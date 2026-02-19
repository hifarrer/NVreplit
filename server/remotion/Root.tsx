import React from "react";
import { Composition, registerRoot } from "remotion";
import {
  CaptionedVideoComposition,
  type CaptionedVideoCompositionProps,
} from "./CaptionedVideoComposition";
import {
  TextOverlayComposition,
  type TextOverlayCompositionProps,
} from "./TextOverlayComposition";
import type { SubtitleStyle } from "@shared/subtitleStyles";

// Do not import @remotion/google-fonts here - the Remotion bundler resolves from
// server/remotion and can fail to find that package on some environments (e.g. Replit).
// Compositions use fontFamily with a fallback (e.g. "Inter, sans-serif") so system
// fonts are used when Google Fonts are not loaded.

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

const RemotionRoot: React.FC = () => {
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

registerRoot(RemotionRoot);

