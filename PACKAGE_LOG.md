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

---

## 強調テロップと図解の重なり修正 — 2026-10-25

### 不具合と原因
- シーン冒頭の強調テロップ（accentTelop）が図解の先頭要素と重なっていた（Kimi K3.1 Pro の S2=summary-points、S3=split で顕著）。
- 原因のレイアウト値（template/src/components.tsx、1920×1080 座標）: 強調テロップは `top: 190 / fontSize: 110` で帯域およそ y190–322 を占有。一方、図解の先頭は sandbox 容器 top 215 / split top 225 / redteam top 235 / summary-points top 250 / timeline 円上端 274 とすべてこの帯域内に入っており、構造的に衝突していた。

### 修正（変更ファイル: template/src/components.tsx のみ）
- 強調テロップを肩テロップ（下端 ≈136）直下の帯へ移動: `top: 140 / fontSize: 92`（帯域 ≈140–250）。見出し（上端 ≈626）・字幕（上端 ≈790）とは元々干渉しない。
- 図解側は「強調テロップのあるシーンだけ」開始位置を調整（SceneView から `accent` prop を渡す）。無いシーンの見た目は不変。出現タイミング（atUnit 連動）は変更なし。
  - summary-points: top 250 → 280
  - split: top 225 → 265
  - redteam: top 235 → 270
  - sandbox: 容器 top 215 → 235、破線ボックス height 400 → 380（底辺 615 を維持し、下端アンカーの円・補足の絶対位置は従来どおり。見出しテロップ上端 626 に箱を近づけないための措置）
  - timeline: 円上端 274 が新しい帯域（〜250）と干渉しないため変更なし

### 検証（dev 画質、静止画目視）
- Kimi K3.1 Pro（gigazine-578fe5d4fd0c）を --skip-synth で再レンダリングし、各シーン開始+0.3秒と+2.5秒のフレームを確認:
  - S2 summary-points: 「最長100万トークン」が要点1行目と重ならず帯域内に収まる ✓
  - S3 split: 「低コストで高スコア」が両カードと重ならない ✓
  - S5 timeline: 「11月4日に無償公開」が年表の円・線と重ならない ✓
- 追加で他タイプも確認:
  - sandbox（HackiOS gigazine-e8f96cf95b33 S3、合成から実施）: 「変更なしのiOS 16.5」が箱タイトル・円・補足と重ならない ✓（残存: 文字の下端が箱の右上隅で破線枠線を横切る箇所があるが、内容・文字との重なりではない）
  - redteam（1Password S3）: 「パスワードは渡らない」が攻撃役ボックスと重ならない ✓
- 検証プロジェクト: ~/workspace/video-prod/verify-accent-fix / verify-sandbox / verify-redteam

---

## ワーカーへの TOML 設定ファイル対応＋辞書の自動発見 — 2026-10-25

Tanaka の要望により、ノード固有のパスや設定をコードや GitHub に書かず、
各ノードのローカル設定ファイルで持てるようにした（変更は tools/worker.py と
設定・ドキュメントのみ。runner.py 本体は無変更）。

### 実装（tools/worker.py）
- `--config <path>` で TOML（標準ライブラリ tomllib）を読み込む。省略時は
  カレントディレクトリ → パッケージ直下の順に `newsreel.toml` を探す。
- 優先順位は CLI引数 > TOML（[worker] テーブル、無ければトップレベル） > 既定値。
  実装は argparse の全オプションを default=SUPPRESS にして明示分だけを取り出し、
  TOML・既定値と合成する方式。未知のキーは警告のみ、backend/mode/synth の
  TOML 値は手動で検証する。既存の CLI 挙動（--node の環境変数/ホスト名フォール
  バック、runner-python の自動判定含む）は不変。
- 辞書の自動発見（dir バックエンド）: `--voice-dir` が CLI/TOML のどちらでも
  明示されていない場合、`<jobs-dir>/../voice/reading_dict.json`（Drive 共有
  レイアウト: newsreel/voice/reading_dict.json）があれば優先する。runner が
  「apply_reading_dict.py と同じフォルダの reading_dict.json」を読む仕様に
  合わせ、パッケージ voice/ の *.py と Drive の辞書を一時フォルダ
  （newsreel-voice-autodiscovered）に組み合わせて作業用 voice dir を構成する。
  元ファイルは変更しない。

