# newsreel を Windows で動かす手順（JSON → 完成mp4）

newsreel は、動画スクリプトJSON を1本渡すだけで **読み替え辞書適用 → VOICEVOX音声合成 →
シーン別レンダリング → 連結 → 完成mp4** までを自動実行します。
音声合成に **VOICEVOX公式アプリのHTTP API**（`--synth http`）を使うため、
**Windows PC だけで最初から最後まで生成できます**（合成済み素材の持ち込みは不要）。

> style_id の意味は公式エンジンと VOICEVOX core で同一です。
> このパッケージの production.json は `styleId: 2` = **四国めたん ノーマル** を前提にしています。

## 1. 必要なもの

| ソフト | 入手 | 備考 |
|---|---|---|
| VOICEVOX 公式アプリ | https://voicevox.hiroshiba.jp/ | 合成エンジン。起動しておくと `http://localhost:50021` で API が応答する |
| Node.js LTS（20 以上推奨） | https://nodejs.org/ | インストーラで `node` / `npm` / `npx` が PATH に入る |
| Python 3（3.10 以上） | https://www.python.org/ または Microsoft Store | ランナー実行用（標準ライブラリのみ）。ただし 3.10 以下の場合のみ、ワーカーの設定ファイル読み込み用に `pip install tomli` が必要（3.11 以上は不要） |
| ffmpeg | https://ffmpeg.org/ （または `winget install ffmpeg`） | シーン連結・無音トラック追加・検証に使用。PATH を通すこと |
| newsreel パッケージ | GitHub リポジトリを clone / ダウンロードして配置 | 配置場所は任意（例: `C:\newsreel`） |

## 2. VOICEVOX の準備（合成エンジン）

1. 公式アプリをインストールして **起動したまま** にしておきます。
2. 起動するとエンジンが `http://localhost:50021` で待ち受けます。確認方法:
   ブラウザで `http://localhost:50021/version` を開いてバージョンが表示されれば OK です。
3. ランナーはこのエンジンに文単位で合成を依頼します。**VOICEVOX を終了すると合成で
   接続エラー**になるので、生成が終わるまでは起動したままにしてください。

通信はすべて **同一PC内の localhost** で完結し、外部にデータを送ることはありません。
初回起動時に Windows ファイアウォールの許可ダイアログが出た場合は、
「プライベート ネットワーク」で許可してください（localhost の待ち受け・接続に必要です）。

## 3. セットアップ（初回のみ）

PowerShell でテンプレートフォルダを開いて依存パッケージを入れます:

```powershell
cd C:\newsreel\template
npm ci
```

`npm ci` で `package-lock.json` と同じバージョン一式が入ります（ネット接続が必要）。

**初回レンダリング時の注意**: Remotion は描画用ブラウザ（Chrome Headless Shell、約 150MB）を
自動ダウンロードします。初回だけ数分の待ち時間が必要です。2回目以降は不要です。

## 4. 実行

```powershell
cd C:\newsreel\runner

# 開発用（960x540、高速確認）
python runner.py ..\examples\openai-isolation\production.json --mode dev --synth http

# 最終版（1920x1080）
python runner.py <自分の production.json> --mode final --synth http
```

