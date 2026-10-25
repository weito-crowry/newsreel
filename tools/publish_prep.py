#!/usr/bin/env python3
"""投稿準備の定型フロー支援ツール（newsreel パッケージ）。

動画化済みトピックについて、YouTube 投稿に必要な下書き（タイトル案＋概要欄）を
「投稿パック」として用意する。機械的な組み立てはこのツール、タイトル案と
リード文を書くのは LLM、人間（Tanaka）は選んで貼るだけ、という分担。

  list     投稿パック未作成の動画化済みトピックを洗い出す
  prepare  publish_worksheet.json に素材（エンドカード要約・出典・タグ・出力先）を束ねる
  apply    publish_results.json（タイトル案＋リード文）を検証し、投稿パック
           publish-<repId>.md を組み立てて成果物フォルダと Drive へ置く

手順はパッケージの PUBLISHING.md を参照。シート読み取りは scripting.py を再利用する。
"""
import argparse
import importlib.util
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))
BASE = Path.home() / "workspace/news-pipeline"
WORKSHEET = BASE / "publish_worksheet.json"
RESULTS = BASE / "publish_results.json"
STATE = BASE / "publish_state.json"
DEFAULT_SCRIPTS_DIR = Path.home() / "workspace/goals/daily-ai-news-digest/files"
DEFAULT_GWS = "/opt/hatch/bin/hatch_gws_cli"
DEFAULT_SHEET_ID = "1F73m5bKIqvS9fFbOP1_hnvtPzFro5021S108Rgb4R3c"
DEFAULT_DRIVE_SCRIPTS_FOLDER = "1K8ux1douU8oonA-cCjjuk2zxrZaihS6m"

_spec = importlib.util.spec_from_file_location(
    "newsreel_scripting", Path(__file__).with_name("scripting.py"))
_scripting = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_scripting)
read_sheet = _scripting.read_sheet
build_topics = _scripting.build_topics
drive_find_folder = _scripting.drive_find_folder
drive_create_folder = _scripting.drive_create_folder
drive_child_names = _scripting.drive_child_names


def load_state():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_state(state):
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")


def ready_topics(args):
    articles, groups = read_sheet(args.gws, args.sheet_id)
    # scripting.read_sheet は job 列 (O-R) を返さないため、出力先だけ別途読む
    out = _scripting.cli(args.gws, "sheets", "spreadsheets", "values", "get",
                         "--params", json.dumps({"spreadsheetId": args.sheet_id,
                                                 "range": "ニュース!A1:R2000"}))
    job = {}
    for idx, r in enumerate(out.get("values", [])[1:], start=2):
        if len(r) > 0 and r[0]:
            job[r[0]] = {"node": r[14] if len(r) > 14 else "",
                         "output": r[17] if len(r) > 17 else ""}
    topics = build_topics(articles)
    state = load_state()
    ready = []
    for key, t in topics.items():
        rep = t["rep"]
        if rep["status"] != "動画化済み":
            continue
        if (args.scripts_dir / f"publish-{key}.md").exists():
            continue
        if state.get(key, {}).get("applied_at"):
            continue
        prod_path = args.scripts_dir / f"production-{key}.json"
        prod = {}
        if prod_path.exists():
            try:
                prod = json.loads(prod_path.read_text(encoding="utf-8"))
            except Exception:
                prod = {}
        end = {}
        for s in prod.get("scenes", []):
            if s.get("type") == "end":
                end = s.get("endCard", {})
        tags = []
        for a in t["members"]:
            for x in a["tags"].split(","):
                x = x.strip()
                if x and x not in tags:
                    tags.append(x)
        if not end.get("sources"):
            # 初期の手作り production.json 等で endCard に出典がない場合はメンバー記事で補う
            end = dict(end)
            end["sources"] = [{"label": f"{a['source']}「{a['title']}」", "url": a["url"]}
                              for a in t["members"] if a["url"]]
        ready.append({
            "id": key,
            "topic_name": (groups.get(key) or {}).get("topic") or rep["title"],
            "production_title": prod.get("title", rep["title"]),
            "end_summary": end.get("summary", []),
            "sources": end.get("sources", []),
            "tags": tags[:6],
            "node": job.get(key, {}).get("node", ""),
            "output": job.get(key, {}).get("output", ""),
            "pub_date": rep["pub"][:10],
            "folder_name": f"{rep['pub'][:10]}_{key}",
            "no_production_json": not prod,
        })
    ready.sort(key=lambda x: x["pub_date"], reverse=True)
    return ready


def cmd_list(args):
    ready = ready_topics(args)
    print(f"投稿パック未作成: {len(ready)} トピック")
    for r in ready:
        print(f"- {r['id']} | {r['pub_date']} | {r['topic_name'][:50]} | 出力: {r['output'][:50] or '記録なし'}")
    return 0


