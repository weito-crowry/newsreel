import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { PRODUCTION, Scene, SceneDef } from "./layout";

// Windows でも崩れないよう游ゴシック/メイリオをフォールバックに含める
export const FONT =
  "'Noto Sans CJK JP', 'Noto Sans JP', 'Yu Gothic UI', 'Yu Gothic', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
// 様式は脚本データ（production.style）が決める。プログラム側は既定値を持つだけ
export const STYLE = PRODUCTION.style ?? {};
export const THEME = STYLE.theme ?? "#0f62b4"; // テーマ色: 青
export const YELLOW = "#ffd83d";
export const INK = "#eaf2fb";

export const OUTLINE =
  "3px 0 0 #000, -3px 0 0 #000, 0 3px 0 #000, 0 -3px 0 #000, 2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 8px 22px rgba(0,0,0,0.6)";

/* ---------------- 共通パーツ ---------------- */

export const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background: "linear-gradient(155deg, #0c2142 0%, #071528 55%, #040b16 100%)",
      fontFamily: FONT,
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "repeating-linear-gradient(0deg, rgba(120,170,255,0.05) 0 1px, transparent 1px 96px), repeating-linear-gradient(90deg, rgba(120,170,255,0.05) 0 1px, transparent 1px 96px)",
      }}
    />
    <div
      style={{
        position: "absolute",
        width: 1100,
        height: 1100,
        right: -350,
        top: -450,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(15,98,180,0.35) 0%, rgba(15,98,180,0) 65%)",
      }}
    />
    {/* 下部のグラデーション（旧・字幕帯。字幕廃止後も画面下部の締めとして残置） */}
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 300,
        background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)",
      }}
    />
  </AbsoluteFill>
);

export const Shoulder: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      top: 54,
      left: 96,
      display: "flex",
      alignItems: "center",
      gap: 18,
    }}
  >
    <div
      style={{
        background: THEME,
        color: "#fff",
        fontSize: 48,
        fontWeight: 700,
        padding: "12px 30px",
        borderRadius: 8,
        boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
        letterSpacing: 1,
      }}
    >
      {text}
    </div>
  </div>
);

export const BrandBadge: React.FC = () => {
  const brand = STYLE.brand === undefined ? "AI NEWS" : STYLE.brand;
  if (!brand) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 54,
        right: 96,
        color: "rgba(234,242,251,0.75)",
        fontSize: 34,
        fontWeight: 700,
        letterSpacing: 6,
      }}
    >
      {brand}
    </div>
  );
};

export const Headline: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        bottom: 260, // 2026-10-26 田中指定で 330→260（図解ボックスとの重なり回避に70px下げ）
        opacity,
        transform: `translateX(${interpolate(s, [0, 1], [-40, 0])}px)`,
      }}
    >
      {/* 背景は不透過にする（2026-10-26 田中さんの指定）。図解の文字と重なった
          ときでも見出しが読めるようにするためで、透けさせない */}
      <div
        style={{
          background: "#0a2036",
          borderRadius: 10,
          padding: "14px 36px 18px 44px",
          position: "relative",
        }}
      >
        <div style={{ width: 14, background: THEME, position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: "10px 0 0 10px" }} />
        <div style={{ fontSize: 96, fontWeight: 700, color: "#fff", textShadow: OUTLINE, letterSpacing: 1 }}>{text}</div>
      </div>
    </div>
  );
};

