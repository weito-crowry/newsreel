import React from "react";
import {
  AbsoluteFill,
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
  const left = d.left ?? { title: "", mark: "✕", text: "" };
  const right = d.right ?? { title: "", mark: "○", text: "" };
  return (
    <div style={{ position: "absolute", left: 210, top: accent ? 265 : 225, width: 1500, display: "flex", alignItems: "stretch", gap: 44 }}>
      <FadeIn>
        <div style={{ ...boxStyle, width: 700, height: "100%", boxSizing: "border-box", padding: "34px 38px", opacity: 0.85 }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: "#fff", whiteSpace: "pre-line" }}>
            {left.title} <span style={{ color: "#ff7b7b", fontSize: 56 }}>{left.mark ?? "✕"}</span>
          </div>
          <div style={{ fontSize: 38, color: INK, marginTop: 14, lineHeight: 1.55, whiteSpace: "pre-line" }}>{left.text ?? ""}</div>
        </div>
      </FadeIn>
      <FadeIn>
        <div style={{ ...boxStyle, width: 700, height: "100%", boxSizing: "border-box", padding: "34px 38px", borderColor: THEME, background: "rgba(15,98,180,0.28)" }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: "#fff", whiteSpace: "pre-line" }}>
            {right.title} <span style={{ color: "#7ddb8a", fontSize: 56 }}>{right.mark ?? "○"}</span>
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
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", left: 210, top: 620, width: 1500 }}>
          <FadeIn delay={10}>
            <div style={{ fontSize: 40, fontWeight: 700, color: "#9fc6ff" }}>出典</div>
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
  const showHeadline = def.headline && frame < (def.headlineSec ?? 4.2) * 30;
  // 強調テロップの表示時間もデータ（accentTelop.sec、省略時は1文目+20フレーム）
  const accentUntil =
    def.accentTelop?.sec != null ? def.accentTelop.sec * 30 : (scene.units[0]?.durFrames ?? 0) + 20;
  return (
    <AbsoluteFill>
      {def.shoulder && <Shoulder text={def.shoulder} />}
      {def.type === "hook" && <HookScene scene={scene} />}
      {def.diagram === "sandbox" && <SandboxDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "timeline" && <TimelineDiagram scene={scene} />}
      {def.diagram === "redteam" && <RedTeamDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "split" && <SplitDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "summary-points" && <SummaryDiagram scene={scene} accent={!!def.accentTelop} />}
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