### 追加・変更ファイル
- tools/worker.py: TOML 読み込み、辞書の自動発見、起動ログに設定ファイルと
  辞書フォルダを表示
- newsreel.example.toml（新規）: Windows ノード（dir＋Drive 同期パス）と
  Muse VM（sheet）の2例をコメント付きで記載。実パスはプレースホルダ
- .gitignore: `newsreel.toml` を除外対象に追加
- runner/README.md（ワーカーモード節）/ runner/README-WINDOWS.md（6.5節）:
  TOML の使い方と Windows 実例を追記

### 検証（この VM、すべて --dry-run）
- TOML（backend=dir / node=test-node / jobs_dir=~/workspace/newsreel-scripts/scripts）
  を --config で指定 → 設定値どおりに起動し、その jobs_dir から40件を列挙 ✓
- CLI 優先: TOML と違う --node cli-node を渡すと起動ログのノード名が変わる ✓
- 辞書の自動発見: scripts/ と voice/reading_dict.json を隣接させた構成で、
  自動発見のログと、作業用 voice dir（apply_reading_dict.py 等＋隣接辞書の
  バイト一致コピー）が構成されることを確認 ✓（--voice-dir 明示時は無効化される
  ことも確認）
- 自動探索: カレントの newsreel.toml が --config なしで拾われること、
  設定なしの従来 CLI 実行が従来どおり動くことも確認 ✓

## ワーカーに sheetapi バックエンド（Sheets API 直接連携・OAuth）を追加 — 2026-10-25

Tanaka の要望により、Windows ノードが Muse の橋渡し（dir バックエンド＋
result.json 方式）なしに、シートのジョブキューを直接読み書きできるようにした
（変更は tools/ と設定・ドキュメントのみ。runner.py 本体は無変更）。

### 実装（tools/sheets_api.py、新規）
- 標準ライブラリのみの Sheets API クライアント。OAuth 2.0 installed-app
  （ループバック）フロー: クライアントJSON（"installed" / "web" 形式の両対応）を
  読み、認可URLをブラウザで開き、http://localhost:<空きポート> のローカル
  HTTPサーバーで code を受けてトークン交換。refresh_token を含むトークン
  ファイルを保存し、以後は access_token を自動更新する。
- スコープは spreadsheets のみ。Sheets 操作は values の get / update /
  batchUpdate（urllib で REST）。429/5xx は最大3回まで控えめにリトライ。
- 単体実行で認証できる: `python tools/sheets_api.py auth --credentials
  <client.json> [--token <token.json>]`（--token 省略時は credentials と同じ
  フォルダの newsreel_token.json）。
- 認証情報/トークンの実ファイルはリポジトリ内に作らない。.gitignore に
  `client_secret*.json` と `newsreel_token.json` を追加した。

### 統合（tools/worker.py）
- backend `sheetapi` を追加。`SheetApiBackend(SheetBackend)` が読み書きの
  3プリミティブ（read_rows / read_row / batch_update）だけを Sheets API 経由に
  差し替え、list_jobs / claim / record_* のキュー意味論は gws 版と完全同一。
  既存の sheet / dir バックエンドの挙動は不変。素材対応付けは --scripts-dir。
- CLI フラグ `--sheets-credentials` / `--sheets-token` を追加し、TOML でも
  同じキー名（sheets_credentials / sheets_token、path 型）で指定できる。
- 起動時に access_token を先に取得し、トークンが無い/失効している場合は
  認証コマンドを案内する分かりやすいエラーで止まる（生成は始めない）。

### 追加・変更ファイル
- tools/sheets_api.py（新規）: OAuth フロー＋Sheets REST クライアント
- tools/worker.py: sheetapi バックエンド、CLI/TOML キー、起動時認証チェック
- .gitignore: 秘密情報2パターンを追加
- newsreel.example.toml: キー一覧に sheets 系2キーを追加、例3（sheetapi）を追加
- runner/README.md: ワーカーモード節のバックエンド表・オプション表に追記
- runner/README-WINDOWS.md: 「シート直接連携（OAuth）」節を新設（Google Cloud
  での初回手順→認証コマンド→TOML 記入例）、トラブル表に認証エラー行を追加