export const FadeIn: React.FC<{ delay?: number; children: React.ReactNode; y?: number; style?: React.CSSProperties }> = ({
  delay = 0,
  children,
  y = 16,
  style,
}) => {
  const frame = useCurrentFrame();
  const fadeFrames = Math.max(1, Math.round((STYLE.fadeSec ?? 0.4) * 30));
  const opacity = interpolate(frame, [delay, delay + fadeFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ty = interpolate(frame, [delay, delay + fadeFrames], [y, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ opacity, transform: `translateY(${ty}px)`, ...style }}>{children}</div>;
};

/* ---------------- 図解（文言・項目は production.json の diagramData 駆動） ---------------- */

const boxStyle: React.CSSProperties = {
  border: "3px solid rgba(160,200,255,0.8)",
  borderRadius: 16,
  background: "rgba(10,30,60,0.75)",
  color: INK,
};

/* 文字幅の概算（レイアウト計算用）。全角=フォントサイズ、半角=その halfRatio 倍。
   既定の 0.52 は layout_check.py の見積もりと同じ係数。実フォントの太字数字は
   これより広い（stat-grid の実測で約0.57）ため、用途により呼び出し側で変える。 */
const estTextW = (text: string, fs: number, halfRatio = 0.52): number => {
  let w = 0;
  for (const ch of text)
    w += ch === "−" || ch === "-" ? fs * halfRatio : (ch.codePointAt(0) ?? 0) > 0xff ? fs : fs * halfRatio;
  return w;
};

/* 明示改行（\n）＋自動折り返しを見込んだ行数の概算 */
const estLines = (text: string | null | undefined, fs: number, innerW: number): number => {
  if (text == null) return 0;
  let lines = 0;
  for (const ln of text.split("\n"))
    lines += Math.max(1, Math.ceil(estTextW(ln, fs) / Math.max(1, innerW)));
  return lines;
};

const SandboxDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  // 表示タイミングはデータ（step2AtUnit/step3AtUnit）が決める。省略時は最初から
  const step2 = d.step2AtUnit != null ? (scene.units[d.step2AtUnit]?.startFrame ?? 0) : 0;
  const step3 = d.step3AtUnit != null ? (scene.units[d.step3AtUnit]?.startFrame ?? 0) : 0;
  // 強調テロップがあるシーンでは容器を下げ、箱の高さを同量減らして底辺（615）を変えない
  // （底辺固定なので、下端アンカーの円・補足の絶対位置は従来どおり）
  return (
    <div style={{ position: "absolute", left: 210, top: accent ? 235 : 215, width: 1500, height: 480 }}>
      <FadeIn>
        <div style={{ ...boxStyle, borderStyle: "dashed", width: 900, height: accent ? 380 : 400, position: "relative", padding: 36 }}>
          <div style={{ fontSize: 40, color: "#9fc6ff", fontWeight: 700 }}>{d.title ?? "学習環境（サンドボックス）"}</div>
          <div
            style={{
              position: "absolute",
              left: 90,
              bottom: 70,
              width: 210,
              height: 210,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, #3d8bdd, #0f4c8c)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
              fontWeight: 700,
              color: "#fff",
              textAlign: "center",
              lineHeight: 1.3,
              whiteSpace: "pre-line",
            }}
          >
            {d.circle ?? "開発中\nモデル"}
          </div>
          <div style={{ position: "absolute", left: 360, bottom: 130, fontSize: 38, color: INK, lineHeight: 1.5, whiteSpace: "pre-line" }}>
            {d.note ?? "訓練は\nまだ途中…"}
          </div>
        </div>
      </FadeIn>
      <div style={{ position: "absolute", right: 60, top: 130, width: 420 }}>
        {frame >= step2 && (
          <FadeIn>
            <div style={{ fontSize: 64, color: YELLOW, fontWeight: 700, textShadow: OUTLINE }}>{d.step2Title ?? "囲いの外へ？ ➜"}</div>
            <div style={{ fontSize: 38, color: INK, marginTop: 14, lineHeight: 1.5, whiteSpace: "pre-line" }}>
              {d.step2Text ?? "抜け出そうとする\n事例が相次ぐ"}
            </div>
          </FadeIn>
        )}
        {frame >= step3 && d.step3Badge && (
          <div style={{ marginTop: 42 }}>
            <FadeIn>
              <div
                style={{
                  display: "inline-block",
                  background: "rgba(255,216,61,0.15)",
                  border: `2px solid ${YELLOW}`,
                  borderRadius: 10,
                  padding: "12px 22px",
                  fontSize: 36,
                  color: YELLOW,
                  fontWeight: 700,
                }}
              >
                {d.step3Badge}
              </div>
            </FadeIn>
          </div>
        )}
      </div>
    </div>
  );
};

const TimelineDiagram: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const events = scene.def.diagramData?.events ?? [];
  const nodes = events.map((ev) => {
    // 表示タイミングはデータ（atUnit）が決める。省略時は最初から、
    // null は「このシーンでは表示しない」
    const at =
      ev.atUnit === null
        ? Number.POSITIVE_INFINITY
        : ev.atUnit != null
          ? (scene.units[ev.atUnit]?.startFrame ?? 0)
          : 0;
    return { date: ev.date, label: ev.label, at };
  });
  return (
    <div style={{ position: "absolute", left: 160, top: 300, width: 1600 }}>
      <div style={{ position: "relative", height: 8, background: "rgba(160,200,255,0.5)", borderRadius: 4, margin: "0 60px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: -34 }}>
        {nodes.map((n, i) => (
          <div key={i} style={{ width: 480, textAlign: "center" }}>
            {frame >= n.at ? (
              <FadeIn>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: "50%",
                    background: i === 0 ? YELLOW : THEME,
                    margin: "0 auto",
                    border: "4px solid #fff",
                  }}
                />
                <div style={{ fontSize: 54, fontWeight: 700, color: i === 0 ? YELLOW : "#fff", marginTop: 26, textShadow: OUTLINE }}>
                  {n.date}
                </div>
                <div style={{ fontSize: 36, color: INK, lineHeight: 1.55, marginTop: 10, whiteSpace: "pre-line" }}>{n.label}</div>
              </FadeIn>
            ) : (
              <div style={{ height: 60 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const RedTeamDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  // 表示タイミングはデータ（step2AtUnit/step3AtUnit）が決める。省略時は最初から
  const step2 = d.step2AtUnit != null ? (scene.units[d.step2AtUnit]?.startFrame ?? 0) : 0;
  const step3 = d.step3AtUnit != null ? (scene.units[d.step3AtUnit]?.startFrame ?? 0) : 0;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 270 : 235, width: 1600, display: "flex", alignItems: "stretch", gap: 30 }}>
      <FadeIn>
        <div style={{ ...boxStyle, width: 430, height: "100%", boxSizing: "border-box", padding: "30px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#ffb3b3", whiteSpace: "pre-line", lineHeight: 1.4 }}>{d.attackerTitle ?? "攻撃役"}</div>
          <div style={{ fontSize: 38, color: INK, marginTop: 10, lineHeight: 1.5, whiteSpace: "pre-line" }}>
            {d.attackerText ?? ""}
          </div>
        </div>
      </FadeIn>
      {frame >= step2 && (
        <FadeIn style={{ alignSelf: "center" }}>
          <div style={{ fontSize: 84, color: YELLOW, fontWeight: 700 }}>➜</div>
        </FadeIn>
      )}
      {frame >= step2 && (
        <FadeIn>
          <div style={{ ...boxStyle, width: 400, height: "100%", boxSizing: "border-box", padding: "30px 28px", textAlign: "center", borderColor: THEME }}>
            <div style={{ fontSize: 42, fontWeight: 700, color: "#9fc6ff", whiteSpace: "pre-line", lineHeight: 1.4 }}>{d.middleTitle ?? "🛡 境界・監視"}</div>
            <div style={{ fontSize: 36, color: INK, marginTop: 10, lineHeight: 1.5, whiteSpace: "pre-line" }}>
              {d.middleText ?? ""}
            </div>
          </div>
        </FadeIn>
      )}
      {frame >= step3 && d.resultText && (
        <FadeIn>
          <div
            style={{
              width: 400,
              height: "100%",
              boxSizing: "border-box",
              padding: "26px 28px",
              borderRadius: 16,
              background: "rgba(255,216,61,0.13)",
              border: `2px solid ${YELLOW}`,
              fontSize: 37,
              color: YELLOW,
              fontWeight: 700,
              lineHeight: 1.55,
              textAlign: "center",
              whiteSpace: "pre-line",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {d.resultText}
          </div>
        </FadeIn>
      )}
    </div>
  );
};

const SplitDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const d = scene.def.diagramData ?? {};
  // マーク（✕/○）はデータに書かれている場合だけ描く。プログラムが既定の
  // マークを補うと、脚本が外したはずの記号が画面に出てしまう（2026-11-07 修正。
  // ラボ セット5 S3 で、データに無い ✕/○ が描かれた実例を受けたもの）
  const left = d.left ?? { title: "", text: "" };
  const right = d.right ?? { title: "", text: "" };
  return (
    <div style={{ position: "absolute", left: 210, top: accent ? 265 : 225, width: 1500, display: "flex", alignItems: "stretch", gap: 44 }}>
      <FadeIn>
        <div style={{ ...boxStyle, width: 700, height: "100%", boxSizing: "border-box", padding: "34px 38px", opacity: 0.85 }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: "#fff", whiteSpace: "pre-line" }}>
            {left.title}
            {left.mark ? <span style={{ color: "#ff7b7b", fontSize: 56 }}> {left.mark}</span> : null}
          </div>
          <div style={{ fontSize: 38, color: INK, marginTop: 14, lineHeight: 1.55, whiteSpace: "pre-line" }}>{left.text ?? ""}</div>
        </div>
      </FadeIn>
      <FadeIn>
        <div style={{ ...boxStyle, width: 700, height: "100%", boxSizing: "border-box", padding: "34px 38px", borderColor: THEME, background: "rgba(15,98,180,0.28)" }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: "#fff", whiteSpace: "pre-line" }}>
            {right.title}
            {right.mark ? <span style={{ color: "#7ddb8a", fontSize: 56 }}> {right.mark}</span> : null}
          </div>
          <div style={{ fontSize: 38, color: INK, marginTop: 14, lineHeight: 1.55, whiteSpace: "pre-line" }}>{right.text ?? ""}</div>
        </div>
      </FadeIn>
    </div>
  );
};

const SummaryDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const items = (scene.def.diagramData?.points ?? []).map((p) =>
    typeof p === "string" ? { text: p } : p,
  );
  const starts = scene.units.map((u) => u.startFrame);
  const full = !!scene.def.pointsFull; // 冒頭サマリー用: 箇条書きを画面いっぱいに大きく
  // 通常も表示領域は画面幅いっぱいに取る（右側に何もない空間を作らない。
  // フォントは大きくせず、行を長くして幅を使う。2026-10-26 田中さんの指摘）
  const fs = full ? 66 : 46;
  const badge = full ? 76 : 58;
  // ページ分け（2026-10-26 田中さんの指定）: 1画面に収まらないときは脚本が
  // pageBreakBefore でページを区切る。ページは、その先頭項目の atUnit の文から
  // 表示され、前のページと入れ替わる（積み増しではない）。番号は通しで振る。
  // ページ分けの指定が無ければ従来どおり1ページに全点を表示する。
  const atOf = (p: (typeof items)[number]) => (p.atUnit != null ? (starts[p.atUnit] ?? 0) : 0);
  const pages: { startAt: number; items: { p: (typeof items)[number]; index: number }[] }[] = [];
  items.forEach((p, i) => {
    if (i === 0 || p.pageBreakBefore) pages.push({ startAt: atOf(p), items: [] });
    pages[pages.length - 1].items.push({ p, index: i });
  });
  const currentPage = pages.reduce((acc, pg, pi) => (frame >= pg.startAt ? pi : acc), 0);
  return (
    <div style={{ position: "absolute", left: 100, top: full ? 170 : accent ? 280 : 250, width: full ? 1740 : 1720 }}>
      {pages[currentPage].items.map(({ p, index: i }) => {
        // 表示タイミングはデータ（各項目の atUnit）が決める。省略時は最初から
        // （2026-10-26 田中さん: 原則は最初から全点表示。ただしそれはデータの
        // 既定として表し、例外は脚本が atUnit で書く。プログラムは機構だけ）
        const at = atOf(p);
        const t = p.text;
        return (
          <div key={i} style={{ marginBottom: full ? 56 : 30, minHeight: full ? 92 : 62 }}>
            {frame >= at && (
              <FadeIn>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <div
                    style={{
                      width: badge,
                      height: badge,
                      borderRadius: "50%",
                      background: THEME,
                      color: "#fff",
                      fontSize: full ? 46 : 36,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: fs, fontWeight: 700, color: "#fff", textShadow: OUTLINE, whiteSpace: "pre-line", lineHeight: full ? 1.5 : 1.45 }}>
                    {t.split("\n").map((ln, li) => (
                      <React.Fragment key={li}>
                        {li > 0 && <br />}
                        {ln.startsWith("（") || ln.startsWith("(") ? (
                          // 括弧書きだけの行は「補足行」として小さく・落とした色で見せる（D3）
                          <span style={{ fontSize: full ? 48 : 37, fontWeight: 600, color: INK }}>{ln}</span>
                        ) : (
                          ln
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </FadeIn>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ---------------- 追加図解（2026-11-06、仕様: template-spec-2026-11-06.md） ----------------
   いずれも表示タイミングはデータ側の atUnit が決める（省略時は最初から）。
   プログラムは機構だけを持ち、様式の既定値は持たない（従来種別と同じ原則）。 */

const HeroNumberDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const labelAt = atOf(d.labelAtUnit);
  const valueAt = atOf(d.atUnit);
  const noteAt = atOf(d.noteAtUnit);
  const subs = d.sub ?? [];
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 255 : 215, width: 1600, textAlign: "center" }}>
      {d.label && frame >= labelAt && (
        <FadeIn>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#9fc6ff", letterSpacing: 2 }}>{d.label}</div>
        </FadeIn>
      )}
      {d.value && frame >= valueAt && (
        <FadeIn>
          <div style={{ fontSize: 190, fontWeight: 800, color: "#fff", textShadow: OUTLINE, lineHeight: 1.25, marginTop: 6 }}>
            {d.value}
          </div>
        </FadeIn>
      )}
      {d.valueNote && frame >= valueAt && (
        <FadeIn>
          <div style={{ fontSize: 44, color: INK, marginTop: 10, whiteSpace: "pre-line", lineHeight: 1.5 }}>{d.valueNote}</div>
        </FadeIn>
      )}
      {subs.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 40, marginTop: 52 }}>
          {subs.map((s, i) => (
            <React.Fragment key={i}>
              {frame >= atOf(s.atUnit) ? (
                <FadeIn>
                  <div style={{ ...boxStyle, padding: "22px 44px", minWidth: 380 }}>
                    <div style={{ fontSize: 64, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{s.value}</div>
                    <div style={{ fontSize: 36, color: INK, marginTop: 8, whiteSpace: "pre-line", lineHeight: 1.45 }}>{s.label}</div>
                  </div>
                </FadeIn>
              ) : (
                <div style={{ minWidth: 380 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      {d.note && frame >= noteAt && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 40, whiteSpace: "pre-line", lineHeight: 1.5 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const NumbersTableDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const columns = d.columns ?? [];
  const rows = d.rows ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  // 行の高さは固定し、行ごとの表示タイミングで表全体が上下に動かないようにする
  const ROW_H = 108;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 225, width: 1600 }}>
      <FadeIn>
        <div>
          {/* 列見出し行 */}
          <div style={{ display: "flex", alignItems: "flex-end", padding: "0 24px 14px" }}>
            <div style={{ width: 500, flexShrink: 0 }} />
            {columns.map((c, ci) => (
              <div key={ci} style={{ flex: 1, textAlign: "right", fontSize: 38, fontWeight: 700, color: "#9fc6ff", whiteSpace: "pre-line", lineHeight: 1.35 }}>
                {c}
              </div>
            ))}
          </div>
          {rows.map((r, ri) => {
            const visible = frame >= atOf(r.atUnit);
            const hl = !!r.highlight;
            return (
              <div
                key={ri}
                style={{
                  height: ROW_H,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 24px",
                  boxSizing: "border-box",
                  borderTop: hl ? undefined : "2px solid rgba(160,200,255,0.35)",
                  ...(hl
                    ? {
                        background: "rgba(255,216,61,0.13)",
                        border: `2px solid ${YELLOW}`,
                        borderRadius: 12,
                      }
                    : {}),
                }}
              >
                {visible && (
                  <FadeIn style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <div
                      style={{
                        width: 500,
                        flexShrink: 0,
                        fontSize: 40,
                        fontWeight: 700,
                        color: hl ? YELLOW : "#fff",
                        whiteSpace: "pre-line",
                        lineHeight: 1.35,
                      }}
                    >
                      {r.label}
                    </div>
                    {(r.values ?? []).map((v, vi) => (
                      <div
                        key={vi}
                        style={{
                          flex: 1,
                          textAlign: "right",
                          fontSize: 48,
                          fontWeight: 800,
                          color: hl ? YELLOW : "#fff",
                          whiteSpace: "pre-line",
                          lineHeight: 1.3,
                        }}
                      >
                        {v}
                      </div>
                    ))}
                  </FadeIn>
                )}
              </div>
            );
          })}
        </div>
      </FadeIn>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 26, whiteSpace: "pre-line", lineHeight: 1.55 }}>
            {d.note}
          </div>
        </FadeIn>
      )}
    </div>
  );
};

const StepsDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const steps = d.steps ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 270 : 235, width: 1600, display: "flex", alignItems: "stretch", gap: 22 }}>
      {steps.map((s, i) => {
        const visible = frame >= atOf(s.atUnit);
        const nextVisible = i + 1 < steps.length ? frame >= atOf(steps[i + 1].atUnit) : false;
        return (
          <React.Fragment key={i}>
            {visible ? (
              <FadeIn style={{ flex: 1, display: "flex" }}>
                <div style={{ ...boxStyle, flex: 1, boxSizing: "border-box", padding: "30px 26px", textAlign: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: "50%",
                        background: THEME,
                        color: "#fff",
                        fontSize: 30,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 42, fontWeight: 700, color: "#fff", whiteSpace: "pre-line", lineHeight: 1.35 }}>{s.title}</div>
                  </div>
                  {s.text && (
                    <div style={{ fontSize: 38, color: INK, marginTop: 14, lineHeight: 1.55, whiteSpace: "pre-line" }}>{s.text}</div>
                  )}
                </div>
              </FadeIn>
            ) : (
              <div style={{ flex: 1 }} />
            )}
            {i + 1 < steps.length && (
              <div style={{ alignSelf: "center", width: 56, textAlign: "center", fontSize: 72, fontWeight: 700, color: YELLOW, opacity: nextVisible ? 1 : 0 }}>
                ➜
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const ItemsDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const items = d.items ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 285 : 250, width: 1600, display: "flex", alignItems: "stretch", gap: 30 }}>
      {items.map((it, i) => {
        const visible = frame >= atOf(it.atUnit);
        return visible ? (
          <FadeIn key={i} style={{ flex: 1, display: "flex" }}>
            <div style={{ ...boxStyle, flex: 1, boxSizing: "border-box", padding: "30px 26px", textAlign: "center" }}>
              <div style={{ fontSize: 44, fontWeight: 700, color: "#fff", whiteSpace: "pre-line", lineHeight: 1.35 }}>{it.title}</div>
              {it.text && (
                <div style={{ fontSize: 38, color: INK, marginTop: 12, lineHeight: 1.55, whiteSpace: "pre-line" }}>{it.text}</div>
              )}
            </div>
          </FadeIn>
        ) : (
          <div key={i} style={{ flex: 1 }} />
        );
      })}
    </div>
  );
};

const QuoteDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const quoteAt = atOf(d.atUnit);
  const speakerAt = atOf(d.speakerAtUnit);
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 260 : 225, width: 1600 }}>
      {d.context && frame >= quoteAt && (
        <FadeIn>
          <div style={{ fontSize: 38, fontWeight: 700, color: "#9fc6ff", whiteSpace: "pre-line", lineHeight: 1.45 }}>{d.context}</div>
        </FadeIn>
      )}
      {d.quote && frame >= quoteAt && (
        <FadeIn>
          <div style={{ display: "flex", marginTop: 18 }}>
            <div style={{ fontSize: 130, fontWeight: 800, color: THEME, lineHeight: 0.9, marginRight: 26, flexShrink: 0 }}>“</div>
            <div style={{ fontSize: 58, fontWeight: 700, color: "#fff", textShadow: OUTLINE, whiteSpace: "pre-line", lineHeight: 1.5, paddingTop: 26 }}>
              {d.quote}
            </div>
          </div>
        </FadeIn>
      )}
      {(d.speaker || d.role) && frame >= speakerAt && (
        <FadeIn>
          <div style={{ textAlign: "right", marginTop: 54 }}>
            <span style={{ fontSize: 44, fontWeight: 700, color: "#fff" }}>{d.speaker ?? ""}</span>
            {d.role && <span style={{ fontSize: 36, color: INK, marginLeft: 18 }}>{d.role}</span>}
          </div>
        </FadeIn>
      )}
    </div>
  );
};

/* ---------------- 追加図解 第2弾（2026-11-06、仕様: template-spec-2026-11-06.md 第2弾） ---------------- */

const BenchmarkTableDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const columns = d.columns ?? [];
  const rows = d.benchRows ?? [];
  const best = d.best ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  // 寸法は numbers-table と同一（行高固定で表示タイミングによる上下動を防ぐ）
  const ROW_H = 108;
  const BEST = "#7ddb8a";
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 225, width: 1600 }}>
      <FadeIn>
        <div>
          <div style={{ display: "flex", alignItems: "flex-end", padding: "0 24px 14px" }}>
            <div style={{ width: 500, flexShrink: 0 }} />
            {columns.map((c, ci) => (
              <div key={ci} style={{ flex: 1, textAlign: "right", fontSize: 38, fontWeight: 700, color: "#9fc6ff", whiteSpace: "pre-line", lineHeight: 1.35 }}>
                {c}
              </div>
            ))}
          </div>
          {rows.map((r, ri) => {
            const visible = frame >= atOf(r.atUnit);
            const hl = !!r.highlight;
            return (
              <div
                key={ri}
                style={{
                  height: ROW_H,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 24px",
                  boxSizing: "border-box",
                  borderTop: hl ? undefined : "2px solid rgba(160,200,255,0.35)",
                  ...(hl
                    ? {
                        background: "rgba(255,216,61,0.13)",
                        border: `2px solid ${YELLOW}`,
                        borderRadius: 12,
                      }
                    : {}),
                }}
              >
                {visible && (
                  <FadeIn style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <div
                      style={{
                        width: 500,
                        flexShrink: 0,
                        fontSize: 40,
                        fontWeight: 700,
                        color: hl ? YELLOW : "#fff",
                        whiteSpace: "pre-line",
                        lineHeight: 1.35,
                      }}
                    >
                      {r.model}
                    </div>
                    {(r.values ?? []).map((v, vi) => {
                      const isBest = best[vi] === ri;
                      return (
                        <div
                          key={vi}
                          style={{
                            flex: 1,
                            textAlign: "right",
                            fontSize: 48,
                            fontWeight: 800,
                            color: hl ? YELLOW : isBest ? BEST : "#fff",
                            whiteSpace: "pre-line",
                            lineHeight: 1.3,
                          }}
                        >
                          {v}
                          {isBest && <span style={{ fontSize: 30, marginLeft: 8, verticalAlign: "top" }}>◆</span>}
                        </div>
                      );
                    })}
                  </FadeIn>
                )}
              </div>
            );
          })}
        </div>
      </FadeIn>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 26, whiteSpace: "pre-line", lineHeight: 1.55 }}>
            {d.note}
          </div>
        </FadeIn>
      )}
    </div>
  );
};

const BenchmarkChartDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const bars = d.bars ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const maxVal = bars.reduce((a, b) => Math.max(a, b.value || 0), 0);
  // 軸の最大値: データ指定（max）が無ければ最大値×1.2を10単位で切り上げ（機構としての換算）
  const axisMax = d.max ?? Math.max(10, Math.ceil((maxVal * 1.2) / 10) * 10);
  const BAR_H = 84;
  const BAR_GAP = 34;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 225, width: 1600 }}>
      {d.benchmark && (
        <FadeIn>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#9fc6ff", letterSpacing: 1 }}>{d.benchmark}</div>
        </FadeIn>
      )}
      <div style={{ marginTop: 34 }}>
        {bars.map((b, i) => {
          const visible = frame >= atOf(b.atUnit);
          const pct = Math.max(0, Math.min(100, ((b.value || 0) / axisMax) * 100));
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", height: BAR_H, marginBottom: i + 1 < bars.length ? BAR_GAP : 0 }}>
              <div style={{ width: 460, flexShrink: 0, textAlign: "right", paddingRight: 28, fontSize: 40, fontWeight: 700, color: b.highlight ? YELLOW : "#fff", whiteSpace: "pre-line", lineHeight: 1.3 }}>
                {visible ? b.model : ""}
              </div>
              <div style={{ position: "relative", flex: 1, height: BAR_H, borderLeft: "3px solid rgba(160,200,255,0.5)" }}>
                {visible && (
                  <FadeIn>
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        height: BAR_H,
                        width: `${pct}%`,
                        borderRadius: "0 10px 10px 0",
                        background: b.highlight
                          ? `linear-gradient(90deg, #c79a00, ${YELLOW})`
                          : "linear-gradient(90deg, #0f4c8c, #3d8bdd)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: `calc(${pct}% + 18px)`,
                        top: 0,
                        height: BAR_H,
                        display: "flex",
                        alignItems: "center",
                        fontSize: 48,
                        fontWeight: 800,
                        color: b.highlight ? YELLOW : "#fff",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.value}
                      {d.unit ?? ""}
                    </div>
                  </FadeIn>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 30, whiteSpace: "pre-line", lineHeight: 1.55 }}>
            {d.note}
          </div>
        </FadeIn>
      )}
    </div>
  );
};

