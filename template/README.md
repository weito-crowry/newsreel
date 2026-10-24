# newsreel template/ — Remotion テンプレートプロジェクト

ニュース動画の画面を描く Remotion プロジェクトのテンプレートです。
**話題固有の文言はコードに持たず、すべて `src/production.json` 駆動**になっています。

## 構成

| ファイル | 役割 |
|---|---|
| `src/index.ts` / `src/Root.tsx` | 全編 Composition（`NewsVideo`）とシーン別 Composition を登録 |
| `src/Video.tsx` | 全編／シーン単体の描画（音声の配置を含む） |
| `src/layout.ts` | production.json の型定義と、尺・字幕チャンク等のレイアウト計算 |
| `src/components.tsx` | 共通画面部品（背景・肩テロップ・見出し・字幕・出典・バッジ）と図解・カード類 |
| `src/production.json` | 作業用コピー。**runner.py が入力JSONで上書きする**ので、手で編集する場所ではない（収録内容は実例そのもの） |
| `src/timing.json` | 合成結果（文ごとの実尺）。runner.py が生成する |
| `public/audio/` | 合成した文単位WAVの置き場所。runner.py が生成する |

## 図解（diagram / diagramData）

シーンの `diagram` で図解の種類を選び、文言・項目は `diagramData` に書きます
（対応フィールドは `src/layout.ts` の `DiagramData` 型と runner/README.md のスキーマ説明を参照）。

| diagram | diagramData で渡すもの |
|---|---|
| `sandbox` | `title` / `circle` / `note` / `step2Title` / `step2Text` / `step3Badge`（任意） |
| `timeline` | `events: [{date, label, atUnit}]`（`atUnit` は表示開始の文番号、null は非表示） |
| `redteam` | `attackerTitle` / `attackerText` / `middleTitle` / `middleText` / `resultText` |
| `split` | `left: {title, mark, text}` / `right: {title, mark, text}` |
| `summary-points` | `points: string[]` |

テキスト中の `"\n"` は改行として表示されます。新しい図解が必要な場合は
`src/components.tsx` にコンポーネントを追加し、`diagram` の値を増やしてください。

## 単体で使う場合

通常は runner.py 経由で使いますが、プロジェクト単体でも動きます:

```bash
npm ci                  # node_modules が無い環境だけ（同梱済みの場合は不要）
npm run compositions    # Composition 一覧
npm run studio          # ブラウザでプレビュー
npm run render:full:dev # 全編一括レンダリング（開発画質、従来方式）
```

フォントは `'Noto Sans CJK JP' → 'Noto Sans JP' → 游ゴシック → ヒラギノ → メイリオ`
の順にフォールバックするので、Windows でも崩れません（詳細は ../runner/README-WINDOWS.md）。
