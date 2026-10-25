# 投稿準備の定型フロー

動画化済みトピックの YouTube 投稿を、タイトル案と概要欄の「投稿パック」で定型化する。組み立ては `tools/publish_prep.py`、タイトル案とリード文は LLM、投稿そのものは人間（Tanaka）が行う。

## 流れ

```sh
python3 tools/publish_prep.py list # 投稿パック未作成の動画化済みトピック
python3 tools/publish_prep.py prepare # 素材を publish_worksheet.json に束ねる
# LLM が publish_results.json に {id, title_main, title_alt, lead} を書く
python3 tools/publish_prep.py apply # 投稿パックを組み立てて配置する
```

- 素材は production.json のエンドカード（要約・出典）と、シートのタグ・出力先記録から自動で集まる。初期の手作り production.json で出典がない場合は、メンバー記事から補完される。
- apply の成果物:
- 手元: `publish-<repId>.md`（成果物フォルダ）
- Drive: 「newsreel/scripts/<YYYY-MM-DD_repId>/publish.md」（脚本と同じフォルダ。動画ファイルのある PC からも開ける）
- 状態は `~/workspace/news-pipeline/publish_state.json` に記録され、作成済みトピックは list に出なくなる。

## 投稿パックの中身

- **動画ファイル**: シート記録の「ノード名: ローカルパス」。アップロードするファイルはここで特定する。dev 版が記録されているトピックは、投稿前に final 版の有無を確認すること。
- **タイトル案 2つ**: 案1 は「フック｜題材の本質」の形（例: 事実が正しくても、情報源が違えば誤り｜MCPエージェントの"出所"を検証する ProvenanceGuard）。案2 は事実を素直に伝える形。どちらも動画の内容と一致する範囲で、誇張しない。
- **概要欄（コピペ用）**: リード文 → （エンドカード要約） → （媒体名・記事タイトル・URL） → 「音声: VOICEVOX（四国めたん）」 → ハッシュタグ（#AIニュース #生成AI ＋記事タグ最大6件）。

## 投稿後の処理

- Tanaka が YouTube に投稿したら、URL を Muse に伝える。Muse はシートの代表行（と脚本済みメンバー行）を「投稿済み」に進め、備考に URL を追記する（初回投稿 ProvenanceGuard のときと同じ処理）。
- 投稿は人間が行う（YouTube 連携は作らない方針）。このフローの役割は、投稿直前の「考える・書く」をなくすこと。