const CODE_FONT = "ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace";

const CodeBlockDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const at = d.atUnit != null ? (scene.units[d.atUnit]?.startFrame ?? 0) : 0;
  if (frame < at) return null;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 260 : 225, width: 1600 }}>
      <FadeIn>
        {d.caption && (
          <div style={{ fontSize: 38, fontWeight: 700, color: "#9fc6ff", whiteSpace: "pre-line", lineHeight: 1.45 }}>{d.caption}</div>
        )}
        {d.above && (
          <div style={{ fontSize: 38, color: INK, marginTop: d.caption ? 18 : 0, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.above}</div>
        )}
        <div
          style={{
            marginTop: d.caption || d.above ? 24 : 0,
            background: "rgba(4,12,24,0.92)",
            border: "3px solid rgba(160,200,255,0.8)",
            borderRadius: 16,
            padding: "36px 48px",
          }}
        >
          {(d.lines ?? []).map((ln, i) => (
            <div key={i} style={{ fontFamily: CODE_FONT, fontSize: 42, lineHeight: 1.6, color: "#d6e9ff", whiteSpace: "pre" }}>
              {ln === "" ? " " : ln}
            </div>
          ))}
        </div>
        {d.below && (
          <div style={{ fontSize: 38, color: INK, marginTop: 26, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.below}</div>
        )}
      </FadeIn>
    </div>
  );
};

/* ---------------- 追加図解 第3弾（2026-11-06、仕様: template-spec-2026-11-06.md 第3弾） ---------------- */

const DeltaDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const baseAt = atOf(d.atUnit);
  const afterAt = atOf(d.afterAtUnit ?? d.atUnit);
  const changeAt = atOf(d.changeAtUnit ?? d.afterAtUnit ?? d.atUnit);
  const noteAt = atOf(d.noteAtUnit);
  const changeColor = d.good === true ? "#7ddb8a" : d.good === false ? "#ff7b7b" : YELLOW;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 255 : 215, width: 1600, textAlign: "center" }}>
      {d.label && frame >= baseAt && (
        <FadeIn>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#9fc6ff", letterSpacing: 2 }}>{d.label}</div>
        </FadeIn>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 40, marginTop: 46 }}>
        {frame >= baseAt ? (
          <FadeIn>
            <div style={{ minWidth: 420 }}>
              {d.beforeLabel && <div style={{ fontSize: 36, color: "rgba(234,242,251,0.75)", marginBottom: 12 }}>{d.beforeLabel}</div>}
              <div style={{ fontSize: 72, fontWeight: 700, color: "rgba(234,242,251,0.8)", lineHeight: 1.25 }}>{d.before}</div>
            </div>
          </FadeIn>
        ) : (
          <div style={{ minWidth: 420 }} />
        )}
        <div style={{ fontSize: 84, fontWeight: 700, color: YELLOW, opacity: frame >= afterAt ? 1 : 0 }}>➜</div>
        {frame >= afterAt ? (
          <FadeIn>
            <div style={{ minWidth: 420 }}>
              {d.afterLabel && <div style={{ fontSize: 36, color: "#9fc6ff", marginBottom: 12 }}>{d.afterLabel}</div>}
              <div style={{ fontSize: 110, fontWeight: 800, color: "#fff", textShadow: OUTLINE, lineHeight: 1.25 }}>{d.after}</div>
            </div>
          </FadeIn>
        ) : (
          <div style={{ minWidth: 420 }} />
        )}
      </div>
      {d.change && frame >= changeAt && (
        <FadeIn>
          <div style={{ fontSize: 64, fontWeight: 800, color: changeColor, marginTop: 48 }}>{d.change}</div>
        </FadeIn>
      )}
      {d.note && frame >= noteAt && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 36, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const StatGridDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const stats = d.stats ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const grid2 = stats.length === 4;
  // 値がセルの内幅に1行で収まるよう、全セル共通でフォントサイズを自動調整する
  // （収まる場合は従来どおり 72）。実フォントの太字数字は layout_check の見積もり
  // （半角0.52倍）より広く、見積もりでは収まる値が実描画で単語の途中で改行した
  // （2026-11-07 修正。ラボ セット2 S2「169.56億ド/ル」の実例）。幅の概算は
  // 実測に合わせ半角0.57倍で数える。下限は 54（それでも収まらない場合は従来どおり改行）。
  const cellW = grid2 ? (1600 - 30) / 2 : (1600 - 30 * Math.max(0, stats.length - 1)) / Math.max(1, stats.length);
  const innerW = cellW - 68;
  const maxValW = Math.max(0, ...stats.flatMap((s) => String(s.value ?? "").split("\n").map((ln) => estTextW(ln, 72, 0.57))));
  const valueFs = maxValW > innerW ? Math.max(54, Math.floor(72 * (innerW / maxValW))) : 72;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 230, width: 1600 }}>
      <div
        style={
          grid2
            ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }
            : { display: "flex", gap: 30 }
        }
      >
        {stats.map((s, i) => {
          const visible = frame >= atOf(s.atUnit);
          return visible ? (
            <FadeIn key={i} style={grid2 ? {} : { flex: 1, display: "flex" }}>
              <div style={{ ...boxStyle, flex: 1, boxSizing: "border-box", padding: "32px 34px", textAlign: "center" }}>
                <div style={{ fontSize: valueFs, fontWeight: 800, color: "#fff", lineHeight: 1.25, whiteSpace: "pre-line" }}>{s.value}</div>
                <div style={{ fontSize: 36, color: INK, marginTop: 12, whiteSpace: "pre-line", lineHeight: 1.5 }}>{s.label}</div>
              </div>
            </FadeIn>
          ) : (
            <div key={i} style={grid2 ? {} : { flex: 1 }} />
          );
        })}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 30, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const SpecListDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const specs = d.specs ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const ROW_H = 96;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 225, width: 1600 }}>
      {d.subject && (
        <FadeIn>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#9fc6ff", letterSpacing: 1 }}>{d.subject}</div>
        </FadeIn>
      )}
      <div style={{ marginTop: d.subject ? 26 : 0 }}>
        {specs.map((r, ri) => {
          const visible = frame >= atOf(r.atUnit);
          return (
            <div
              key={ri}
              style={{
                height: ROW_H,
                display: "flex",
                alignItems: "center",
                padding: "0 24px",
                boxSizing: "border-box",
                borderTop: ri === 0 ? undefined : "2px solid rgba(160,200,255,0.35)",
              }}
            >
              {visible && (
                <FadeIn style={{ display: "flex", alignItems: "center", width: "100%" }}>
                  <div style={{ width: 560, flexShrink: 0, fontSize: 40, fontWeight: 700, color: "#9fc6ff", whiteSpace: "pre-line", lineHeight: 1.35 }}>
                    {r.item}
                  </div>
                  <div style={{ fontSize: 48, fontWeight: 800, color: "#fff", whiteSpace: "pre-line", lineHeight: 1.3 }}>
                    {r.value}
                  </div>
                </FadeIn>
              )}
            </div>
          );
        })}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 26, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const CHANGELOG_KINDS: Record<string, { badge: string; color: string; bg: string }> = {
  added: { badge: "追加", color: "#7ddb8a", bg: "rgba(125,219,138,0.13)" },
  changed: { badge: "変更", color: "#9fc6ff", bg: "rgba(61,139,221,0.16)" },
  fixed: { badge: "修正", color: YELLOW, bg: "rgba(255,216,61,0.13)" },
  removed: { badge: "削除", color: "#ff7b7b", bg: "rgba(255,123,123,0.12)" },
};

const ChangelogDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const changes = d.changes ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const ROW_H = 92;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 230, width: 1600 }}>
      {changes.map((c, i) => {
        const visible = frame >= atOf(c.atUnit);
        const k = CHANGELOG_KINDS[c.kind] ?? CHANGELOG_KINDS.changed;
        return (
          <div key={i} style={{ height: ROW_H, display: "flex", alignItems: "center", padding: "0 8px", boxSizing: "border-box" }}>
            {visible && (
              <FadeIn style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <div
                  style={{
                    width: 150,
                    flexShrink: 0,
                    textAlign: "center",
                    background: k.bg,
                    border: `2px solid ${k.color}`,
                    borderRadius: 10,
                    padding: "8px 0",
                    fontSize: 34,
                    fontWeight: 700,
                    color: k.color,
                  }}
                >
                  {c.badge ?? k.badge}
                </div>
                <div style={{ fontSize: 40, fontWeight: 700, color: "#fff", marginLeft: 34, whiteSpace: "pre-line", lineHeight: 1.45 }}>
                  {c.text}
                </div>
              </FadeIn>
            )}
          </div>
        );
      })}
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 24, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const RankingListDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const entries = d.entries ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const ROW_H = 84;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 225, width: 1600 }}>
      {d.rankTitle && (
        <FadeIn>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#9fc6ff", letterSpacing: 1 }}>{d.rankTitle}</div>
        </FadeIn>
      )}
      <div style={{ marginTop: d.rankTitle ? 22 : 0 }}>
        {entries.map((e, i) => {
          const visible = frame >= atOf(e.atUnit);
          const hl = !!e.highlight;
          return (
            <div
              key={i}
              style={{
                height: ROW_H,
                display: "flex",
                alignItems: "center",
                padding: "0 24px",
                boxSizing: "border-box",
                ...(hl
                  ? { background: "rgba(255,216,61,0.13)", border: `2px solid ${YELLOW}`, borderRadius: 12 }
                  : { borderTop: i === 0 ? undefined : "2px solid rgba(160,200,255,0.35)" }),
              }}
            >
              {visible && (
                <FadeIn style={{ display: "flex", alignItems: "center", width: "100%" }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: i === 0 ? YELLOW : THEME,
                      color: i === 0 ? "#17222e" : "#fff",
                      fontSize: 34,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 44, fontWeight: 700, color: hl ? YELLOW : "#fff", marginLeft: 30, whiteSpace: "pre-line", lineHeight: 1.3 }}>
                    {e.name}
                  </div>
                  {e.score && (
                    <div style={{ flex: 1, textAlign: "right", fontSize: 48, fontWeight: 800, color: hl ? YELLOW : "#fff" }}>{e.score}</div>
                  )}
                </FadeIn>
              )}
            </div>
          );
        })}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 24, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

