#!/usr/bin/env python3
"""読み替え辞書をテキストに適用する。

使い方:
  python3 apply_reading_dict.py input.txt [-o output.txt]   # 置換して出力（既定は標準出力、適用箇所は標準エラーに報告）
  python3 apply_reading_dict.py --add "表記=読み"           # 辞書に登録（上書き）
  python3 apply_reading_dict.py --list                      # 辞書一覧

辞書: 同じディレクトリの reading_dict.json（entries: 表記 -> 読み）
置換は長い表記から優先（例: ChatGPT を GPT より先に処理する）。
字幕表示用の原文は別に保持し、音声合成用テキストにだけ適用するのが前提。
"""
import json
import sys
from pathlib import Path

DICT_PATH = Path(__file__).with_name("reading_dict.json")


def load_dict() -> dict:
    data = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    return data.get("entries", {})


def save_dict(entries: dict) -> None:
    data = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    data["entries"] = dict(sorted(entries.items(), key=lambda kv: -len(kv[0])))
    DICT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def apply_dict(text: str, entries: dict) -> tuple[str, list[tuple[str, str, int]]]:
    applied = []
    for surface in sorted(entries, key=len, reverse=True):
        reading = entries[surface]
        count = text.count(surface)
        if count:
            text = text.replace(surface, reading)
            applied.append((surface, reading, count))
    return text, applied


def main(argv: list[str]) -> int:
    if "--list" in argv:
        for k, v in load_dict().items():
            print(f"{k} = {v}")
        return 0
    if "--add" in argv:
        pair = argv[argv.index("--add") + 1]
        surface, reading = pair.split("=", 1)
        entries = load_dict()
        entries[surface] = reading
        save_dict(entries)
        print(f"登録しました: {surface} = {reading}（辞書は全{len(entries)}件）")
        return 0
    if not argv:
        print(__doc__)
        return 1
    src = Path(argv[0]).read_text(encoding="utf-8")
    out, applied = apply_dict(src, load_dict())
    if "-o" in argv:
        Path(argv[argv.index("-o") + 1]).write_text(out, encoding="utf-8")
    else:
        print(out)
    for surface, reading, count in applied:
        print(f"[読み替え] {surface} -> {reading} （{count}か所）", file=sys.stderr)
    if not applied:
        print("[読み替え] 適用なし", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