- `--synth http` が Windows 用の合成方式です（エンジンURLを変えた場合は `--engine-url` で指定）。
- シーン単体だけ作り直す: `--scenes S3 --force` を追加（他のシーンは再利用され、再連結だけ行います）。
- 合成を省いて描画だけ: `--skip-synth`（既存の `template\src\timing.json` と音声を再利用）。
- 音声だけ差し替え: `--audio-only-from 既存.mp4`（映像は無劣化コピー）。`--synth http` と併用できます。
- 出力は `template\out\<動画id>-<mode>\` に、完成mp4・シーン別mp4・制作ログ（production-log.md）が入ります。
- ランナーは一時ファイルをプロジェクト配下の `.tmp` に向けます（TEMP/TMP を自動設定）。

### npx で直接（シーン単体の描画など）

```powershell
cd C:\newsreel\template
npx remotion render src/index.ts S3 out\scene-S3.mp4            # フルHD
npx remotion render src/index.ts S3 out\scene-S3.mp4 --scale 0.5  # 開発用 960x540
npx remotion studio src/index.ts                                # ブラウザでプレビュー編集
```

package.json の scripts（`studio` / `render:full:dev` / `render:full:final` / `render:scene` /
`still`）は npm が解釈するので OS 非依存です。

## 5. フォントの注意（日本語ゴシック）

画面のフォント指定は `'Noto Sans CJK JP' → 'Noto Sans JP' → 游ゴシック → ヒラギノ → メイリオ`
の順にフォールバックします。

- Windows 標準環境では **游ゴシック（Yu Gothic UI / Yu Gothic）** で描画されます。
  太字ウェイトもあり、そのまま使えますが、Linux 側（Noto Sans CJK JP）とは字形・行間が
  微妙に変わり、テロップの折り返し位置がずれることがあります。
- 見た目を揃えたい場合は、Google Fonts から **Noto Sans JP** をインストールしてください
  （https://fonts.google.com/noto/specimen/Noto+Sans+JP ）。

## 6.5 ワーカーモード（ジョブの自動取得＋連続処理）

複数の題材をまとめて連続生成したい場合は、`tools\worker.py` の **dir バックエンド** を使います。
Windows ノードではシートへ直接は書き込まず、ジョブフォルダごとの `result.json` に結果を残します
（シートへの反映は Muse 側が result.json を見て橋渡しします）。

シートへ直接書き込みたい場合は **sheetapi バックエンド**も使えます（Google Sheets API を
OAuth 認証で直接叩く方式で、Muse の橋渡しが不要になります）。初回だけブラウザでの
準備と認証が必要です → [シート直接連携（OAuth）](#シート直接連携oauth)。

前提:

- Drive 同期フォルダに、題材ごとのジョブフォルダ（`production.json` を含む）が展開されていること
  （例: `D:\newsreel-scripts\scripts\<題材フォルダ>\production.json`）。
  題材フォルダ名の規約は `YYYY-MM-DD_<題材ID>`（ニュース日付のプレフィックス）です。
- VOICEVOX 公式アプリを起動しておくこと（合成は `--synth http` で公式アプリの API を使います）。

```powershell
cd C:\newsreel\tools

# ジョブ一覧だけ見る
python worker.py --backend dir --jobs-dir D:\newsreel-scripts\scripts --dry-run

# キューが空になるまで連続生成（最終画質）
python worker.py --backend dir --jobs-dir D:\newsreel-scripts\scripts ^
    --mode final --synth http --node weito-pc --idle-exit
