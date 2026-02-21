import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame } from "remotion";

export type SubtitleStyle =
  | "plain-white"
  | "yellow-bg"
  | "pink-bg"
  | "blue-bg"
  | "red-bg";

export interface TikTokCaptionPage {
  startMs: number;
  durationMs: number;
  tokens: Array<{
    text: string;
    fromMs: number;
    toMs: number;
  }>;
}

export interface CaptionedVideoCompositionProps {
  videoSrc: string;
  pages: TikTokCaptionPage[];
  fps: number;
  stylePreset: SubtitleStyle;
  captionPosition?: "top" | "center" | "bottom";
  fontFamily?: string;
}

const styleMap: Record<
  SubtitleStyle,
  {
    fontSize: number;
    activeColor: string;
    activeBackground?: string;
    bottomOffset: number;
  }
> = {
  "plain-white": {
    fontSize: 60,
    activeColor: "#ffffff",
    activeBackground: "transparent",
    bottomOffset: 140,
  },
  "yellow-bg": {
    fontSize: 60,
    activeColor: "#ffffff",
    activeBackground: "#facc15",
    bottomOffset: 140,
  },
  "pink-bg": {
    fontSize: 60,
    activeColor: "#ffffff",
    activeBackground: "#ec4899",
    bottomOffset: 140,
  },
  "blue-bg": {
    fontSize: 60,
    activeColor: "#ffffff",
    activeBackground: "#3b82f6",
    bottomOffset: 140,
  },
  "red-bg": {
    fontSize: 60,
    activeColor: "#ffffff",
    activeBackground: "#ef4444",
    bottomOffset: 140,
  },
};

export const CaptionedVideoComposition: React.FC<
  CaptionedVideoCompositionProps
> = ({ videoSrc, pages, fps, stylePreset, captionPosition = "bottom", fontFamily }) => {
  const frame = useCurrentFrame();
  const currentMs = (frame / fps) * 1000;
  const activeStyle = styleMap[stylePreset] ?? styleMap["plain-white"];

  const activePage = pages.find((page) => {
    const endMs = page.startMs + page.durationMs;
    return currentMs >= page.startMs && currentMs <= endMs;
  });

  const activeTokenIndex = activePage
    ? activePage.tokens.findIndex(
        (token) => currentMs >= token.fromMs && currentMs <= token.toMs,
      )
    : -1;
  const activeToken =
    activePage && activeTokenIndex >= 0
      ? activePage.tokens[activeTokenIndex]
      : null;
  const karaokeProgress =
    activeToken && activeToken.toMs > activeToken.fromMs
      ? Math.min(
          1,
          Math.max(
            0,
            (currentMs - activeToken.fromMs) / (activeToken.toMs - activeToken.fromMs),
          ),
        )
      : 0;
  const karaokeScale =
    1 + 0.22 * Math.sin(Math.min(1, karaokeProgress) * Math.PI) * (1 - karaokeProgress * 0.15);

  const getPositionStyles = () => {
    switch (captionPosition) {
      case "top":
        return {
          justifyContent: "flex-start" as const,
          alignItems: "center" as const,
          paddingTop: activeStyle.bottomOffset,
          paddingBottom: 0,
          paddingLeft: 48,
          paddingRight: 48,
        };
      case "center":
        return {
          justifyContent: "center" as const,
          alignItems: "center" as const,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 48,
          paddingRight: 48,
        };
      case "bottom":
      default:
        return {
          justifyContent: "flex-end" as const,
          alignItems: "center" as const,
          paddingTop: 0,
          paddingBottom: activeStyle.bottomOffset,
          paddingLeft: 48,
          paddingRight: 48,
        };
    }
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <OffthreadVideo src={videoSrc} />
      {activePage ? (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            ...getPositionStyles(),
          }}
        >
          <div
            style={{
              textAlign: "center",
              fontSize: activeStyle.fontSize,
              fontWeight: 800,
              lineHeight: 1.1,
              textShadow: "0 4px 24px rgba(0, 0, 0, 0.9)",
              WebkitTextStroke: "1px rgba(0,0,0,0.85)",
              fontFamily: fontFamily || "Inter, sans-serif",
            }}
          >
            {activeToken ? (
              <span
                style={{
                  color: activeStyle.activeColor,
                  background: activeStyle.activeBackground,
                  borderRadius: 10,
                  padding: "4px 14px",
                  display: "inline-block",
                  transform: `scale(${karaokeScale})`,
                  transformOrigin: "center center",
                  transition: "transform 40ms linear",
                }}
              >
                {activeToken.text}
              </span>
            ) : null}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
