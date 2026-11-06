import timing from "./timing.json";
import production from "./production.json";

export const FPS = 30;
const SCENE_PAD_HEAD = 0.175; // シーン冒頭の間（秒）(2026-10-26 田中指定で従来の半分。runner.py の PAD_HEAD と一致)
const SCENE_PAD_TAIL = 0.225; // シーン末尾の間（秒）(同上、PAD_TAIL と一致)
// 冒頭効果音が終わってから発話を始めるための追加の間（秒）。runner が timing.json に書く
const INTRO_HOLD_SEC = Number((timing as { introHoldSec?: unknown }).introHoldSec ?? 0) || 0;

/* ---------- 動画スクリプトJSON（production.json）の型 ---------- */

/** 図解の中身（文言・項目）。図解の種類ごとに使うフィールドが違う。
 *  テキスト中の "\n" は改行として表示される。 */
export interface DiagramData {
  // sandbox: 囲いとモデルの図
  title?: string; // 囲いの見出し
  circle?: string; // 円の中のラベル
  note?: string; // 円の横の補足
  step2Title?: string; // 段階表示の2段目の大見出し
  step2Text?: string; // その補足
  step3Badge?: string; // バッジ（省略時は出さない）
  // 段階表示のタイミング（sandbox / redteam 共通）: その文（0始まり）の開始で出す。
  // 省略時は 0 = シーン開始から出す（演出はデータが決める。プログラムは機構だけ）
  step2AtUnit?: number;
  step3AtUnit?: number;
  // timeline: 年表
  events?: { date: string; label: string; atUnit?: number | null }[];
  //   atUnit: その文（0始まり）の開始で表示。省略時は 0（最初から）。null はこのシーンでは表示しない
  // redteam: 攻撃役 → 境界・監視 → 結果 の3段
  attackerTitle?: string;
  attackerText?: string;
  middleTitle?: string;
  middleText?: string;
  resultText?: string;
  // split: 2カラム対比
  left?: { title: string; mark?: string; text?: string };
  right?: { title: string; mark?: string; text?: string };
  // summary-points: 番号付き要点。各要素は文字列、または {text, atUnit}。
  // atUnit: その文（0始まり）の開始で表示。省略時は 0（最初から）
  points?: (string | { text: string; atUnit?: number; pageBreakBefore?: boolean })[];
  // --- 以下、2026-11-06 追加の図解種別（仕様: template-spec-2026-11-06.md） ---
  // 要素ごとの atUnit はいずれも「その文（0始まり）の開始で表示。省略時は 0（最初から）」
  // hero-number: 大きな数字を主役に
  label?: string; // 主数字の上の短い見出し
  value?: string; // 主役の数字
  valueNote?: string; // 主数字の下の補足1行
  sub?: { value: string; label: string; atUnit?: number }[]; // 副次数字（最大2件）
  // note は sandbox と共用フィールド（図解ごとに意味が違う）。hero-number では
  // 最下部の注釈、numbers-table では表の下の注釈として使う
  atUnit?: number; // hero-number: 主数字 / quote: 引用文 の表示タイミング
  labelAtUnit?: number; // hero-number: label の表示タイミング
  noteAtUnit?: number; // hero-number: note の表示タイミング
  // numbers-table: 数値対比表
  columns?: string[]; // 列見出し（1〜3列）。行ラベル列は別
  rows?: { label: string; values: string[]; atUnit?: number; highlight?: boolean }[];
  // steps: 手順・流れ（2〜4段）
  steps?: { title: string; text?: string; atUnit?: number }[];
  // quote: 引用・発言
  quote?: string; // 発言の引用
  speaker?: string; // 発言者
  role?: string; // 肩書き・所属
  context?: string; // いつの何の発言か
  speakerAtUnit?: number; // 発言者・肩書きの表示タイミング
  // items: 並列リスト（2〜4項目）
  items?: { title: string; text?: string; atUnit?: number }[];
  // --- 以下、2026-11-06 第2弾の図解種別（仕様: template-spec-2026-11-06.md 第2弾） ---
  // benchmark-table: モデル×ベンチマークのスコア表
  benchRows?: { model: string; values: string[]; atUnit?: number; highlight?: boolean }[];
  best?: (number | null)[]; // 列ごとの最良セルの行index
  // benchmark-chart: 単一ベンチマークの横棒グラフ
  benchmark?: string; // 指標名
  unit?: string; // 単位（値ラベルの後ろ）
  max?: number; // 軸の最大値。省略時は最大値×1.2を10単位で切り上げ
  bars?: { model: string; value: number; atUnit?: number; highlight?: boolean }[];
  // code-block: コード・設定例
  lines?: string[]; // コード行（等幅・左寄せ）
  caption?: string; // 箱の上の見出し
  above?: string; // 箱の上の説明文
  below?: string; // 箱の下の説明文
  // columns / note / atUnit は既存種別と共用（benchmark-table の列見出し・注釈等）
  // --- 以下、2026-11-06 第3弾の図解種別（仕様: template-spec-2026-11-06.md 第3弾） ---
  // delta: 前後変化（1シーン1ペア）
  beforeLabel?: string; // 前の主体・時点
  before?: string; // 前の値
  afterLabel?: string; // 後の主体・時点
  after?: string; // 後の値
  change?: string; // 変化幅・変化率（脚本側が計算して書く）
  good?: boolean; // 良い変化なら true（change の色分け）
  afterAtUnit?: number; // after の表示タイミング。省略時は atUnit と同時
  changeAtUnit?: number; // change の表示タイミング。省略時は afterAtUnit と同時
  // label / atUnit / note / noteAtUnit は hero-number と共用
  // stat-grid: 主要数値グリッド（3〜4件）
  stats?: { value: string; label: string; atUnit?: number }[];
  // spec-list: 単体スペック表（最大6行）
  subject?: string; // 対象名
  specs?: { item: string; value: string; atUnit?: number }[];
  // changelog: 変更点リスト（最大6件）。kind は added/changed/fixed/removed
  changes?: { kind: string; text: string; badge?: string; atUnit?: number }[];
  // ranking-list: 順位リスト（最大7件）。並び順がそのまま順位
  rankTitle?: string; // 一覧の見出し
  entries?: { name: string; score?: string; atUnit?: number; highlight?: boolean }[];
  // --- 以下、2026-11-06 第4弾の図解種別（仕様: template-spec-2026-11-06.md 第4弾） ---
  // trend-chart: 折れ線グラフ（時系列の推移）。全系列で points の label をそろえる前提
  series?: {
    name?: string;
    highlight?: boolean;
    points: { label: string; value: number; atUnit?: number }[];
  }[];
  min?: number; // trend-chart / scatter の軸の下限。省略時は自動
  valueLabels?: "all" | "last" | "none"; // trend-chart の値ラベル表示
  // max は benchmark-chart と共用（trend-chart / delta-multi / grouped-bars / radar の軸最大値）
  // post-card: SNS投稿カード（実在の人物写真は使わない。initial は頭文字）
  name?: string; // post-card の表示名 / scatter・quadrant の点の名前と共用しない（そちらは points 側）
  handle?: string; // ハンドル（任意）
  initial?: string; // アバターの頭文字（post-card / profile-card 共用）
  text?: string; // post-card の投稿文（split の text とは別フィールド扱い: 単独文字列）
  date?: string; // 投稿日時表示（任意）
  likes?: string; // いいね数（任意・文字列）
  reposts?: string; // リポスト数（任意・文字列）
  // relation-map: 相関図。mode で hub（中心放射）/ tree（階層2段）を切り替える
  mode?: "hub" | "tree";
  center?: { title: string; text?: string }; // hub の中心ノード
  root?: { title: string; text?: string }; // tree の最上位ノード
  nodes?: { title: string; text?: string; link?: string; atUnit?: number }[];
  // scatter / quadrant: 2軸配置。points は x / y 数値（scatter は測定値、quadrant は 0〜100 の編集値）
  xLabel?: string;
  yLabel?: string;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  chartPoints?: { name: string; x: number; y: number; atUnit?: number; highlight?: boolean }[];
  quadrants?: { topLeft?: string; topRight?: string; bottomLeft?: string; bottomRight?: string };
  // delta-multi: スロープグラフ（単位が共通の複数項目の前後比較）
  // beforeLabel / afterLabel は delta と共用
  slopeItems?: { label: string; before: number; after: number; atUnit?: number }[];
  // map: タイルマップ（us / jp）＋ピン。base "none" のときは x / y（0〜100）で模式図
  base?: "us" | "jp" | "none";
  mapMode?: "pin" | "tile";
  mapPoints?: {
    code?: string; // us は州略号、jp は都道府県名
    name: string;
    value?: string;
    tone?: "good" | "bad" | "accent" | "neutral";
    x?: number;
    y?: number;
    dx?: number;
    dy?: number;
    atUnit?: number;
  }[];
  // share-stack: 100%積み上げ構成比バー（%はプログラムが値から計算する）
  stackBars?: {
    label?: string;
    atUnit?: number;
    segments: { label: string; value: number }[];
  }[];
  // waterfall: ブリッジ図。end.value 省略時は start＋steps の合計
  wfStart?: { label: string; value: number };
  wfSteps?: { label: string; value: number; atUnit?: number }[];
  wfEnd?: { label: string; value?: number };
  // grouped-bars: 複数指標 × 複数対象。values は series と同じ並び（欠測は null）
  barSeries?: { name: string }[];
  barGroups?: { label: string; values: (number | null)[]; atUnit?: number; highlight?: boolean }[];
  // waffle: 割合のワッフル（塗りマス数は割合を100マスへ換算）
  waffleValue?: number;
  waffleTotal?: number;
  display?: string; // 大数字の表示文字列（任意）
  // label は hero-number と共用（waffle の対象ラベル等）
  // profile-card: 人物カード（写真は使わず initial の頭文字アバター）
  // name / initial / role / context は post-card・quote と共用
  affiliation?: string; // 所属
  profilePoints?: string[]; // 要点（最大3行）
  // radar: 能力プロファイル。値はデータ側で 0〜max に正規化して渡す前提
  axes?: string[]; // 4〜8軸
  radarSeries?: { name: string; values: number[]; atUnit?: number; highlight?: boolean }[];
  // venn: ベン図（2〜3集合）。overlap は中央の共通部分
  sets?: { label: string; items?: string[]; atUnit?: number }[];
  overlap?: { label?: string; items?: string[] };
}

