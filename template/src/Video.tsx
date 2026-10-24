import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Background, BrandBadge, FONT, SceneView } from "./components";
import { LAYOUT, Scene, buildScene } from "./layout";

/** 全シーン連結の一括レンダリング用（従来方式） */
export const NewsVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const inCard = LAYOUT.scenes.some(
    (s) =>
      (s.def.type === "title" || s.def.type === "end") &&
      frame >= s.startFrame &&
      frame < s.startFrame + s.durFrames,
  );
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Background />
      {!inCard && <BrandBadge />}
      {LAYOUT.scenes.map((scene) => (
        <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durFrames} name={scene.id}>
          <SceneView scene={scene} />
        </Sequence>
      ))}
      {LAYOUT.scenes.flatMap((scene) =>
        scene.units.map((u) => (
          <Sequence key={u.file} from={u.startFrameGlobal} durationInFrames={u.durFrames} name={u.file}>
            <Audio src={staticFile(u.file)} />
          </Sequence>
        )),
      )}
    </AbsoluteFill>
  );
};

/** シーン単体レンダリング用。scene はシーン相対フレームで構築される */
export const SceneVideo: React.FC<{ scene: Scene }> = ({ scene }) => {
  const isCard = scene.def.type === "title" || scene.def.type === "end";
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Background />
      {!isCard && <BrandBadge />}
      <SceneView scene={scene} />
      {scene.units.map((u) => (
        <Sequence key={u.file} from={u.startFrame} durationInFrames={u.durFrames} name={u.file}>
          <Audio src={staticFile(u.file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const makeSceneVideo = (compId: string): React.FC => {
  const scene = buildScene(compId);
  const Comp: React.FC = () => <SceneVideo scene={scene} />;
  Comp.displayName = `SceneVideo-${compId}`;
  return Comp;
};
