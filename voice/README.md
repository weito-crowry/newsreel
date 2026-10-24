# newsreel voice/ — 読み替え辞書と読み確認

VOICEVOX 合成の前に、読み間違いやすい語を正しい読みへ置き換えるための一式です。

| ファイル | 内容 |
|---|---|
| `reading_dict.json` | 読み替え辞書本体（`entries`: 表記 → 読み）。適用は3段構え: (1)単語単位の読み替え (2)文脈で読みが変わる漢字はフレーズ単位で登録（例: 「生のインターネット」→「なまのインターネット」） (3)それでも難しい箇所は合成用テキストだけをひらがな化する |
| `apply_reading_dict.py` | 辞書をテキストに適用するモジュール兼CLI。長い表記から優先して置換。runner.py はこのモジュールを読み込んで使う |
| `check_kana.py` | VOICEVOX が文をどう読むか（カナ）を表示する確認ツール。辞書に登録すべき語を探すときに使う |

## 使い方

```bash
# 辞書の適用（ファイル → 標準出力。適用箇所は標準エラーに報告）
python3 apply_reading_dict.py input.txt

# 辞書への登録・一覧
python3 apply_reading_dict.py --add "表記=読み"
python3 apply_reading_dict.py --list

# 読みの確認（VOICEVOX エンジンが必要）
~/workspace/voicevox/venv/bin/python check_kana.py "読みを調べたい文"
```

## 前提（エンジン本体はパッケージ外）

VOICEVOX エンジン一式（モデル `0.vvm`、ONNX Runtime、OpenJTalk辞書、venv）は
**`~/workspace/voicevox/`** にあります。大きいのでパッケージには含めていません。
置き場所が違う場合は、環境変数 `VOICEVOX_DIR` で指定してください
（`check_kana.py` と runner.py の `--voicevox-dir` が参照します）。

なお字幕・画面表示には原文を使い、読み替えは**音声合成用テキストにだけ**適用するのが前提です。
