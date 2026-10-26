# newsreel 制作ランナー

動画スクリプトJSON を1本渡すだけで、**読み替え辞書適用 → VOICEVOX音声合成 → 尺計測 → シーン別レンダリング → 連結 → 完成mp4＋制作ログ** までを一気に実行するプログラムです。

将来、脚本作成（LLM）がこのJSONを直接出力すれば、制作はコマンド1回で全自動になります。

## 使い方

合成バックエンドは2種類あります（`--synth`、既定は `core`）:

- **core**: VOICEVOX core を直接使う（この Linux 環境用）。voicevox の venv の Python で実行します。
- **http**: VOICEVOX エンジンの公式HTTP API（既定 `http://localhost:50021`）を使う。voicevox_core は不要で、通常の Python で実行できます。**Windows では公式VOICEVOXアプリがこの API を提供する**ので、この方式で JSON から完成まで完結します。手順は [README-WINDOWS.md](README-WINDOWS.md)。
  style_id の意味は公式エンジンと core で同一です（`2` = 四国めたん ノーマル）。

```bash
cd ~/workspace/news-video-package/runner

# 開発用（960x540、高速確認）— core バックエンド
~/workspace/voicevox/venv/bin/python runner.py ../examples/openai-isolation/production.json --mode dev

# 最終版（1920x1080）
~/workspace/voicevox/venv/bin/python runner.py ../examples/openai-isolation/production.json --mode final

# HTTP バックエンド（エンジンが localhost:50021 で動いている前提。通常の python3 で可）
python3 runner.py ../examples/openai-isolation/production.json --mode dev --synth http

# シーン単体だけ作り直す（例: S3）
~/workspace/voicevox/venv/bin/python runner.py ../examples/openai-isolation/production.json --mode dev --scenes S3 --force

# 合成済みの音声・尺を再利用して描画だけ
python3 runner.py ../examples/openai-isolation/production.json --mode dev --skip-synth

# 音声だけ差し替え（映像はそのまま、再レンダリングなし）
~/workspace/voicevox/venv/bin/python runner.py ../examples/openai-isolation/production.json \
  --audio-only-from ~/workspace/goals/daily-ai-news-digest/files/openai-isolation-news.mp4 \
  --out ~/workspace/news-video-package/runner/out/openai-isolation-audio-replaced.mp4
```

### 主なオプション

| オプション | 意味 |
|---|---|
| `--mode dev\|final` | dev = `--scale 0.5`（960×540）で高速確認、final = フルHD（既定 dev） |
| `--scenes S1,S3` | 対象シーンを限定（連結もそのシーンだけになる） |
| `--skip-synth` | 辞書適用・合成を省略し、既存の `src/timing.json` と音声を再利用 |
| `--timing-only` | 合成と `timing.json` の作成までで終了（レンダリングしない。絵コンテ等の尺情報取得用、約1分） |
| `--force` | 既存のシーンmp4があっても再レンダリング（既定は再利用＝差分だけ速い） |
| `--out <dir>` | 出力先（既定: `<project>/out/<動画id>-<mode>/`） |
| `--project <dir>` | Remotion テンプレートプロジェクト（既定: `../template`） |
| `--voicevox-dir <dir>` | VOICEVOX エンジン一式（既定: 環境変数 `VOICEVOX_DIR`、なければ `../../voicevox` = `~/workspace/voicevox`） |
| `--voice-dir <dir>` | 読み替え辞書一式（既定: `../voice`） |
| `--audio-only-from <mp4>` | 音声だけ差し替えモード |
| `--synth core\|http` | 合成バックエンド（既定: core）。http は VOICEVOX エンジンの公式HTTP API を使い、通常の python で実行できる |
| `--engine-url <url>` | `--synth http` の接続先（既定: `http://localhost:50021`） |

### 出力

```
<out>/
  openai-isolation-dev.mp4     # 完成動画（連結済み）
  scenes/scene-S1.mp4 ...      # シーン単体のmp4（差し替え・再利用の単位）
  concat-list.txt              # 連結リスト
  production-log.md            # 工程別の所要時間ログ
```

### 仕組みのポイント

