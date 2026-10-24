#!/usr/bin/env python3
"""VOICEVOX がテキストをどう読むか（カナ）を確認する小さな道具。

読み替え辞書に登録すべき語を探すときに使う。合成はせず、読みだけを表示する。

使い方:
  ~/workspace/voicevox/venv/bin/python check_kana.py
  ~/workspace/voicevox/venv/bin/python check_kana.py "読みを調べたい文" ...

前提: VOICEVOX エンジン一式（0.vvm / vort / OpenJTalk辞書）はパッケージ外の
~/workspace/voicevox/ にある。置き場所が違う場合は環境変数 VOICEVOX_DIR で指定する。
"""
import os
import sys
from pathlib import Path

from voicevox_core.blocking import Onnxruntime, OpenJtalk, Synthesizer, VoiceModelFile

BASE = Path(os.environ.get("VOICEVOX_DIR") or (Path.home() / "workspace" / "voicevox"))
ort = Onnxruntime.load_once(filename=str(BASE / "vort/lib/libvoicevox_onnxruntime.so.1.23.2"))
synth = Synthesizer(ort, OpenJtalk(str(BASE / "dict/open_jtalk_dic_utf_8-1.11")), acceleration_mode="CPU")
with VoiceModelFile.open(BASE / "0.vvm") as model:
    synth.load_voice_model(model)

texts = sys.argv[1:] or [
    "OpenAIが発表しました。",
    "オープンエーアイが発表しました。",
    "DNSリゾルバの脆弱性です。",
    "ディーエヌエスリゾルバのぜいじゃくせいです。",
]
for text in texts:
    q = synth.create_audio_query(text, 2)
    print(text, "=>", q.kana)