- tools/README.md: バックエンド3種の説明と sheets_api.py の節を追加

### 検証（この VM、実クレデンシャルなし・モック相手）
- モックHTTPサーバー（トークンエンドポイント＋Sheets values API を模擬し、
  Authorization を厳密に検証）相手に全25項目を確認 ✓
  - クライアント: 期限切れトークンの refresh 経路、トークンファイルの更新保存、
    get/update/batchUpdate の URL・エンコーディング・JSONボディ・
    Authorization ヘッダの形式、web 形式クライアントJSON の読み込み
  - バックエンド: 列挙（対象1件・対象外の除外）→ claim（O/P列＋再読一致）→
    成功記録（D=動画化済み・Q/R・メンバー行Dの追随）→ 失敗記録（R列の要約）
  - CLI 統合: worker --backend sheetapi --dry-run がモック相手に完走し
    ジョブを列挙。TOML（backend/credentials/token/scripts_dir/dry_run）でも
    同様に動作。トークン無しでは非ゼロ終了し認証手順を案内（生成は始まらない）
- 既存バックエンドの回帰: dir バックエンドの --dry-run が従来どおり動作 ✓
- 未検証: 実際のブラウザ同意フローと実シートへの読み書きは Tanaka の Windows
  環境でしか確認できない（モックでは要求形式までを担保）。

## ワーカーの Ctrl+C を段階式に変更 — 2026-10-25

Tanaka の要望: 「1回目はきりの良いところ（処理中ジョブの完了）まで進めて
止まる。2回目で強制終了」を全バックエンド共通のメインループで実現。

### 実装（tools/worker.py）
- StopController を追加。SIGINT ハンドラは例外を投げず、1回目は停止
  フラグを立てるだけ（処理中ジョブの subprocess.wait() は継続し、生成→
  結果記録まで完了。次のジョブは開始しない）。待機中・列挙失敗時の
  スリープは sleep_or_stop（0.2秒粒度でフラグ確認）に置き換え、速やかに
  終了する。claim 中に押された場合も claim→生成→記録を1ジョブとして
  最後まで進める一貫仕様。
- 2回目は強制終了フラグ＋ウォッチドッグスレッドで即時終了（exit 130）。
  メインスレッドは子が死んで wait() から戻った時点でフラグを見て、
  失敗/成功いずれの記録もせずに 130 で終了。2秒の猶予内に終わらなければ
  ウォッチドッグが os._exit(130) する。
- ランナー子プロセスは端末/コンソールのプロセスグループから分離して
  起動（POSIX: start_new_session、Windows: CREATE_NEW_PROCESS_GROUP で
  CTRL_C_EVENT を無効化）。1回目の Ctrl+C が子に届いて巻き添え死する
  ことを防ぐ。強制終了はツリーごと（POSIX: killpg に SIGKILL、
  Windows: taskkill /T /F）。
- 注意点: ハンドラ内では Popen の poll()/wait() を呼ばない。Python 3.12
  では wait() が _waitpid_lock を保持したままブロックするため、ハンドラ
  から呼ぶとロック待ちで固まる（実測で確認）。kill は pid への OS
  呼び出しのみで完結させる。
- 旧仕様の置き換え: SIGINT で中断を記録する処理（KeyboardInterrupt の
  except 節、SheetBackend/DirBackend の record_interrupt、中断
  result.json / R列 INTERRUPTED 記録）はすべて削除。中断したジョブは
  「失敗」でも「中断」でもなく、記録上は未完了のまま残る（sheet では
  claim 済みなので O列を手で消せば再キューできる）。

### 追加・変更ファイル
- tools/worker.py: StopController / sleep_or_stop、Runner の分離起動と
  force_kill、メインループの停止チェック、旧中断処理の削除、冒頭doc更新
- tools/test_worker_signals.py（新規）: スタブランナーを使う自動テスト
- runner/README.md / runner/README-WINDOWS.md: Ctrl+C 段階仕様に差し替え

### 検証（この VM、自動テスト）
- tools/test_worker_signals.py を3回実行し、毎回 4/4 PASS・残プロセス
  ゼロを確認:
  1. 処理中に SIGINT 1回 → 1件目が完了・記録され、2件目は開始されず
     exit 0（6.2s）
  2. 処理中に SIGINT 2回 → 0.6s で exit 130、スタブ子プロセスと
     その子（孫 sleep）も残らない、result.json は書かれない
  3. 待機中（キュー空・間隔60秒）に SIGINT → 0.4s で exit 0
  4. 回帰: シグナル無しの連続処理（2件成功）/ --once（1件のみ）/
     --dry-run（列挙のみ・記録なし）
