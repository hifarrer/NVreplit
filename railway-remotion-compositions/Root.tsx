import React from "react";
import { Composition } from "remotion";
import {
  CaptionedVideoComposition,
  type CaptionedVideoCompositionProps,
  type SubtitleStyle,
} from "./CaptionedVideoComposition";
import {
  TextOverlayComposition,
  type TextOverlayCompositionProps,
} from "./TextOverlayComposition";

const defaultCaptionProps: CaptionedVideoCompositionProps = {
  videoSrc: "",
  pages: [],
  fps: 30,
  stylePreset: "plain-white" as SubtitleStyle,
  captionPosition: "bottom",
};

const defaultTextOverlayProps: TextOverlayCompositionProps = {
  videoSrc: "",
  textLines: [],
  textPosition: "center",
  fps: 30,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition<CaptionedVideoCompositionProps>
        id="CaptionedVideo"
        component={CaptionedVideoComposition}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultCaptionProps}
      />
      <Composition<TextOverlayCompositionProps>
        id="TextOverlay"
        component={TextOverlayComposition}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultTextOverlayProps}
      />
    </>
  );
};
