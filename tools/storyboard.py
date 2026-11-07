#!/usr/bin/env python3
"""絵コンテ（内容チェック資料）の生成。

production.json と timing.json（runner が出力したもの）から、各シーンの
代表フレームを Remotion still で描画し、「左に画面・右にナレーション」の
HTML 資料を作る。動画を再生しなくても、画面の文字列とナレーションの
対応（名詞の一致）を目で追って確認できる。

使い方:
  python3 tools/storyboard.py <production.json> <timing.json> <出力HTML>
  [--template DIR] [--keep-frames DIR]

フレーム選定:
  - hook: 開始+2.6s（ホールド後の発話開始付近）
  - title/end: 中央
  - content: 開始+3.0s（見出し・アクセント表示中）と 終了-0.7s（図解完成）の2枚
"""
import argparse
import base64
import fcntl
import hashlib
import html
import json
import math
import os
import subprocess
import sys
from pathlib import Path

from layout_check import check_production

FPS = 30
PAD_HEAD = 0.175  # runner.py / layout.ts と一致
PAD_TAIL = 0.225


def js_round(x: float) -> int:
    return math.floor(x + 0.5)


def compute_starts(production: dict, timing: dict):
    """シーンごとの (開始フレーム, 尺フレーム, ユニット開始秒リスト) を返す。"""
    units = timing.get("units", [])
    hold = float(timing.get("introHoldSec", 0.0))
    starts = {}
    frame = 0
    hold_applied = False
    for scene in production["scenes"]:
        sid = scene["id"]
        s_units = [u for u in units if u["scene"] == sid]
        if scene["type"] in ("title", "end") and not s_units:
            sec = float(scene.get("fixedSeconds", 3 if scene["type"] == "title" else 5))
            frames = js_round(sec * FPS)
            starts[sid] = (frame, frames, [])
            frame += frames
            continue
        use_hold = hold if (not hold_applied and s_units) else 0.0
        if use_hold:
            hold_applied = True
        head = PAD_HEAD + use_hold
        total = head + sum(u["dur"] for u in s_units) + PAD_TAIL
        frames = js_round(total * FPS)
        offs = []
        cur = head
        for u in s_units:
            offs.append(cur)
            cur += u["dur"]
        starts[sid] = (frame, frames, offs)
        frame += frames
    return starts, frame


def pick_frames(scene: dict, start: int, frames: int, offs=()):
    """(相対秒, ラベル) のリスト。"""
    dur = frames / FPS
    if scene["type"] == "hook":
        picks = [(2.6, "フック画面")]
    elif scene["type"] == "title":
        return [(dur / 2, "タイトル")]
    elif scene["type"] == "end":
        return [(dur / 2, "エンドカード")]
    else:
        picks = [(3.0, "シーン冒頭（見出し表示中）"), (max(3.5, dur - 0.7), "シーン終盤（見出し消去後）")]
    # 用語解説がある場面は、最後のブロックが出そろった頃のフレームも撮る
    # （ブロックは5秒で消えるため、冒頭/完成時のフレームでは写らないことがある）
    gloss = scene.get("glossary") or []
    if gloss and offs:
        appears = []
        for i, g in enumerate(gloss):
            unit = g.get("atUnit") or 0
            stagger = sum(1 for x in gloss[:i] if (x.get("atUnit") or 0) == unit)
            if unit < len(offs):
                appears.append(offs[unit] + stagger * 1.2)
        if appears:
            rel = max(appears) + 1.2
            if rel < dur - 0.3 and all(abs(rel - p) > 0.8 for p, _ in picks):
                picks.append((rel, "用語解説の表示中"))
    return picks


