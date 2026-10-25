# パッケージ化作業ログ

- 日付: 2026-10-25（JST）
- 作業: 散らばっていたニュース動画制作の部品を `~/workspace/news-video-package/` に自己完結パッケージとして整理
- 方針: **コピーのみ**（元のファイルは削除・移動しない）。今後の正式版はパッケージ側
- 作業時間: 約6分（08:31〜08:37 JST。うち検証実行が約3分）

## 旧配置 → パッケージの対応

| 旧配置 | パッケージ内 | 備考 |
|---|---|---|
| `video-prod/runner/runner.py` | `runner/runner.py` | パス参照を修正（下記） |
| `video-prod/runner/README.md` / `README-WINDOWS.md` / `RUNNER_LOG.md` | `runner/` 同名 | README類はパス・スキーマを現行化 |
| `video-prod/openai-isolation/src/*` | `template/src/*` | 図解をJSON駆動化（下記）。package.json は名称を `news-video-template` に変更し、package-lock.json の name も追随 |
| `video-prod/openai-isolation/node_modules` | `template/node_modules` | `npm ci` ではなくコピーで用意（下記） |
| `voicevox/reading_dict.json` / `apply_reading_dict.py` / `check_kana.py` | `voice/` 同名 | check_kana.py はエンジン参照を環境変数化 |
| `video-prod/openai-isolation/src/production.json` | `examples/openai-isolation/production.json` | diagramData を追加した版。`template/src/production.json`（作業用コピー）にも同じ内容を配置 |
| `goals/daily-ai-news-digest/files/script-openai-internet-isolation-v2.md` | `examples/openai-isolation/` 同名 | 脚本の実例としてコピー |

パッケージに入れなかったもの: 完成動画・バックアップ等の大きな成果物（mp4）、生成済み音声（public/audio のWAV）、
静止画、`audio-swap/` 等の作業ファイル、旧 `synthesize.py`（話題固有の文単位合成スクリプト。runner.py に取って代わられたため同梱しない）。

## パッケージ化に伴う修正

### runner/runner.py（パス参照の自己完結化）
- 既定プロジェクト: `../openai-isolation` → パッケージ内の `../template`
- 読み替え辞書の読み込み先を VOICEVOX エンジンと分離。辞書モジュールはパッケージ内 `voice/` から読む（`--voice-dir` で変更可）
- VOICEVOX エンジン（`0.vvm` / `vort` / OpenJTalk辞書 / venv）は外部のまま。既定は `../../voicevox`（=`~/workspace/voicevox`）、環境変数 `VOICEVOX_DIR` でも指定可

### template（図解のJSON駆動化）
- `components.tsx` の図解5種（sandbox / timeline / redteam / split / summary-points）に残っていた話題固有の文言
  （年表の出来事、対比カラムの文言、要点リスト等）を、すべて `production.json` の `diagramData` へ移した。
  コード側は汎用描画＋話題非依存のフォールバックのみ
- `layout.ts` の `SceneDef` に `diagramData`（型 `DiagramData`）を追加
- timeline の表示タイミングは `atUnit` で指定（文番号 / null=そのシーンでは非表示）。元の描画挙動と一致させた

### voice/check_kana.py
- エンジン参照が「自ファイルと同じフォルダ」だったのを、環境変数 `VOICEVOX_DIR` → 既定 `~/workspace/voicevox` に変更。
  調べたい文をコマンドライン引数で渡せるようにした

## 検証結果（実測）

パッケージの runner で実例を S3 単体・dev 画質で実行:

```bash
cd ~/workspace/news-video-package/runner
~/workspace/voicevox/venv/bin/python runner.py ../examples/openai-isolation/production.json --mode dev --scenes S3 --force
```

| 工程 | 所要 | 結果 |
|---|---|---|
| 辞書適用＋VOICEVOX合成＋実尺計測 | 102.8s | 16ユニット、読み替え9件適用（OpenAI×2、生のインターネット、DNS、Anthropic 等）。辞書はパッケージ内 `voice/` から、エンジンは外部 `~/workspace/voicevox` から読み込み |
| レンダリング S3（dev, 960×540） | 66.3s | 488フレーム |
| 連結（ffmpeg） | 0.3s | stream copy、実尺 16.32s（予測 16.27s） |
| 検証（ffprobe） | 0.2s | 尺・音声ストリーム OK |
| **合計** | **170.1s** | |

