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

// Load all available Google Fonts at root level
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";
import { loadFont as loadOpenSans } from "@remotion/google-fonts/OpenSans";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadLato } from "@remotion/google-fonts/Lato";
import { loadFont as loadRaleway } from "@remotion/google-fonts/Raleway";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadPlayfairDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadTitanOne } from "@remotion/google-fonts/TitanOne";
import { loadFont as loadBangers } from "@remotion/google-fonts/Bangers";
import { loadFont as loadRighteous } from "@remotion/google-fonts/Righteous";
import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as loadBungee } from "@remotion/google-fonts/Bungee";
import { loadFont as loadLilitaOne } from "@remotion/google-fonts/LilitaOne";
import { loadFont as loadRubik } from "@remotion/google-fonts/Rubik";
import { loadFont as loadNunito } from "@remotion/google-fonts/Nunito";
import { loadFont as loadSourceSans3 } from "@remotion/google-fonts/SourceSans3";
import { loadFont as loadUbuntu } from "@remotion/google-fonts/Ubuntu";

// Load all fonts
// Note: Loading without options to avoid "style [object Object]" errors
// The warnings about too many requests are just warnings and don't prevent rendering
loadInter();
loadRoboto();
loadOpenSans();
loadMontserrat();
loadPoppins();
loadLato();
loadRaleway();
loadOswald();
loadPlayfairDisplay();
loadBebasNeue();
loadTitanOne();
loadBangers();
loadRighteous();
loadFredoka();
loadBungee();
loadLilitaOne();
loadRubik();
loadNunito();
loadSourceSans3();
loadUbuntu();

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

