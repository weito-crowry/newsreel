# 制作ランナー構築ログ

- 日付: 2026-10-25（JST）
- 土台: 試作プロジェクト `~/workspace/video-prod/openai-isolation/`（Remotion 4.0.469）
- 実装した3原則: ①開発中は低画質（--scale 0.5）②シーン単位レンダリング＋後で連結 ③Windowsでも動く形

## 作ったもの

| 対象 | 内容 |
|---|---|
| `openai-isolation/src/production.json` | **動画スクリプトJSON**（入力の実例）。メタ情報（タイトル/声・速度）、シーン配列（種別・肩/見出し/要約テロップ・出典・図解指定・ナレーション文配列）を1本に集約 |
| `openai-isolation/src/layout.ts` | JSON駆動に再構成。シーン単体レイアウト（相対フレーム）生成＋全編レイアウトの両対応 |
| `openai-isolation/src/components.tsx` | 共通部品（背景・肩テロップ・見出し・字幕・出典・バッジ）と図解・カード類を分離。図解はJSONの `diagram` 指定で切替。フォントスタックに游ゴシック/メイリオを追加（Windows対策） |
| `openai-isolation/src/Video.tsx` / `Root.tsx` | 全編 `NewsVideo` に加え、シーン別 Composition（S1/T/S2/S3/S4/S5/S6/E）を登録 |
| `runner/runner.py` | 制作ランナー本体（下記フロー）。コマンド1回で全自動 |
| `runner/README.md` | 使い方＋**JSONスキーマ説明**（将来LLMがJSONを直接出力する前提の設計） |
| `runner/README-WINDOWS.md` | Windows手順書（Node LTS、npm ci、初回Chrome自動DL、フォント注意、コマンド集） |
| `openai-isolation/package.json` | scripts をクロスプラットフォームな render 系コマンドに差し替え |

### ランナーのフロー

`python3 runner.py production.json --mode dev` で:
1. 入力JSONをプロジェクトの `src/production.json` へ配置
2. 読み替え辞書（`~/workspace/voicevox/apply_reading_dict.py`）を合成用テキストにのみ適用（字幕は原文保持）
3. VOICEVOX合成（四国めたん style_id 2、速度はJSON指定=1.12）→文単位WAV＋実尺を `src/timing.json` へ
4. シーン別に Remotion レンダリング（dev=--scale 0.5 / final=フル、TMPDIRはプロジェクト配下 `.tmp` を必ず指定、既存シーンmp4は再利用）
5. 無音シーン（タイトル/エンディング）に無音AACを足してストリーム構成を統一
6. ffmpeg concat（stream copy を試行し、尺がずれれば再エンコードへ自動フォールバック）
7. ffprobe 検証＋ `production-log.md` 出力

音声だけ差し替えモード（`--audio-only-from`）: 既存timing.jsonのオフセットを維持して再合成音声を配置し、`-c:v copy` で映像無劣化のまま差し替え。

## 検証結果（実測）

| 検証 | 結果 | 所要 |
|---|---|---|
| Composition一覧 | 全9種（NewsVideo＋シーン8種）、尺は再構成前と完全一致（全編3215フレーム=107.17s ※旧timing時点） | 約14s |
| S3単体（合成込み・dev） | 辞書適用9件を確認。S3=488フレーム描画、連結 stream copy、実尺16.32s（予測16.27s）、音声あり | 合成95.2s＋描画58.6s、計154.7s |
| 全編（dev・--skip-synth） | 8シーン描画→連結 stream copy。完成尺 **102.93s**、音声が全編通っていること（60s/85s地点の音量測定）とタイトル/エンディング/本文の静止画を目視確認 | 306.4s（描画は約0.10s/フレーム） |
| final画質（Tシーン単体） | 1920×1080 で描画成功、尺3.05s（予測3.00s） | 40.4s（90フレーム、バンドル含む） |
| 音声だけ差し替え | dev完成mp4を元に実施。映像 stream copy のまま新音声に差し替え成功（103.00s、音声あり） | 103.2s（うち再合成が大半） |

### 尺についての注意

完成尺は試作の 107.2s ではなく **約102.9s** です。差の原因は読み替え辞書の適用で、英字語をカタカナ読みにした分だけ発話が短くなりました（ナレーション合計 94.4s → 89.7s）。仕様どおりの挙動であり、異常ではありません。

### 速度の目安（2コアVM）

- dev（960×540）: 約0.10s/フレーム → 全編描画 約5分
- final（1920×1080）: 約0.32s/フレーム → 全編だと約17分（試作時の実測どおり）。シーン分割により、修正時は該当シーン分だけで済む

## 詰まった点・残課題

- **シーン連結の互換性**: 音声のないシーン（タイトル/エンディング）は Remotion 出力に音声ストリームが無く、そのままだと concat copy が揃わない。→ ランナーが無音AAC（48kHzステレオ）を自動追加して解決。
- **連結方式**: 全シーン同一条件の出力のため stream copy で問題なし（実測で確認）。将来シーン間で条件が変わる場合は自動フォールバック（再エンコード）が働く。
- **合成ステップのOS依存**: VOICEVOX core の onnxruntime ライブラリパス（`.so`）は Linux 前提。Windows 対応は「合成済み素材を持ち込んで描画だけ回す」までで、Windows での合成は未対応（手順書に明記）。
- **Windows実機確認は未実施**（Tanaka側の作業）。コード側は OS 依存パス・シェル前提を排除済み（npx は Windows で shell 経由実行、パスは pathlib、TMPDIR/TEMP/TMP を自動設定）。
- 試作の完成動画（`goals/.../openai-isolation-news.mp4`）には一切触れていない。検証出力は `openai-isolation/out/` と `runner/out/` 配下の別名ファイル。