export interface SceneDef {
  id: string; // Composition ID としても使う（S1 / T / S2 ... / E）
  type: "hook" | "title" | "content" | "end";
  shoulder?: string;
  headline?: string;
  headlineSec?: number; // 見出しテロップの表示秒数。省略時は 4.2
  credit?: string; // 出典クレジット（左下）。書けば表示され、書かなければ出ない
  diagram?: string; // "sandbox" | "timeline" | "redteam" | "split" | "summary-points"
  // | "hero-number" | "numbers-table" | "steps" | "quote" | "items"（2026-11-06 追加）
  // | "benchmark-table" | "benchmark-chart" | "code-block"（2026-11-06 第2弾）
  // | "delta" | "stat-grid" | "spec-list" | "changelog" | "ranking-list"（2026-11-06 第3弾）
  // | "trend-chart" | "post-card" | "relation-map" | "scatter" | "delta-multi" | "map"
  // | "share-stack" | "waterfall" | "grouped-bars" | "waffle" | "profile-card" | "radar"
  // | "quadrant" | "venn"（2026-11-06 第4弾）
  diagramData?: DiagramData; // 図解の文言・項目（話題ごとの中身はここに書く）
  accentTelop?: { text: string; sec?: number }; // sec: 表示秒数。省略時は1文目の長さ+20フレーム
  pointsFull?: boolean; // summary-points を画面いっぱいに大きく出す（冒頭サマリー用）
  fixedSeconds?: number; // title / end 用
  hook?: { lines: string[]; accent?: string; sub?: string; subAtUnit?: number }; // subAtUnit: 補足文を出す文の番号。省略時は 1
  titleCard?: { kicker: string; lines: string[]; sub?: string };
  endCard?: { summary: string[]; sources: { label: string; url: string }[]; layout?: "summary" | "sources" }; // layout 省略時: summary があれば "summary"、なければ "sources"
  // 用語解説ブロック（右下）: 引っかかりそうな固有名詞に、初出のナレーション
  // ユニット（atUnit、省略時0）でスライド表示する短い解説を付ける。
  glossary?: { term: string; text: string; atUnit?: number }[];
  narration?: string[];
}

