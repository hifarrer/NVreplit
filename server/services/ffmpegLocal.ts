import { spawn, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

const UPLOAD_FOLDER = path.join(os.tmpdir(), "ffmpeg-uploads");
const OUTPUT_FOLDER = path.join(os.tmpdir(), "ffmpeg-outputs");

fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });

export { OUTPUT_FOLDER };

function cleanupFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[FFMPEG-LOCAL] Cleaned up: ${filePath}`);
    }
  } catch (e) {
    console.error(`[FFMPEG-LOCAL] Cleanup failed for ${filePath}:`, e);
  }
}

async function downloadFile(url: string, outputPath: string, label = "file"): Promise<void> {
  console.log(`[FFMPEG-LOCAL] Downloading ${label} from: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${label}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`[FFMPEG-LOCAL] Downloaded ${label}: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
}

interface VideoProperties {
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioSampleRate: string | null;
  audioChannels: number | null;
  pixelFormat: string | null;
}

async function getVideoProperties(videoPath: string): Promise<VideoProperties> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_streams",
    "-show_format",
    videoPath,
  ], { timeout: 30_000 });

  const data = JSON.parse(stdout);
  const streams: any[] = data.streams ?? [];

  const props: VideoProperties = {
    width: null, height: null, fps: null,
    videoCodec: null, audioCodec: null,
    audioSampleRate: null, audioChannels: null,
    pixelFormat: null,
  };

  for (const s of streams) {
    if (s.codec_type === "video") {
      props.width = s.width ?? null;
      props.height = s.height ?? null;
      props.videoCodec = s.codec_name ?? null;
      props.pixelFormat = s.pix_fmt ?? null;
      const fpsStr: string = s.r_frame_rate ?? "0/1";
      if (fpsStr.includes("/")) {
        const [num, den] = fpsStr.split("/").map(Number);
        if (den > 0) props.fps = Math.round((num / den) * 100) / 100;
      }
    } else if (s.codec_type === "audio") {
      props.audioCodec = s.codec_name ?? null;
      props.audioSampleRate = s.sample_rate ?? null;
      props.audioChannels = s.channels ?? null;
    }
  }
  return props;
}

function videosAreIdentical(allProps: VideoProperties[]): boolean {
  if (allProps.length < 2) return true;
  const first = allProps[0];
  return allProps.slice(1).every(p =>
    p.width === first.width &&
    p.height === first.height &&
    p.fps === first.fps &&
    p.videoCodec === first.videoCodec &&
    p.pixelFormat === first.pixelFormat &&
    p.audioCodec === first.audioCodec &&
    p.audioSampleRate === first.audioSampleRate &&
    p.audioChannels === first.audioChannels
  );
}

function runFfmpeg(args: string[], timeoutMs = 1800_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function hasAudioStream(videoPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet", "-select_streams", "a",
      "-show_entries", "stream=index",
      "-of", "csv=p=0",
      videoPath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function normalizeVideo(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number,
): Promise<void> {
  const args = [
    "-i", inputPath,
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p`,
    "-c:v", "libx264",
    "-c:a", "aac",
    "-ar", "48000",
    "-ac", "2",
    "-preset", "veryfast",
    "-crf", "23",
    "-g", "30",
    "-keyint_min", "30",
    "-sc_threshold", "0",
    "-video_track_timescale", "30000",
    "-y",
    outputPath,
  ];
  await runFfmpeg(args, 300_000);
}

