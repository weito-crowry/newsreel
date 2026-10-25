# newsreel tools/

## worker.py — ジョブ自動取得＋連続処理（ワーカーモード）

「脚本済み」の題材をジョブとして自動で掴み、runner.py（サブプロセス）で生成し、
結果を記録するまでを繰り返す常駐型ツールです。バックエンドは2種類:

- `--backend sheet`: Google スプレッドシート「AIニュース収集」をジョブキューとして
  読み書きする（gws CLI がある環境専用。claim は O/P列への書き込み＋数秒後の再読で
  競合チェック。成功時は D列=動画化済み・Q列・R列へ記録し、メンバー行の D列も追随）。
- `--backend dir`: ジョブフォルダを列挙して各フォルダに `result.json` を書き出す
  （Windows ノード用。シートへの反映は Muse 側が橋渡しする）。

使い方は [../runner/README.md のワーカーモード節](../runner/README.md#ワーカーモードジョブ自動取得連続処理) と
[../runner/README-WINDOWS.md](../runner/README-WINDOWS.md) を参照してください。

## voicevox_mock_server.py — VOICEVOX公式API互換モックサーバ（テスト専用）

runner.py の HTTP合成バックエンド（`--synth http`）を、公式VOICEVOXアプリなしで
検証するための最小サーバです。中身は voicevox_core（blocking API）を HTTP の後ろに
置いたもので、実装は `POST /audio_query` と `POST /synthesis` のみです。

```bash
# エンジン一式（~/workspace/voicevox）を掴んで起動（venv の python が必要）
~/workspace/voicevox/venv/bin/python tools/voicevox_mock_server.py [--port 50021]

# 別のターミナルで、通常の python3 から runner を HTTP 経路で実行
cd runner
python3 runner.py ../examples/openai-isolation/production.json --mode dev --synth http
```

- 環境変数 `VOICEVOX_DIR` でエンジン一式の場所を変更できます。
- **本番・Windows では不要**です。Windows では公式VOICEVOXアプリが同じ API を
  `http://localhost:50021` で提供します（手順は [../runner/README-WINDOWS.md](../runner/README-WINDOWS.md)）。
- core 側の都合で、公式形式にある `pauseLength` は常に null を返します（合成結果には影響しません）。