/* ---------------- 追加図解 第4弾（2026-11-06、仕様: template-spec-2026-11-06.md 第4弾） ---------------- */

const TrendChartDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const series = d.series ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const allVals = series.flatMap((s) => s.points.map((p) => p.value || 0));
  const dataMax = allVals.length ? Math.max(...allVals) : 0;
  const dataMin = allVals.length ? Math.min(...allVals) : 0;
  const pad = Math.max(1, (dataMax - dataMin) * 0.18);
  const axisMax = d.max ?? dataMax + pad;
  const axisMin = d.min ?? (dataMin < 0 ? dataMin - pad : Math.min(0, dataMin));
  const range = axisMax - axisMin || 1;
  const PLOT_W = 1420;
  const PLOT_H = 460;
  const LEFT = 130;
  const TOP = 26;
  const n = Math.max(...series.map((s) => s.points.length), 1);
  const xOf = (i: number) => LEFT + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yOf = (v: number) => TOP + ((axisMax - v) / range) * PLOT_H;
  const COLORS = ["#3d8bdd", "#7ddb8a", "#ffd83d"];
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
  // 端のラベルが SVG の端（幅1600）で切れないよう、中心位置を内側に寄せる
  // （2026-11-07 修正。ラボ セット2 S7 の右端ラベル「2026年Q3」が切れた実例）
  const clampCx = (cx: number, t: string, fs: number) => {
    const half = estTextW(t, fs, 0.57) / 2 + 4;
    return Math.min(1600 - half, Math.max(half, cx));
  };
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 255 : 215, width: 1600 }}>
      {(d.label || d.unit) && (
        <FadeIn>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#9fc6ff", letterSpacing: 1 }}>
            {d.label}
            {d.unit && <span style={{ fontSize: 36, color: "rgba(234,242,251,0.75)", marginLeft: 18 }}>（{d.unit}）</span>}
          </div>
        </FadeIn>
      )}
      {series.length > 1 && (
        <div style={{ display: "flex", gap: 36, marginTop: 14 }}>
          {series.map((s, si) => (
            <div key={si} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 8, background: s.highlight ? YELLOW : COLORS[si % COLORS.length], borderRadius: 4 }} />
              <div style={{ fontSize: 34, color: INK }}>{s.name}</div>
            </div>
          ))}
        </div>
      )}
      <svg width={1600} height={PLOT_H + 96} style={{ marginTop: 10, display: "block" }}>
        {/* 軸と目盛り */}
        <line x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + PLOT_H} stroke="rgba(160,200,255,0.55)" strokeWidth={3} />
        <line x1={LEFT} y1={TOP + PLOT_H} x2={LEFT + PLOT_W} y2={TOP + PLOT_H} stroke="rgba(160,200,255,0.55)" strokeWidth={3} />
        {axisMin < 0 && axisMax > 0 && (
          <line x1={LEFT} y1={yOf(0)} x2={LEFT + PLOT_W} y2={yOf(0)} stroke="rgba(234,242,251,0.5)" strokeWidth={2} strokeDasharray="8 7" />
        )}
        <text x={LEFT - 16} y={yOf(axisMax) + 8} textAnchor="end" fontSize={32} fill="#9fc6ff">{fmt(axisMax)}</text>
        <text x={LEFT - 16} y={yOf(axisMin) + 8} textAnchor="end" fontSize={32} fill="#9fc6ff">{fmt(axisMin)}</text>
        {axisMin < 0 && axisMax > 0 && (
          <text x={LEFT - 16} y={yOf(0) + 8} textAnchor="end" fontSize={32} fill="#9fc6ff">0</text>
        )}
        {labels.map((lb, i) => (
          <text key={i} x={clampCx(xOf(i), lb, 36)} y={TOP + PLOT_H + 52} textAnchor="middle" fontSize={36} fill="#eaf2fb">{lb}</text>
        ))}
        {series.map((s, si) => {
          const color = s.highlight ? YELLOW : COLORS[si % COLORS.length];
          const vis = s.points.map((p) => frame >= atOf(p.atUnit));
          return (
            <g key={si}>
              {s.points.map((p, i) => {
                if (i === 0 || !vis[i] || !vis[i - 1]) return null;
                return (
                  <line key={`l${i}`} x1={xOf(i - 1)} y1={yOf(s.points[i - 1].value)} x2={xOf(i)} y2={yOf(p.value)}
                    stroke={color} strokeWidth={s.highlight ? 7 : 5} strokeLinecap="round" />
                );
              })}
              {s.points.map((p, i) => {
                if (!vis[i]) return null;
                const showLabel = (d.valueLabels ?? "all") === "all" || ((d.valueLabels ?? "all") === "last" && i === s.points.length - 1);
                return (
                  <g key={`p${i}`}>
                    <circle cx={xOf(i)} cy={yOf(p.value)} r={13} fill={color} stroke="#fff" strokeWidth={3} />
                    {showLabel && (
                      <text x={clampCx(xOf(i), fmt(p.value), 40)} y={yOf(p.value) - TOP < PLOT_H * 0.15 ? yOf(p.value) + 56 : yOf(p.value) - 28} textAnchor="middle" fontSize={40} fontWeight={700} fill="#fff">
                        {fmt(p.value)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const PostCardDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const at = d.atUnit != null ? (scene.units[d.atUnit]?.startFrame ?? 0) : 0;
  if (frame < at) return null;
  return (
    <div style={{ position: "absolute", left: 340, top: accent ? 265 : 225, width: 1240 }}>
      <FadeIn>
        <div style={{ background: "rgba(6,16,30,0.95)", border: "3px solid rgba(160,200,255,0.8)", borderRadius: 20, padding: "42px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: THEME, color: "#fff", fontSize: 48, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {d.initial ?? ""}
            </div>
            <div>
              <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>{d.name}</div>
              {d.handle && <div style={{ fontSize: 36, color: "rgba(234,242,251,0.65)", marginTop: 4 }}>{d.handle}</div>}
            </div>
            {d.date && <div style={{ flex: 1, textAlign: "right", fontSize: 34, color: "rgba(234,242,251,0.6)" }}>{d.date}</div>}
          </div>
          <div style={{ fontSize: 46, color: "#fff", lineHeight: 1.6, whiteSpace: "pre-line", marginTop: 32 }}>{d.text}</div>
          {(d.likes || d.reposts) && (
            <div style={{ display: "flex", gap: 44, marginTop: 34, paddingTop: 26, borderTop: "2px solid rgba(160,200,255,0.3)", fontSize: 36, color: "rgba(234,242,251,0.8)" }}>
              {d.likes && <div>いいね <span style={{ fontWeight: 700, color: "#fff" }}>{d.likes}</span></div>}
              {d.reposts && <div>リポスト <span style={{ fontWeight: 700, color: "#fff" }}>{d.reposts}</span></div>}
            </div>
          )}
        </div>
        {d.note && (
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 26, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        )}
      </FadeIn>
    </div>
  );
};

const RelationMapDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const nodes = d.nodes ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const nodeBox = (t: string, x: string | undefined, big?: boolean) => (
    <div style={{ ...boxStyle, padding: "24px 28px", textAlign: "center" }}>
      <div style={{ fontSize: big ? 46 : 40, fontWeight: 800, color: "#fff", whiteSpace: "pre-line", lineHeight: 1.35 }}>{t}</div>
      {x && <div style={{ fontSize: 34, color: INK, marginTop: 8, whiteSpace: "pre-line", lineHeight: 1.5 }}>{x}</div>}
    </div>
  );
  // ノード箱の高さの見積もり（折り返し行数から）。箱は中身で高さが変わるため、
  // 配置を固定値で決めると、見出しが単語途中で割れたり、箱の下の link ラベルが
  // 後続の note に重なったりする。見積もりで配置を追随させる（2026-11-07 修正。
  // ラボ セット4 S7 の実例を受けたもの）
  const boxH = (title: string, text: string | undefined, titleFs: number, innerW: number) =>
    48 + estLines(title, titleFs, innerW) * titleFs * 1.35 + (text ? 8 + estLines(text, 34, innerW) * 34 * 1.5 : 0);
  if ((d.mode ?? "hub") === "tree") {
    const n = Math.max(1, nodes.length);
    const childW = (1600 - (n - 1) * 40) / n;
    const centers = nodes.map((_, i) => childW * i + 40 * i + childW / 2);
    const rootW = 860;
    const rootH = boxH(d.root?.title ?? "", d.root?.text, 46, rootW - 56);
    const hlineY = rootH + 48;
    const childTop = hlineY + 48;
    const maxChildH = Math.max(0, ...nodes.map((nd) => boxH(nd.title, nd.text, 40, childW - 56)));
    const treeH = childTop + maxChildH + (nodes.some((nd) => nd.link) ? 58 : 0) + 8;
    return (
      <div style={{ position: "absolute", left: 160, top: accent ? 255 : 215, width: 1600 }}>
        <div style={{ position: "relative", height: treeH }}>
          <svg width={1600} height={childTop} style={{ position: "absolute", left: 0, top: 0 }}>
            <line x1={800} y1={rootH} x2={800} y2={hlineY} stroke="rgba(160,200,255,0.65)" strokeWidth={3} />
            {centers.map((cx, i) => (
              <g key={i}>
                <line x1={Math.min(800, cx)} y1={hlineY} x2={Math.max(800, cx)} y2={hlineY} stroke="rgba(160,200,255,0.65)" strokeWidth={3} />
                <line x1={cx} y1={hlineY} x2={cx} y2={childTop} stroke="rgba(160,200,255,0.65)" strokeWidth={3} />
              </g>
            ))}
          </svg>
          <div style={{ position: "absolute", left: (1600 - rootW) / 2, top: 0, width: rootW, height: rootH, display: "flex" }}>
            <div style={{ flex: 1 }}>{nodeBox(d.root?.title ?? "", d.root?.text, true)}</div>
          </div>
          {nodes.map((nd, i) =>
            frame >= atOf(nd.atUnit) ? (
              <div key={i} style={{ position: "absolute", left: childW * i + 40 * i, top: childTop, width: childW }}>
                <FadeIn>{nodeBox(nd.title, nd.text)}</FadeIn>
                {nd.link && (
                  <div style={{ textAlign: "center", fontSize: 32, color: "#9fc6ff", marginTop: 10 }}>{nd.link}</div>
                )}
              </div>
            ) : null,
          )}
        </div>
        {d.note && (
          <FadeIn>
            <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 6, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
          </FadeIn>
        )}
      </div>
    );
  }
  // hub: 中心＋左右の列
  const leftNodes = nodes.filter((_, i) => i % 2 === 0);
  const rightNodes = nodes.filter((_, i) => i % 2 === 1);
  const colY = (count: number, idx: number) => {
    if (count <= 1) return 280;
    if (count === 2) return idx === 0 ? 140 : 420;
    return [80, 280, 480][idx] ?? 280;
  };
  const placed = nodes.map((nd, i) => {
    const side = i % 2 === 0 ? "L" : "R";
    const col = side === "L" ? leftNodes : rightNodes;
    const idxInCol = col.indexOf(nd);
    return { nd, side, cx: side === "L" ? 210 : 1390, cy: colY(col.length, idxInCol) };
  });
  // hub: ノード箱（＋link ラベル）がコンテナの下端を超えて note に重ならないよう、
  // 最も低いノードの底に合わせてコンテナの高さを確保する（2026-11-07 修正）
  const hubH =
    Math.max(580, ...placed.map((p) => p.cy - 70 + boxH(p.nd.title, p.nd.text, 40, 420 - 56) + (p.nd.link ? 58 : 0))) + 8;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 245 : 205, width: 1600 }}>
      <div style={{ position: "relative", height: hubH }}>
        <svg width={1600} height={580} style={{ position: "absolute", left: 0, top: 0 }}>
          {placed.map((p, i) =>
            frame >= atOf(p.nd.atUnit) ? (
              <line key={i} x1={800} y1={290} x2={p.cx} y2={p.cy} stroke="rgba(160,200,255,0.55)" strokeWidth={3} />
            ) : null,
          )}
        </svg>
        <div style={{ position: "absolute", left: 540, top: 190, width: 520 }}>
          <FadeIn>{nodeBox(d.center?.title ?? "", d.center?.text, true)}</FadeIn>
        </div>
        {placed.map((p, i) =>
          frame >= atOf(p.nd.atUnit) ? (
            <div key={i} style={{ position: "absolute", left: p.cx - 210, top: p.cy - 70, width: 420 }}>
              <FadeIn>
                {nodeBox(p.nd.title, p.nd.text)}
                {p.nd.link && (
                  <div style={{ textAlign: "center", marginTop: 10 }}>
                    <span style={{ background: "rgba(10,30,60,0.92)", border: "2px solid rgba(160,200,255,0.5)", borderRadius: 8, padding: "4px 14px", fontSize: 32, color: "#9fc6ff" }}>
                      {p.nd.link}
                    </span>
                  </div>
                )}
              </FadeIn>
            </div>
          ) : null,
        )}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const ScatterDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const pts = d.chartPoints ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const xs = pts.map((p) => p.x || 0);
  const ys = pts.map((p) => p.y || 0);
  const xMin = d.min ?? 0;
  const xMax = d.xMax ?? (xs.length ? Math.max(...xs) * 1.15 : 10);
  const yPad = ys.length ? Math.max(1, (Math.max(...ys) - Math.min(...ys)) * 0.25) : 1;
  const yMin = d.yMin ?? (ys.length ? Math.min(...ys) - yPad : 0);
  const yMax = d.yMax ?? (ys.length ? Math.max(...ys) + yPad : 10);
  const LEFT = 110;
  const TOP = 30;
  const PLOT_W = 1440;
  const PLOT_H = 470;
  const xOf = (v: number) => LEFT + ((v - xMin) / (xMax - xMin || 1)) * PLOT_W;
  const yOf = (v: number) => TOP + ((yMax - v) / (yMax - yMin || 1)) * PLOT_H;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 255 : 215, width: 1600 }}>
      {d.yLabel && (
        <FadeIn>
          <div style={{ fontSize: 38, fontWeight: 700, color: "#9fc6ff" }}>{d.yLabel}</div>
        </FadeIn>
      )}
      <svg width={1600} height={PLOT_H + 90} style={{ display: "block", marginTop: 6 }}>
        <line x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + PLOT_H} stroke="rgba(160,200,255,0.55)" strokeWidth={3} />
        <line x1={LEFT} y1={TOP + PLOT_H} x2={LEFT + PLOT_W} y2={TOP + PLOT_H} stroke="rgba(160,200,255,0.55)" strokeWidth={3} />
        <text x={LEFT + PLOT_W} y={TOP + PLOT_H + 56} textAnchor="end" fontSize={36} fill="#9fc6ff">{d.xLabel ?? ""}</text>
        {pts.map((p, i) => {
          if (frame < atOf(p.atUnit)) return null;
          const cx = xOf(p.x);
          const cy = yOf(p.y);
          const anchorEnd = cx > LEFT + PLOT_W * 0.72;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={p.highlight ? 21 : 16} fill={p.highlight ? YELLOW : "#3d8bdd"} stroke="#fff" strokeWidth={3} />
              <text x={anchorEnd ? cx - 30 : cx + 30} y={cy + 10} textAnchor={anchorEnd ? "end" : "start"}
                fontSize={38} fontWeight={700} fill={p.highlight ? YELLOW : "#fff"}>
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const DeltaMultiDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const items = d.slopeItems ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const vals = items.flatMap((it) => [it.before || 0, it.after || 0]);
  const dataMax = vals.length ? Math.max(...vals) : 0;
  const dataMin = vals.length ? Math.min(...vals) : 0;
  const axisMax = d.max ?? Math.max(10, Math.ceil((dataMax * 1.15) / 10) * 10);
  const axisMin = d.min ?? (dataMin < 0 ? Math.floor((dataMin * 1.15) / 10) * 10 : 0);
  const TOP = 92;
  const PLOT_H = 440;
  const LX = 600;
  const RX = 1180;
  const yOf = (v: number) => TOP + ((axisMax - v) / (axisMax - axisMin || 1)) * PLOT_H;
  const COLORS = ["#3d8bdd", "#7ddb8a", "#ffd83d", "#ff9f6e", "#c792ea", "#4dd0e1"];
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 255 : 215, width: 1600 }}>
      <div style={{ position: "relative", height: TOP + PLOT_H + 70 }}>
        <div style={{ position: "absolute", left: LX - 200, top: 0, width: 400, textAlign: "center", fontSize: 40, fontWeight: 700, color: "#9fc6ff" }}>
          {d.beforeLabel}
        </div>
        <div style={{ position: "absolute", left: RX - 200, top: 0, width: 400, textAlign: "center", fontSize: 40, fontWeight: 700, color: "#9fc6ff" }}>
          {d.afterLabel}
        </div>
        <svg width={1600} height={TOP + PLOT_H + 70} style={{ position: "absolute", left: 0, top: 0 }}>
          <line x1={LX} y1={TOP} x2={LX} y2={TOP + PLOT_H} stroke="rgba(160,200,255,0.4)" strokeWidth={3} />
          <line x1={RX} y1={TOP} x2={RX} y2={TOP + PLOT_H} stroke="rgba(160,200,255,0.4)" strokeWidth={3} />
          {items.map((it, i) => {
            if (frame < atOf(it.atUnit)) return null;
            const color = COLORS[i % COLORS.length];
            return (
              <g key={i}>
                <line x1={LX} y1={yOf(it.before)} x2={RX} y2={yOf(it.after)} stroke={color} strokeWidth={5} strokeLinecap="round" />
                <circle cx={LX} cy={yOf(it.before)} r={13} fill={color} stroke="#fff" strokeWidth={3} />
                <circle cx={RX} cy={yOf(it.after)} r={13} fill={color} stroke="#fff" strokeWidth={3} />
                <text x={LX - 26} y={yOf(it.before) + 10} textAnchor="end" fontSize={40} fontWeight={700} fill="#fff">
                  {fmt(it.before)}{d.unit ?? ""}
                </text>
                <text x={RX + 26} y={yOf(it.after) + 10} textAnchor="start" fontSize={40} fontWeight={700} fill="#fff">
                  {fmt(it.after)}{d.unit ?? ""}
                </text>
              </g>
            );
          })}
        </svg>
        {items.map((it, i) => {
          if (frame < atOf(it.atUnit)) return null;
          return (
            <div key={i} style={{ position: "absolute", left: 0, top: yOf(it.before) - 30, width: 400, fontSize: 38, fontWeight: 700, color: COLORS[i % COLORS.length], whiteSpace: "pre-line", lineHeight: 1.4 }}>
              {it.label}
            </div>
          );
        })}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

/* タイルマップの配置（col, row）。us は州の2文字略号、jp は都道府県名 */
const US_TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [11, 0],
  WA: [1, 1], MT: [2, 1], ND: [3, 1], MN: [4, 1], WI: [5, 1], MI: [6, 1], VT: [9, 1], NH: [10, 1],
  OR: [1, 2], ID: [2, 2], SD: [3, 2], IA: [4, 2], IL: [5, 2], IN: [6, 2], OH: [7, 2], PA: [8, 2], NY: [9, 2], MA: [10, 2],
  CA: [1, 3], NV: [2, 3], WY: [3, 3], NE: [4, 3], MO: [5, 3], KY: [6, 3], WV: [7, 3], VA: [8, 3], NJ: [9, 3], CT: [10, 3], RI: [11, 3],
  AZ: [2, 4], NM: [3, 4], CO: [4, 4], KS: [5, 4], AR: [6, 4], TN: [7, 4], NC: [8, 4], SC: [9, 4], MD: [10, 4], DE: [11, 4],
  HI: [1, 5], TX: [4, 5], OK: [5, 5], LA: [6, 5], MS: [7, 5], AL: [8, 5], GA: [9, 5], DC: [11, 5],
  FL: [10, 6],
};
const JP_TILES: Record<string, [number, number]> = {
  "北海道": [8, 0], "青森県": [8, 1],
  "秋田県": [7, 2], "岩手県": [8, 2],
  "山形県": [7, 3], "宮城県": [8, 3],
  "福島県": [8, 4], "富山県": [5, 4], "新潟県": [6, 4],
  "石川県": [4, 4], "群馬県": [7, 5], "栃木県": [8, 5], "茨城県": [9, 5], "福井県": [4, 5], "長野県": [6, 5],
  "鳥取県": [2, 6], "島根県": [1, 6], "滋賀県": [4, 6], "岐阜県": [5, 6], "山梨県": [7, 6], "埼玉県": [8, 6], "千葉県": [9, 6],
  "山口県": [0, 7], "広島県": [1, 7], "岡山県": [2, 7], "兵庫県": [3, 7], "京都府": [4, 7], "愛知県": [5, 7], "東京都": [8, 7],
  "福岡県": [0, 8], "大分県": [1, 8], "大阪府": [3, 8], "奈良県": [4, 8], "三重県": [5, 8], "静岡県": [7, 8], "神奈川県": [8, 8],
  "佐賀県": [0, 9], "愛媛県": [1, 9], "香川県": [2, 9], "徳島県": [3, 9], "和歌山県": [4, 9],
  "長崎県": [0, 10], "熊本県": [1, 10], "高知県": [2, 10],
  "宮崎県": [2, 11],
  "鹿児島県": [1, 12],
  "沖縄県": [0, 13],
};
const MAP_TONE_COLORS: Record<string, string> = {
  good: "#7ddb8a", bad: "#ff7b7b", accent: "#ffd83d", neutral: "#9fc6ff",
};

const MapDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const pts = d.mapPoints ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const base = d.base ?? "none";
  const mode = d.mapMode ?? "pin";
  const tiles = base === "us" ? US_TILES : base === "jp" ? JP_TILES : {};
  const codes = Object.keys(tiles);
  const maxCol = codes.length ? Math.max(...codes.map((c) => tiles[c][0])) + 1 : 0;
  const maxRow = codes.length ? Math.max(...codes.map((c) => tiles[c][1])) + 1 : 0;
  const pitch = codes.length ? Math.min(1150 / maxCol, 700 / maxRow) : 0;
  const tile = pitch - 6;
  const gridW = maxCol * pitch;
  const gridH = maxRow * pitch;
  const gridLeft = (1600 - gridW) / 2;
  const toneFill = (t?: string) =>
    t === "good" ? "rgba(125,219,138,0.5)" : t === "bad" ? "rgba(255,123,123,0.5)"
      : t === "accent" ? "rgba(255,216,61,0.5)" : "rgba(61,139,221,0.45)";
  const centerOf = (p: (typeof pts)[number]) => {
    if (base !== "none" && p.code && tiles[p.code]) {
      const [c, r] = tiles[p.code];
      return { x: gridLeft + c * pitch + pitch / 2 + (p.dx ?? 0), y: r * pitch + pitch / 2 + (p.dy ?? 0) };
    }
    return { x: ((p.x ?? 50) / 100) * 1600, y: ((p.y ?? 50) / 100) * 660 };
  };
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 245 : 205, width: 1600 }}>
      <div style={{ position: "relative", height: Math.max(gridH, 660) }}>
        {codes.map((code) => {
          const [c, r] = tiles[code];
          const hit = mode === "tile" ? pts.find((p) => p.code === code) : undefined;
          const short = base === "jp" ? code.replace(/[都府県]$/, "") : code;
          return (
            <div key={code} style={{
              position: "absolute", left: gridLeft + c * pitch + 3, top: r * pitch + 3,
              width: tile, height: tile, borderRadius: 8,
              background: hit ? toneFill(hit.tone) : "rgba(61,139,221,0.13)",
              border: `2px solid ${hit ? MAP_TONE_COLORS[hit.tone ?? "neutral"] : "rgba(160,200,255,0.3)"}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              fontSize: base === "jp" ? 19 : 26, fontWeight: 700,
              color: hit ? "#fff" : "rgba(234,242,251,0.55)",
            }}>
              <div>{short}</div>
              {hit?.value && <div style={{ fontSize: 22, marginTop: 2 }}>{hit.value}</div>}
            </div>
          );
        })}
        {mode === "pin" && pts.map((p, i) => {
          if (frame < atOf(p.atUnit)) return null;
          const { x, y } = centerOf(p);
          const H = Math.max(gridH, 660);
          const above = y > H * 0.78 ? true : y < H * 0.18 ? false : i % 2 === 1;
          return (
            <div key={i} style={{ position: "absolute", left: x, top: y }}>
              <div style={{ position: "absolute", left: -13, top: -13, width: 26, height: 26, borderRadius: "50%", background: MAP_TONE_COLORS[p.tone ?? "neutral"], border: "3px solid #fff" }} />
              <div style={{
                position: "absolute", left: -135, width: 270,
                ...(above ? { bottom: 22 } : { top: 22 }),
                background: "rgba(6,16,30,0.94)", border: `2px solid ${MAP_TONE_COLORS[p.tone ?? "neutral"]}`,
                borderRadius: 10, padding: "8px 10px", textAlign: "center",
              }}>
                <div style={{ fontSize: 29, fontWeight: 700, color: "#fff", lineHeight: 1.35 }}>{p.name}</div>
                {p.value && <div style={{ fontSize: 28, color: MAP_TONE_COLORS[p.tone ?? "neutral"], marginTop: 3, lineHeight: 1.35 }}>{p.value}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 14, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const STACK_COLORS = ["#3d8bdd", "#7ddb8a", "#ffd83d", "#ff9f6e", "#c792ea", "#4dd0e1"];

const ShareStackDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const bars = d.stackBars ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 225, width: 1600 }}>
      {bars.map((bar, bi) => {
        if (frame < atOf(bar.atUnit)) return null;
        const total = bar.segments.reduce((a, s) => a + (s.value || 0), 0);
        return (
          <FadeIn key={bi}>
            <div style={{ marginBottom: bi + 1 < bars.length ? 54 : 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
                {bar.label && <div style={{ fontSize: 40, fontWeight: 700, color: "#fff" }}>{bar.label}</div>}
                <div style={{ flex: 1, textAlign: "right", fontSize: 38, color: "#9fc6ff" }}>
                  合計 {total.toLocaleString()}{d.unit ?? ""}
                </div>
              </div>
              <div style={{ display: "flex", height: 92, borderRadius: 10, overflow: "hidden", border: "2px solid rgba(160,200,255,0.5)" }}>
                {bar.segments.map((s, si) => (
                  <div key={si} style={{ width: `${pct(s.value, total)}%`, background: STACK_COLORS[si % STACK_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {pct(s.value, total) >= 9 && (
                      <span style={{ fontSize: 42, fontWeight: 800, color: "#10222f" }}>{pct(s.value, total)}%</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 36px", marginTop: 18 }}>
                {bar.segments.map((s, si) => (
                  <div key={si} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 36, color: INK }}>
                    <span style={{ width: 24, height: 24, borderRadius: 5, background: STACK_COLORS[si % STACK_COLORS.length], display: "inline-block" }} />
                    {s.label} {s.value.toLocaleString()}{d.unit ?? ""}（{pct(s.value, total)}%）
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
        );
      })}
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 30, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const WaterfallDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const steps = d.wfSteps ?? [];
  const startV = d.wfStart?.value ?? 0;
  const endV = d.wfEnd?.value ?? startV + steps.reduce((a, s) => a + (s.value || 0), 0);
  type Col = { label: string; from: number; to: number; kind: "start" | "step" | "end"; atUnit?: number };
  const cols: Col[] = [];
  if (d.wfStart) cols.push({ label: d.wfStart.label, from: 0, to: startV, kind: "start" });
  let cum = startV;
  for (const s of steps) {
    cols.push({ label: s.label, from: cum, to: cum + (s.value || 0), kind: "step", atUnit: s.atUnit });
    cum += s.value || 0;
  }
  if (d.wfEnd) cols.push({ label: d.wfEnd.label, from: 0, to: endV, kind: "end" });
  const allV = cols.flatMap((c) => [c.from, c.to, 0]);
  const vmax = Math.max(...allV, 0);
  const vmin = Math.min(...allV, 0);
  const pad = Math.max(1, (vmax - vmin) * 0.14);
  const hi = vmax + pad;
  const lo = vmin - pad;
  const PLOT_H = 450;
  const yOf = (v: number) => ((hi - v) / (hi - lo || 1)) * PLOT_H;
  const n = Math.max(1, cols.length);
  const gap = 56;
  const colW = Math.min(320, (1600 - (n - 1) * gap) / n);
  const totalW = colW * n + gap * (n - 1);
  const left0 = (1600 - totalW) / 2;
  const fmt = (v: number) => v.toLocaleString();
  // 到達点ラベル（ステップ列の累計表示）の文面と大きさ。列幅に収まらない場合は
  // 折り返さずフォントを落として1行に収める
  const cumLabel = (to: number) => {
    const txt = `到達 ${to < 0 ? "−" : ""}${fmt(Math.abs(to))}${d.unit ?? ""}`;
    const w = estTextW(txt, 30, 0.57);
    const fs = w > colW + 56 ? Math.max(20, Math.floor(((30 * (colW + 56)) / w) * 0.95)) : 30;
    return { txt, fs };
  };
  // 値ラベル（増減値）も同様に、列幅に収まらない場合はフォントを落として1行に収める
  // （単位付きの長い値が「54.01億ド/ル」と割れたラボ セット2 v1 の実例を受けたもの）
  const valFs = (txt: string) => {
    const w = estTextW(txt, 42, 0.57);
    return w > colW + 40 ? Math.max(24, Math.floor(((42 * (colW + 40)) / w) * 0.95)) : 42;
  };
  const lastStepAt = steps.length ? atOf(steps[steps.length - 1].atUnit) : 0;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 225, width: 1600 }}>
      <div style={{ position: "relative", height: PLOT_H + 130 }}>
        <div style={{ position: "absolute", left: left0, top: yOf(0), width: totalW, borderTop: "3px solid rgba(160,200,255,0.55)" }} />
        {cols.map((c, i) => {
          const visible = c.kind === "start" ? true : c.kind === "end" ? frame >= lastStepAt : frame >= atOf(c.atUnit);
          if (!visible) return null;
          const x = left0 + i * (colW + gap);
          const top = yOf(Math.max(c.from, c.to));
          const h = Math.max(6, Math.abs(yOf(c.from) - yOf(c.to)));
          const val = c.kind === "step" ? c.to - c.from : c.to;
          const neg = val < 0;
          const fill = c.kind === "end" ? "linear-gradient(180deg, #c79a00, #ffd83d)" : neg ? "#c0453e" : "#2f6fb4";
          const next = cols[i + 1];
          const nextVisible = next && (next.kind === "end" ? frame >= lastStepAt : next.kind === "start" ? true : frame >= atOf(next.atUnit));
          return (
            <div key={i}>
              {next && nextVisible && (
                <div style={{ position: "absolute", left: x + colW, top: yOf(c.to), width: gap, borderTop: "3px dashed rgba(234,242,251,0.5)" }} />
              )}
              <FadeIn>
                <div style={{ position: "absolute", left: x, top, width: colW, height: h, background: fill, borderRadius: 8, border: c.kind === "end" ? `3px solid ${YELLOW}` : "3px solid rgba(160,200,255,0.5)" }} />
                <div style={{ position: "absolute", left: x - 20, top: top - 66, width: colW + 40, textAlign: "center", fontSize: valFs(`${neg ? "−" : ""}${fmt(Math.abs(val))}${d.unit ?? ""}`), fontWeight: 800, color: c.kind === "end" ? YELLOW : "#fff", whiteSpace: "nowrap" }}>
                  {neg ? "−" : ""}{fmt(Math.abs(val))}{d.unit ?? ""}
                </div>
                {/* 到達点ラベル: 各ステップの到達水準（累計）を必ず画面に残す。
                    これが無いと、実績の到達値が棒の幾何位置としてしか存在せず、
                    ナレーションの数字と画面の数字が一致しない（2026-11-07 追加。
                    ラボ セット2 で実績 −5.67 が無ラベルだった実例を受けたもの）。
                    位置は棒の下端のすぐ下（増減どちらでも到達側に寄る） */}
                {c.kind === "step" && (
                  <div style={{ position: "absolute", left: x - 28, top: top + h + 8, width: colW + 56, textAlign: "center", fontSize: cumLabel(c.to).fs, fontWeight: 700, color: "#9fc6ff", whiteSpace: "nowrap" }}>
                    {cumLabel(c.to).txt}
                  </div>
                )}
                <div style={{ position: "absolute", left: x - 28, top: PLOT_H + 18, width: colW + 56, textAlign: "center", fontSize: 33, color: INK, whiteSpace: "pre-line", lineHeight: 1.4 }}>
                  {c.label}
                </div>
              </FadeIn>
            </div>
          );
        })}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const GroupedBarsDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const series = d.barSeries ?? [];
  const groups = d.barGroups ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const allV = groups.flatMap((g) => g.values.map((v) => v ?? 0));
  const axisMax = d.max ?? Math.max(10, Math.ceil(((allV.length ? Math.max(...allV) : 0) * 1.15) / 10) * 10);
  const SERIES_COLORS = ["#3d8bdd", "#7ddb8a", "#ffd83d"];
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 255 : 215, width: 1600 }}>
      <div style={{ display: "flex", gap: 36, marginBottom: 26 }}>
        {series.map((s, si) => (
          <div key={si} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 30, height: 18, borderRadius: 4, background: SERIES_COLORS[si % SERIES_COLORS.length], display: "inline-block" }} />
            <span style={{ fontSize: 36, color: INK }}>{s.name}</span>
          </div>
        ))}
        {d.unit && <div style={{ fontSize: 34, color: "rgba(234,242,251,0.7)" }}>単位: {d.unit}</div>}
      </div>
      {groups.map((g, gi) => {
        if (frame < atOf(g.atUnit)) return <div key={gi} style={{ height: series.length * 52 + 34 }} />;
        return (
          <FadeIn key={gi}>
            <div style={{ display: "flex", marginBottom: 34 }}>
              <div style={{ width: 480, flexShrink: 0, paddingRight: 26, fontSize: 42, fontWeight: 700, color: g.highlight ? YELLOW : "#fff", whiteSpace: "pre-line", lineHeight: 1.35, display: "flex", alignItems: "center" }}>
                {g.label}
              </div>
              <div style={{ flex: 1 }}>
                {series.map((s, si) => {
                  const v = g.values[si];
                  const pctW = v == null ? 0 : Math.max(0, Math.min(100, (v / axisMax) * 100));
                  return (
                    <div key={si} style={{ display: "flex", alignItems: "center", height: 40, marginBottom: si + 1 < series.length ? 12 : 0 }}>
                      {v == null ? (
                        <div style={{ fontSize: 36, color: "rgba(234,242,251,0.55)" }}>—（データなし）</div>
                      ) : (
                        <>
                          <div style={{ width: `${pctW}%`, height: 40, borderRadius: "0 8px 8px 0", background: g.highlight ? `linear-gradient(90deg, #c79a00, ${YELLOW})` : SERIES_COLORS[si % SERIES_COLORS.length] }} />
                          <div style={{ marginLeft: 16, fontSize: 38, fontWeight: 800, color: g.highlight ? YELLOW : "#fff" }}>{v}{d.unit ?? ""}</div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </FadeIn>
        );
      })}
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const WaffleDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const at = d.atUnit != null ? (scene.units[d.atUnit]?.startFrame ?? 0) : 0;
  const total = d.waffleTotal ?? 0;
  const value = d.waffleValue ?? 0;
  const ratio = total > 0 ? value / total : 0;
  const filled = Math.round(ratio * 100);
  const percent = Math.round(ratio * 1000) / 10;
  if (frame < at) return null;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 265 : 225, width: 1600 }}>
      <FadeIn>
        <div style={{ display: "flex", alignItems: "center", gap: 90 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 46px)", gap: 7, flexShrink: 0 }}>
            {Array.from({ length: 100 }, (_, idx) => {
              const row = Math.floor(idx / 10);
              const col = idx % 10;
              const order = (9 - row) * 10 + col;
              const on = order < filled;
              return (
                <div key={idx} style={{ width: 46, height: 46, borderRadius: 7, background: on ? "#3d8bdd" : "rgba(160,200,255,0.14)", border: `2px solid ${on ? "#7ab5e8" : "rgba(160,200,255,0.3)"}` }} />
              );
            })}
          </div>
          <div>
            <div style={{ fontSize: 110, fontWeight: 800, color: "#fff", textShadow: OUTLINE, lineHeight: 1.2 }}>
              {d.display ?? `${total}件中${value}件`}
            </div>
            <div style={{ fontSize: 72, fontWeight: 800, color: YELLOW, marginTop: 18 }}>{percent}%</div>
            {d.label && <div style={{ fontSize: 44, fontWeight: 700, color: INK, marginTop: 16, whiteSpace: "pre-line", lineHeight: 1.45 }}>{d.label}</div>}
          </div>
        </div>
        {d.note && (
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 36, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        )}
      </FadeIn>
    </div>
  );
};

const ProfileCardDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const at = d.atUnit != null ? (scene.units[d.atUnit]?.startFrame ?? 0) : 0;
  if (frame < at) return null;
  return (
    <div style={{ position: "absolute", left: 230, top: accent ? 265 : 225, width: 1460 }}>
      <FadeIn>
        {d.context && (
          <div style={{ fontSize: 36, color: "#9fc6ff", marginBottom: 20, whiteSpace: "pre-line", lineHeight: 1.5 }}>{d.context}</div>
        )}
        <div style={{ ...boxStyle, padding: "44px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            <div style={{ width: 150, height: 150, borderRadius: "50%", background: THEME, color: "#fff", fontSize: 64, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {d.initial ?? ""}
            </div>
            <div>
              <div style={{ fontSize: 56, fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>{d.name}</div>
              {d.role && <div style={{ fontSize: 38, color: "#9fc6ff", marginTop: 8 }}>{d.role}</div>}
              {d.affiliation && <div style={{ fontSize: 36, color: "rgba(234,242,251,0.8)", marginTop: 4 }}>{d.affiliation}</div>}
            </div>
          </div>
          {(d.profilePoints ?? []).length > 0 && (
            <div style={{ marginTop: 34, paddingTop: 30, borderTop: "2px solid rgba(160,200,255,0.3)" }}>
              {(d.profilePoints ?? []).map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 16, marginBottom: i + 1 < (d.profilePoints ?? []).length ? 16 : 0 }}>
                  <div style={{ width: 16, height: 16, background: YELLOW, borderRadius: 3, marginTop: 14, flexShrink: 0 }} />
                  <div style={{ fontSize: 38, color: INK, lineHeight: 1.55, whiteSpace: "pre-line" }}>{p}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {d.note && (
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 26, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        )}
      </FadeIn>
    </div>
  );
};

const RadarDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const axes = d.axes ?? [];
  const series = d.radarSeries ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const max = d.max ?? 100;
  const CX = 380;
  const CY = 300;
  const R = 195;
  const n = Math.max(3, axes.length);
  const pt = (i: number, ratio: number): [number, number] => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [CX + Math.cos(ang) * R * ratio, CY + Math.sin(ang) * R * ratio];
  };
  const COLORS = ["#3d8bdd", "#7ddb8a", "#ffd83d"];
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 245 : 205, width: 1600, display: "flex", gap: 60 }}>
      <svg width={760} height={600} style={{ flexShrink: 0 }}>
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon key={r} points={axes.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" stroke="rgba(160,200,255,0.3)" strokeWidth={2} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 1);
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(160,200,255,0.3)" strokeWidth={2} />;
        })}
        {series.map((s, si) => {
          if (frame < atOf(s.atUnit)) return null;
          const color = s.highlight ? YELLOW : COLORS[si % COLORS.length];
          const points = axes.map((_, i) => pt(i, Math.max(0, Math.min(1, (s.values[i] ?? 0) / max))).join(",")).join(" ");
          return (
            <g key={si}>
              <polygon points={points} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={4} strokeLinejoin="round" />
              {axes.map((_, i) => {
                const [x, y] = pt(i, Math.max(0, Math.min(1, (s.values[i] ?? 0) / max)));
                return <circle key={i} cx={x} cy={y} r={8} fill={color} stroke="#fff" strokeWidth={2} />;
              })}
            </g>
          );
        })}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 1.25);
          return (
            <text key={i} x={x} y={y + 10} textAnchor="middle" fontSize={34} fontWeight={700} fill="#9fc6ff">{a}</text>
          );
        })}
      </svg>
      <div style={{ flex: 1, paddingTop: 60 }}>
        {series.map((s, si) => (
          <div key={si} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <span style={{ width: 30, height: 18, borderRadius: 4, background: s.highlight ? YELLOW : COLORS[si % COLORS.length], display: "inline-block" }} />
            <span style={{ fontSize: 38, fontWeight: 700, color: "#fff" }}>{s.name}</span>
          </div>
        ))}
        <div style={{ marginTop: 26 }}>
          {axes.map((a, i) => (
            <div key={i} style={{ display: "flex", fontSize: 36, color: INK, marginBottom: 10 }}>
              <div style={{ width: 300, color: "#9fc6ff" }}>{a}</div>
              <div style={{ fontWeight: 700 }}>{series.map((s) => s.values[i] ?? "—").join(" / ")}</div>
            </div>
          ))}
        </div>
        {d.note && (
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 26, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        )}
      </div>
    </div>
  );
};

const QuadrantDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const pts = d.chartPoints ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const PLOT_W = 1020;
  const PLOT_H = 540;
  const LEFT = 290;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 255 : 215, width: 1600 }}>
      {d.yLabel && <div style={{ fontSize: 38, fontWeight: 700, color: "#9fc6ff", marginLeft: LEFT }}>{d.yLabel}</div>}
      <div style={{ position: "relative", height: PLOT_H, marginTop: 12 }}>
        <div style={{ position: "absolute", left: LEFT, top: 0, width: PLOT_W, height: PLOT_H, border: "3px solid rgba(160,200,255,0.55)", background: "rgba(10,30,60,0.4)" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, height: "100%", borderLeft: "2px dashed rgba(234,242,251,0.4)" }} />
          <div style={{ position: "absolute", top: "50%", left: 0, width: "100%", borderTop: "2px dashed rgba(234,242,251,0.4)" }} />
          {d.quadrants?.topLeft && <div style={{ position: "absolute", left: 20, top: 14, fontSize: 34, color: "rgba(159,198,255,0.85)" }}>{d.quadrants.topLeft}</div>}
          {d.quadrants?.topRight && <div style={{ position: "absolute", right: 20, top: 14, fontSize: 34, color: "rgba(159,198,255,0.85)" }}>{d.quadrants.topRight}</div>}
          {d.quadrants?.bottomLeft && <div style={{ position: "absolute", left: 20, bottom: 14, fontSize: 34, color: "rgba(159,198,255,0.85)" }}>{d.quadrants.bottomLeft}</div>}
          {d.quadrants?.bottomRight && <div style={{ position: "absolute", right: 20, bottom: 14, fontSize: 34, color: "rgba(159,198,255,0.85)" }}>{d.quadrants.bottomRight}</div>}
          {pts.map((p, i) => {
            if (frame < atOf(p.atUnit)) return null;
            const x = (Math.max(0, Math.min(100, p.x)) / 100) * PLOT_W;
            const y = (1 - Math.max(0, Math.min(100, p.y)) / 100) * PLOT_H;
            return (
              <div key={i} style={{ position: "absolute", left: x, top: y }}>
                <div style={{ position: "absolute", left: -13, top: -13, width: 26, height: 26, borderRadius: "50%", background: p.highlight ? YELLOW : "#3d8bdd", border: "3px solid #fff" }} />
                <div style={{ position: "absolute", ...(p.x > 60 ? { right: 24, textAlign: "right" as const } : { left: 24 }), top: -22, fontSize: 38, fontWeight: 700, color: p.highlight ? YELLOW : "#fff", whiteSpace: "nowrap" }}>{p.name}</div>
              </div>
            );
          })}
        </div>
      </div>
      {d.xLabel && <div style={{ fontSize: 36, color: "#9fc6ff", textAlign: "right", width: LEFT + PLOT_W }}>{d.xLabel}</div>}
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 14, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

