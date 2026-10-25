import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Scene, SceneDef } from "./layout";

// Windows でも崩れないよう游ゴシック/メイリオをフォールバックに含める
export const FONT =
  "'Noto Sans CJK JP', 'Noto Sans JP', 'Yu Gothic UI', 'Yu Gothic', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif";
export const THEME = "#0f62b4"; // テーマ色: 青
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
    {/* 下部の字幕帯グラデーション */}
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

export const BrandBadge: React.FC = () => (
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
    AI NEWS
  </div>
);

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
        bottom: 330,
        opacity,
        transform: `translateX(${interpolate(s, [0, 1], [-40, 0])}px)`,
      }}
    >
      <div style={{ width: 14, height: 118, background: THEME, position: "absolute", left: -34, top: 6 }} />
      <div style={{ fontSize: 96, fontWeight: 700, color: "#fff", textShadow: OUTLINE, letterSpacing: 1 }}>{text}</div>
    </div>
  );
};

export const SourceCredit: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      left: 96,
      bottom: 36,
      fontSize: 32,
      color: "rgba(234,242,251,0.9)",
      textShadow: "0 2px 8px rgba(0,0,0,0.8)",
    }}
  >
    {text}
  </div>
);

/** シーン内（相対フレーム）で字幕を表示する */
export const Subtitles: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  for (const u of scene.units) {
    const rel = u.startFrame; // シーン相対
    if (frame >= rel && frame < rel + u.durFrames) {
      const uf = frame - rel;
      for (const c of u.chunks) {
        if (uf >= c.startFrame && uf < c.startFrame + c.durFrames) {
          return (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 92,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  maxWidth: 1520,
                  fontSize: 72,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  color: "#fff",
                  textAlign: "center",
                  textShadow: OUTLINE,
                }}
              >
                {c.text}
              </div>
            </div>
          );
        }
      }
    }
  }
  return null;
};

export const FadeIn: React.FC<{ delay?: number; children: React.ReactNode; y?: number }> = ({
  delay = 0,
  children,
  y = 16,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ty = interpolate(frame, [delay, delay + 12], [y, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ opacity, transform: `translateY(${ty}px)` }}>{children}</div>;
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
  const step2 = scene.units[1] ? scene.units[1].startFrame : 0;
  const step3 = scene.units[2] ? scene.units[2].startFrame : 0;
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
  const nodes = events.map((ev, i) => {
    // atUnit: その文の開始で表示 / null: このシーンでは表示しない / 省略時: 同番号の文
    const atUnit = ev.atUnit === undefined ? i : ev.atUnit;
    const at =
      atUnit === null
        ? Number.POSITIVE_INFINITY
        : scene.units[atUnit]
          ? scene.units[atUnit].startFrame
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
  const step2 = scene.units[1] ? scene.units[1].startFrame : 0;
  const step3 = scene.units[2] ? scene.units[2].startFrame : 0;
  return (
    <div style={{ position: "absolute", left: 160, top: accent ? 270 : 235, width: 1600, display: "flex", alignItems: "center", gap: 30 }}>
      <FadeIn>
        <div style={{ ...boxStyle, width: 430, padding: "30px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 42, fontWeight: 700, color: "#ffb3b3" }}>{d.attackerTitle ?? "攻撃役"}</div>
          <div style={{ fontSize: 38, color: INK, marginTop: 10, lineHeight: 1.5, whiteSpace: "pre-line" }}>
            {d.attackerText ?? ""}
          </div>
        </div>
      </FadeIn>
      {frame >= step2 && (
        <FadeIn>
          <div style={{ fontSize: 84, color: YELLOW, fontWeight: 700 }}>➜</div>
        </FadeIn>
      )}
      {frame >= step2 && (
        <FadeIn>
          <div style={{ ...boxStyle, width: 400, padding: "30px 28px", textAlign: "center", borderColor: THEME }}>
            <div style={{ fontSize: 42, fontWeight: 700, color: "#9fc6ff" }}>{d.middleTitle ?? "🛡 境界・監視"}</div>
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
    <div style={{ position: "absolute", left: 210, top: accent ? 265 : 225, width: 1500, display: "flex", gap: 44 }}>
      <FadeIn>
        <div style={{ ...boxStyle, width: 700, padding: "34px 38px", opacity: 0.85 }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: "#fff" }}>
            {left.title} <span style={{ color: "#ff7b7b", fontSize: 56 }}>{left.mark ?? "✕"}</span>
          </div>
          <div style={{ fontSize: 38, color: INK, marginTop: 14, lineHeight: 1.55, whiteSpace: "pre-line" }}>{left.text ?? ""}</div>
        </div>
      </FadeIn>
      <FadeIn delay={14}>
        <div style={{ ...boxStyle, width: 700, padding: "34px 38px", borderColor: THEME, background: "rgba(15,98,180,0.28)" }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: "#fff" }}>
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
  const items = scene.def.diagramData?.points ?? [];
  const starts = scene.units.map((u) => u.startFrame);
  return (
    <div style={{ position: "absolute", left: 210, top: accent ? 280 : 250, width: 1500 }}>
      {items.map((t, i) => {
        const at = i === 0 ? 0 : i === 1 ? starts[0] ?? 99999 : starts[1] ?? 99999;
        return (
          <div key={i} style={{ marginBottom: 30, minHeight: 62 }}>
            {frame >= at && (
              <FadeIn>
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: "50%",
                      background: THEME,
                      color: "#fff",
                      fontSize: 36,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 46, fontWeight: 700, color: "#fff", textShadow: OUTLINE }}>{t}</div>
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
  const showSecond = scene.units[1] ? frame >= scene.units[1].startFrame : false;
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
  const { summary, sources } = def.endCard ?? { summary: [] as string[], sources: [] };
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
              <React.Fragment key={i}>
                {i > 0 && <br />}
                ・{line}
              </React.Fragment>
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

/* ---------------- シーン描画（シーン相対フレーム前提） ---------------- */

export const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const def = scene.def;
  if (def.type === "title") return <TitleCard def={def} />;
  if (def.type === "end") return <EndCard def={def} />;
  const frame = useCurrentFrame();
  const showHeadline = def.headline && frame < 4.2 * 30;
  return (
    <AbsoluteFill>
      {def.shoulder && <Shoulder text={def.shoulder} />}
      {def.type === "hook" && <HookScene scene={scene} />}
      {def.diagram === "sandbox" && <SandboxDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "timeline" && <TimelineDiagram scene={scene} />}
      {def.diagram === "redteam" && <RedTeamDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "split" && <SplitDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.diagram === "summary-points" && <SummaryDiagram scene={scene} accent={!!def.accentTelop} />}
      {def.accentTelop && frame < (scene.units[0]?.durFrames ?? 0) + 20 && (
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
      {def.credit && <SourceCredit text={def.credit} />}
      <Subtitles scene={scene} />
    </AbsoluteFill>
  );
};