def diagram_text(scene: dict) -> list[str]:
    d = scene.get("diagramData") or {}
    out = []
    for g in scene.get("glossary") or []:
        out.append(f"用語解説[{g.get('term', '')}]: " + (g.get("text") or "").replace("\n", " / "))
    kind = scene.get("diagram")
    if kind == "split":
        for side in ("left", "right"):
            s = d.get(side) or {}
            if s:
                out.append(f"{s.get('title','')} {s.get('mark','')}: {(s.get('text') or '').replace(chr(10), ' / ')}")
    elif kind == "redteam":
        for k, label in (("attackerTitle", "左"), ("middleTitle", "中"), ("resultText", "結果")):
            v = d.get(k)
            if v:
                body = d.get(k.replace("Title", "Text")) if k != "resultText" else ""
                out.append(f"{label}: {v} {body or ''}".replace("\n", " / "))
    elif kind == "summary-points":
        for i, p in enumerate(d.get("points") or [], 1):
            out.append(f"{i}. {p}".replace("\n", " / "))
    elif kind == "timeline":
        for e in d.get("events") or []:
            out.append(f"{e.get('date','')}: {(e.get('label') or '').replace(chr(10), ' / ')}")
    elif kind == "sandbox":
        for k in ("title", "circle", "note", "step2Title", "step2Text", "step3Badge"):
            if d.get(k):
                out.append(f"{k}: {d[k]}".replace("\n", " / "))
    elif kind == "hero-number":
        if d.get("label"):
            out.append(f"label: {d['label']}")
        if d.get("value"):
            vn = f"（{d['valueNote']}）" if d.get("valueNote") else ""
            out.append(f"主数字: {d['value']}{vn}")
        for s in d.get("sub") or []:
            out.append(f"副数字: {s.get('value', '')} {s.get('label', '')}".replace("\n", " / "))
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "numbers-table":
        if d.get("columns"):
            out.append("列: " + " / ".join(d["columns"]))
        for r in d.get("rows") or []:
            mark = " ★強調" if r.get("highlight") else ""
            out.append(f"{r.get('label', '')}: " + " / ".join(r.get("values") or []) + mark)
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "steps":
        for i, s in enumerate(d.get("steps") or [], 1):
            out.append(f"{i}. {s.get('title', '')}: {(s.get('text') or '').replace(chr(10), ' / ')}")
    elif kind == "items":
        for it in d.get("items") or []:
            out.append(f"{it.get('title', '')}: {(it.get('text') or '').replace(chr(10), ' / ')}")
    elif kind == "quote":
        if d.get("context"):
            out.append("context: " + d["context"].replace("\n", " / "))
        if d.get("quote"):
            out.append("引用: " + d["quote"].replace("\n", " / "))
        sp = " ".join(x for x in (d.get("speaker"), d.get("role")) if x)
        if sp:
            out.append(f"発言者: {sp}")
    elif kind == "benchmark-table":
        cols = d.get("columns") or []
        if cols:
            out.append("列: " + " / ".join(cols))
        brows = d.get("benchRows") or []
        for r in brows:
            mark = " ★発表モデル" if r.get("highlight") else ""
            out.append(f"{r.get('model', '')}: " + " / ".join(r.get("values") or []) + mark)
        best = d.get("best") or []
        bests = []
        for ci, ri in enumerate(best):
            if ri is not None and 0 <= ri < len(brows):
                cname = cols[ci] if ci < len(cols) else f"列{ci + 1}"
                bests.append(f"{cname}={brows[ri].get('model', '')}")
        if bests:
            out.append("最良: " + "、".join(bests))
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "benchmark-chart":
        head = f"指標: {d.get('benchmark', '')}"
        if d.get("unit"):
            head += f"（単位: {d['unit']}）"
        out.append(head)
        for b in d.get("bars") or []:
            mark = " ★強調" if b.get("highlight") else ""
            out.append(f"{b.get('model', '')}: {b.get('value', '')}{d.get('unit', '')}{mark}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "code-block":
        if d.get("caption"):
            out.append("caption: " + d["caption"].replace("\n", " / "))
        if d.get("above"):
            out.append("above: " + d["above"].replace("\n", " / "))
        for ln in d.get("lines") or []:
            out.append(f"code: {ln}")
        if d.get("below"):
            out.append("below: " + d["below"].replace("\n", " / "))
    elif kind == "delta":
        if d.get("label"):
            out.append(f"label: {d['label']}")
        out.append(f"前: {d.get('beforeLabel', '')} {d.get('before', '')}".strip())
        out.append(f"後: {d.get('afterLabel', '')} {d.get('after', '')}".strip())
        if d.get("change"):
            out.append(f"変化: {d['change']}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "stat-grid":
        for s in d.get("stats") or []:
            out.append(f"{s.get('value', '')}（{s.get('label', '')}）".replace("\n", " / "))
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "spec-list":
        if d.get("subject"):
            out.append(f"対象: {d['subject']}")
        for r in d.get("specs") or []:
            out.append(f"{r.get('item', '')}: {r.get('value', '')}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "changelog":
        kind_labels = {"added": "追加", "changed": "変更", "fixed": "修正", "removed": "削除"}
        for c in d.get("changes") or []:
            badge = c.get("badge") or kind_labels.get(c.get("kind", ""), c.get("kind", ""))
            out.append(f"[{badge}] {(c.get('text') or '').replace(chr(10), ' / ')}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "ranking-list":
        if d.get("rankTitle"):
            out.append(f"見出し: {d['rankTitle']}")
        for i, e in enumerate(d.get("entries") or [], 1):
            sc = f": {e['score']}" if e.get("score") else ""
            mark = " ★強調" if e.get("highlight") else ""
            out.append(f"{i}位 {e.get('name', '')}{sc}{mark}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "trend-chart":
        if d.get("label"):
            out.append(f"グラフ: {d['label']}" + (f"（{d['unit']}）" if d.get("unit") else ""))
        for s in d.get("series") or []:
            pts = " → ".join(f"{pt.get('label', '')} {pt.get('value', '')}" for pt in s.get("points") or [])
            out.append(f"{s.get('name', '')}: {pts}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "post-card":
        who = d.get("name", "") + (f"（{d['handle']}）" if d.get("handle") else "")
        out.append(f"投稿者: {who}")
        if d.get("text"):
            out.append("投稿文: " + d["text"].replace("\n", " / "))
        meta = " ".join(x for x in (f"いいね {d['likes']}" if d.get("likes") else "", f"リポスト {d['reposts']}" if d.get("reposts") else "", d.get("date", "")) if x)
        if meta:
            out.append(meta)
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "relation-map":
        mode = d.get("mode") or "hub"
        head = (d.get("center") or d.get("root") or {})
        out.append(f"中心: {head.get('title', '')}" + (f"（{head['text']}）" if head.get("text") else ""))
        for nd in d.get("nodes") or []:
            link = f"［{nd['link']}］" if nd.get("link") else ""
            out.append(f"{nd.get('title', '')}{link}: {(nd.get('text') or '').replace(chr(10), ' / ')}")
        out.append(f"形式: {'階層ツリー' if mode == 'tree' else '中心放射'}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "scatter":
        out.append(f"軸: x={d.get('xLabel', '')} / y={d.get('yLabel', '')}")
        for pt in d.get("chartPoints") or []:
            mark = " ★強調" if pt.get("highlight") else ""
            out.append(f"{pt.get('name', '')}: x={pt.get('x', '')}, y={pt.get('y', '')}{mark}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "delta-multi":
        out.append(f"前後: {d.get('beforeLabel', '')} → {d.get('afterLabel', '')}")
        for it in d.get("slopeItems") or []:
            out.append(f"{it.get('label', '')}: {it.get('before', '')} → {it.get('after', '')}{d.get('unit', '')}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "map":
        out.append(f"地図: base={d.get('base', '')} / mode={d.get('mapMode', '')}")
        for pt in d.get("mapPoints") or []:
            out.append(f"{pt.get('name', '')}: {pt.get('value', '')}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "share-stack":
        for bar in d.get("stackBars") or []:
            segs = " / ".join(f"{s.get('label', '')} {s.get('value', '')}" for s in bar.get("segments") or [])
            out.append(f"{bar.get('label', '')}: {segs}（単位: {d.get('unit', '')}）")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "waterfall":
        if d.get("wfStart"):
            out.append(f"始点 {d['wfStart'].get('label', '')}: {d['wfStart'].get('value', '')}")
        for s in d.get("wfSteps") or []:
            out.append(f"増減 {s.get('label', '')}: {s.get('value', '')}")
        if d.get("wfEnd"):
            ev = d["wfEnd"].get("value")
            out.append(f"終点 {d['wfEnd'].get('label', '')}: {ev if ev is not None else '（合計を自動計算）'}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "grouped-bars":
        names = [s.get("name", "") for s in d.get("barSeries") or []]
        out.append("指標: " + " / ".join(names))
        for g in d.get("barGroups") or []:
            vals = " / ".join("—" if v is None else str(v) for v in g.get("values") or [])
            mark = " ★強調" if g.get("highlight") else ""
            out.append(f"{g.get('label', '')}: {vals}{mark}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "waffle":
        out.append(f"{d.get('display') or str(d.get('waffleValue', '')) + '/' + str(d.get('waffleTotal', ''))}（{d.get('label', '')}）")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "profile-card":
        who = d.get("name", "") + (f"（{d['role']}）" if d.get("role") else "") + (f" / {d['affiliation']}" if d.get("affiliation") else "")
        out.append(f"人物: {who}")
        if d.get("context"):
            out.append("context: " + d["context"].replace("\n", " / "))
        for pt in d.get("profilePoints") or []:
            out.append("要点: " + str(pt).replace("\n", " / "))
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "radar":
        out.append("軸: " + " / ".join(d.get("axes") or []))
        for s in d.get("radarSeries") or []:
            vals = " / ".join(str(v) for v in s.get("values") or [])
            mark = " ★強調" if s.get("highlight") else ""
            out.append(f"{s.get('name', '')}: {vals}{mark}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "quadrant":
        out.append(f"軸: x={d.get('xLabel', '')} / y={d.get('yLabel', '')}")
        q = d.get("quadrants") or {}
        ql = "、".join(f"{k}={v}" for k, v in q.items() if v)
        if ql:
            out.append("象限: " + ql)
        for pt in d.get("chartPoints") or []:
            mark = " ★強調" if pt.get("highlight") else ""
            out.append(f"{pt.get('name', '')}: x={pt.get('x', '')}, y={pt.get('y', '')}{mark}")
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    elif kind == "venn":
        for s in d.get("sets") or []:
            items = "、".join(s.get("items") or [])
            out.append(f"集合 {s.get('label', '')}" + (f": {items}" if items else ""))
        ov = d.get("overlap") or {}
        if ov.get("label") or ov.get("items"):
            items = "、".join(ov.get("items") or [])
            out.append(f"重なり {ov.get('label', '')}" + (f": {items}" if items else ""))
        if d.get("note"):
            out.append("note: " + d["note"].replace("\n", " / "))
    return out


def mmss(sec: float) -> str:
    m, s = divmod(int(sec), 60)
    return f"{m}:{s:02d}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("timing")
    ap.add_argument("out_html")
    ap.add_argument("--template", default=str(Path(__file__).resolve().parent.parent / "template"))
    ap.add_argument("--keep-frames", default="")
    args = ap.parse_args()

    production = json.loads(Path(args.production).read_text(encoding="utf-8"))
    timing = json.loads(Path(args.timing).read_text(encoding="utf-8"))
    template = Path(args.template)
    if not template.exists():
        print(f"テンプレートがありません: {template}", file=sys.stderr)
        return 1

    starts, total_frames = compute_starts(production, timing)
    # フレームキャッシュのキーに出力名だけでなく production/timing の内容ハッシュを
    # 含める（出力名＋シーンID＋時刻だけだと別トピックのフレームが再利用され、
    # 絵コンテに混入する。同じ内容の再実行では従来どおりキャッシュが効く）
    digest = hashlib.sha256(
        json.dumps({"production": production, "timing": timing},
                   ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()[:12]
    frames_dir = Path(args.keep_frames) if args.keep_frames else Path(args.out_html).with_suffix("")
    frames_dir = frames_dir.with_name(frames_dir.name + "-frames")
    frames_dir = frames_dir.with_name(f"{frames_dir.name}-{digest}")
    frames_dir.mkdir(parents=True, exist_ok=True)

    # 共有 template/src の production.json / timing.json は実行中に書き換えるため、
    # 同じ template を使う並行実行と交錯しないよう、template ごとの排他ロックを
    # 取り、配置から撮影・復元までを臨界区間にする（ロック待ちでよい）
    src = template / "src"
    lock_file = open(template / ".storyboard.lock", "a+")
    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
    backups = {}
    existed = {}
    try:
        # template/src に production/timing を配置（既存は退避して復元）
        for name, data in (("production.json", production), ("timing.json", timing)):
            f = src / name
            existed[name] = f.exists()
            if existed[name]:
                backups[name] = f.read_bytes()
            f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

        rendered = {}
        for scene in production["scenes"]:
            sid = scene["id"]
            start, frames, offs = starts[sid]
            rendered[sid] = []
            for rel_sec, label in pick_frames(scene, start, frames, offs):
                abs_frame = start + int(rel_sec * FPS)
                png = frames_dir / f"{sid}-{int(rel_sec * 10)}.png"
                jpg = png.with_suffix(".jpg")
                if not jpg.exists():
                    env = dict(os.environ)
                    env["TMPDIR"] = str(template / ".tmp")
                    r = subprocess.run(
                        ["npx", "remotion", "still", "NewsVideo", str(png),
                         f"--frame={abs_frame}"],
                        cwd=template, capture_output=True, text=True, env=env)
                    if r.returncode != 0 or not png.exists():
                        print(f"still 失敗 {sid}@{abs_frame}: {r.stderr[-500:]}", file=sys.stderr)
                        return 1
                    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(png),
                                    "-q:v", "4", str(jpg)], check=True)
                    png.unlink()
                b64 = base64.b64encode(jpg.read_bytes()).decode()
                rendered[sid].append((label, abs_frame / FPS, b64))
    finally:
        try:
            # 復元: 元々あったファイルは内容を戻し、無かったファイルは削除して元に戻す
            for name in ("production.json", "timing.json"):
                if name not in existed:
                    continue
                f = src / name
                if existed[name]:
                    f.write_bytes(backups[name])
                else:
                    f.unlink(missing_ok=True)
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            lock_file.close()

    rows = []
    unit_no = 0
    for scene in production["scenes"]:
        sid = scene["id"]
        start, frames, offs = starts[sid]
        start_sec = start / FPS
        imgs = "".join(
            f'<figure><img src="data:image/jpeg;base64,{b64}"><figcaption>{html.escape(label)}（{mmss(t)}）</figcaption></figure>'
            for label, t, b64 in rendered[sid])
        meta = []
        if scene.get("shoulder"):
            meta.append(f"肩テロップ: {html.escape(scene['shoulder'])}")
        if scene.get("headline"):
            meta.append(f"見出し: {html.escape(scene['headline'])}")
        if scene.get("accentTelop"):
            meta.append(f"アクセント: {html.escape(scene['accentTelop']['text'])}")
        if scene.get("hook"):
            h = scene["hook"]
            meta.append("フック文字: " + " ／ ".join(html.escape(x) for x in h.get("lines", [])))
            if h.get("sub"):
                meta.append(f"フック小文字: {html.escape(h['sub'])}")
        if scene.get("titleCard"):
            tc = scene["titleCard"]
            meta.append("タイトル: " + " ／ ".join(html.escape(x) for x in tc.get("lines", [])))
            if tc.get("sub"):
                meta.append(f"サブ: {html.escape(tc['sub'])}")
        for line in diagram_text(scene):
            meta.append("図解: " + html.escape(line))
        if scene.get("endCard"):
            for s in scene["endCard"].get("summary", []):
                meta.append("要約: " + html.escape(s))
            for s in scene["endCard"].get("sources", []):
                meta.append("出典: " + html.escape(s.get("label", "")))
        narr = []
        for i, line in enumerate(scene.get("narration") or []):
            unit_no += 1
            t = start_sec + (offs[i] if i < len(offs) else 0.0)
            narr.append(f'<li><span class="uno">{unit_no}</span><span class="time">{mmss(t)}</span>{html.escape(line)}</li>')
        meta_html = "".join(f"<div class='meta'>{m}</div>" for m in meta)
        narr_html = f"<ol class='narr'>{''.join(narr)}</ol>" if narr else "<div class='meta'>（ナレーションなし）</div>"
        rows.append(
            f"<section><h2>{sid} <span class='type'>{html.escape(scene['type'])}</span> "
            f"<span class='range'>{mmss(start_sec)} – {mmss(start_sec + frames / FPS)}</span></h2>"
            f"<div class='row'><div class='left'>{imgs}</div>"
            f"<div class='right'>{meta_html}{narr_html}</div></div></section>")

    total_sec = total_frames / FPS
    doc = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<title>絵コンテ: {html.escape(production.get('title',''))}</title>
<style>
body {{ font-family: sans-serif; margin: 24px; background: #f4f6f9; color: #17222e; }}
h1 {{ font-size: 20px; }} .total {{ color: #456; margin-bottom: 16px; }}
section {{ background: #fff; border: 1px solid #d5dde6; border-radius: 10px; padding: 16px 18px; margin-bottom: 18px; }}
h2 {{ font-size: 17px; margin: 0 0 10px; }} .type {{ color: #0f62b4; }} .range {{ color: #678; font-weight: normal; font-size: 13px; }}
.row {{ display: flex; gap: 20px; align-items: flex-start; }}
.left {{ flex: 0 0 56%; }} .right {{ flex: 1; min-width: 280px; }}
figure {{ margin: 0 0 10px; }} img {{ width: 100%; border-radius: 6px; display: block; }}
figcaption {{ font-size: 12px; color: #678; margin-top: 4px; }}
.meta {{ font-size: 13px; color: #34506b; background: #eef4fb; border-radius: 6px; padding: 5px 9px; margin-bottom: 6px; }}
ol.narr {{ margin: 8px 0 0; padding-left: 4px; list-style: none; }}
ol.narr li {{ font-size: 15px; line-height: 1.65; margin-bottom: 7px; }}
.uno {{ display: inline-block; background: #0f62b4; color: #fff; border-radius: 50%; width: 20px; height: 20px; text-align: center; font-size: 12px; line-height: 20px; margin-right: 7px; }}
.time {{ color: #89a; font-size: 12px; margin-right: 7px; }}
@media (max-width: 800px) {{ .row {{ flex-direction: column; }} .left {{ flex: none; width: 100%; }} }}
</style></head><body>
<h1>絵コンテ ― {html.escape(production.get('title',''))}</h1>
<div class="total">総尺 約{mmss(total_sec)}（{total_sec:.0f}秒）／ 左=画面、右=画面の文字列とナレーション（番号は通し、時刻は開始位置）</div>
{''.join(rows)}
</body></html>"""
    for w in check_production(args.production):
        print(f"⚠ レイアウト: {w}", file=sys.stderr)
    out = Path(args.out_html)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(doc, encoding="utf-8")
    print(json.dumps({"out": str(out), "scenes": len(production["scenes"]),
                      "frames": sum(len(v) for v in rendered.values()),
                      "total_sec": round(total_sec, 1)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