/** 動画全体の様式指定（すべて省略可。省略時の既定値が現在の見た目。
 *  演出・様式は脚本データが決め、プログラムは指定に従うだけ——という分離のための受け口） */
export interface ProductionStyle {
  brand?: string | null; // 右上のバッジ文字列。省略時は "AI NEWS"、null で非表示
  theme?: string; // テーマ色。省略時は #0f62b4
  fadeSec?: number; // フェードにかける秒数。省略時は 0.4
  glossaryHoldSec?: number; // 用語解説ブロックの表示秒数。省略時は 5
  glossaryMaxVisible?: number; // 用語解説の同時表示数。省略時は 2
}

export interface Production {
  schemaVersion: number;
  id: string;
  title: string;
  voice: { styleId: number; speed: number; tailSilence: number };
  style?: ProductionStyle;
  // 冒頭の効果音。省略時は intro.wav、null で効果音なし、{file} で assets/se 内の別ファイル
  se?: { file?: string } | null;
  scenes: SceneDef[];
}

export const PRODUCTION = production as unknown as Production;

/** シーン定義を Composition ID で引く */
export function sceneDef(compId: string): SceneDef {
  const def = PRODUCTION.scenes.find((s) => s.id === compId);
  if (!def) throw new Error(`unknown scene id: ${compId}`);
  return def;
}