const VennDiagram: React.FC<{ scene: Scene; accent?: boolean }> = ({ scene, accent }) => {
  const frame = useCurrentFrame();
  const d = scene.def.diagramData ?? {};
  const sets = d.sets ?? [];
  const atOf = (u?: number) => (u != null ? (scene.units[u]?.startFrame ?? 0) : 0);
  const is3 = sets.length >= 3;
  const centers: [number, number][] = is3 ? [[640, 225], [960, 225], [800, 420]] : [[615, 280], [985, 280]];
  const R = is3 ? 225 : 250;
  const COLORS = ["#3d8bdd", "#7ddb8a", "#c792ea"];
  const itemDiv = (items: string[] | undefined, style: React.CSSProperties) =>
    (items ?? []).length > 0 ? (
      <div style={{ position: "absolute", textAlign: "center", ...style }}>
        {(items ?? []).map((t, i) => (
          <div key={i} style={{ fontSize: 36, color: "#fff", lineHeight: 1.5, whiteSpace: "pre-line" }}>{t}</div>
        ))}
      </div>
    ) : null;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 245 : 205, width: 1600 }}>
      <div style={{ position: "relative", height: 580 }}>
        <svg width={1600} height={580} style={{ position: "absolute", left: 0, top: 0 }}>
          {sets.map((s, i) => {
            if (frame < atOf(s.atUnit)) return null;
            return <circle key={i} cx={centers[i][0]} cy={centers[i][1]} r={R} fill={COLORS[i % COLORS.length]} fillOpacity={0.4} stroke="#fff" strokeOpacity={0.6} strokeWidth={3} />;
          })}
        </svg>
        {sets.map((s, i) => {
          if (frame < atOf(s.atUnit)) return null;
          const labelPos: React.CSSProperties = is3
            ? [{ left: 340, top: 0, width: 340 }, { left: 920, top: 0, width: 340 }, { left: 630, top: 520, width: 340 }][i]
            : [{ left: 245, top: 6, width: 340 }, { left: 1015, top: 6, width: 340 }][i];
          return (
            <div key={i} style={{ position: "absolute", textAlign: "center", fontSize: 44, fontWeight: 800, color: "#fff", ...labelPos }}>
              {s.label}
            </div>
          );
        })}
        {!is3 && itemDiv(sets[0]?.items, { left: 325, top: 240, width: 360 })}
        {!is3 && itemDiv(sets[1]?.items, { left: 915, top: 240, width: 360 })}
        {is3 && itemDiv(sets[0]?.items, { left: 380, top: 190, width: 300 })}
        {is3 && itemDiv(sets[1]?.items, { left: 920, top: 190, width: 300 })}
        {is3 && itemDiv(sets[2]?.items, { left: 650, top: 450, width: 300 })}
        {d.overlap && (
          <div style={{ position: "absolute", left: 600, top: is3 ? 268 : 218, width: 400, textAlign: "center" }}>
            {d.overlap.label && <div style={{ fontSize: 38, fontWeight: 800, color: YELLOW, lineHeight: 1.4 }}>{d.overlap.label}</div>}
            {(d.overlap.items ?? []).map((t, i) => (
              <div key={i} style={{ fontSize: 34, color: "#fff", lineHeight: 1.5 }}>{t}</div>
            ))}
          </div>
        )}
      </div>
      {d.note && (
        <FadeIn>
          <div style={{ fontSize: 36, color: "rgba(234,242,251,0.85)", marginTop: 10, whiteSpace: "pre-line", lineHeight: 1.55 }}>{d.note}</div>
        </FadeIn>
      )}
    </div>
  );
};

