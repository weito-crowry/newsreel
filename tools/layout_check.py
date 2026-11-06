"""レイアウトのはみ出しチェック（2026-10-26 田中さんの指定で追加）。

summary-points の縦・横のはみ出しと見出しの横幅を、テンプレの実寸
（1920x1080、SummaryDiagram / Headline の定数）から見積もって警告する。
見積もりは警告用途の近似で、正確な描画幅ではない。はみ出す脚本は
チェックで弾き、対応はページ分け（pageBreakBefore）で行う。
"""
import json
import sys
import unicodedata
from pathlib import Path


def text_width(s: str, fs: float) -> float:
    w = 0.0
    for ch in s:
        eaw = unicodedata.east_asian_width(ch)
        w += fs * (1.0 if eaw in ("W", "F", "A") else 0.52)
    return w


def check_scene(scene: dict) -> list[str]:
    warns: list[str] = []
    sid = scene.get("id", "?")
    if scene.get("diagram") == "summary-points":
        full = bool(scene.get("pointsFull"))
        fs = 66 if full else 46
        sup_fs = 48 if full else 37
        lh = 1.5 if full else 1.45
        top = 170 if full else 250
        min_h = 92 if full else 62
        margin = 56 if full else 30
        area_w = (1740 if full else 1720) - ((76 if full else 58) + 24)
        points = [
            p if isinstance(p, dict) else {"text": p}
            for p in (scene.get("diagramData") or {}).get("points", [])
        ]
        pages: list[list[dict]] = [[]]
        for p in points:
            if p.get("pageBreakBefore") and pages[-1]:
                pages.append([])
            pages[-1].append(p)
            if p.get("pageBreakBefore") and p.get("atUnit") is None:
                warns.append(
                    f"{sid}: pageBreakBefore の項目に atUnit が無い"
                    "（ページの切り替わりはその項目の atUnit の文から）"
                )
        for pi, page in enumerate(pages):
            total = float(top)
            for j, p in enumerate(page):
                h = 0.0
                for ln in str(p.get("text", "")).split("\n"):
                    f = sup_fs if ln.startswith(("（", "(")) else fs
                    w = text_width(ln, f)
                    if w > area_w:
                        warns.append(
                            f"{sid}: ページ{pi + 1} の行が横にはみ出す見積もり"
                            f"（約{int(w)}px > {area_w}px）: {ln[:24]}"
                        )
                    h += f * lh
                total += max(min_h, h) + (margin if j < len(page) - 1 else 0)
            if total > 1080:
                warns.append(
                    f"{sid}: ページ{pi + 1} が縦にはみ出す見積もり"
                    f"（約{int(total)}px > 1080px）。pageBreakBefore でページを分けること"
                )
    # --- 追加図解（2026-11-06 第1弾・第2弾）のはみ出し見積もり ---
    # テンプレの実寸（components.tsx の各 Diagram の定数）からの近似。
    # summary-points と同じく警告用途の見積もりで、正確な描画幅ではない。
    kind = scene.get("diagram")
    d = scene.get("diagramData") or {}
    if kind == "hero-number":
        top = 215.0
        v = str(d.get("value", ""))
        if v:
            w = text_width(v, 190)
            if w > 1600:
                warns.append(f"{sid}: 主数字が横にはみ出す見積もり（約{int(w)}px > 1600px）: {v[:16]}")
            top += 190 * 1.25 + 6
        if d.get("label"):
            top += 44
        if d.get("valueNote"):
            top += 44 * 1.5 + 10
        subs = d.get("sub") or []
        if subs:
            sub_h = 0.0
            for s in subs:
                for ln in str(s.get("label", "")).split("\n"):
                    w = text_width(ln, 36)
                    if w > 380:
                        warns.append(f"{sid}: 副数字のラベルが横にはみ出す見積もり（約{int(w)}px > 380px）: {ln[:16]}")
                sub_h = max(sub_h, 64 * 1.2 + 8 + 36 * 1.45 * max(1, len(str(s.get("label", "")).split("\n"))) + 44)
            top += 52 + sub_h
        if d.get("note"):
            top += 40 + 36 * 1.5 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: hero-number が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind in ("numbers-table", "benchmark-table"):
        top = 225.0
        cols = d.get("columns") or []
        rows = d.get("rows") or [] if kind == "numbers-table" else d.get("benchRows") or []
        name_key = "label" if kind == "numbers-table" else "model"
        header_lines = max([len(str(c).split("\n")) for c in cols] + [1])
        top += header_lines * 38 * 1.35 + 14
        cell_w = (1600 - 500 - 48) / max(1, len(cols)) if cols else 0
        for r in rows:
            for ln in str(r.get(name_key, "")).split("\n"):
                w = text_width(ln, 40)
                if w > 452:
                    warns.append(f"{sid}: 行ラベルが横にはみ出す見積もり（約{int(w)}px > 452px）: {ln[:16]}")
            for val in r.get("values") or []:
                for ln in str(val).split("\n"):
                    w = text_width(ln, 48)
                    if cols and w > cell_w:
                        warns.append(f"{sid}: 数値セルが横にはみ出す見積もり（約{int(w)}px > {int(cell_w)}px）: {ln[:16]}")
            if cols and len(r.get("values") or []) != len(cols):
                warns.append(f"{sid}: 行の値の数（{len(r.get('values') or [])}）が列数（{len(cols)}）と一致しない")
        top += 108 * len(rows)
        if d.get("note"):
            top += 26 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: 表が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
        if kind == "benchmark-table":
            for ci, ri in enumerate(d.get("best") or []):
                if ri is not None and not (0 <= ri < len(rows)):
                    warns.append(f"{sid}: best[{ci}] の行index（{ri}）が行数（{len(rows)}）の範囲外")
    elif kind in ("steps", "items"):
        entries = d.get("steps") or [] if kind == "steps" else d.get("items") or []
        n = max(1, len(entries))
        if kind == "steps":
            box_w = (1600 - (n - 1) * (56 + 44)) / n
        else:
            box_w = (1600 - (n - 1) * 30) / n
        inner = box_w - 52
        title_fs = 42 if kind == "steps" else 44
        for e in entries:
            for ln in str(e.get("title", "")).split("\n"):
                w = text_width(ln, title_fs)
                if w > inner:
                    warns.append(f"{sid}: 箱の見出しが横にはみ出す見積もり（約{int(w)}px > {int(inner)}px）: {ln[:16]}")
            for ln in str(e.get("text", "")).split("\n"):
                w = text_width(ln, 38)
                if w > inner:
                    warns.append(f"{sid}: 箱の本文が横にはみ出す見積もり（約{int(w)}px > {int(inner)}px）: {ln[:16]}")
    elif kind == "quote":
        top = 225.0
        if d.get("context"):
            top += 38 * 1.45 * len(str(d["context"]).split("\n"))
        for ln in str(d.get("quote", "")).split("\n"):
            w = text_width(ln, 58)
            if w > 1444:
                warns.append(f"{sid}: 引用文が横にはみ出す見積もり（約{int(w)}px > 1444px）: {ln[:16]}")
            top += 58 * 1.5
        if d.get("quote"):
            top += 18
        if d.get("speaker") or d.get("role"):
            top += 54 + 44
        if top > 1080:
            warns.append(f"{sid}: quote が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "benchmark-chart":
        top = 225.0
        bars = d.get("bars") or []
        if d.get("benchmark"):
            top += 44
        max_val = max([float(b.get("value") or 0) for b in bars] + [0.0])
        axis_max = d.get("max") or max(10, -(-int(max_val * 1.2) // 10) * 10)
        track_w = 1600 - 460 - 28
        for b in bars:
            for ln in str(b.get("model", "")).split("\n"):
                w = text_width(ln, 40)
                if w > 432:
                    warns.append(f"{sid}: モデル名が横にはみ出す見積もり（約{int(w)}px > 432px）: {ln[:16]}")
            pct = (float(b.get("value") or 0) / axis_max) if axis_max else 0
            label = f"{b.get('value', '')}{d.get('unit', '')}"
            w = text_width(label, 48)
            rest = track_w * (1 - min(1.0, pct)) + 160  # 右端の余白（画面端まで）も使う
            if w > rest:
                warns.append(f"{sid}: 値ラベルが横にはみ出す見積もり（約{int(w)}px > {int(rest)}px）: {label[:16]}")
        top += 34 + len(bars) * 84 + max(0, len(bars) - 1) * 34
        if d.get("note"):
            top += 30 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: benchmark-chart が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "code-block":
        top = 225.0
        if d.get("caption"):
            top += 38 * 1.45 + 24
        if d.get("above"):
            top += 38 * 1.55 * len(str(d["above"]).split("\n")) + 24
        for ln in d.get("lines") or []:
            w = 0.0
            for ch in str(ln):
                w += 42.0 if unicodedata.east_asian_width(ch) in ("W", "F") else 42 * 0.6
            if w > 1504:
                warns.append(f"{sid}: コード行が横にはみ出す見積もり（約{int(w)}px > 1504px）: {str(ln)[:24]}")
        top += 72 + 42 * 1.6 * len(d.get("lines") or [])
        if d.get("below"):
            top += 26 + 38 * 1.55 * len(str(d["below"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: code-block が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "delta":
        for key, fs in (("before", 72), ("after", 110)):
            v = str(d.get(key, ""))
            if v:
                w = text_width(v, fs)
                if w > 680:
                    warns.append(f"{sid}: delta の {key} が横にはみ出す見積もり（約{int(w)}px > 680px）: {v[:16]}")
        if d.get("change"):
            w = text_width(str(d["change"]), 64)
            if w > 1600:
                warns.append(f"{sid}: delta の change が横にはみ出す見積もり（約{int(w)}px > 1600px）")
    elif kind == "stat-grid":
        stats = d.get("stats") or []
        cell_w = (1600 - 30) / 2 if len(stats) == 4 else (1600 - 60) / 3
        inner = cell_w - 68
        for s in stats:
            for ln in str(s.get("value", "")).split("\n"):
                w = text_width(ln, 72)
                if w > inner:
                    warns.append(f"{sid}: stat-grid の値が横にはみ出す見積もり（約{int(w)}px > {int(inner)}px）: {ln[:16]}")
            for ln in str(s.get("label", "")).split("\n"):
                w = text_width(ln, 36)
                if w > inner:
                    warns.append(f"{sid}: stat-grid のラベルが横にはみ出す見積もり（約{int(w)}px > {int(inner)}px）: {ln[:16]}")
    elif kind == "spec-list":
        top = 225.0
        if d.get("subject"):
            top += 44 + 26
        specs = d.get("specs") or []
        for r in specs:
            for ln in str(r.get("item", "")).split("\n"):
                w = text_width(ln, 40)
                if w > 512:
                    warns.append(f"{sid}: spec-list の項目が横にはみ出す見積もり（約{int(w)}px > 512px）: {ln[:16]}")
            for ln in str(r.get("value", "")).split("\n"):
                w = text_width(ln, 48)
                if w > 992:
                    warns.append(f"{sid}: spec-list の値が横にはみ出す見積もり（約{int(w)}px > 992px）: {ln[:16]}")
        top += 96 * len(specs)
        if d.get("note"):
            top += 26 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: spec-list が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "changelog":
        top = 230.0
        changes = d.get("changes") or []
        for c in changes:
            for ln in str(c.get("text", "")).split("\n"):
                w = text_width(ln, 40)
                if w > 1396:
                    warns.append(f"{sid}: changelog の本文が横にはみ出す見積もり（約{int(w)}px > 1396px）: {ln[:16]}")
            if c.get("kind") not in ("added", "changed", "fixed", "removed"):
                warns.append(f"{sid}: changelog の kind が不正（{c.get('kind')}）。added/changed/fixed/removed のいずれかにすること")
        top += 92 * len(changes)
        if d.get("note"):
            top += 24 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: changelog が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "ranking-list":
        top = 225.0
        if d.get("rankTitle"):
            top += 44 + 22
        entries = d.get("entries") or []
        for e in entries:
            for ln in str(e.get("name", "")).split("\n"):
                w = text_width(ln, 44)
                if w > 1150:
                    warns.append(f"{sid}: ranking-list の名称が横にはみ出す見積もり（約{int(w)}px > 1150px）: {ln[:16]}")
            if e.get("score"):
                w = text_width(str(e["score"]), 48)
                if w > 300:
                    warns.append(f"{sid}: ranking-list のスコアが横にはみ出す見積もり（約{int(w)}px > 300px）: {str(e['score'])[:16]}")
        top += 84 * len(entries)
        if d.get("note"):
            top += 24 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: ranking-list が縦にはみ出す見積もり（約{int(top)}px > 1080px）")

    elif kind == "trend-chart":
        top = 215.0
        series = d.get("series") or []
        n = max([len(s.get("points") or []) for s in series] + [1])
        if d.get("label"):
            top += 54
        if len(series) > 1:
            top += 48
        spacing = 1420 / (n - 1) if n > 1 else 1420
        for s in series:
            for pt in s.get("points") or []:
                w = text_width(str(pt.get("value", "")), 40)
                if w > spacing:
                    warns.append(f"{sid}: trend-chart の値ラベルが隣と重なる見積もり（約{int(w)}px > {int(spacing)}px）")
                w = text_width(str(pt.get("label", "")), 36)
                if w > spacing:
                    warns.append(f"{sid}: trend-chart の時点ラベルが横にはみ出す見積もり（約{int(w)}px > {int(spacing)}px）: {str(pt.get('label',''))[:16]}")
        top += 10 + 460 + 96
        if d.get("note"):
            top += 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: trend-chart が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "post-card":
        top = 225.0 + 84 + 96
        for ln in str(d.get("text", "")).split("\n"):
            w = text_width(ln, 46)
            if w > 1136:
                warns.append(f"{sid}: post-card の投稿文が横にはみ出す見積もり（約{int(w)}px > 1136px）: {ln[:16]}")
            top += 46 * 1.6
        if d.get("name"):
            w = text_width(str(d["name"]), 44)
            if w > 800:
                warns.append(f"{sid}: post-card の表示名が横にはみ出す見積もり（約{int(w)}px > 800px）")
        if d.get("likes") or d.get("reposts"):
            top += 34 + 26 + 54
        if d.get("note"):
            top += 26 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: post-card が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "relation-map":
        nodes = d.get("nodes") or []
        if (d.get("mode") or "hub") == "tree":
            n = max(1, len(nodes))
            child_w = (1600 - (n - 1) * 40) / n
            for nd in nodes:
                for ln in str(nd.get("text", "")).split("\n"):
                    w = text_width(ln, 34)
                    if w > child_w - 56:
                        warns.append(f"{sid}: relation-map のノード本文が横にはみ出す見積もり（約{int(w)}px > {int(child_w - 56)}px）: {ln[:16]}")
            top = 215 + 520
        else:
            for nd in nodes:
                for ln in str(nd.get("text", "")).split("\n"):
                    w = text_width(ln, 34)
                    if w > 364:
                        warns.append(f"{sid}: relation-map のノード本文が横にはみ出す見積もり（約{int(w)}px > 364px）: {ln[:16]}")
                for ln in str(nd.get("title", "")).split("\n"):
                    w = text_width(ln, 40)
                    if w > 364:
                        warns.append(f"{sid}: relation-map のノード名が横にはみ出す見積もり（約{int(w)}px > 364px）: {ln[:16]}")
            if len(nodes) > 6:
                warns.append(f"{sid}: relation-map のノードが上限（6件）を超えている")
            top = 205 + 580
        if d.get("note"):
            top += 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: relation-map が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "scatter":
        pts = d.get("chartPoints") or []
        if len(pts) > 12:
            warns.append(f"{sid}: scatter の点が上限（12点）を超えている")
        for pt in pts:
            w = text_width(str(pt.get("name", "")), 38)
            if w > 560:
                warns.append(f"{sid}: scatter の名前ラベルが横にはみ出す見積もり（約{int(w)}px > 560px）: {str(pt.get('name',''))[:16]}")
        top = 215 + 44 + 6 + 470 + 90
        if d.get("note"):
            top += 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: scatter が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "delta-multi":
        items = d.get("slopeItems") or []
        if len(items) > 6:
            warns.append(f"{sid}: delta-multi の項目が上限（6件）を超えている")
        for it in items:
            for ln in str(it.get("label", "")).split("\n"):
                w = text_width(ln, 38)
                if w > 400:
                    warns.append(f"{sid}: delta-multi の項目名が横にはみ出す見積もり（約{int(w)}px > 400px）: {ln[:16]}")
        top = 215 + 92 + 440 + 70
        if d.get("note"):
            top += 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: delta-multi が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "map":
        grid = {"us": (12, 7), "jp": (10, 14)}.get(d.get("base") or "")
        grid_h = 0.0
        if grid:
            pitch = min(1150 / grid[0], 700 / grid[1])
            grid_h = pitch * grid[1]
        else:
            grid_h = 660
        for pt in d.get("mapPoints") or []:
            for ln in str(pt.get("name", "")).split("\n"):
                w = text_width(ln, 29)
                if w > 250:
                    warns.append(f"{sid}: map のピン名が横にはみ出す見積もり（約{int(w)}px > 250px）: {ln[:16]}")
            if pt.get("value"):
                w = text_width(str(pt["value"]), 28)
                if w > 246:
                    warns.append(f"{sid}: map のピン値が横にはみ出す見積もり（約{int(w)}px > 246px）: {str(pt['value'])[:16]}")
        top = 205 + grid_h + 14
        if d.get("note"):
            top += 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: map が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "share-stack":
        top = 225.0
        for bar in d.get("stackBars") or []:
            segs = bar.get("segments") or []
            total = sum(float(s.get("value") or 0) for s in segs)
            if total <= 0:
                warns.append(f"{sid}: share-stack の区間の合計が0以下")
            for s in segs:
                if float(s.get("value") or 0) < 0:
                    warns.append(f"{sid}: share-stack に負の区間がある（構成比は正の値で書く）")
            top += 56 + 92 + 18 + 46 * max(1, -(-len(segs) // 2)) + 54
        if d.get("note"):
            top += 30 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: share-stack が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "waterfall":
        steps = d.get("wfSteps") or []
        n = len(steps) + (1 if d.get("wfStart") else 0) + (1 if d.get("wfEnd") else 0)
        col_w = min(320, (1600 - max(0, n - 1) * 56) / max(1, n))
        labels = [d.get("wfStart", {}).get("label", "")] + [s.get("label", "") for s in steps] + [d.get("wfEnd", {}).get("label", "")]
        for lb in labels:
            for ln in str(lb).split("\n"):
                w = text_width(ln, 33)
                if w > col_w + 56:
                    warns.append(f"{sid}: waterfall の列ラベルが横にはみ出す見積もり（約{int(w)}px > {int(col_w + 56)}px）: {ln[:16]}")
        top = 225 + 450 + 130
        if d.get("note"):
            top += 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: waterfall が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "grouped-bars":
        series = d.get("barSeries") or []
        groups = d.get("barGroups") or []
        all_v = [float(v or 0) for g in groups for v in (g.get("values") or [])]
        axis_max = d.get("max") or max(10, -(-int((max(all_v) if all_v else 0) * 1.15) // 10) * 10)
        for g in groups:
            for ln in str(g.get("label", "")).split("\n"):
                w = text_width(ln, 42)
                if w > 454:
                    warns.append(f"{sid}: grouped-bars の対象名が横にはみ出す見積もり（約{int(w)}px > 454px）: {ln[:16]}")
            if len(g.get("values") or []) != len(series):
                warns.append(f"{sid}: grouped-bars の値の数（{len(g.get('values') or [])}）が指標数（{len(series)}）と一致しない")
            for v in g.get("values") or []:
                if v is None:
                    continue
                w = text_width(str(v), 38)
                rest = 1120 * (1 - min(1.0, float(v) / axis_max)) if axis_max else 0
                if w + 16 > rest + 160:
                    warns.append(f"{sid}: grouped-bars の値ラベルが横にはみ出す見積もり（値 {v}）")
        top = 215 + 62 + len(groups) * (len(series) * 52 + 34)
        if d.get("note"):
            top += 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: grouped-bars が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "waffle":
        disp = d.get("display") or f"{d.get('waffleTotal', '')}件中{d.get('waffleValue', '')}件"
        w = text_width(str(disp), 110)
        if w > 880:
            warns.append(f"{sid}: waffle の大数字が横にはみ出す見積もり（約{int(w)}px > 880px）: {str(disp)[:16]}")
        if d.get("waffleTotal") is not None and float(d.get("waffleTotal") or 0) <= 0:
            warns.append(f"{sid}: waffle の total が0以下")
        top = 225 + 523
        if d.get("note"):
            top += 36 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: waffle が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "profile-card":
        top = 225.0
        if d.get("context"):
            top += 36 * 1.5 * len(str(d["context"]).split("\n")) + 20
        top += 88 + 150
        for pt in d.get("profilePoints") or []:
            lines = str(pt).split("\n")
            for ln in lines:
                w = text_width(ln, 38)
                if w > 1300:
                    warns.append(f"{sid}: profile-card の要点が横にはみ出す見積もり（約{int(w)}px > 1300px）: {ln[:16]}")
            top += 38 * 1.55 * len(lines) + 16
        if d.get("note"):
            top += 26 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: profile-card が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "radar":
        axes = d.get("axes") or []
        if not (4 <= len(axes) <= 8):
            warns.append(f"{sid}: radar の軸数（{len(axes)}）が範囲外（4〜8）")
        for a in axes:
            w = text_width(str(a), 34)
            if w > 270:
                warns.append(f"{sid}: radar の軸ラベルが横にはみ出す見積もり（約{int(w)}px > 270px）: {str(a)[:16]}")
        mx = d.get("max") or 100
        for s in d.get("radarSeries") or []:
            if len(s.get("values") or []) != len(axes):
                warns.append(f"{sid}: radar の値の数（{len(s.get('values') or [])}）が軸数（{len(axes)}）と一致しない")
            for v in s.get("values") or []:
                if float(v or 0) > mx:
                    warns.append(f"{sid}: radar の値（{v}）が max（{mx}）を超えている。正規化はデータ側で行うこと")
        top = 205 + 600
        if top > 1080:
            warns.append(f"{sid}: radar が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "quadrant":
        for pt in d.get("chartPoints") or []:
            w = text_width(str(pt.get("name", "")), 38)
            xv = max(0.0, min(100.0, float(pt.get("x") or 0)))
            if xv > 60:
                rest = (xv / 100) * 1020 - 24
                edge = "左端"
            else:
                rest = (1 - xv / 100) * 1020 - 24
                edge = "右端"
            if w > rest and rest < 560:
                warns.append(f"{sid}: quadrant の名前ラベルが{edge}にはみ出す見積もり（約{int(w)}px > {int(rest)}px）: {str(pt.get('name',''))[:16]}")
        top = 215 + 50 + 12 + 540 + 50
        if d.get("note"):
            top += 14 + 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: quadrant が縦にはみ出す見積もり（約{int(top)}px > 1080px）")
    elif kind == "venn":
        for s in d.get("sets") or []:
            for it in s.get("items") or []:
                for ln in str(it).split("\n"):
                    w = text_width(ln, 36)
                    if w > 360:
                        warns.append(f"{sid}: venn の項目が横にはみ出す見積もり（約{int(w)}px > 360px）: {ln[:16]}")
        if d.get("overlap", {}).get("label"):
            w = text_width(str(d["overlap"]["label"]), 38)
            if w > 400:
                warns.append(f"{sid}: venn の重なりラベルが横にはみ出す見積もり（約{int(w)}px > 400px）")
        top = 205 + 580 + 10
        if d.get("note"):
            top += 36 * 1.55 * len(str(d["note"]).split("\n"))
        if top > 1080:
            warns.append(f"{sid}: venn が縦にはみ出す見積もり（約{int(top)}px > 1080px）")

    hl = scene.get("headline")
    if hl:
        w = text_width(str(hl), 96)
        if w > 1700:
            warns.append(f"{sid}: 見出しが横にはみ出す見積もり（約{int(w)}px）")
    return warns


def check_production(path) -> list[str]:
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    warns: list[str] = []
    for s in doc.get("scenes", []):
        warns += check_scene(s)
    return warns


if __name__ == "__main__":
    ws = check_production(sys.argv[1])
    for w in ws:
        print("⚠", w)
    print(f"レイアウトチェック: 警告 {len(ws)} 件")
    sys.exit(1 if ws else 0)