- **シーン単位レンダリング**: シーンごとに mp4 を作り、ffmpeg の concat で連結します（まず stream copy を試し、尺が合わなければ再エンコードに自動フォールバック）。1シーンだけ直せばそのシーンだけ再描画して再連結できます。
- **音声だけ差し替え**: 既存動画のタイミング（timing.json のオフセット）を維持したまま再合成音声を配置し、`-c:v copy` で映像を無劣化コピーします。字幕は焼き込み済みなので、配置を旧尺に合わせることでズレを防ぎます。
- **TMPDIR**: /tmp が小さい環境（512MB tmpfs）でレンダリングが溢れて失敗した実績があるため、プロジェクト配下の `.tmp/` を必ず指定します（Windows では TEMP/TMP も同値に設定）。
- **無音シーンの正規化**: タイトル/エンディングなど音声のないシーンには無音AACトラックを自動追加し、全シーンのストリーム構成を揃えてから連結します。

## 動画スクリプトJSON スキーマ

入力は1本の JSON です。Remotion プロジェクトの `src/production.json` に配置され、ランナー（合成・尺計算）と Remotion（描画）の両方が同じファイルを読みます。

### トップレベル

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `schemaVersion` | number | ○ | スキーマ版数。現在は `1` |
| `id` | string | ○ | 動画の識別子。出力ファイル名などに使う |
| `title` | string | ○ | 動画タイトル（制作ログ等に記録） |
| `voice` | object | ○ | 音声合成の設定（下記） |
| `scenes` | array | ○ | シーンの配列。**この並び順がそのまま動画の順序**になる |

### `voice`

| フィールド | 型 | 意味 |
|---|---|---|
| `styleId` | number | VOICEVOX のスタイルID。`2` = 四国めたん ノーマル |
| `speed` | number | 話速。試作の既定は `1.12` |
| `tailSilence` | number | 文末に付ける余韻の無音（秒）。既定 `0.28` |

### シーン共通フィールド

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| `id` | string | ○ | シーンID。そのまま Remotion の Composition ID になる（例: `S1`, `T`, `S2` …） |
| `type` | string | ○ | シーン種別: `hook` / `title` / `content` / `end` |
| `shoulder` | string | 任意 | 肩テロップ（左上の常時表示ラベル） |
| `headline` | string | 任意 | 見出しテロップ（シーン冒頭 約4.2秒 表示） |
| `credit` | string | 任意 | 出典クレジット（左下の小表示。例: `出典: OpenAI公式ブログ`） |
| `accentTelop` | object | 任意 | 要約テロップ（大きな強調表示）。`{"text": "9月20日"}` の形で、最初のナレーション文の間だけ右上に出る |
| `diagram` | string | 任意 | 図解の指定（下記） |
| `diagramData` | object | 任意 | 図解の文言・項目（下記）。話題固有の中身はコードではなくここに書く |
| `fixedSeconds` | number | title/end で任意 | ナレーションのないシーンの尺（秒）。既定 title=3 / end=5 |
| `narration` | string[] | content/hook で必須 | ナレーション文の配列。**1要素 = 1文**として文単位に合成され、字幕もこの単位（長文は句読点で自動分割表示）。字幕には原文が使われ、読み替え辞書は合成用テキストにだけ適用される |

### シーン種別ごとの追加フィールド

| type | 追加フィールド | 意味 |
|---|---|---|
| `hook` | `hook: {lines: string[], accent?: string, sub?: string}` | 冒頭フックの大テロップ。`lines` を行ごとに表示し、`accent` に一致する部分を黄色で強調。`sub` は2文目が始まるタイミングで出す補足文 |
| `title` | `titleCard: {kicker: string, lines: string[], sub?: string}` | タイトルカード。`kicker` は小さな英字ラベル（例: `AI NEWS`）、`lines` が大見出し、`sub` が下部の補足（日付・副題） |
| `content` | `diagram` など共通フィールド | 通常の解説シーン |
| `end` | `endCard: {summary: string[], sources: {label: string, url: string}[]}` | エンディング。`summary` は要点リスト、`sources` は出典一覧（ラベルとURL） |

### `diagram` / `diagramData`（図解の指定と中身）