def cmd_prepare(args):
    ready = ready_topics(args)
    WORKSHEET.write_text(json.dumps(
        {"generated_at": datetime.now(JST).isoformat(timespec="seconds"),
         "topics": ready}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"topics": len(ready), "worksheet": str(WORKSHEET)},
                     ensure_ascii=False))
    return 0


def build_description(topic, lead):
    lines = [lead, ""]
    if topic["end_summary"]:
        lines.append("【この動画の内容】")
        for p in topic["end_summary"]:
            lines.append(f"・{p}")
        lines.append("")
    if topic["sources"]:
        lines.append("【出典】")
        for s in topic["sources"]:
            lines.append(f"・{s.get('label', '')}")
            if s.get("url"):
                lines.append(f"  {s['url']}")
        lines.append("")
    lines += ["音声: VOICEVOX（四国めたん）", ""]
    tags = ["AIニュース", "生成AI"]
    for t in topic["tags"]:
        t = re.sub(r"[^0-9A-Za-zぁ-んァ-ヶー一-龥]", "", t)
        if t and t not in tags:
            tags.append(t)
    lines.append(" ".join(f"#{t}" for t in tags[:8]))
    return "\n".join(lines)


def cmd_apply(args):
    if not WORKSHEET.exists():
        print("publish_worksheet.json がありません。先に prepare を実行してください", file=sys.stderr)
        return 1
    ws = json.loads(WORKSHEET.read_text(encoding="utf-8"))
    results_path = Path(args.results) if args.results else RESULTS
    if not results_path.exists():
        print(f"結果ファイルがありません: {results_path}", file=sys.stderr)
        return 1
    results = json.loads(results_path.read_text(encoding="utf-8"))
    res = {it.get("id", ""): it for it in results.get("items", [])}
    topics = {t["id"]: t for t in ws["topics"]}
    missing = [tid for tid in topics if tid not in res]
    if missing:
        print(f"結果に含まれていないトピックがあります: {missing[:5]}", file=sys.stderr)
        return 1
    for tid, r in res.items():
        if tid in topics and not ((r.get("title_main") or "").strip()
                                   and (r.get("lead") or "").strip()):
            print(f"{tid}: title_main と lead は必須です", file=sys.stderr)
            return 1
    state = load_state()
    done = []
    for tid, t in topics.items():
        r = res[tid]
        desc = build_description(t, r["lead"].strip())
        pack = "\n".join([
            f"# 投稿パック: {t['topic_name']}",
            "",
            f"- 題材ID: {tid}",
            f"- 動画ファイル: {t['output'] or 'シートに記録なし'}",
            f"- ニュース日: {t['pub_date']}",
            "",
            "## タイトル案",
            f"1. {r['title_main'].strip()}",
            f"2. {(r.get('title_alt') or '').strip()}",
            "",
            "## 概要欄（コピペ用）",
            "```text",
            desc,
            "```",
            "",
        ])
        if args.dry_run:
            done.append({"id": tid, "dry_run": True})
            continue
        (args.scripts_dir / f"publish-{tid}.md").write_text(pack, encoding="utf-8")
        folder_id = drive_find_folder(args.gws, args.drive_scripts_folder, t["folder_name"])
        if not folder_id:
            folder_id = drive_create_folder(args.gws, args.drive_scripts_folder, t["folder_name"])
        uploaded = False
        if "publish.md" not in drive_child_names(args.gws, folder_id):
            import subprocess
            rr = subprocess.run([args.gws, "drive", "+upload",
                                 str(args.scripts_dir / f"publish-{tid}.md"),
                                 "--parent", folder_id, "--name", "publish.md"],
                                capture_output=True, text=True, timeout=180)
            uploaded = rr.returncode == 0
        state[tid] = {"applied_at": datetime.now(JST).isoformat(timespec="seconds"),
                      "drive_folder": t["folder_name"], "drive_uploaded": uploaded}
        done.append({"id": tid, "drive_uploaded": uploaded})
    if not args.dry_run:
        save_state(state)
    print(json.dumps({"packs": len(done), "done": done}, ensure_ascii=False, indent=1))
    return 0


def main():
    ap = argparse.ArgumentParser(description="投稿準備の定型フロー支援ツール")
    ap.add_argument("--gws", default=DEFAULT_GWS)
    ap.add_argument("--sheet-id", default=DEFAULT_SHEET_ID)
    ap.add_argument("--scripts-dir", type=Path, default=DEFAULT_SCRIPTS_DIR)
    ap.add_argument("--drive-scripts-folder", default=DEFAULT_DRIVE_SCRIPTS_FOLDER)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    sub.add_parser("prepare").set_defaults(fn=cmd_prepare)
    p = sub.add_parser("apply")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--results", default="")
    p.set_defaults(fn=cmd_apply)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