- 静止画確認: S3 の年表図解が diagramData の文言どおりに描画されることを目視確認
  （「9月20日」「直後」の2項目が表示され、`atUnit: null` の「10月1日」は非表示＝元の挙動と一致）
- `voice/check_kana.py` の動作確認: 約2秒で読み（カナ）を返した
- 検証で生成された成果物（`template/out/`、合成WAV、`.tmp`、キャッシュ類）はパッケージ同梱対象外として削除済み

### node_modules について
- `npm ci` ではなく既存プロジェクトからコピーした（519MB、ファイル数 10,905 件が元と一致、Chrome Headless Shell のキャッシュ込み）
- コピー時に「所有権を保存できない」警告が多数出たが、内容・ファイル数に欠けはなく、検証レンダリングも正常に動いた

## 残課題

- VOICEVOX エンジンは設計上パッケージ外（`~/workspace/voicevox`）。丸ごと移す場合は `VOICEVOX_DIR` の差し替えで対応可能だが、venv 内のパス等の実地確認は未実施
- Windows 実機での動作確認は未実施（従来どおり Tanaka 側の作業）
- `template/src/production.json` は runner が実行時に入力JSONで上書きする作業用コピー。`examples/` の実例と二重管理になるため、実例を直すときは両方ではなく examples 側を正とすること
- 元の配置（`video-prod/`、`voicevox/` 内の制作部品）は互換のため残置。今後の改修はパッケージ側で行い、旧側は参照しない

---

# 追記: HTTP合成バックエンド＋名称決定＋配布方針変更（2026-10-25）

## 名称決定
- パッケージ／リポジトリの正式名称は **newsreel** に決定（Tanaka指示）。
  フォルダ名（`news-video-package/`）は変更せず、表示名・ドキュメント上の正式名として寄せた。
- 反映箇所: パッケージ README / runner README / README-WINDOWS / template・voice の各 README のタイトル、
  runner.py の docstring、`template/package.json` と `package-lock.json` の name を `newsreel-template` に変更（lock と同期済み）。

## 配布方針の変更
- 当初予定の **配布用 zip は中止**。代わりに、Tanaka が今後切る **GitHub リポジトリ（newsreel）** に入れて配布する方針に変更。
- その準備として、パッケージ直下に `.gitignore` を新設: `**/node_modules/`、`**/.tmp/`、`**/out/`、
  `__pycache__`、生成WAV（`/template/public/audio/*.wav`）、生成される `/template/src/timing.json`、`dist/` 等を除外。
- zip 用に予定していた `setup-windows.ps1` も作成中止（リポジトリ配布では clone 後に README 手順で足りるため）。
- **git init / 初回コミット / push は未実施**（実施可否は未定、Tanaka の指示待ち）。ツリーと .gitignore の整備までに留めた。
- 検証で生成された成果物（`template/out/`、`.tmp/`、合成WAV、`timing.json`、`__pycache__`）は削除済みで、ツリーはクリーンな状態。

## HTTP合成バックエンド（runner/runner.py）
- `--synth core|http`（既定 core）と `--engine-url`（既定 `http://localhost:50021`）を追加。
- http は VOICEVOX エンジン公式HTTP API: `POST /audio_query`（text, speaker=style_id）→ 返却JSONの
  `speedScale` に production.json の `voice.speed` を設定 → `POST /synthesis` で WAV 取得。標準ライブラリ
  （urllib）のみで実装し、**voicevox_core 不要・通常の python3 で実行可能**（Windows 対応の要）。
- 辞書適用は従来どおりバックエンド非依存の前処理（パッケージ内 `voice/` から読む）。文単位合成・実尺計測・
  末尾無音の付加も共通処理に一本化。音声だけ差し替え（`--audio-only-from`）でも `--synth http` が使える。