export async function localMergeVideos(
  videoUrls: string[],
  audioUrl?: string,
  subtitleUrl?: string,
  watermarkUrl?: string,
  dimensions?: string,
): Promise<{ download_url: string; filename: string }> {
  const requestId = randomUUID();
  const downloadedVideos: string[] = [];
  const normalizedVideos: string[] = [];
  let audioPath: string | undefined;
  let subtitlePath: string | undefined;
  let watermarkPath: string | undefined;
  let outputPath = path.join(OUTPUT_FOLDER, `${requestId}_merged.mp4`);
  let outputFilename = `${requestId}_merged.mp4`;

  try {
    // --- Download all inputs ---
    const downloadPromises = videoUrls.map(async (url, i) => {
      const p = path.join(UPLOAD_FOLDER, `${requestId}_v${i}.mp4`);
      await downloadFile(url, p, `video ${i + 1}`);
      return p;
    });
    const downloaded = await Promise.all(downloadPromises);
    downloadedVideos.push(...downloaded);

    if (audioUrl) {
      audioPath = path.join(UPLOAD_FOLDER, `${requestId}_audio.mp3`);
      await downloadFile(audioUrl, audioPath, "audio");
    }
    if (subtitleUrl) {
      subtitlePath = path.join(UPLOAD_FOLDER, `${requestId}_subtitle.ass`);
      await downloadFile(subtitleUrl, subtitlePath, "subtitle");
    }
    if (watermarkUrl) {
      watermarkPath = path.join(UPLOAD_FOLDER, `${requestId}_watermark.png`);
      await downloadFile(watermarkUrl, watermarkPath, "watermark");
    }

    // --- Analyze videos ---
    console.log("[FFMPEG-LOCAL] Analyzing video properties...");
    const allProps = await Promise.all(downloadedVideos.map(getVideoProperties));
    for (let i = 0; i < allProps.length; i++) {
      const p = allProps[i];
      console.log(`[FFMPEG-LOCAL] Video ${i + 1}: ${p.width}x${p.height} @ ${p.fps}fps, codec=${p.videoCodec}, audio=${p.audioCodec}`);
    }

    let videosToMerge: string[];
    const skipNormalization = !dimensions && videosAreIdentical(allProps);

    if (skipNormalization) {
      console.log("[FFMPEG-LOCAL] All videos identical — skipping normalization");
      videosToMerge = downloadedVideos;
    } else {
      console.log("[FFMPEG-LOCAL] Normalizing videos...");
      let targetW: number;
      let targetH: number;

      if (dimensions) {
        const parts = dimensions.split("x");
        if (parts.length !== 2) throw new Error("Invalid dimensions format. Use WIDTHxHEIGHT (e.g. 1280x720)");
        targetW = parseInt(parts[0], 10);
        targetH = parseInt(parts[1], 10);
        if (isNaN(targetW) || isNaN(targetH)) throw new Error("Invalid dimensions format");
      } else {
        targetW = allProps[0].width ?? 1920;
        targetH = allProps[0].height ?? 1080;
      }

      console.log(`[FFMPEG-LOCAL] Target dimensions: ${targetW}x${targetH}`);
      for (let i = 0; i < downloadedVideos.length; i++) {
        const normPath = path.join(UPLOAD_FOLDER, `${requestId}_v${i}_norm.mp4`);
        console.log(`[FFMPEG-LOCAL] Normalizing video ${i + 1}/${downloadedVideos.length}...`);
        await normalizeVideo(downloadedVideos[i], normPath, targetW, targetH);
        normalizedVideos.push(normPath);
      }
      videosToMerge = normalizedVideos;
    }

    // --- Build concat command ---
    const numVideos = videosToMerge.length;
    const inputs: string[] = [];
    for (const vp of videosToMerge) {
      inputs.push("-i", vp);
    }

    const videoConcat = Array.from({ length: numVideos }, (_, i) => `[${i}:v:0]`).join("");

    const audioIndicesWithAudio: number[] = [];
    for (let i = 0; i < numVideos; i++) {
      if (await hasAudioStream(videosToMerge[i])) audioIndicesWithAudio.push(i);
    }

    let ffmpegArgs: string[];

    if (audioPath) {
      const filterComplex = `${videoConcat}concat=n=${numVideos}:v=1:a=0[outv]`;
      ffmpegArgs = [
        ...inputs,
        "-i", audioPath,
        "-filter_complex", filterComplex,
        "-map", "[outv]",
        "-map", `${numVideos}:a:0`,
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "veryfast", "-crf", "23",
        "-b:a", "192k",
        "-y", outputPath,
      ];
    } else if (audioIndicesWithAudio.length > 0) {
      const audioConcat = audioIndicesWithAudio.map(i => `[${i}:a:0]`).join("");
      const filterComplex = `${videoConcat}concat=n=${numVideos}:v=1:a=0[outv];${audioConcat}concat=n=${audioIndicesWithAudio.length}:v=0:a=1[outa]`;
      ffmpegArgs = [
        ...inputs,
        "-filter_complex", filterComplex,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264", "-c:a", "aac",
        "-preset", "veryfast", "-crf", "23",
        "-y", outputPath,
      ];
    } else {
      const filterComplex = `${videoConcat}concat=n=${numVideos}:v=1:a=0[outv]`;
      ffmpegArgs = [
        ...inputs,
        "-filter_complex", filterComplex,
        "-map", "[outv]",
        "-c:v", "libx264",
        "-preset", "veryfast", "-crf", "23",
        "-y", outputPath,
      ];
    }

    console.log(`[FFMPEG-LOCAL] Merging ${numVideos} videos...`);
    await runFfmpeg(ffmpegArgs);
    console.log("[FFMPEG-LOCAL] Merge complete");

    // --- Subtitles ---
    if (subtitlePath) {
      const subtitledPath = path.join(OUTPUT_FOLDER, `${requestId}_subtitled.mp4`);
      console.log("[FFMPEG-LOCAL] Burning subtitles...");
      await runFfmpeg([
        "-i", outputPath,
        "-vf", `subtitles=${subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:")}`,
        "-c:a", "copy",
        "-y", subtitledPath,
      ]);
      cleanupFile(outputPath);
      outputPath = subtitledPath;
      outputFilename = `${requestId}_subtitled.mp4`;
      console.log("[FFMPEG-LOCAL] Subtitles burned");
    }

    // --- Watermark ---
    if (watermarkPath) {
      const watermarkedPath = path.join(OUTPUT_FOLDER, `${requestId}_watermarked.mp4`);
      const wmFilter = "[1:v]scale=iw*0.3:-1[watermark];[0:v][watermark]overlay=main_w-overlay_w-20:main_h-overlay_h-20";
      console.log("[FFMPEG-LOCAL] Adding watermark...");
      await runFfmpeg([
        "-i", outputPath,
        "-i", watermarkPath,
        "-filter_complex", wmFilter,
        "-c:a", "copy",
        "-y", watermarkedPath,
      ]);
      cleanupFile(outputPath);
      outputPath = watermarkedPath;
      outputFilename = `${requestId}_watermarked.mp4`;
      console.log("[FFMPEG-LOCAL] Watermark added");
    }

    // Cleanup temp inputs
    for (const p of downloadedVideos) cleanupFile(p);
    for (const p of normalizedVideos) cleanupFile(p);
    if (audioPath) cleanupFile(audioPath);
    if (subtitlePath) cleanupFile(subtitlePath);
    if (watermarkPath) cleanupFile(watermarkPath);

    const localDownloadUrl = `/api/ffmpeg-local/download/${outputFilename}`;
    console.log(`[FFMPEG-LOCAL] Output ready: ${outputFilename} (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB)`);

    return { download_url: localDownloadUrl, filename: outputFilename };

  } catch (err) {
    // Cleanup everything on error
    for (const p of downloadedVideos) cleanupFile(p);
    for (const p of normalizedVideos) cleanupFile(p);
    if (audioPath) cleanupFile(audioPath);
    if (subtitlePath) cleanupFile(subtitlePath);
    if (watermarkPath) cleanupFile(watermarkPath);
    if (fs.existsSync(outputPath)) cleanupFile(outputPath);
    throw err;
  }
}

/**
 * Periodically clean up old output files (older than 1 hour)
 */
export function startOutputCleanupJob(intervalMs = 15 * 60 * 1000) {
  setInterval(() => {
    try {
      const files = fs.readdirSync(OUTPUT_FOLDER);
      const now = Date.now();
      for (const file of files) {
        const fullPath = path.join(OUTPUT_FOLDER, file);
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > 60 * 60 * 1000) {
          cleanupFile(fullPath);
        }
      }
    } catch (e) {
      console.error("[FFMPEG-LOCAL] Cleanup job error:", e);
    }
  }, intervalMs);
}
