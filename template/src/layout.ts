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
}

export interface SceneDef {
  id: string; // Composition ID としても使う（S1 / T / S2 ... / E）
  type: "hook" | "title" | "content" | "end";
  shoulder?: string;
  headline?: string;
  headlineSec?: number; // 見出しテロップの表示秒数。省略時は 4.2
  credit?: string; // 出典クレジット（左下）。書けば表示され、書かなければ出ない
  diagram?: string; // "sandbox" | "timeline" | "redteam" | "split" | "summary-points"
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