- style_id の意味は公式エンジンと core で同一（2 = 四国めたん ノーマル）である前提を各 README に明記。
- エンジン未起動時は、接続エラーとして「公式VOICEVOXアプリを起動すること」を案内するメッセージで終了する。

## 互換モックサーバ（tools/voicevox_mock_server.py、新規）
- Linux 側で HTTP 経路を検証するためのテスト専用サーバ。voicevox_core（blocking API）を HTTP の後ろに置き、
  `/audio_query` と `/synthesis` のみを公式形式で実装（クエリJSONの相互変換を含む）。
- 実装上の発見: core 0.17 の `AccentPhrase.pause_mora` は Mora オブジェクトでなく **dict**（公式JSON形式のキー）で
  返るため、変換関数で両形式に対応した。また公式形式の `pauseLength` は core 側に対応項目がなく、常に null を返す
  （合成結果への影響なし）。Windows では公式アプリが同じ API を提供するので、このモックは不要。

## README-WINDOWS の全面更新
- 「描画だけ」手順から「**JSONを受け取って動画を生成する**」完全手順に書き直し:
  ①公式VOICEVOXアプリをインストールして起動（`http://localhost:50021/version` で確認、起動したままにする）
  ②Node.js LTS・Python・ffmpeg の導入 ③パッケージ配置 ④`template` で `npm ci`
  ⑤実行コマンド例（`python runner.py production.json --mode dev --synth http`）。
- 注意点も追記: 初回 Chrome Headless Shell 自動DL、フォント（游ゴシック / Noto Sans JP）、
  通信は同一PC内の localhost のみで外部送信なし、ファイアウォール許可ダイアログへの対処、
  コンソールの文字化け（`chcp 65001`）等。

## 検証結果（実測、2026-10-25 08:43〜08:47 JST 頃）

モックサーバを起動し、**通常の python3** で runner を HTTP 経路・S3 単体・dev 画質で実行:

```bash
~/workspace/voicevox/venv/bin/python tools/voicevox_mock_server.py &
cd runner && python3 runner.py ../examples/openai-isolation/production.json --mode dev --scenes S3 --force --synth http
```

| 工程 | HTTP経路（今回） | core実績（前回） |
|---|---|---|
| 辞書適用＋合成＋実尺計測（16ユニット） | 101.2s | 102.8s |
| レンダリング S3（dev, 488フレーム） | 60.8s | 66.3s |
| 連結（ffmpeg, stream copy） | 0.2s | 0.3s |
| シーンmp4 実尺 | **16.32s**（予測 16.27s） | **16.32s** |
| ナレーション合計 | 89.7s | 89.7s |
| 総所要 | 163.0s | 170.1s |

- 実尺・ナレーション合計が core 方式と完全一致（同じエンジン・同じ辞書のため当然だが、HTTP 経路でも
  speedScale 設定・実尺計測・末尾無音が正しく効いていることを確認）。
- 読み替え適用 9件（OpenAI×2、生のインターネット、DNS、Anthropic 等）も core 時と同一。
- モックサーバ単体でも `/audio_query` → speedScale 編集 → `/synthesis` の往復を確認（24kHz WAV を返却）。

## 残課題
- **Windows 実機での動作確認は未実施**（Tanaka 側の作業）。特に公式VOICEVOXアプリ実物との疎通
  （モックは公式形式準拠だが実物では未検証）。
- git init / 初回コミットの実施可否と、リポジトリ URL の共有待ち。
- VOICEVOX エンジンは引き続きパッケージ外（core 利用時）。http 利用時はエンジンがアプリ側に移るため、
  Windows ではこの制約自体が消える。

---

## ワーカーモード（ジョブ自動取得＋連続処理）の追加 — 2026-10-25

Tanaka の要望により、動画生成プログラムに「ジョブを自動取得して連続処理する
ワーカーモード」を追加した（先行していた bootstrap 作業は取り違えのため停止され、
残っていた `tools/bootstrap.py` と pycache はこの作業で除去した。README 類への
bootstrap 記述の混入は無かった）。

### 実装