/* ---------------- カード類（文案は production.json） ---------------- */

const HookScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  // 補足文の表示タイミングはデータ（subAtUnit、省略時は1文目）が決める
  const subAt = scene.units[scene.def.hook?.subAtUnit ?? 1]?.startFrame ?? 0;
  const showSecond = frame >= subAt;
  const { lines, accent, sub } = scene.def.hook ?? { lines: [] as string[] };
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center" }}>
        <FadeIn>
          <div style={{ fontSize: 120, fontWeight: 700, color: "#fff", textShadow: OUTLINE, lineHeight: 1.35 }}>
            {lines.map((line, i) => {
              const idx = accent ? line.indexOf(accent) : -1;
              return (
                <React.Fragment key={i}>
                  {i > 0 && <br />}
                  {idx >= 0 ? (
                    <>
                      {line.slice(0, idx)}
                      <span style={{ color: YELLOW }}>{accent}</span>
                      {line.slice(idx + accent.length)}
                    </>
                  ) : (
                    line
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </FadeIn>
        {showSecond && (
          <FadeIn>
            <div style={{ fontSize: 52, color: INK, marginTop: 44 }}>{sub}</div>
          </FadeIn>
        )}
      </div>
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{ def: SceneDef }> = ({ def }) => {
  const { kicker, lines, sub } = def.titleCard ?? { kicker: "", lines: [] as string[] };
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 170, textAlign: "center" }}>
        <FadeIn>
          <div style={{ fontSize: 40, letterSpacing: 10, color: "#9fc6ff", fontWeight: 700 }}>{kicker}</div>
        </FadeIn>
        <FadeIn delay={8}>
          <div style={{ fontSize: 138, fontWeight: 700, color: "#fff", textShadow: OUTLINE, lineHeight: 1.38, marginTop: 30 }}>
            {lines.map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </div>
        </FadeIn>
        <FadeIn delay={16}>
          <div style={{ width: 560, height: 10, background: THEME, margin: "40px auto 0", borderRadius: 5 }} />
          <div style={{ fontSize: 38, color: INK, marginTop: 30 }}>{sub}</div>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ def: SceneDef }> = ({ def }) => {
  const summary = def.endCard?.summary ?? [];
  const sources = def.endCard?.sources ?? [];
  // 配置はデータ（endCard.layout）が決める。省略時は summary の有無から決まる
  const layout = def.endCard?.layout ?? (summary.length === 0 ? "sources" : "summary");
  if (layout === "sources") {
    // 出典のみのエンドカード: 上側は YouTube のエンドスクリーン（次のおすすめ等）が
    // 重なる場所として空けておき、出典は下側に置く（2026-10-26 田中さんの指定）。
    // 出典の文字量が多いと下端（1080）をはみ出して URL が見切れるため、収まる範囲で
    // フォントを段階的に小さくする（2026-11-07 追加。ラボ セット5 の実例を受けたもの）。
    // 上端 620 の指定は変えず、縮小だけで収める。
    const srcAvail = 1080 - 620 - 44; // 見出し込みで使える高さ
    const srcHeadH = 40 + 16;
    let srcFs = 33;
    let srcLh = 1.75;
    for (const [fs, lh] of [[33, 1.75], [30, 1.7], [27, 1.62], [24, 1.55]] as [number, number][]) {
      srcFs = fs;
      srcLh = lh;
      const lines =
        sources.reduce((a, s) => a + estLines(s.label, fs, 1500) + estLines(s.url || " ", fs, 1500), 0) +
        Math.max(0, sources.length - 1);
      if (srcHeadH + lines * fs * lh <= srcAvail) break;
    }
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 210, top: 620, width: 1500 }}>
          <FadeIn delay={10}>
            <div style={{ fontSize: 40, fontWeight: 700, color: "#9fc6ff" }}>出典</div>
            <div style={{ fontSize: srcFs, color: "rgba(234,242,251,0.92)", lineHeight: srcLh, marginTop: 16 }}>
              {sources.map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <br />}
                  {s.label}
                  <br />
                  <span style={{ color: "#9fc6ff" }}>{s.url}</span>
                  {i < sources.length - 1 && <br />}
                </React.Fragment>
              ))}
            </div>
          </FadeIn>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 210, top: 150, width: 1500 }}>
        <FadeIn>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#fff" }}>まとめ</div>
          <div style={{ width: 200, height: 8, background: THEME, borderRadius: 4, marginTop: 18 }} />
        </FadeIn>
        <FadeIn delay={10}>
          <div style={{ fontSize: 44, color: INK, lineHeight: 1.7, marginTop: 40 }}>
            {summary.map((line, i) => (
              <div key={i} style={{ display: "flex" }}>
                <span style={{ flexShrink: 0 }}>・</span>
                <span style={{ whiteSpace: "pre-line" }}>{line}</span>
              </div>
            ))}
          </div>
        </FadeIn>
        <FadeIn delay={22}>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#9fc6ff", marginTop: 64 }}>出典</div>
          <div style={{ fontSize: 33, color: "rgba(234,242,251,0.92)", lineHeight: 1.75, marginTop: 16 }}>
            {sources.map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {s.label}
                <br />
                <span style={{ color: "#9fc6ff" }}>{s.url}</span>
                {i < sources.length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- 用語解説ブロック（右下） ----------------
   引っかかりそうな固有名詞の初出で、右からスライドインして右下に出る。
   表示は5秒間だけ: 出てから5秒で右へスライドして消える（田中さんの指定）。
   複数あるときは新しいものが下に入り、既存のものは上へスライドして積み上がる。
   同時に見えるのは最新2件まで（3件目が出ると最古は上に抜けながら消える）。
   ブロックは「太字の名詞＋短い解説（長くても3行）」、高さ固定で積み上げ量を一定にする。 */
const GLOSSARY_H = 208;
const GLOSSARY_GAP = 14;
const GLOSSARY_SLIDE = 14; // スライドにかけるフレーム数
// 表示時間と同時表示数は脚本データ（production.style）が決める。既定は5秒・2件
const GLOSSARY_HOLD = Math.round((STYLE.glossaryHoldSec ?? 5) * 30);
const GLOSSARY_MAX = Math.max(1, STYLE.glossaryMaxVisible ?? 2);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const GlossaryOverlay: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const items = scene.def.glossary ?? [];
  if (!items.length) return null;
  const starts = scene.units.map((u) => u.startFrame);
  // 出現フレーム: atUnit の開始。同じユニットに複数あれば 1.2 秒ずつずらす
  const appear = items.map((g, i) => {
    const unit = g.atUnit ?? 0;
    const stagger = items.slice(0, i).filter((x) => (x.atUnit ?? 0) === unit).length;
    return (starts[unit] ?? 0) + stagger * 36;
  });
  return (
    <div style={{ position: "absolute", right: 56, bottom: 44, width: 520, height: 0 }}>
      {items.map((g, i) => {
        if (frame < appear[i]) return null;
        const exitStart = appear[i] + GLOSSARY_HOLD;
        if (frame >= exitStart + GLOSSARY_SLIDE) return null;
        let x = (1 - clamp01((frame - appear[i]) / GLOSSARY_SLIDE)) * 580;
        if (frame >= exitStart) {
          x = clamp01((frame - exitStart) / GLOSSARY_SLIDE) * 580;
        }
        let y = 0;
        let opacity = 1;
        // 自分より後に現れたブロックの数だけ上に積み上がる。同時表示数（GLOSSARY_MAX）を
        // 超えたら、いちばん古いものが上に抜けながら消える
        for (let k = 1; k <= GLOSSARY_MAX; k++) {
          const nxt = appear[i + k];
          if (nxt !== undefined && frame >= nxt) {
            const p = clamp01((frame - nxt) / GLOSSARY_SLIDE);
            y += p * (GLOSSARY_H + GLOSSARY_GAP);
            if (k === GLOSSARY_MAX) opacity = 1 - p;
          }
        }
        if (opacity <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              right: 0,
              bottom: y,
              width: 520,
              height: GLOSSARY_H,
              transform: `translateX(${x}px)`,
              opacity,
              background: "rgba(6,24,44,0.88)",
              border: "2px solid rgba(140,190,255,0.55)",
              borderRadius: 14,
              padding: "18px 22px",
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>{g.term}</div>
            <div style={{ fontSize: 29, color: INK, lineHeight: 1.5, marginTop: 6, whiteSpace: "pre-line" }}>{g.text}</div>
          </div>
        );
      })}
    </div>
  );
};

/* ---------------- シーン描画（シーン相対フレーム前提） ---------------- */

export const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const def = scene.def;
  if (def.type === "title") return <TitleCard def={def} />;
  if (def.type === "end") return <EndCard def={def} />;
  const frame = useCurrentFrame();
  // 見出しの表示秒数はデータ（headlineSec、省略時は4.2）が決める
  const headlineSec = def.headlineSec ?? 4.2;
  const showHeadline = def.headline && frame < headlineSec * 30;
  // バリアントB＋アニメーション（試作）: 見出しバンド（bottom:260、不透過）は
  // 図解の下部を覆い、単純な上端基準の縮小では図解の上端が肩テロップに詰まる。
  // そこで見出し表示中は、図解レイヤー全体（全高1080）を「安全矩形」へ写像する:
  //   上端 = 肩の下端 + 余白。肩は top:54・padding 12px・fontSize 48 で下端は
  //          y=147（実測一致）。余白 9px を取り y=156 から。
  //   下端 = 見出しバンドの上端。バンドは bottom:260・padding 14/18・fontSize 96
  //          の1行で高さ約170、上端は y=649（実測一致。従来Bの収納先と同じ）。
  // 写像は scale（矩形の高さ/1080）と下方向オフセット（矩形の上端）の組で、
  // 図解のどの部分も肩・バンドのどちらにも被らない。見出しが消えたら、約0.5秒
  // かけて scale とオフセットの両方を ease-out で (1, 0) へ滑らかに戻し、
  // 1フレーム切り替えの「ポップ」を消す。
  // 遷移の開始点は見出し表示の終了（データ側 headlineSec）に追随する機構で、
  // 秒数そのものはデータが決める。遷移時間はプログラム側の表現機構の定数。
  const DIAGRAM_SAFE_TOP = 156; // 肩の下端147 + 余白9
  const DIAGRAM_SAFE_BOTTOM = 649; // 見出しバンド（1行時）の上端
  const DIAGRAM_SAFE_SCALE = (DIAGRAM_SAFE_BOTTOM - DIAGRAM_SAFE_TOP) / 1080; // ≒0.457
  const DIAGRAM_RESTORE_FRAMES = 15; // 約0.5秒（30fps 前提。見出し計算と同じ規約）
  const headlineEndFrame = headlineSec * 30;
  let diagramScale = 1;
  let diagramOffsetY = 0;
  if (def.headline) {
    if (frame < headlineEndFrame) {
      diagramScale = DIAGRAM_SAFE_SCALE;
      diagramOffsetY = DIAGRAM_SAFE_TOP;
    } else if (frame < headlineEndFrame + DIAGRAM_RESTORE_FRAMES) {
      const easeOpts = {
        easing: Easing.out(Easing.cubic),
        extrapolateLeft: "clamp" as const,
        extrapolateRight: "clamp" as const,
      };
      diagramScale = interpolate(
        frame,
        [headlineEndFrame, headlineEndFrame + DIAGRAM_RESTORE_FRAMES],
        [DIAGRAM_SAFE_SCALE, 1],
        easeOpts
      );
      diagramOffsetY = interpolate(
        frame,
        [headlineEndFrame, headlineEndFrame + DIAGRAM_RESTORE_FRAMES],
        [DIAGRAM_SAFE_TOP, 0],
        easeOpts
      );
    }
  }
  // 強調テロップの表示時間もデータ（accentTelop.sec、省略時は1文目+20フレーム）
  const accentUntil =
    def.accentTelop?.sec != null ? def.accentTelop.sec * 30 : (scene.units[0]?.durFrames ?? 0) + 20;
  return (
    <AbsoluteFill>
      {def.shoulder && <Shoulder text={def.shoulder} />}
      {/* 図解レイヤー: 見出しバンドとの分離（バリアントB）のためラッパーで拡縮・移動する。
          肩テロップ・強調テロップ・用語解説・出典クレジットは対象外（従来位置のまま）。 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateY(${diagramOffsetY}px) scale(${diagramScale})`,
          transformOrigin: "50% 0%",
        }}
      >
      {def.type === "hook" && <HookScene scene={scene} />}
      {def.diagram === "sandbox" && <SandboxDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "timeline" && <TimelineDiagram scene={scene} />}
      {def.diagram === "redteam" && <RedTeamDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "split" && <SplitDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "summary-points" && <SummaryDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "hero-number" && <HeroNumberDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "numbers-table" && <NumbersTableDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "steps" && <StepsDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "items" && <ItemsDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "quote" && <QuoteDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "benchmark-table" && <BenchmarkTableDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "benchmark-chart" && <BenchmarkChartDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "code-block" && <CodeBlockDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "delta" && <DeltaDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "stat-grid" && <StatGridDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "spec-list" && <SpecListDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "changelog" && <ChangelogDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "ranking-list" && <RankingListDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "trend-chart" && <TrendChartDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "post-card" && <PostCardDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "relation-map" && <RelationMapDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "scatter" && <ScatterDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "delta-multi" && <DeltaMultiDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "map" && <MapDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "share-stack" && <ShareStackDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "waterfall" && <WaterfallDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "grouped-bars" && <GroupedBarsDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "waffle" && <WaffleDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "profile-card" && <ProfileCardDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "radar" && <RadarDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "quadrant" && <QuadrantDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "venn" && <VennDiagram scene={scene} accent={!!def.accentTelop} />}
      </div>
      {def.accentTelop && frame < accentUntil && (
        // 強調テロップの帯域は肩テロップ直下（top 140〜約250）に固定する。
        // 旧配置（top 190 / 110px）は図解の先頭要素と重なったため、この帯に移し、
        // 図解側も accent 時に開始位置を下げてある（各 Diagram の accent prop 参照）。
        // timeline は円の上端が 274 で干渉しないため図解側は不変。
        <div style={{ position: "absolute", right: 150, top: 140 }}>
          <FadeIn>
            <span style={{ fontSize: 92, fontWeight: 700, color: YELLOW, textShadow: OUTLINE }}>
              {def.accentTelop.text}
            </span>
          </FadeIn>
        </div>
      )}
      {showHeadline && def.headline && <Headline text={def.headline} />}
      <GlossaryOverlay scene={scene} />
      {/* 出典クレジットは、脚本データに credit が書かれていれば左下に表示する。
          出すかどうかはデータが決める（プログラムがデータの有無を無視して
          一律に出さない、という決め方はしない。2026-10-26 データ/プログラム
          分離の原則による）。字幕はそもそもデータに描画指定がないため出ない。 */}
      {def.credit && (
        <div
          style={{
            position: "absolute",
            left: 96,
            bottom: 36,
            fontSize: 26,
            color: "rgba(234,242,251,0.55)",
          }}
        >
          {def.credit}
        </div>
      )}
    </AbsoluteFill>
  );
};
