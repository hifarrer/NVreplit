/**
 * One-off / occasional: ingest the Single Prompt marketing MP4 into Mux and print the HLS URL.
 *
 * Usage (from repo root):
 *   npx tsx scripts/create-single-prompt-mux-preview.ts
 *
 * Requires MUX_TOKEN_ID and MUX_TOKEN_SECRET in .env
 */
import "dotenv/config";
import Mux from "@mux/mux-node";

const SOURCE_URL = "https://neonvideo.b-cdn.net/FinalVideos/singleprompt.mp4";

async function main() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error("Set MUX_TOKEN_ID and MUX_TOKEN_SECRET in .env");
  }

  const mux = new Mux({ tokenId, tokenSecret });

  console.log("Creating Mux asset from:", SOURCE_URL);
  const asset = await mux.video.assets.create({
    inputs: [{ url: SOURCE_URL }],
    playback_policy: ["public"],
    encoding_tier: "baseline",
    mp4_support: "none",
    normalize_audio: true,
  });

  const initialPlaybackId = asset.playback_ids?.[0]?.id;
  console.log("Asset id:", asset.id);
  console.log("Initial status:", asset.status);
  console.log("Playback id:", initialPlaybackId);

  const maxPolls = 120;
  for (let i = 0; i < maxPolls; i++) {
    const a = await mux.video.assets.retrieve(asset.id);
    const pid = a.playback_ids?.[0]?.id;
    console.log(`Poll ${i + 1}/${maxPolls}: status=${a.status} playbackId=${pid ?? "(none)"}`);

    if (a.status === "ready" && pid) {
      const hls = `https://stream.mux.com/${pid}.m3u8?redundant_streams=true`;
      console.log("\n--- Paste into create-select.tsx (single-prompt videoUrl) ---");
      console.log(hls);
      console.log("--- Or playback ID only ---");
      console.log(pid);
      return;
    }
    if (a.status === "errored") {
      throw new Error(`Mux asset errored: ${JSON.stringify(a.errors?.messages ?? a.errors)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error("Timed out waiting for Mux asset to be ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