現在テンプレート（`template/`）に実装されている図解。文言・項目はすべて `diagramData` で渡します
（テキスト中の `"\n"` は改行として表示されます）:

| 値 | 内容 | `diagramData` の主なフィールド |
|---|---|---|
| `sandbox` | 囲い（サンドボックス）とモデル、抜け出しの図解 | `title` / `circle` / `note` / `step2Title` / `step2Text` / `step3Badge`（任意） |
| `timeline` | 年表（出来事の時系列） | `events: [{date, label, atUnit}]` |
| `redteam` | 攻撃役 → 境界・監視 → 修正 の3段図解 | `attackerTitle` / `attackerText` / `middleTitle` / `middleText` / `resultText` |
| `split` | 2カラム対比（✕ / ○） | `left: {title, mark, text}` / `right: {title, mark, text}` |
| `summary-points` | 番号付き要点リスト | `points: string[]` |
| （省略） | 図解なし（テロップと字幕のみ） | — |

**図解は全種類とも、シーン開始から全体を表示します**（2026-10-26 田中さんの指定。
ナレーションに合わせた段階表示・順次表示はしません）。
`timeline` の `atUnit` は表示タイミングには使われません。`null` にした項目だけは
シーン内では表示されません（後続シーンで触れる出来事を並べておく用途）。

新しい図解が必要な場合は、テンプレートの `src/components.tsx` にコンポーネントを追加し、ここで指定できる値を増やします。

### 最小例

```json
{
  "schemaVersion": 1,
  "id": "example-news",
  "title": "例: 新モデルの発表",
  "voice": { "styleId": 2, "speed": 1.12, "tailSilence": 0.28 },
  "scenes": [
    { "id": "S1", "type": "hook", "shoulder": "新モデル発表",
      "hook": { "lines": ["新モデル、登場"], "accent": "新モデル", "sub": "何が変わったのか" },
      "narration": ["新しいモデルが発表されました。"] },
    { "id": "T", "type": "title", "fixedSeconds": 3,
      "titleCard": { "kicker": "AI NEWS", "lines": ["新モデル発表"], "sub": "2026年10月発表" } },
    { "id": "S2", "type": "content", "shoulder": "内容", "headline": "ポイントは3つ",
      "credit": "出典: 公式ブログ", "diagram": "summary-points",
      "narration": ["第一のポイントは速度です。", "第二に価格が下がりました。"] },
    { "id": "E", "type": "end", "fixedSeconds": 5,
      "endCard": { "summary": ["要点を1行で"], "sources": [{ "label": "公式ブログ", "url": "https://example.com/" }] } }
  ]
}
```

## ワーカーモード（ジョブ自動取得＋連続処理）

`../tools/worker.py` は、ジョブキューを監視して「脚本済み」の題材を自動で掴み、
runner.py で生成し、結果を記録するまでを繰り返す常駐型ツールです。
runner.py 本体には手を入れず、サブプロセスとして呼び出します（通常モードの挙動は不変）。

ジョブ取得バックエンドは3種類あります:

| バックエンド | ジョブキュー | 結果の記録 | 想定環境 |
|---|---|---|---|
| `sheet` | Google スプレッドシート「AIニュース収集」のニュースタブ | シートに直接記録 | gws CLI がある環境（Muse の VM） |
| `sheetapi` | 同上（Google Sheets API を OAuth 認証で直接読み書き） | シートに直接記録 | gws CLI が無い環境（Windows ノード等）。キュー意味論は `sheet` と同一。**初回だけブラウザ認証が要る**（手順は [README-WINDOWS.md](README-WINDOWS.md) のシート直接連携の節） |
| `dir` | 指定フォルダ配下のジョブフォルダ（production.json を含むフォルダ） | 各フォルダの `result.json` | Windows ノード（Drive 同期フォルダ前提）。**シートへの反映は Muse 側が橋渡しする** |

### sheet バックエンドの動き（sheetapi も同じ）