```

#### 設定ファイル（TOML）でノード設定を持たせる

毎回長いオプションを書く代わりに、ノード固有の設定を設定ファイル
`newsreel.toml` にまとめられます。パッケージ直下の `newsreel.example.toml`
をコピーして `newsreel.toml` にリネームし、自分の環境に書き換えてください
（`newsreel.toml` は .gitignore 済みで、GitHub には上がりません）。
優先順位は CLI引数 > TOML > 既定値です。

Drive for Desktop で `newsreel` フォルダを同期している場合の設定例
（`jobs_dir` に同期フォルダの `scripts` を指します。パスは自分の環境に
合わせて読み替えてください。Windows パスは TOML のシングルクォートで
囲むリテラル文字列で書きます）:

```toml
[worker]
backend = "dir"
node = "weito-pc"
mode = "final"
synth = "http"
jobs_dir = 'D:\ドキュメント\Googleドライブ\newsreel\scripts'
outputs_dir = 'D:\newsreel-outputs'
idle_exit = true
```

起動はカレントディレクトリかパッケージ直下に `newsreel.toml` を置けば
オプションなしで済みます。別の場所に置いた場合は `--config <path>` で渡します。

```powershell
cd C:\newsreel\tools
python worker.py
```

辞書について: `jobs_dir` の隣の `voice\reading_dict.json`（上記の例では
`D:\ドキュメント\Googleドライブ\newsreel\voice\reading_dict.json`）があれば、
`--voice-dir` を書かなくても worker が自動でそちらを優先します
（Drive 側で更新された辞書がそのまま使われます）。

- 結果は各ジョブフォルダの `result.json`（status / node / started_at / finished_at / output の絶対パス、失敗時は error）に記録されます。完成mp4はノードのローカル（`--outputs-dir`、既定は `%USERPROFILE%\workspace\newsreel-outputs`）に出力され、アップロードはしません。
- `result.json` の status が `success` のフォルダは処理済みとしてスキップされます。再処理したい場合はそのフォルダの `result.json` を削除してください。
- 1件だけ処理する場合は `--once`、件数を絞る場合は `--max-jobs N`、特定の題材だけは `--only-group <フォルダ名>` を付けます。
- Ctrl+C で安全に止まります（処理中ジョブには中断の result.json を残します）。
- **sheet バックエンド**（`--backend sheet`）は gws CLI がある環境（Muse の VM）専用です。Windows では dir バックエンドか、下記の sheetapi バックエンドを使ってください。

#### シート直接連携（OAuth）

sheetapi バックエンドを使うと、Windows ノードが Google スプレッドシート
「AIニュース収集」を直接ジョブキューとして読み書きします（claim・結果記録まで
全部シートに直接。dir バックエンドと違い、result.json の橋渡しは不要です）。
読み書きは `tools\sheets_api.py`（標準ライブラリのみ）が Google Sheets API を
OAuth 認証で叩きます。**初回だけ**、以下の準備と認証が必要です。

**準備（Google Cloud Console、ブラウザで1回だけ）**

1. [Google Cloud Console](https://console.cloud.google.com/) を開き、プロジェクトを
   作成します（既存のプロジェクトでも構いません）。
2. 「APIとサービス」→「ライブラリ」で **Google Sheets API** を検索して有効化します。
3. 「APIとサービス」→「OAuth 同意画面」で、ユーザーの種類に **「外部」** を選んで
   アプリ名などを入力し、作成します。**「テストユーザー」に自分の Google アカウントを
   追加**してください（アプリを「公開」にしない限り、認証できるのはテストユーザー
   だけです）。スコープの追加は不要です。
4. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth クライアント ID」で、
   アプリケーションの種類に **「デスクトップ アプリ」** を選んで作成します。
5. 作成後に表示される **JSON をダウンロード**し、`client_secret.json` という名前で
   安全な場所に保存します（例: `C:\newsreel\client_secret.json`)。
   このファイルは秘密情報です。**Drive 同期フォルダや他人と共有する場所には置かないで
   ください**（リポジトリ内でも .gitignore 済みですが、リポジトリ外が無難です）。

**認証（PowerShell で1回だけ）**

```powershell
cd C:\newsreel\tools
python sheets_api.py auth --credentials C:\newsreel\client_secret.json
```

ブラウザが開くので、スプレッドシートを編集できる自分のアカウントでログインして
許可します（「このアプリは確認されていません」と出たら「詳細」→「（プロジェクト名）に
移動」で進みます）。トークンは credentials と同じフォルダに `newsreel_token.json`
として保存され、以後は自動で更新されます。以後の起動で再認証を求められることは
通常ありません（Google アカウント側で許可を取り消した場合などは、この認証コマンドを
再実行してください。worker は認証が切れていると生成を始めず、手順を表示して止まります）。

**起動（TOML の記入例）**

`newsreel.toml` に次のように書けば、オプションなしで起動できます
（素材フォルダは dir バックエンドの `jobs_dir` ではなく `scripts_dir` で指します）。

```toml
[worker]
backend = "sheetapi"
node = "weito-pc"
mode = "final"
synth = "http"
sheets_credentials = 'C:\newsreel\client_secret.json'
scripts_dir = 'D:\ドキュメント\Googleドライブ\newsreel\scripts'
outputs_dir = 'D:\newsreel-outputs'
idle_exit = true
```

```powershell
cd C:\newsreel\tools
python worker.py            # TOML がある場合
# TOML なしで直接指定する場合:
python worker.py --backend sheetapi --sheets-credentials C:\newsreel\client_secret.json --mode final --synth http --node weito-pc --idle-exit
```

- トークンの保存先を変えたい場合は `--sheets-token <path>`（TOML では `sheets_token`）。
- シート上での動き（claim の競合チェック、成功/失敗の記録先）は Muse VM の
  sheet バックエンドと完全に同じです。2つのノードで同時に使っても claim が競合を防ぎます。

## 6. トラブル時

| 症状 | 対処 |
|---|---|
| 「VOICEVOX エンジンに接続できません」 | 公式アプリが起動しているか確認。`http://localhost:50021/version` が開けるか試す |
| `npx` / `python` / `ffmpeg` が見つからない | インストール直後は PowerShell を開き直して PATH を再読み込みする |
| 初回描画で止まって見える | Chrome Headless Shell のダウンロード中。数分待つ |
| コンソールの日本語が文字化けする | 表示だけの問題（ファイルは UTF-8 で正常）。気になる場合は `chcp 65001` を実行 |
| sheetapi で「認証が必要です」と出て止まる | トークンが無い/失効しています。`python tools\sheets_api.py auth --credentials <client_secret.jsonのパス>` を再実行してください |
| 描画が極端に遅い | `--mode dev`（scale 0.5）で確認用を先に作る。最終版だけフルHDにする |
