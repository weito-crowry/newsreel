#!/usr/bin/env python3
"""脚本化の定型フロー支援ツール（newsreel パッケージ）。

「選択済み」トピックの脚本化で毎回発生する機械的な作業を担う:
  list      脚本化対象トピックの洗い出し（選択済みメンバーがいて未脚本のグループ）
  materials トピックの素材束ね（メンバー記事の要約・本文・出典を1ファイルに）
  scaffold  production.json の器（メタ・タイトルカード・エンドカード出典）を生成
  readings  ナレーションの読みチェック（辞書未登録の英字語を抽出し VOICEVOX かなを付ける）
  finalize  完了処理（シートのステータス揃え／Drive へ配置／準備時間ログ追記）

脚本の中身（ナレーション・シーン構成）を書くのは LLM の仕事で、このツールは
その前後の定型作業だけを行う。前提・手順はパッケージの SCRIPTING.md を参照。

シートアクセスは gws CLI 経由（Muse VM 専用。worker.py の sheet バックエンドと同じ前提）。
標準ライブラリのみ。
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))
DEFAULT_SHEET_ID = "1F73m5bKIqvS9fFbOP1_hnvtPzFro5021S108Rgb4R3c"
DEFAULT_GWS = "/opt/hatch/bin/hatch_gws_cli"
DEFAULT_SCRIPTS_DIR = Path.home() / "workspace/goals/daily-ai-news-digest/files"
DEFAULT_TEXTS_DIR = Path.home() / "workspace/news-pipeline/texts"
DEFAULT_WORK_DIR = Path.home() / "workspace/news-pipeline/scripting"
DEFAULT_STATE = Path.home() / "workspace/news-pipeline/scripting_state.json"
PACKAGE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_VOICE_DIR = PACKAGE_DIR / "voice"
DEFAULT_DRIVE_SCRIPTS_FOLDER = "1K8ux1douU8oonA-cCjjuk2zxrZaihS6m"  # Drive「newsreel/scripts」
VOICEVOX_PY = Path.home() / "workspace/voicevox/venv/bin/python"

DONE_STATUSES = {"脚本済み", "音声化済み", "動画化済み", "投稿済み"}
VOICE_DEFAULTS = {"styleId": 2, "speed": 1.12, "tailSilence": 0.28}


def now_jst() -> datetime:
    return datetime.now(JST)


def fmt_md(dt: datetime | None) -> str:
    return dt.strftime("%m/%d %H:%M") if dt else "—"


def cli(gws: str, service: str, *args: str) -> dict:
    r = subprocess.run([gws, service, *args], capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        raise RuntimeError(f"gws {service} failed: {r.stderr.strip()[:400]}")
    return json.loads(r.stdout) if r.stdout.strip() else {}


# ---------------------------------------------------------------- sheet ----
def read_sheet(gws: str, sheet_id: str):
    """ニュースタブ全行とグループタブを読み、記事dictのリストとグループ情報を返す。"""
    out = cli(gws, "sheets", "spreadsheets", "values", "get",
              "--params", json.dumps({"spreadsheetId": sheet_id, "range": "ニュース!A1:T2000"}))
    rows = out.get("values", [])

    def c(r, i):
        return r[i] if len(r) > i else ""

    articles = []
    for idx, r in enumerate(rows[1:], start=2):
        if not c(r, 0):
            continue
        articles.append({
            "row": idx, "id": c(r, 0), "recorded": c(r, 1), "pub": c(r, 2),
            "status": c(r, 3), "url": c(r, 4), "source": c(r, 6), "type": c(r, 7),
            "title": c(r, 8), "summary": c(r, 9), "category": c(r, 10),
            "tags": c(r, 11), "note": c(r, 12), "groupId": c(r, 13),
        })
    groups = {}
    try:
        gout = cli(gws, "sheets", "spreadsheets", "values", "get",
                   "--params", json.dumps({"spreadsheetId": sheet_id, "range": "グループ!A1:F1000"}))
        for r in gout.get("values", [])[1:]:
            if len(r) > 0 and r[0]:
                groups[r[0]] = {
                    "topic": r[1] if len(r) > 1 else "",
                    "rep": r[2] if len(r) > 2 else "",
                    "status": r[4] if len(r) > 4 else "",
                }
    except Exception:
        pass  # グループタブが読めなくても致命的ではない
    return articles, groups


def build_topics(articles):
    """groupId（=代表記事ID）で束ねる。グループなし記事は単独トピック。"""
    topics: dict[str, dict] = {}
    for a in articles:
        key = a["groupId"] or a["id"]
        t = topics.setdefault(key, {"rep_id": key, "members": []})
        t["members"].append(a)
    for t in topics.values():
        t["members"].sort(key=lambda a: a["pub"], reverse=True)
        rep = next((a for a in t["members"] if a["id"] == t["rep_id"]), t["members"][0])
        t["rep"] = rep
    return topics


def is_ready(topic, scripts_dir: Path) -> bool:
    statuses = {a["status"] for a in topic["members"]}
    if "選択済み" not in statuses:
        return False
    if statuses & DONE_STATUSES:
        return False
    if (scripts_dir / f"production-{topic['rep_id']}.json").exists():
        return False
    return True


# ---------------------------------------------------------------- state ----
def load_state(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(path: Path, state: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


# --------------------------------------------------------------- commands ----
def cmd_list(args) -> int:
    articles, groups = read_sheet(args.gws, args.sheet_id)
    topics = build_topics(articles)
    state = load_state(args.state_file)
    ready = []
    for key, t in topics.items():
        if not is_ready(t, args.scripts_dir):
            continue
        entry = state.setdefault(key, {})
        if not entry.get("first_seen"):
            entry["first_seen"] = now_jst().isoformat(timespec="seconds")
        name = (groups.get(key) or {}).get("topic") or t["rep"]["title"]
        ready.append({
            "topic_id": key,
            "name": name,
            "rep_title": t["rep"]["title"],
            "rep_pub": t["rep"]["pub"][:10],
            "members": len(t["members"]),
            "selected": sum(1 for a in t["members"] if a["status"] == "選択済み"),
            "sources": sorted({a["source"] for a in t["members"]}),
            "with_body": sum(1 for a in t["members"] if (args.texts_dir / f"{a['id']}.txt").exists()),
            "first_seen": entry["first_seen"],
        })
    save_state(args.state_file, state)
    ready.sort(key=lambda x: x["rep_pub"], reverse=True)
    if args.json:
        print(json.dumps(ready, ensure_ascii=False, indent=1))
    else:
        print(f"脚本化対象: {len(ready)} トピック")
        for r in ready:
            print(f"- {r['topic_id']} | {r['rep_pub']} | メンバー{r['members']}件"
                  f"（選択済み{r['selected']}・本文あり{r['with_body']}）| {r['name']}")
    return 0


def cmd_materials(args) -> int:
    articles, groups = read_sheet(args.gws, args.sheet_id)
    topics = build_topics(articles)
    t = topics.get(args.topic)
    if t is None:
        print(f"トピックが見つかりません: {args.topic}", file=sys.stderr)
        return 1
    state = load_state(args.state_file)
    entry = state.setdefault(args.topic, {})
    entry.setdefault("first_seen", now_jst().isoformat(timespec="seconds"))
    entry.setdefault("materials_at", now_jst().isoformat(timespec="seconds"))
    save_state(args.state_file, state)

    name = (groups.get(args.topic) or {}).get("topic") or t["rep"]["title"]
    out_dir = args.work_dir / args.topic
    out_dir.mkdir(parents=True, exist_ok=True)
    lines = [f"# 素材束ね: {name}", "",
             f"- トピックID（代表記事ID）: {args.topic}",
             f"- 代表記事: {t['rep']['title']}（{t['rep']['source']} / {t['rep']['pub'][:10]}）",
             f"- メンバー: {len(t['members'])}件"
             f"（選択済み {sum(1 for a in t['members'] if a['status'] == '選択済み')}件）",
             "", "## メンバー記事", ""]
    for i, a in enumerate(t["members"], 1):
        body_path = args.texts_dir / f"{a['id']}.txt"
        body = body_path.read_text(encoding="utf-8", errors="replace") if body_path.exists() else ""
        lines += [f"### {i}. {a['title']}",
                  f"- 媒体: {a['source']} / 日時: {a['pub']} / ステータス: {a['status']}",
                  f"- URL: {a['url']}",
                  f"- 分類: {a['category']} / タグ: {a['tags']}",
                  f"- 要約: {a['summary'] or '（なし）'}",
                  f"- 本文: {'あり（' + str(len(body)) + '字）' if body else 'なし（タイトル＋要約で構成する。CodeZine等の本文取得不可は例外扱い）'}",
                  ""]
        if body:
            lines += ["```", body, "```", ""]
    path = out_dir / "materials.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"topic": args.topic, "materials": str(path),
                      "members": len(t["members"])}, ensure_ascii=False))
    return 0


def cmd_scaffold(args) -> int:
    articles, groups = read_sheet(args.gws, args.sheet_id)
    topics = build_topics(articles)
    t = topics.get(args.topic)
    if t is None:
        print(f"トピックが見つかりません: {args.topic}", file=sys.stderr)
        return 1
    rep = t["rep"]
    out = args.scripts_dir / f"production-{rep['id']}.json"
    if out.exists() and not args.force:
        print(f"既に存在します（上書きは --force）: {out}", file=sys.stderr)
        return 1
    sources, seen = [], set()
    for a in t["members"]:
        if a["url"] and a["url"] not in seen:
            seen.add(a["url"])
            sources.append({"label": f"{a['source']}「{a['title']}」", "url": a["url"]})
    doc = {
        "schemaVersion": 1,
        "id": rep["id"],
        "title": rep["title"],  # 仮タイトル。脚本作成時に動画タイトルへ付け直す
        "voice": dict(VOICE_DEFAULTS),
        # 様式の標準値はスキル側（この scaffold と SCRIPTING.md）が管理する。
        # プログラム側の既定値は、フィールド不足時の安全弁にすぎない
        # （2026-10-26 田中さん: 既定値の管理はプログラムではなくスキル側）
        "style": {
            "brand": "AI NEWS",
            "theme": "#0f62b4",
            "fadeSec": 0.4,
            "glossaryHoldSec": 5,
            "glossaryMaxVisible": 2,
        },
        "scenes": [
            {"id": "S1", "type": "hook", "shoulder": "",
             "hook": {"accent": "", "lines": ["", ""], "sub": ""}, "narration": []},
            {"id": "T", "type": "title", "fixedSeconds": 3,
             "titleCard": {"kicker": "AI NEWS", "lines": [""], "sub": ""}},
            {"id": "S2", "type": "content", "shoulder": "", "headline": "",
             "diagram": "summary-points", "diagramData": {"points": []},
             "narration": []},
            {"id": "E", "type": "end", "fixedSeconds": 5,
             "endCard": {"summary": [], "sources": sources}},
        ],
    }
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"topic": args.topic, "scaffold": str(out),
                      "sources": len(sources)}, ensure_ascii=False))
    return 0


TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:[-.+][A-Za-z0-9]+)*")


def apply_dict(text: str, entries: dict) -> str:
    for k in sorted(entries, key=len, reverse=True):
        if k:
            text = text.replace(k, entries[k])
    return text


def cmd_readings(args) -> int:
    prod = json.loads(Path(args.production).read_text(encoding="utf-8"))
    narrations = []
    for s in prod.get("scenes", []):
        narrations += s.get("narration", [])
    dict_path = args.voice_dir / "reading_dict.json"
    entries = json.loads(dict_path.read_text(encoding="utf-8")).get("entries", {})
    converted = [apply_dict(t, entries) for t in narrations]
    counts: dict[str, int] = {}
    examples: dict[str, str] = {}
    for orig, conv in zip(narrations, converted):
        for tok in TOKEN_RE.findall(conv):
            tok = tok.strip(".")
            if not tok:
                continue
            counts[tok] = counts.get(tok, 0) + 1
            examples.setdefault(tok, orig)
    kana = {}
    toks = sorted(counts)
    if toks and VOICEVOX_PY.exists() and (args.voice_dir / "check_kana.py").exists():
        try:
            r = subprocess.run([str(VOICEVOX_PY), str(args.voice_dir / "check_kana.py"), *toks],
                               capture_output=True, text=True, timeout=300)
            for line in r.stdout.splitlines():
                if " => " in line:
                    t0, k0 = line.split(" => ", 1)
                    kana[t0.strip()] = k0.strip()
        except Exception as e:
            print(f"<!-- kana check failed: {e} -->")
    print(f"# 読みチェック: {Path(args.production).name}")
    print(f"ナレーション {len(narrations)} ユニット / 辞書 {len(entries)} 件適用後、"
          f"未登録の英字語 {len(toks)} 件")
    print()
    print("| 表記 | 回数 | VOICEVOXかな | 例文 |")
    print("|---|---|---|---|")
    for tok in toks:
        ex = examples[tok].replace("|", "｜")[:60]
        print(f"| {tok} | {counts[tok]} | {kana.get(tok, '（未取得）')} | {ex} |")
    print()
    print("登録は voice/apply_reading_dict.py --add \"表記=読み\" で行う。"
          "曖昧な読みは Tanaka に候補を提示してから登録する（SCRIPTING.md）。")
    return 0


# ---------------------------------------------------------------- drive ----
def drive_find_folder(gws: str, parent: str, name: str):
    q = (f"name='{name}' and '{parent}' in parents and "
         "mimeType='application/vnd.google-apps.folder' and trashed=false")
    out = cli(gws, "drive", "files", "list",
              "--params", json.dumps({"q": q, "fields": "files(id,name)"}))
    files = out.get("files", [])
    return files[0]["id"] if files else None


def drive_create_folder(gws: str, parent: str, name: str) -> str:
    out = cli(gws, "drive", "files", "create",
              "--json", json.dumps({"name": name,
                                    "mimeType": "application/vnd.google-apps.folder",
                                    "parents": [parent]}))
    return out["id"]


def drive_child_names(gws: str, folder: str) -> set:
    out = cli(gws, "drive", "files", "list",
              "--params", json.dumps({"q": f"'{folder}' in parents and trashed=false",
                                      "fields": "files(id,name)"}))
    return {f["name"] for f in out.get("files", [])}


def cmd_finalize(args) -> int:
    articles, groups = read_sheet(args.gws, args.sheet_id)
    topics = build_topics(articles)
    t = topics.get(args.topic)
    if t is None:
        print(f"トピックが見つかりません: {args.topic}", file=sys.stderr)
        return 1
    rep = t["rep"]
    prod_path = args.scripts_dir / f"production-{rep['id']}.json"
    script_path = args.scripts_dir / f"script-{rep['id']}.md"
    for p in (prod_path, script_path):
        if not p.exists():
            print(f"成果物がありません: {p}", file=sys.stderr)
            return 1
    prod = json.loads(prod_path.read_text(encoding="utf-8"))
    if prod.get("id") != rep["id"]:
        print(f"production.json の id が代表記事と一致しません: {prod.get('id')} != {rep['id']}",
              file=sys.stderr)
        return 1

    # --- シート: 選択済みメンバーと代表行を 脚本済み に揃える（ワーカーのキュー条件）
    updates = []
    for a in t["members"]:
        target = None
        if a["status"] == "選択済み":
            target = "脚本済み"
        elif a["id"] == rep["id"] and a["status"] in ("取得", "確認済み", "却下"):
            target = "脚本済み"  # 代表行が 脚本済み でないとキューに載らない
        if target:
            updates.append({"range": f"ニュース!D{a['row']}", "values": [[target]]})
    folder_name = f"{rep['pub'][:10]}_{rep['id']}"
    if args.dry_run:
        print(json.dumps({"topic": args.topic, "dry_run": True,
                          "sheet_updates": [u["range"] for u in updates],
                          "drive_folder": folder_name,
                          "files": [prod_path.name, script_path.name]},
                         ensure_ascii=False, indent=1))
        return 0
    if updates:
        cli(args.gws, "sheets", "spreadsheets", "values", "batchUpdate",
            "--params", json.dumps({"spreadsheetId": args.sheet_id}),
            "--json", json.dumps({"valueInputOption": "RAW", "data": updates}))

    # --- Drive: scripts/<YYYY-MM-DD_repId>/ へ production.json + script.md
    folder_id = drive_find_folder(args.gws, args.drive_scripts_folder, folder_name)
    if not folder_id:
        folder_id = drive_create_folder(args.gws, args.drive_scripts_folder, folder_name)
    existing = drive_child_names(args.gws, folder_id)
    uploaded, skipped = [], []
    for p in (prod_path, script_path):
        # ワーカーはフォルダ内の production.json / script.md という名前で素材を探すため、
        # Drive 上の名前は必ずこの2名前にそろえる（ローカル名 production-<id>.json のまま
        # 上げると素材が見つからずジョブがスキップされる。2026-10-26 実地で確認）
        target_name = "production.json" if p is prod_path else "script.md"
        if target_name in existing:
            skipped.append(target_name)
            continue
        r = subprocess.run([args.gws, "drive", "+upload", str(p), "--parent", folder_id,
                            "--name", target_name],
                           capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            print(f"アップロード失敗: {p.name}: {r.stderr.strip()[:300]}", file=sys.stderr)
            return 1
        uploaded.append(target_name)

    # --- 準備時間ログ
    state = load_state(args.state_file)
    entry = state.get(args.topic, {})
    sel = parse_iso(entry.get("first_seen"))
    start = parse_iso(entry.get("materials_at"))
    done = now_jst()
    work = ""
    if start:
        mins = round((done - start).total_seconds() / 60)
        work = f"約{mins}分"
    name = (groups.get(args.topic) or {}).get("topic") or rep["title"][:40]
    log_path = args.scripts_dir / "prep-time-log.md"
    row = (f"| {name} | {fmt_md(sel)} | {fmt_md(start)} | {fmt_md(done)} | {work} "
           f"| 定型フロー（scripting.py）で脚本化 |")
    if log_path.exists():
        with log_path.open("a", encoding="utf-8") as f:
            f.write(row + "\n")
    entry["finalized_at"] = done.isoformat(timespec="seconds")
    state[args.topic] = entry
    save_state(args.state_file, state)

    print(json.dumps({"topic": args.topic, "sheet_updated": len(updates),
                      "drive_folder": folder_name, "uploaded": uploaded,
                      "skipped_existing": skipped, "prep_log_row": row},
                     ensure_ascii=False, indent=1))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="脚本化の定型フロー支援ツール")
    ap.add_argument("--gws", default=DEFAULT_GWS)
    ap.add_argument("--sheet-id", default=DEFAULT_SHEET_ID)
    ap.add_argument("--scripts-dir", type=Path, default=DEFAULT_SCRIPTS_DIR)
    ap.add_argument("--texts-dir", type=Path, default=DEFAULT_TEXTS_DIR)
    ap.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR)
    ap.add_argument("--state-file", type=Path, default=DEFAULT_STATE)
    ap.add_argument("--voice-dir", type=Path, default=DEFAULT_VOICE_DIR)
    ap.add_argument("--drive-scripts-folder", default=DEFAULT_DRIVE_SCRIPTS_FOLDER)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list", help="脚本化対象トピックの洗い出し")
    p.add_argument("--json", action="store_true")
    p.set_defaults(fn=cmd_list)
    p = sub.add_parser("materials", help="素材束ねを作る")
    p.add_argument("topic")
    p.set_defaults(fn=cmd_materials)
    p = sub.add_parser("scaffold", help="production.json の器を生成")
    p.add_argument("topic")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_scaffold)
    p = sub.add_parser("readings", help="ナレーションの読みチェック")
    p.add_argument("production")
    p.set_defaults(fn=cmd_readings)
    p = sub.add_parser("finalize", help="完了処理（シート／Drive／準備時間ログ）")
    p.add_argument("topic")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(fn=cmd_finalize)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
