import React from "react";
import { AbsoluteFill, OffthreadVideo, useCurrentFrame } from "remotion";

export interface TextOverlayCompositionProps {
  videoSrc: string;
  textLines: Array<{
    text: string;
    startTime: number;
    duration: number;
  }>;
  textPosition: "top" | "center" | "bottom";
  fps: number;
  fontFamily?: string;
}

export const TextOverlayComposition: React.FC<TextOverlayCompositionProps> = ({
  videoSrc,
  textLines,
  textPosition,
  fps,
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const currentTime = frame / fps;

  const activeLine = textLines.find(
    (line) =>
      currentTime >= line.startTime &&
      currentTime < line.startTime + line.duration
  );

  const positionStyles: React.CSSProperties = {
    justifyContent:
      textPosition === "top"
        ? "flex-start"
        : textPosition === "center"
        ? "center"
        : "flex-end",
    alignItems: "center",
    paddingLeft: 48,
    paddingRight: 48,
    ...(textPosition === "top" && { paddingTop: 140 }),
    ...(textPosition === "bottom" && { paddingBottom: 140 }),
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <OffthreadVideo src={videoSrc} />
      {activeLine && (
        <AbsoluteFill style={positionStyles}>
          <div
            style={{
              textAlign: "center",
              fontSize: 60,
              fontWeight: 800,
              lineHeight: 1.1,
              textShadow: "0 4px 24px rgba(0, 0, 0, 0.9)",
              WebkitTextStroke: "1px rgba(0,0,0,0.85)",
              color: "#ffffff",
              background: "transparent",
              borderRadius: 10,
              padding: "4px 14px",
              display: "inline-block",
              fontFamily: fontFamily || "Inter, sans-serif",
            }}
          >
            {activeLine.text}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
