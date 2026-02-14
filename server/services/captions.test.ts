import test from "node:test";
import assert from "node:assert/strict";
import { createTikTokPages, parseAssToCaptions } from "./captions";

const sampleAss = `
[Script Info]
ScriptType: v4.00

[Events]
Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: Marked=0,0:00:00.20,0:00:00.60,Default,,0000,0000,0000,,Using
Dialogue: Marked=0,0:00:00.60,0:00:01.10,Default,,0000,0000,0000,,Remotion
Dialogue: Marked=0,0:00:01.10,0:00:01.80,Default,,0000,0000,0000,,captions
`.trim();

test("parseAssToCaptions converts ASS dialogue rows to Caption shape", () => {
  const captions = parseAssToCaptions(sampleAss);

  assert.equal(captions.length, 3);
  assert.equal(captions[0].text, "Using");
  assert.equal(captions[0].startMs, 200);
  assert.equal(captions[0].endMs, 600);
  assert.equal(captions[1].startMs, 600);
  assert.equal(captions[2].text, "captions");
});

test("createTikTokPages builds grouped pages for karaoke presets", () => {
  const captions = parseAssToCaptions(sampleAss);
  const pages = createTikTokPages({ captions, style: "yellow-bg" });

  assert.ok(pages.length >= 1);
  assert.ok(pages[0].tokens.length >= 1);
  assert.ok(pages[0].durationMs > 0);
});