- 1題材＝1グループ（N列グループID）。代表記事の行がジョブ単位で、**D列=脚本済み かつ O列（担当ノード）が空** の代表行が未処理ジョブです。
- **claim**: 代表行の O列にノード名、P列に開始時刻（JST）を書き、数秒待って再読します。他ノードの名前に変わっていたら譲って次のジョブへ進みます（緩い排他）。
- **素材の対応付け**: `--scripts-dir`（既定 `~/workspace/newsreel-scripts/scripts`、Drive 共有フォルダの scripts）から、(1) フォルダ名＝代表記事ID（フォルダ名の規約は `YYYY-MM-DD_<代表記事ID>`。日付部分は対応付けに使わない）→ (2) production.json の `id` → (3) エンドカード出典URLとメンバー記事URLの一致、の順で production.json を特定します。
- **成功**: 代表行の D列を「動画化済み」にし、Q列に完了時刻、R列に `ノード名: 出力mp4の絶対パス` を記録します。グループの他メンバー行は D列だけ追随させます（脚本済み以外の行は触りません）。生成物はノードのローカル（`--outputs-dir`、既定 `~/workspace/newsreel-outputs`）に置き、アップロードはしません。
- **失敗**: 代表行の R列にエラーの要旨を記録して次のジョブへ進みます（1件の失敗で全体は止まりません）。リトライしたい場合は、その行の O列と R列を手で消してください。
- **Ctrl+C は段階式**です。1回目は「現在のジョブが終わったら停止します」と表示され、処理中のジョブは生成→結果記録まで完了してから、次のジョブを開始せずに正常終了します（中断の記録は残しません）。待機中（キュー空のスリープ中）なら速やかに終了します。もう一度 Ctrl+C を押すと、ランナー子プロセス（とその子孫）ごと即座に強制終了します。

```bash
# ジョブ一覧だけ見る
python3 ../tools/worker.py --backend sheet --dry-run

# 実ジョブを1件だけ dev で処理
python3 ../tools/worker.py --backend sheet --once --mode dev --node muse-vm

# キューが空になるまで連続処理
python3 ../tools/worker.py --backend sheet --mode final --node muse-vm --idle-exit

# sheetapi（Sheets API 直接連携。要・初回認証。下記 TOML 例も参照）
python ../tools/worker.py --backend sheetapi --sheets-credentials C:\newsreel\client_secret.json --mode final --synth http --node weito-pc --idle-exit
```

### 設定ファイル（TOML）

ノード固有のパスや設定は、コマンドラインに毎回書かず、ローカルの設定ファイル
`newsreel.toml` に持てます（[worker] テーブルに CLI と同じ名前のキーで書く。
書式と2つの記入例はパッケージ直下の [`../newsreel.example.toml`](../newsreel.example.toml) を参照）。

- 探索順: `--config <path>` の明示指定 → カレントディレクトリの `newsreel.toml` → パッケージ直下の `newsreel.toml`
- 優先順位: **CLI引数 > TOML > 既定値**
- `newsreel.toml` は `.gitignore` 済みです。個人のパスが GitHub に上がることはありません

また **dir バックエンドでは辞書の自動発見**が働きます: `--voice-dir` が明示されて
いない場合、`<jobs-dir>/../voice/reading_dict.json`（Drive 共有レイアウトの辞書）が
あればそれを優先し、パッケージ voice/ の適用スクリプトと組み合わせた作業用
voice dir を自動構成して runner に渡します（元のファイルは変更しません）。

### 主なオプション（worker.py）

| オプション | 意味 |
|---|---|
| `--config <path>` | 設定ファイル（TOML）のパス |
| `--backend sheet\|dir\|sheetapi` | ジョブ取得バックエンド（既定: sheet） |
| `--node <名前>` | 担当ノード名（既定: 環境変数 `NEWSREEL_NODE`、なければホスト名） |
| `--mode dev\|final` | 生成画質（既定: dev） |
| `--scripts-dir <dir>` | sheet / sheetapi 用: 素材フォルダの親 |
| `--sheets-credentials <path>` | sheetapi 用: OAuth クライアントJSONのパス（必須） |
| `--sheets-token <path>` | sheetapi 用: トークンファイルのパス（既定: credentials と同じフォルダの `newsreel_token.json`） |
| `--jobs-dir <dir>` | dir 用: ジョブフォルダの親 |
| `--outputs-dir <dir>` | 完成mp4の出力先（ノードのローカル） |
| `--once` / `--max-jobs N` | 処理件数の制限 |
| `--interval <秒>` | キューが空のときのポーリング間隔（既定: 60） |
| `--idle-exit` | キューが空なら待たずに終了 |
| `--only-group <ID>` | 特定のグループ（dir ではフォルダ名）だけを対象にする |
| `--dry-run` | ジョブ一覧の表示のみ |
| `--synth core\|http` / `--engine-url` | runner.py へそのまま渡す合成設定 |

