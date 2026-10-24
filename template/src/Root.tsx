import React from "react";
import { Composition } from "remotion";
import { NewsVideo, makeSceneVideo } from "./Video";
import { COMP_ORDER, FPS, LAYOUT, buildScene } from "./layout";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 全シーン一括（従来方式） */}
      <Composition
        id="NewsVideo"
        component={NewsVideo}
        durationInFrames={LAYOUT.totalFrames}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {/* シーン単体（ランナーが個別に描いて後で連結する） */}
      {COMP_ORDER.map((compId) => {
        const scene = buildScene(compId);
        return (
          <Composition
            key={compId}
            id={compId}
            component={makeSceneVideo(compId)}
            durationInFrames={scene.durFrames}
            fps={FPS}
            width={1920}
            height={1080}
          />
        );
      })}
    </>
  );
};
