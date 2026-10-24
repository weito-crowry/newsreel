# newsreel — ニュース動画 制作パッケージ

ニュース動画の制作パイプラインを1つにまとめた自己完結パッケージです（正式名称: **newsreel**）。
**動画スクリプトJSON を1本渡すだけで、音声合成から完成mp4まで** を作ります。
配布は GitHub リポジトリ（newsreel）で行います。JSON を別のPCに渡せば、その場で動画生成できます
（Windows の手順は [runner/README-WINDOWS.md](runner/README-WINDOWS.md)）。

> **このパッケージが正式版です（2026-10-25 整理）。** 元の配置（`~/workspace/video-prod/`、
> `~/workspace/voicevox/`）のファイルは互換のために残してありますが、今後の制作・改修は
> このパッケージ側で行ってください。経緯は [PACKAGE_LOG.md](PACKAGE_LOG.md) を参照。

## パイプラインの流れ

```
動画スクリプトJSON (production.json)
│
├─ ① 読み替え辞書を適用 voice/reading_dict.json（合成用テキストのみ。字幕は原文）
├─ ② VOICEVOX で文単位に合成 四国めたん等の声で1文ずつ合成し、実尺を計測
├─ ③ シーン別にレンダリング Remotion（template/）。シーンごとに mp4 を作る
├─ ④ ffmpeg で連結 stream copy 優先、ずれれば再エンコード
└─ ⑤ 完成mp4 ＋ 制作ログ 工程別の所要時間つき production-log.md
```

制作の実行は `runner/runner.py` が担います。コマンド1回で上記が全部流れます。

## フォルダ構成

| フォルダ | 役割 |
|---|---|
| `runner/` | 制作ランナー本体（`runner.py`）とその説明（`README.md` / `README-WINDOWS.md` / 構築記録 `RUNNER_LOG.md`） |
| `template/` | Remotion プロジェクトのテンプレート。画面部品・図解・レイアウトはすべて `production.json` 駆動で、話題固有の文言はコードに持たない |
| `voice/` | 読み替え辞書（`reading_dict.json` / `apply_reading_dict.py`）と読み確認ツール（`check_kana.py`）。詳細は [voice/README.md](voice/README.md) |
| `examples/` | 実例。`openai-isolation/` に試作動画「OpenAI、最先端AIをインターネットから完全隔離」の production.json と脚本を収録 |
| `PACKAGE_LOG.md` | このパッケージへの整理作業の記録 |

## クイックスタート

```bash
cd ~/workspace/news-video-package/runner

# 開発用（960x540、高速確認）— 実例で全編
~/workspace/voicevox/venv/bin/python runner.py../examples/openai-isolation/production.json --mode dev

# 最終版（1920x1080）
~/workspace/voicevox/venv/bin/python runner.py../examples/openai-isolation/production.json --mode final
```

出力は `template/out/<動画id>-<mode>/` に、完成mp4・シーン別mp4・制作ログが入ります。

主な使い方（詳細は [runner/README.md](runner/README.md)）:

| やりたいこと | 方法 |
|---|---|
| シーン単体だけ作り直す | `--scenes S3 --force`（他のシーンは再利用され、再連結だけ行う） |
| 音声だけ差し替える | `--audio-only-from 既存.mp4`（映像は無劣化コピー、再レンダリングなし） |
| 合成を省いて描画だけ | `--skip-synth`（既存の timing.json と音声を再利用） |
| Windows で生成する | [runner/README-WINDOWS.md](runner/README-WINDOWS.md)。公式VOICEVOXアプリのHTTP API（`--synth http`）で合成も含めて Windows で完結する |

## 前提

| 必要なもの | 置き場所・備考 |
|---|---|
| VOICEVOX エンジン一式 | **パッケージ外**の `~/workspace/voicevox/`（`0.vvm` / `vort/` / OpenJTalk辞書 / `venv/`）。大きいのでパッケージには含めない。場所を変える場合は環境変数 `VOICEVOX_DIR` か runner の `--voicevox-dir` で指定 |
| Python | core 合成では VOICEVOX の venv の Python で runner を実行する（`~/workspace/voicevox/venv/bin/python`）。`--synth http`（公式エンジンHTTP API）や描画だけなら通常の python3 で可 |
| Node.js | Remotion の実行に必要。`template/node_modules` は用意済み（無い環境では `template/` で `npm ci`） |
| ffmpeg / ffprobe | シーン連結・無音トラック追加・検証に使用。PATH が通っていること |

## ニュース収集側との関係

このパッケージは「制作」専用です。前段の流れはパッケージ外にあります:

```
RSS収集（~/workspace/news-pipeline/、毎時cron → Google Sheets「AIニュース収集」）
→ 選別アプリで人間が話題を選択
→ 脚本作成（production.json を書く。将来はLLMが直接出力する想定）
→ runner.py で動画化
→ YouTube 投稿準備（半自動）
```

収集・選別側の仕組みはこのパッケージには含まれません。production.json の書き方は
[runner/README.md のスキーマ説明](runner/README.md#動画スクリプトjson-スキーマ) を参照してください。