失敗したジョブと素材未解決のジョブは、worker の同一起動中は再試行されません
（素材を後から置いた場合は worker を再起動してください）。

## 関連ファイル

- テンプレートプロジェクト: `../template/`（`src/production.json` は作業用コピーで、実例は `../examples/openai-isolation/production.json`）
- 読み替え辞書: `../voice/reading_dict.json` / `../voice/apply_reading_dict.py`
- Windows で JSON から完成まで生成する場合: [README-WINDOWS.md](README-WINDOWS.md)
- HTTP バックエンドの検証用モックサーバ（Linux 側のテスト専用）: `../tools/voicevox_mock_server.py`
- ランナー構築・検証の記録: [RUNNER_LOG.md](RUNNER_LOG.md)
- パッケージ全体の説明: [../README.md](../README.md)

## ラウドネス正規化（音量の均一化）

完成 mp4 は最後に音量を正規化します（`--no-loudnorm` で省略可）。

- 目標: **統合ラウドネス -14 LUFS / トゥルーピーク -1 dB**（YouTube の基準相当）。
  方式は「loudnorm で計測 → 必要ゲインを volume で適用しつつ alimiter でピークを
  -2 dBFS に抑える → 再計測して担保」。映像は stream copy のまま音声だけを整えます。
  loudnorm の dynamic 補正は、冒頭に強い音がある素材でピーク上限を超えることが
  実測で判明したため、補正には使わず計測専用にしています。
- すでに基準内（±0.5 LUFS かつピーク以下）のファイルはそのままにします。
- 変更前後の実測値は production-log.md の「ラウドネス正規化」行に記録されます。
- 背景: 導入前の実測では生成動画は約 -24.7 LUFS と基準より約10 dB 小さく、
  YouTube は小さい音を底上げしないため、そのままでは他動画より小さく聞こえていました。
  音声だけ差し替えモードでも同じ正規化がかかります。

## 効果音（SE）

連結後・ラウドネス正規化の前に、冒頭へ効果音を重ねます（`--no-se` で省略可）。

効果音は**冒頭の intro.wav のみ**です（2026-10-25 田中さんの判断「頭の効果音以外はいらない」。
以前あったタイトルの風切り・アクセントのピン・締めの和音は廃止しました）。

| 種別 | 配置 | 音 |
|---|---|---|
| start | 動画の先頭（0秒） | **intro.wav（田中提供の冒頭音）** |

- アセットは `runner/assets/se/intro.wav`（田中提供の音源を整形したもの）。
  フォルダ内に残っている他の wav は旧仕様の名残で、現在は使いません。
  音量は声より十分下に置き、最終レベルは続くラウドネス正規化がそろえます。
- 配置した効果音は production-log.md の「効果音ミックス」行に記録されます。
- 音声だけ差し替えモードでは効果音は付きません（映像に合わせた配置が前提のため）。
- **冒頭は効果音が終わってから発話が始まります**（田中さんの指定、2026-10-25）。
  最初にナレーションのあるシーンでは、intro.wav の実尺＋0.15秒の位置から最初の
  ナレーションが始まるよう、runner が `introHoldSec` を timing.json に書き、
  テンプレ側（layout.ts）も同じだけシーンを延ばします（そのシーンより前に
  無音のシーンがある場合は、その分を差し引いて計算します）。intro.wav を
  差し替えればホールド量は実尺に追随します。`--no-se` のときはホールドしません。
  なお、タイトル等の固定尺シーンでも `narration` があれば尺はナレーションから
  決まります（研究・技術系でタイトルカードにサマリー1文目を載せるため）。