/** Composition の並び順（= JSON の scenes の並び） */
export const COMP_ORDER: string[] = PRODUCTION.scenes.map((s) => s.id);

/** 最初にナレーションのあるシーン（intro ホールドはここに効く） */
export const FIRST_NARRATED_ID: string | undefined = COMP_ORDER.find((id) =>
  (timing.units ?? []).some((u) => u.scene === id),
);

/* ---------- レイアウト計算 ---------- */

export interface Chunk {
  text: string;
  startFrame: number; // ユニット内相対
  durFrames: number;
}

export interface Unit {
  scene: string; // Composition ID
  text: string; // 字幕用（原文）
  file: string;
  dur: number;
  startFrame: number; // 所属シーン内での相対フレーム（シーン先頭=0）
  startFrameGlobal: number; // 動画全体での絶対フレーム
  durFrames: number;
  chunks: Chunk[];
}

export interface Scene {
  id: string; // Composition ID
  def: SceneDef;
  startFrame: number; // 動画全体での開始フレーム（単体レンダリング時は0）
  durFrames: number;
  units: Unit[];
}

/** 句読点でバランスよく最大 maxChars 字に分割する */
export function splitChunks(text: string, maxChars = 40): string[] {
  if (text.length <= maxChars) return [text];
  const n = Math.ceil(text.length / maxChars);
  const target = text.length / n;
  const chunks: string[] = [];
  let rest = text;
  for (let i = 0; i < n - 1; i++) {
    // target 付近の句読点を探す
    let best = -1;
    for (let j = 0; j < rest.length; j++) {
      if (rest[j] === "、" || rest[j] === "。") {
        if (best === -1 || Math.abs(j + 1 - target) < Math.abs(best + 1 - target)) best = j;
      }
    }
    const cut = best >= 0 ? best + 1 : Math.round(target);
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  chunks.push(rest);
  return chunks;
}

/** 1シーン分のレイアウトを、シーン先頭を0とした相対フレームで構築する */
export function buildScene(compId: string): Scene {
  const def = sceneDef(compId);
  const rawUnits = timing.units.filter((u) => u.scene === compId);
  if ((def.type === "title" || def.type === "end") && rawUnits.length === 0) {
    const sec = def.fixedSeconds ?? (def.type === "title" ? 3 : 5);
    return { id: compId, def, startFrame: 0, durFrames: Math.round(sec * FPS), units: [] };
  }
  const headPad = SCENE_PAD_HEAD + (rawUnits.length > 0 && compId === FIRST_NARRATED_ID ? INTRO_HOLD_SEC : 0);
  const totalSec = headPad + rawUnits.reduce((a, u) => a + u.dur, 0) + SCENE_PAD_TAIL;
  const durFrames = Math.round(totalSec * FPS);
  const units: Unit[] = [];
  let uCursor = Math.round(headPad * FPS);
  for (const ru of rawUnits) {
    const durFramesU = Math.round(ru.dur * FPS);
    const chunkTexts = splitChunks(ru.text);
    const totalChars = ru.text.length;
    let cCursor = 0;
    const chunks: Chunk[] = chunkTexts.map((t) => {
      const f = Math.max(1, Math.round((t.length / totalChars) * durFramesU));
      const c = { text: t, startFrame: cCursor, durFrames: f };
      cCursor += f;
      return c;
    });
    units.push({
      scene: compId,
      text: ru.text,
      file: ru.file,
      dur: ru.dur,
      startFrame: uCursor,
      startFrameGlobal: uCursor,
      durFrames: durFramesU,
      chunks,
    });
    uCursor += durFramesU;
  }
  return { id: compId, def, startFrame: 0, durFrames, units };
}

/** 全シーンを連結したレイアウト（従来の一括レンダリング用） */
export function buildLayout(): { scenes: Scene[]; totalFrames: number } {
  const scenes: Scene[] = [];
  let cursor = 0;
  for (const compId of COMP_ORDER) {
    const scene = buildScene(compId);
    scene.startFrame = cursor;
    for (const u of scene.units) {
      u.startFrameGlobal = cursor + u.startFrame;
    }
    scenes.push(scene);
    cursor += scene.durFrames;
  }
  return { scenes, totalFrames: cursor };
}

export const LAYOUT = buildLayout();