- 未検証: Windows 実機での Ctrl+C 伝播（CREATE_NEW_PROCESS_GROUP と
  taskkill /T の実挙動）は Tanaka の Windows ノードでの確認が必要。
  POSIX 側は上記テストで担保。

## 脚本化の定型フロー化 — 2026-10-25

### 追加ファイル
- `tools/scripting.py`: 脚本化の前後工程を自動化する CLI（標準ライブラリ＋gws CLI）。
  サブコマンド: list（対象洗い出し）/ materials（素材束ね）/ scaffold（production.json の器・
  エンドカード出典の自動生成）/ readings（辞書適用後に残る英字語の抽出＋VOICEVOX かな）/
  finalize（シートのステータス揃え・Drive 配置・準備時間ログ追記、--dry-run 対応）。
- `SCRIPTING.md`: 定型フローの手順書（工程ごとの担当: 自動 / LLM / 人間、読み登録の基準、
  代表行ルール、完了の定義）。

### 検証（この VM）
- list: 未脚本の選択済み 6 トピックを正しく列挙。
- materials / scaffold: Jac トピックで素材束ねと器（出典自動入力・妥当な JSON）を生成。
- readings: Kimi の production.json から未登録 8 件を抽出（例: Fable → フェエブル）。
- finalize --dry-run: シート更新先（D552）・Drive フォルダ名・対象ファイルを正しく提示。

## 投稿準備の定型フロー化 — 2026-10-25

### 追加ファイル
- `tools/publish_prep.py`: 動画化済みトピックの投稿パック生成 CLI。
  list（未作成トピックの洗い出し）/ prepare（エンドカード要約・出典・タグ・出力先を
  publish_worksheet.json に束ねる）/ apply（タイトル案＋リード文の結果JSONを検証し、
  publish-<repId>.md を組み立て、成果物フォルダと Drive のトピックフォルダへ配置）。
  出典のない初期 production.json はメンバー記事から補完する。
- `PUBLISHING.md`: 投稿準備の手順書（パックの中身、タイトル案の型、投稿後の処理）。

### 実施（初回）
- 動画化済み 36 トピック全件に投稿パックを作成（タイトル案2つ＋概要欄）。
  全件 Drive へ publish.md として配置済み（36/36 アップロード成功）。
- 注意: Kimi K3.1 Pro のシート記録は muse-vm の dev 版レンダリング。
  投稿前に final 版の有無を確認すること（パックにもその旨の注意を手順書に明記）。

## ラウドネス正規化の導入 — 2026-10-25

- runner.py: 完成 mp4 の音量を -14 LUFS / TP -1 dB（YouTube 基準相当）へ正規化する
  工程を追加（ffmpeg loudnorm 2パス、映像は stream copy）。通常モードの連結後と、
  音声だけ差し替えモードの両方に適用。`--no-loudnorm` で省略可。
  変更前後の実測値は production-log.md に記録される。
- 導入前の実測（3本）: いずれも約 -24.7 LUFS（基準より約10 dB 小さい）。
  ピークは -5.2〜-7.8 dBTP でクリッピングはなし。問題は「小さすぎる・揃っていない」こと。
- 検証: 試作動画のコピーで -24.74 → -14.82 LUFS / TP -0.99 dB。
  Kimi の dev 生成を runner 経由で再実行し -24.67 → -14.11 LUFS / TP -0.99 dB
  （独立再計測でも一致）。処理時間は 143 秒の動画で約 26 秒。

## 効果音（SE）の導入 — 2026-10-25

