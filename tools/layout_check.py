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