- 新規ファイル: `tools/worker.py`（標準ライブラリのみ）。runner.py には手を入れず、
  サブプロセスとして呼び出す。通常モード（単発生成）の挙動は不変。
- バックエンドは差し替え式（`--backend`）:
  - `sheet`: スプレッドシート「AIニュース収集」のニュースタブを gws CLI 経由で
    読み書きする（gws CLI のある環境専用）。1題材＝1グループ、代表記事の行が
    ジョブ単位。D列=脚本済み かつ O列が空の代表行を列挙 → claim（O列にノード名、
    P列に開始時刻を書き、3秒後に再読して競合チェック）→ 生成 → 成功時は
    D列=動画化済み、Q列に完了時刻、R列に「ノード名: 出力パス」を記録し、
    メンバー行の D列も追随。失敗時は R列にエラー要旨を記録して次へ進む。
  - `dir`: ジョブフォルダ（production.json を含む）を列挙し、各フォルダに
    result.json を書き出す（Windows ノード用。シート反映は Muse 側が橋渡し）。
- 素材の対応付け: フォルダ名＝代表記事ID → production.json の id →
  エンドカード出典URLとメンバー記事URLの一致、の順で解決。全34ジョブで解決成功
  （claude-mythos5 はURL経由で itmedia-aiplus-679e8039dcec に対応）。
- 連続処理: `--once` / `--max-jobs N` / `--interval` / `--idle-exit` / `--only-group` /
  `--dry-run`。Ctrl+C では処理中ジョブに中断を記録して終了する。
  失敗・素材未解決のジョブは同一起動中は再試行しない（実装中に dir バックエンドで
  失敗ジョブが無限リトライされる問題を発見し、試行済み集合で修正済み）。
- ドキュメント: runner/README.md（ワーカーモード節）、runner/README-WINDOWS.md
  （6.5節）、tools/README.md に追記。

### 検証（実測、2026-10-25 10:12〜10:22 JST）

- dir バックエンド: スタブ runner で列挙・dry-run・成功＋result.json・
  成功済みスキップ・失敗＋result.json（error）・無限リトライ修正を検証。
- sheet バックエンド: `--dry-run` で未処理34件を列挙（素材は全件解決）。
  実ジョブ1件を `--once --mode dev --node muse-vm` で通し処理:
  題材 = gigazine-578fe5d4fd0c「Kimi K3.1 Pro」（シート354行目、単独グループ）。

  | 工程 | 所要 |
  |---|---|
  | ジョブ列挙＋claim（書き込み・3秒待ち・再読） | 約8s |
  | 辞書適用＋VOICEVOX合成＋実尺計測（18ユニット、ナレーション129.5s） | 80.4s |
  | レンダリング 8シーン（dev、計4,268フレーム） | 388.2s |
  | 連結（stream copy）＋検証 | 0.6s |
  | 成功の記録（シート書き込み） | 約1s |
  | **worker 全体（壁時計）** | **480.0s（8分00秒）** |

  - 出力: `/home/hatch/workspace/newsreel-outputs/gigazine-578fe5d4fd0c/gigazine-578fe5d4fd0c-dev.mp4`
    （8.8MB、実尺 142.72s、音声あり）
  - シート354行目に 担当ノード=muse-vm / 生成開始=10:14:38 / 生成完了=10:22:35 /
    出力先=muse-vm: （上記パス）/ ステータス=動画化済み が記録されたことを再読で確認。
  - 処理後の dry-run では未処理 33 件となり、当該ジョブがキューから消えたことを確認。

### 残課題（ワーカーモード）

- Windows 実機での dir バックエンド動作確認は未実施（スタブ検証のみ）。
- sheet バックエンドの claim 競合（2ノード同時 claim）は単独ノードでの検証のみ。
- 代表行が個別に「却下」されているグループ（php2shell、タイムズカー、モンゴル草原
  火災、1Password、OpenAI分離）は、メンバー記事が選択・脚本化されていても代表行が
  脚本済みでないためジョブとして列挙されない（仕様どおりの挙動。対象にしたい場合は
  シート側で代表行のステータスを脚本済みに揃える必要がある）。