- runner/assets/make_se.py: 効果音4種を合成で生成（外部素材なし・再現性あり）。
  hook（低い一撃）/ whoosh（風切り）/ accent（小さなピン）/ end（締めの和音）を
  runner/assets/se/*.wav（48kHz ステレオ）として書き出す。
- runner.py: 連結後・loudnorm 前に効果音をミックスする工程を追加（`--no-se` で省略可）。
  配置はシーン種別と accentTelop の有無から自動決定し、production-log.md に記録。
- 検証（Kimi dev）: 7件配置（hook@0.0s, whoosh@15.5s, accent×4, end@137.4s）。
  A/B 比較でフック区間の平均音量 -31.1 → -13.4 dB（SE が聞こえる）、
  ナレーション区間は -17.6 → -17.5 dB（声のバランス不変）。
  最終ラウドネスは -14.12 LUFS / TP -0.99 dB で基準どおり。
- BGM は今回は入れない（ニュースの聞き取りやすさと信頼感を優先。必要なら別途検討）。

## 冒頭音の差し替えとラウドネス方式の変更 — 2026-10-25

- 田中提供の音声ファイル（実音約1.6秒のスティング＋末尾無音）を冒頭音として採用。
  末尾の無音を詰めて48kHz化したものを runner/assets/se/intro.wav として配置し、
  フックシーン頭の効果音を合成音（hook.wav）から intro.wav に差し替えた（原ファイルは不変更）。
- 検証中に判明した不具合: 冒頭に強い音がある素材では、従来の loudnorm 2パス補正が
  ピーク上限を超える（-14.12 LUFS / TP +0.95 dB を再現）。loudnorm は計測専用に改め、
  補正は「必要ゲインの volume 適用＋alimiter でピークを -2 dBFS に制限→再計測で担保」
  という決定的な方式に変更した。検証3ケース（未正規化/ピーク超過の不良ファイル/
  24kHzモノラル）すべて -14.1〜-14.3 LUFS / TP -1.6〜-1.8 dB に収束。
  Kimi の通し生成でも intro 配置＋正規化（-14.16 LUFS / TP -1.61 dB）を確認。

## 2026-10-25 冒頭ホールド（効果音が終わってから発話開始）

- 田中さんの指定「効果音がおわってから話し始めて欲しい」を実装。
  runner が intro.wav の実尺を測り、先頭フックシーンの発話開始を
  「intro 終了 + 0.3秒」に遅らせる（introHoldSec を timing.json に記録し、
  template/src/layout.ts が同じ値でシーン尺と発話位置を延ばす）。
  --no-se 時はホールドなし。音声だけ差し替えモードは既存 timing.json の
  introHoldSec を読んで配置を維持する。

## 2026-10-25 Windows 実行時バグ2件の修正（再生成ジョブの失敗を受けて）

- 効果音ミックスが Windows で失敗する問題: run_cmd が cmd.exe 経由でコマンドを
  実行する際、list2cmdline が空白を含まない引数を引用符で囲まず、ffmpeg
  フィルタ内の「|」（adelay のチャンネル区切り）がパイプと解釈されていた。
  メタ文字を含む引数は空白がなくても引用符で囲む _windows_cmdline を導入。
  （adelay の単一値化はステレオで第1チャンネルのみ遅れるため不採用）
- 再生成ジョブで旧シーンが再利用される問題: シーンキャッシュの再利用条件が
  「ファイルの存在」だけだったため、出力フォルダが同じ再キュー時に古い尺の
  シーンが使われた。シーンごとに署名（テンプレ指紋＋モード＋脚本＋そのシーンの
  音声尺＋冒頭ホールド）を scene-sigs.json に記録し、一致したときだけ再利用する
  よう変更。署名が無い旧キャッシュは次回実行で描き直される。

## 2026-10-25 効果音を冒頭 intro のみに削減

- 田中さんの視聴後の判断「頭の効果音以外はいらない」を受け、SE_RULES を
  フックシーン頭の intro.wav のみに変更。タイトルの風切り（whoosh）・
  アクセントテロップのピン（accent）・締めの和音（end）の配置を廃止した
  （plan_sound_effects の accent 特別扱いも除去）。アセットファイル自体は
  フォルダに残置するが未使用。冒頭ホールド（intro 終了後に発話）は継続。
- 検証: openai-isolation の脚本（hook/title/content×5/end）で配置が
  intro@0.0s の1件だけになることを確認。

## 2026-10-26 左下の出典クレジットと字幕を廃止

- 田中さんの指定「左下の出典と字幕消して」を受け、template/src/components.tsx
  から SourceCredit（左下・シーンごとの出典）と Subtitles（ナレーション字幕）の
  描画を削除（コンポーネント自体も除去）。出典はエンドカードの一覧で示す形に一本化。
- production.json の credit フィールドや字幕用テキストはデータとして残るが描画しない。
  背景下部のグラデーション（旧字幕帯）は画面の締めとして残置。
- 検証: ProvenanceGuard の脚本で still を描画し、左下クレジットと字幕が
  消えていること、肩テロップ／アクセントテロップ／図解が従来どおり出ることを確認。

## 2026-10-26 シーン切り替えの無音を半分に

- 田中さんの指定で、シーン頭の間 PAD_HEAD 0.35→0.175 秒、シーン末尾の間
  PAD_TAIL 0.45→0.225 秒に変更（runner.py と template/src/layout.ts の両方。
  切り替え時の無音合計は 0.80→0.40 秒）。文ごとの余韻 tailSilence 0.28 秒と
  冒頭効果音後の間 0.3 秒は据え置き（ホールド量は PAD_HEAD 連動で自動追随）。
- ProvenanceGuard の総尺は約 143.6 秒→約 141.6 秒になる。

## 2026-10-26 見出し位置と冒頭の間隔の調整

- 田中さんの視聴フィードバック（VLC スクリーンショット）を受けて2件調整:
  - 見出しテロップ（Headline）の位置を bottom 330→260（70px 下げ）。
    図解ボックスの下端と見出しが重なっていた（例: S3「『どこかにある』では不十分」）。
    still でボックスと重ならなくなったことを確認。
  - 冒頭の効果音が終わってから発話までの間 INTRO_GAP_AFTER を 0.30→0.15 秒に短縮
    （runner.py。ホールド量は intro 実尺＋0.15−PAD_HEAD で自動計算される）。

## 2026-10-26 絵コンテ生成ツールと runner の --timing-only

- 内容チェック高速化のため、絵コンテ生成ツール tools/storyboard.py を追加。
  production.json と timing.json からシーンごとの代表フレーム（内容シーンは
  冒頭＋図解完成時の2枚）を描画し、「左に画面・右に画面の文字列と
  時刻つきナレーション」の自己完結 HTML を出す。形式は田中さんが承認し、
  今後のトピックの標準資料とする。
- runner に --timing-only を追加: 合成と timing.json 作成までで終了し、
  レンダリングをしない。絵コンテの尺情報は dev 生成（約7分）でなく
  合成だけ（実測73秒）で得られるようになった。

## 2026-10-26 改行位置のルール（単語の途中で切らない）

- 田中さんの指定「単語の途中で切れて改行するのはNG」を実装。要点リスト
  （summary-points）だけ authored 改行（\n）を尊重しておらず、自動折り返しで
  「検証さ/れる」「確/認」のような単語途中の改行が出ていた。
  SummaryDiagram に pre-line を追加し、脚本側は文節の切れ目で \n を入れる
  運用に（SCRIPTING.md に明記）。ProvenanceGuard の S2/S4/S6 要点に改行を
  入れて still で確認済み。
- 追記: redteam図解のボックス見出し（attackerTitle/middleTitle）も改行指定が
  効いておらず「エージェントの回/答」と割れていたため、見出し類にも pre-line
  を適用（split見出しも同様）。S3 の各テキストは文節改行に直して確認済み。

## 2026-10-26 用語解説ブロック（右下）追加

- 田中さんの設計: 引っかかりそうな固有名詞は、右下に小さな解説ブロックを出す。
  太字の名詞＋短い解説（3行まで）。右からスライドインし、複数あるときは
  既存が上へスライドして積み上がる（同時表示は最新2件まで）。
  production.json の各シーンに glossary: [{term, text, atUnit}] を追加する形。
  ProvenanceGuard の脚本に6件（HF/MCP/RAGAS/MiniCheck/ProvenanceGuard/RARR）を
  適用し、絵コンテのフレームで表示を確認済み。
- あわせて、絵コンテの初見レビュー用ペルソナを SCRIPTING.md に記録
  （30代会社員男性、ChatGPTで質問する程度のITリテラシー）。

## 2026-10-26 ファイルロック耐性とワーカーの失敗時挙動

- hiro-note で生成の最終段階（効果音ミックス後のファイル置き換え）が
  PermissionError (WinError 5) で失敗した。完成ファイルが他アプリに
  掴まれていると置き換えだけが弾かれるケース。
- runner: replace_file ヘルパーを追加し、SE/ラウドネス/無音トラックの
  置き換えで最大15秒ほどリトライする。最後まで失敗したら原因と対処が
  分かるメッセージで止める（生成物は tmp 側に残る）。
- worker（田中さんの指定）: 失敗時は R列にメッセージを残したうえで
  claim（O/P列）を解放してキューを未取得に戻し、その起動中は再試行
  せずに次のジョブへ進む。次回起動時に再試行される（手動クリア不要に）。

## 2026-10-26 用語解説は5秒で消える／図解ボックスの枠線整列

- 用語解説ブロック（田中さんの指定）: 表示は5秒間だけに変更。出てから
  5秒で右へスライドして消える。絵コンテには「用語解説の表示中」フレームを
  追加し、消えた後の完成時フレームとあわせて確認できるようにした。
- 図解ボックスの枠線整列（田中さんの指定）: redteam の3ボックスと split の
  2ボックスを、最も高いものに合わせて上下端が揃うよう stretch させた
  （結果ボックスの文字は縦中央）。「無理のない範囲で揃える」を
  SCRIPTING.md にルール化。
- ProvenanceGuard 脚本：S5 の「専門家が支えられていると判断した67件」を
  「専門家が裏付けがあると判断した67件」に言い換え（直訳語の回避。
  画面ラベルも「裏付けのある67件も」に統一）。言い回しのルールを
  SCRIPTING.md に追加。

## 2026-10-26 タイトル付けのフロー

- 田中さんの決定: タイトルは記事タイトルを土台に先に決めず、全体構成を
  決めた後に、その構成を要約する形で付ける。
- SCRIPTING.md: scaffold のタイトルは管理用の仮タイトルであること、
  本タイトルは全体構成の後に付けること、タイトルカードと S1 フックの
  重複を避けることを明記。
- PUBLISHING.md: 投稿タイトル案は production.json の本タイトルを
  土台に作り、その内容範囲を超えないことを明記。

## 2026-10-26 主体と出典の正確な書き分け

- 田中さんの指定: 発表主体・記事の著者・掲載媒体は正確に分ける。
- SCRIPTING.md: 論文著者とブログ著者の所属が同じ場合は著者側の公式解説
  として一次ソースにできること、掲載プラットフォームを発表主体に
  しないこと、一次ソースの性能数値も独立検証ではなく著者側の報告として
  扱うことを明記。例として Multiverse Computing の論文を Hugging Face
  ブログ掲載という理由で「Hugging Face が発表した」と書かない。

## 2026-10-26 研究系の冒頭サマリー

- 田中さんの指定: 研究系ではタイトルカードの直後、本文の最初に
  3行（3文）の冒頭サマリーを置く。
- SCRIPTING.md: 3行の内訳（発表主体と提案／方法の核と適用条件／
  主要結果）、専門用語を噛み砕かない密度の目安（著者レベルの知識が
  ある人が後段を推測できること）、フックとの役割分担を明記。

## 2026-10-26 冒頭サマリーの内訳は固定しない

- 田中さんの修正: 3行にまとまっていれば行ごとの内容は固定しない。
  全体として「誰が」「何をした」「どうなった」が読み取れる形を基本とし、
  方法・条件・数値はその理解に必要な範囲で入れる。

## 2026-10-26 本文構成の決め方

- 田中さんの決定: 本文は冒頭サマリー（研究系）または中心主張の展開
  として作る。
- SCRIPTING.md: 事実への役割付け、サマリー／中心主張との関係による
  取捨（理解に必要／根拠になる／限定・修正する）、依存順への並べ替え、
  研究系の標準順、まとめで新しい事実を出さないことを明記。

## 2026-10-26 サマリーと本文の対応／研究系の数字

- 田中さんの指定: 冒頭サマリーで使った用語・主張と本文の対応を取る
  （絵コンテ確認時にチェックする）。
- 田中さんの見解: 研究系で数字が多くなるのは仕方ない。数字の多さ自体は
  欠点として扱わない（レビュー提案 C3 は上限ルールなしで終了）。

## 2026-10-26 レビュー反映：表示順・アクセント・冒頭サマリーの型

- 表示順を タイトル → フック に変更（田中さんの指定）。runner.py の
  intro_hold と layout.ts の FIRST_HOOK_ID を「最初のフックシーン」基準に
  直し、タイトル先行でも効果音が終わってからフックの発話が始まるようにした。
- アクセントテロップは全シーン使わない方針で試行（田中さん「全体的に
  いらないかも」）。フック画面と冒頭サマリーには用語解説を付けない。
- 冒頭サマリーの型：肩「このニュースの概要」、見出し・アクセント・
  用語解説なし、箇条書きは全画面表示（pointsFull をテンプレに追加）。
  サマリーに入れる結果は主要なものだけ（保留などの副次結果は本文へ）。
- 本文：数字は母数→対象→結果のつながりが分かる順に書く。
- スマホ表示の指摘（文字の小ささ等）は横型では対応しない（田中さん判断）。
  縦型表示の型は別途検討する。
- ProvenanceGuard 脚本に反映：情報源のID→「実行履歴から、どの情報が
  どのツールから来たか」、帰属→「情報源の取り違え／出所」、再学習不要の
  利点「そのまま組み込むことができる」を追加、会社説明は記事本文に
  描写がないため追加しない。

## 2026-10-26 研究・技術系はフックなし／効果音は動画の始まり／Eは出典のみ

- 田中さんの指定: 研究・技術系はフックを置かない。代わりにタイトルカードの
  画面のまま、冒頭サマリーの1文目（誰が何をした）のナレーションを先に流す。
  runner / layout.ts: タイトル等の固定尺シーンでも narration があれば
  ナレーション尺でレイアウトするよう変更。
- 効果音（intro.wav）は「動画の始まりの音」として0秒から流す（従来は
  フックシーンの頭）。最初の発話は効果音の終了後（ホールドは「最初に
  ナレーションのあるシーン」基準に一般化し、そのシーンの絶対開始時刻を
  差し引く）。
- エンドカードは出典のみ（まとめを廃止）。上側は YouTube のエンド
  スクリーン用に空け、出典は下側に置く（components.tsx に対応追加）。

## 2026-10-26 箇条書きは右まで使う

- 田中さんの指摘: 箇条書きの右側が不自然に空いている。
- テンプレ（SummaryDiagram）: フォントを拡大（通常 46→54px、全画面 58→66px）、
  コンテナも左右に拡張。
- SCRIPTING.md: 要点の行長目安を「1行およそ22字以内」から「画面幅を使う
  長さ（1行28字前後まで可、文節区切りは維持）」に変更。
- ProvenanceGuard 脚本の要点（S2/S3/S5/S7）を長い行に組み直した。

## 2026-10-26 箇条書きは領域を広げて使う（訂正）

- 田中さんの訂正: 右側が空くのは「文字を大きくする」ではなく「表示領域を
  広げる」で直す。フォント拡大は通常表示では取りやめ（46pxに戻した）。
- テンプレ（SummaryDiagram）: 通常表示の領域を left 100 / width 1720 に拡張。
- 脚本側: 要点は長い1行（目安30字前後）で書くよう S3/S5/S7 を組み直し。
  SCRIPTING.md の行長ガイドもこの形に修正。

## 2026-10-26 冒頭サマリーは最初から全点表示

- 田中さん: 「最初のまとめの3つは最初から出して」。SummaryDiagram は
  pointsFull（冒頭サマリー）のとき全項目を frame 0 から表示するよう変更。
  通常シーンの順次表示は従来どおり。
- 同日、scripting.py finalize の Drive アップロード名を production.json /
  script.md に固定（ワーカーはこの名前で素材を探すため）。

## 2026-10-26 箇条書きは全シーン最初から全点表示に統一

- 田中さん: 冒頭サマリーに続いて「ほかの箇条書きも同様」。SummaryDiagram の
  順次表示を廃止し、全シーンでシーン開始から全点を表示する。

## 2026-10-26 図解も最初から全部出す

- 田中さん: 「図解のところも順次表示追加するんじゃなくて最初から出してて
  もいいな」。SandboxDiagram / RedTeamDiagram のステップ表示、Timeline
  Diagram のノード逐次表示、SplitDiagram の遅延表示を廃止し、全図解を
  シーン開始から表示する（atUnit: null の非表示指定は残す）。
