import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { registerApiV1Routes } from "./api-v1";
import { spawn } from "child_process";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs";
import { Readable } from "stream";
import sharp from "sharp";
import { storage } from "./storage";
import { insertProjectSchema, insertGenerationLogSchema, insertUserSchema, insertSavedCharacterSchema, insertPlanSchema, insertReferralSchema, type Plan, type InsertPlan, type Project } from "@shared/schema";
import {
  STORY_DEFAULT_NARRATOR_VOICE,
  STORY_DEFAULT_CHARACTER_VOICE_POOL,
  STORY_DURATION_MAX,
  STORY_DURATION_MIN,
  STORY_VIDEO_CREDITS_PER_30_SECONDS,
  getStoryVideoGenerationCredits,
} from "@shared/storyConstants";
import { defaultSubtitleStyle, isSubtitleStyle } from "@shared/subtitleStyles";
import { defaultGoogleFont, isGoogleFont } from "@shared/googleFonts";
import {
  allPurposeMergeVideoDimensions,
  allPurposeUsePortraitOutro,
  isAllPurposeAspectRatio,
} from "@shared/allPurposeAspect";
import { z } from "zod";
import { generateLyrics, generateLyricsWithTitle, generateSongTitle, generateScenePrompts, generateInstrumentalScenePrompts, generateLyricVideoScenePrompts, splitLyricsIntoSections, openai, transcribeAudio, generateStoryScript, generateAllPurposeScenePrompts } from "./services/openai";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { generateSongWithElevenLabs } from "./services/elevenlabs";
import { generateSongWithMinimax, generateSingleSong, calculateVideoSegments, generateInstrumentalSong } from "./services/minimax";
import { generateSong as generateSongWithKie, getTimestampedLyrics, convertTimestampedLyricsToASS, storeSubtitleFile } from "./services/kie";
import { nanoid } from "nanoid";
import { generateCharacterImage, generateCharacterImages, generateCharacterImageToImage, generateSceneImages, generateSingleSceneImage, generateSceneImagesFromText, generateAllPurposeWan27TextToImageMany, generateAlbumCoverSeedreamV5Lite, generateAiImageEdit, collectStoryCharacterReferenceImageUrls } from "./services/fal";
import { generateAllVideoSegments, generateAllVideoSegmentsDynamic, enhanceImageHyperReal, generateVideoSegment, generateInfinitetalkMultiVideoSegment, generateImageFromText, generateVideoFromImage, generateVideoFromImageLoop, generateVideoFromImageTransition, generateStoryAudio, generateAllPurposeVideoClip, generateMotionControlVideo, generatePixverseSwapVideo, generateLucyRestyleVideo, editImageNanoBanana2, generateSceneGuidedVideoClip, type PixverseSwapMode, type MotionControlKlingTier } from "./services/wavespeed";
import { splitAudio, splitAudioByParts, mergeVideos, pictureInPicture, getWatermarkUrl, getLastFrameImage, getFirstFrameImage, videoLoop, trimVideo, youtubeToMp4, extractAudioMp3, convertToTiktokPortrait, getVideoAspectFromUrl } from "./services/ffmpeg";
import { VideoQueueService } from "./services/videoQueue";
import { downloadAndStoreImage } from "./services/imageStorage";
import { resolveUrlWithImageKitFallback } from "./services/imagekit";
import { isBunnyConfigured, uploadToBunnyStorage, uploadCharacterImage, uploadSceneImage, uploadSongAudio, uploadSongCover, isBunnyUrl, uploadAudio, isBunnyStreamConfigured, fetchVideoToBunnyStream, getBunnyStreamThumbnailUrl, getBunnyStreamEmbedUrl, deleteBunnyFileByPublicUrlIfConfigured } from "./services/bunny";
import { emailService } from "./services/email";
import { createMuxAssetForVideo } from "./services/muxJobs";
import { listStoryVoiceOptions } from "./services/storyVoices";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { checkProfanity, getCategoryMessage, validateCharacterGenerationPrompt } from "./profanity-filter";
import { getJWKS, initializeOAuthKeys } from "./services/oauth";
import { resolveLoopVideoTheme } from "./services/loopVideoThemes";
import { lookupCountryFromIp } from "./services/ipGeo";

// Content moderation API for user-uploaded images
const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;

/** Free users can have at most this many songs in their library; paid users have no limit. */
const FREE_USER_SONG_LIBRARY_LIMIT = 10;
const YOUTUBE_TO_MP4_CACHE_KEY = "youtube_to_mp4_cache_v1";
const YOUTUBE_TO_MP4_CACHE_MAX_ENTRIES = 1000;

type YoutubeToMp4CacheEntry = {
  youtubeUrl: string;
  videoId: string;
  downloadUrl: string;
  title?: string;
  thumbnailUrl?: string;
  createdAt: string;
  lastUsedAt: string;
};

function normalizeYoutubeUrl(rawUrl: string): string {
  return rawUrl.trim();
}

function extractYoutubeVideoId(youtubeUrl: string): string | null {
  const trimmed = youtubeUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
      return id || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/")[2];
        return id || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizeYoutubeToMp4Cache(raw: string | null): Record<string, YoutubeToMp4CacheEntry> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<YoutubeToMp4CacheEntry>>;
    const normalized: Record<string, YoutubeToMp4CacheEntry> = {};
    for (const [videoId, value] of Object.entries(parsed)) {
      if (!value || typeof value.downloadUrl !== "string" || !value.downloadUrl.trim()) continue;
      normalized[videoId] = {
        youtubeUrl: typeof value.youtubeUrl === "string" ? value.youtubeUrl : "",
        videoId: typeof value.videoId === "string" && value.videoId ? value.videoId : videoId,
        downloadUrl: value.downloadUrl,
        title: typeof value.title === "string" ? value.title : undefined,
        thumbnailUrl: typeof value.thumbnailUrl === "string" ? value.thumbnailUrl : undefined,
        createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
        lastUsedAt: typeof value.lastUsedAt === "string" ? value.lastUsedAt : new Date().toISOString(),
      };
    }
    return normalized;
  } catch (error) {
    console.warn("[YOUTUBE-TO-MP4] Failed to parse cache, resetting:", error);
    return {};
  }
}

function trimYoutubeToMp4Cache(cache: Record<string, YoutubeToMp4CacheEntry>): Record<string, YoutubeToMp4CacheEntry> {
  const entries = Object.entries(cache);
  if (entries.length <= YOUTUBE_TO_MP4_CACHE_MAX_ENTRIES) {
    return cache;
  }
  entries.sort(
    (a, b) => new Date(b[1].lastUsedAt).getTime() - new Date(a[1].lastUsedAt).getTime(),
  );
  return Object.fromEntries(entries.slice(0, YOUTUBE_TO_MP4_CACHE_MAX_ENTRIES));
}

async function isUsableVideoUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-1" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return false;
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType) return true;
    return (
      contentType.includes("video/") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("binary/")
    );
  } catch (error) {
    console.warn("[YOUTUBE-TO-MP4] Cached URL validation failed:", error);
    return false;
  }
}

function getClientIpAddress(req: any): string | null {
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const cfConnectingIp = req.headers["cf-connecting-ip"];
  const directIp = req.ip || req.socket?.remoteAddress || null;

  const candidate =
    (typeof cfConnectingIp === "string" && cfConnectingIp.trim()) ||
    (typeof realIp === "string" && realIp.trim()) ||
    (typeof forwardedFor === "string" && forwardedFor.split(",")[0]?.trim()) ||
    (typeof directIp === "string" && directIp.trim()) ||
    null;

  if (!candidate) return null;
  return candidate.startsWith("::ffff:") ? candidate.replace("::ffff:", "") : candidate;
}

function parseUserAgent(req: any): { userAgent: string | null; deviceType: string | null; browser: string | null } {
  const rawUserAgent = req.headers["user-agent"];
  const ua = typeof rawUserAgent === "string" ? rawUserAgent : "";
  const lower = ua.toLowerCase();

  let deviceType: string | null = null;
  if (lower.includes("iphone")) {
    deviceType = "iPhone";
  } else if (lower.includes("ipad")) {
    deviceType = "iPad";
  } else if (lower.includes("android")) {
    deviceType = "Android";
  } else if (lower.includes("windows")) {
    deviceType = "Windows PC";
  } else if (lower.includes("macintosh") || lower.includes("mac os x")) {
    deviceType = "Mac";
  } else if (lower.includes("linux")) {
    deviceType = "Linux";
  } else if (lower.includes("cros")) {
    deviceType = "Chromebook";
  }

  let browser: string | null = null;
  if (lower.includes("edg/")) {
    browser = "Edge";
  } else if (lower.includes("opr/") || lower.includes("opera")) {
    browser = "Opera";
  } else if (lower.includes("firefox/")) {
    browser = "Firefox";
  } else if (lower.includes("samsungbrowser/")) {
    browser = "Samsung Internet";
  } else if (lower.includes("crios/") || (lower.includes("chrome/") && !lower.includes("edg/") && !lower.includes("opr/"))) {
    browser = "Chrome";
  } else if (lower.includes("safari/") && !lower.includes("chrome/") && !lower.includes("crios/")) {
    browser = "Safari";
  }

  return {
    userAgent: ua || null,
    deviceType,
    browser,
  };
}

async function getRequestUserMetadataAsync(req: any): Promise<{
  ipAddress: string | null;
  location: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
}> {
  const uaData = parseUserAgent(req);
  const ipAddress = getClientIpAddress(req);
  const country = await lookupCountryFromIp(ipAddress ?? "");
  return {
    ipAddress,
    location: country,
    userAgent: uaData.userAgent,
    deviceType: uaData.deviceType,
    browser: uaData.browser,
  };
}

function inferCharacterVocalGender(
  character: string | null | undefined
): "female" | "male" | null {
  if (!character) return null;
  const text = character.toLowerCase();

  const femaleIndicators = [
    "female",
    "woman",
    "girl",
    "lady",
    "queen",
    "princess",
    "goddess",
    "she ",
    " she,",
    " she.",
    " her ",
    " her,",
    " her.",
  ];

  const maleIndicators = [
    "male",
    "man",
    "boy",
    "king",
    "prince",
    "wizard",
    "he ",
    " he,",
    " he.",
    " him ",
    " him,",
    " him.",
  ];

  const hasFemale = femaleIndicators.some((w) => text.includes(w));
  const hasMale = maleIndicators.some((w) => text.includes(w));

  if (hasFemale && !hasMale) return "female";
  if (hasMale && !hasFemale) return "male";
  return null;
}

interface ContentModerationResult {
  harassment?: boolean;
  hate?: boolean;
  sexual?: boolean;
  "sexual/minors"?: boolean;
  violence?: boolean;
}

const CONTENT_MODERATOR_IMAGE_ENDPOINT =
  "https://api.wavespeed.ai/api/v3/wavespeed-ai/content-moderator/image";
const CONTENT_MODERATOR_POLL_BASE = "https://api.wavespeed.ai/api/v3/predictions";

/** Task shape returned by content-moderator (may be wrapped in [] or { data }). */
type ContentModerationTask = {
  id?: string;
  model?: string;
  outputs?: unknown;
  has_nsfw_contents?: boolean[] | null;
  status?: string;
  error?: string;
  code?: number;
  urls?: { get?: string };
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * WaveSpeed may return `{ code, message, data }`, a top-level array `[{ id, status, outputs, ... }]`,
 * or a bare task object. This extracts the task payload in all cases.
 */
function extractContentModerationTask(raw: unknown): ContentModerationTask | null {
  if (raw == null) {
    return null;
  }
  if (Array.isArray(raw) && raw.length > 0 && isRecord(raw[0])) {
    return raw[0] as ContentModerationTask;
  }
  if (isRecord(raw) && "data" in raw) {
    const d = (raw as { data: unknown }).data;
    if (isRecord(d)) {
      return d as ContentModerationTask;
    }
  }
  if (isRecord(raw) && (raw.id != null || raw.status != null || raw.outputs != null)) {
    return raw as ContentModerationTask;
  }
  return null;
}


function collectCategoryViolations(moderationResult: ContentModerationResult): string[] {
  const violations: string[] = [];
  if (moderationResult.harassment) violations.push("harassment");
  if (moderationResult.hate) violations.push("hate");
  if (moderationResult.sexual) violations.push("sexual content");
  if (moderationResult["sexual/minors"]) violations.push("sexual content involving minors");
  if (moderationResult.violence) violations.push("violence");
  return violations;
}

/** Parse WaveSpeed content-moderator/image result payload (outputs + optional has_nsfw_contents). */
function violationsFromModerationData(data: {
  has_nsfw_contents?: boolean[] | null;
  outputs?: unknown;
}): string[] {
  const violations: string[] = [];
  if (data.has_nsfw_contents?.some((x) => x === true)) {
    violations.push("nsfw or inappropriate content");
  }

  const raw = data.outputs;
  if (raw == null) {
    return violations;
  }

  const first =
    Array.isArray(raw) ? raw[0] : typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : null;
  if (first == null) {
    return violations;
  }
  if (typeof first === "string") {
    if (violations.length === 0) {
      console.warn("[Content Moderation] outputs[0] is a string URL; expected an object. Relying on has_nsfw only.");
    }
    return violations;
  }
  if (typeof first === "object" && !Array.isArray(first)) {
    violations.push(...collectCategoryViolations(first as ContentModerationResult));
  }
  return [...new Set(violations)];
}

async function moderateImageContent(imageUrl: string): Promise<{ safe: boolean; violations: string[]; error?: string }> {
  if (!WAVESPEED_API_KEY) {
    console.error("WAVESPEED_API_KEY not configured - content moderation is required but API key is missing");
    return { safe: false, violations: [], error: "Content moderation service unavailable" };
  }

  try {
    console.log(`[Content Moderation] Checking image: ${imageUrl.substring(0, 100)}...`);

    const response = await fetch(CONTENT_MODERATOR_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WAVESPEED_API_KEY}`
      },
      body: JSON.stringify({
        enable_sync_mode: false,
        image: imageUrl
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Content Moderation] API error: ${response.status} ${response.statusText} - ${errorText}`);
      return { safe: false, violations: [], error: "Content moderation check failed. Please try again." };
    }

    const submitRaw: unknown = await response.json();
    console.log(`[Content Moderation] Submit response:`, JSON.stringify(submitRaw, null, 2));

    const data = extractContentModerationTask(submitRaw);
    if (!data) {
      console.error(`[Content Moderation] Could not parse task from response`);
      return { safe: false, violations: [], error: "Content moderation check failed. Please try again." };
    }

    if (data.status === "failed") {
      const errMsg = typeof data.error === "string" ? data.error : JSON.stringify(data.error);
      console.error(`[Content Moderation] Task failed: ${errMsg}`);
      return { safe: false, violations: [], error: "Content moderation check failed. Please try again." };
    }

    if (data.status === "completed") {
      const violations = violationsFromModerationData(data);
      console.log(`[Content Moderation] Violations: ${violations.length ? violations.join(", ") : "none"}`);
      return { safe: violations.length === 0, violations };
    }

    const requestId = data.id;
    if (!requestId) {
      console.error(`[Content Moderation] No task id to poll and status is ${data.status}`);
      return { safe: false, violations: [], error: "Content moderation check failed. Please try again." };
    }

    const maxAttempts = 60;
    const delayMs = 2000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, delayMs));
      const statusResponse = await fetch(`${CONTENT_MODERATOR_POLL_BASE}/${requestId}/result`, {
        headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` }
      });
      if (!statusResponse.ok) {
        const t = await statusResponse.text();
        console.error(`[Content Moderation] Poll error: ${statusResponse.status} - ${t}`);
        return { safe: false, violations: [], error: "Content moderation check failed. Please try again." };
      }
      const pollRaw: unknown = await statusResponse.json();
      const polled = extractContentModerationTask(pollRaw);
      if (!polled) {
        continue;
      }
      if (polled.status === "failed") {
        const errMsg = typeof polled.error === "string" ? polled.error : JSON.stringify(polled.error);
        console.error(`[Content Moderation] Task failed: ${errMsg}`);
        return { safe: false, violations: [], error: "Content moderation check failed. Please try again." };
      }
      if (polled.status === "completed") {
        const violations = violationsFromModerationData(polled);
        console.log(`[Content Moderation] Violations: ${violations.length ? violations.join(", ") : "none"}`);
        return { safe: violations.length === 0, violations };
      }
    }

    console.error("[Content Moderation] Timed out waiting for moderation result");
    return { safe: false, violations: [], error: "Content moderation check timed out. Please try again." };
  } catch (error) {
    console.error("[Content Moderation] Error:", error);
    return { safe: false, violations: [], error: "Content moderation check failed. Please try again." };
  }
}

// Configure multer for audio uploads
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req: any, file: any, cb: any) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `audio-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/mp3'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|aac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, and AAC files are allowed.'));
    }
  }
});

// Configure multer for image uploads (memory storage for object storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Configure multer for scene image uploads (10MB limit)
const sceneImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  }
});

// Configure multer for video uploads (Video Tools - Add Captions); optional file, 150MB
const videoToolUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 150 * 1024 * 1024, // 150MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (allowedTypes.includes(file.mimetype) || file.originalname?.match(/\.(mp4|mov|avi|webm)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, MOV, AVI, and WebM videos are allowed.'));
    }
  }
});

// Configure multer for motion control video uploads; 250MB limit
const motionControlVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    if (allowedTypes.includes(file.mimetype) || file.originalname?.match(/\.(mp4|mov|webm)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, MOV, and WebM videos are allowed.'));
    }
  }
});

// Configure multer for audio uploads (Video Tools - Trim Audio); optional file, 50MB
const audioToolUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/mp3', 'audio/m4a'];
    if (allowedTypes.includes(file.mimetype) || file.originalname?.match(/\.(mp3|wav|aac|m4a)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, AAC, and M4A audio files are allowed.'));
    }
  }
});

// Initialize ObjectStorageService
const objectStorage = new ObjectStorageService();

const JWT_SECRET = process.env.JWT_SECRET || "music-video-maker-secret-key";

/**
 * Get the base URL for internal API calls
 * Uses environment variables or constructs from request object
 */
function getBaseUrl(req?: any): string {
  // First, check for explicit BASE_URL or API_URL environment variable
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  if (process.env.API_URL) {
    return process.env.API_URL;
  }

  // If request object is available, construct from it
  if (req) {
    // Check for X-Forwarded-Proto header (common on Render, Heroku, etc.)
    const forwardedProto = req.get('x-forwarded-proto') || req.headers?.['x-forwarded-proto'];
    const protocol = forwardedProto || req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get('host') || req.headers?.host;
    if (host) {
      return `${protocol}://${host}`;
    }
  }

  // Fall back to localhost for local development
  const port = process.env.PORT || '5000';
  return `http://localhost:${port}`;
}

/**
 * Get a publicly reachable base URL (never localhost).
 * Used when building URLs that external services like ffmpegapi must fetch.
 */
function getPublicBaseUrl(req?: any): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (process.env.API_URL) return process.env.API_URL;

  if (req) {
    const host = req.get('host') || req.headers?.host;
    if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      const forwardedProto = req.get('x-forwarded-proto') || req.headers?.['x-forwarded-proto'];
      const protocol = forwardedProto || req.protocol || (req.secure ? 'https' : 'http');
      return `${protocol}://${host}`;
    }
  }

  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
  if (process.env.PRODUCTION_DOMAIN) return process.env.PRODUCTION_DOMAIN.replace(/\/$/, '');

  const port = process.env.PORT || '5000';
  return `http://localhost:${port}`;
}

/** Short-lived tokens for proxying video to ffmpegapi (avoids Bunny/merge-API download timeout) */
const proxyVideoTokens = new Map<string, { url: string; expiresAt: number }>();
const PROXY_VIDEO_TTL_MS = 10 * 60 * 1000; // 10 min

function createProxyVideoToken(videoUrl: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  proxyVideoTokens.set(token, {
    url: videoUrl,
    expiresAt: Date.now() + PROXY_VIDEO_TTL_MS,
  });
  return token;
}

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback";

// Initialize video queue service
const videoQueueService = new VideoQueueService();

// Initialize admin credentials in database if they don't exist
async function initializeAdminCredentials() {
  try {
    const adminUsername = await storage.getSetting('admin_username');
    const adminPassword = await storage.getSetting('admin_password');

    if (!adminUsername) {
      await storage.setSetting('admin_username', 'admin', false);
      console.log('✅ Admin username initialized');
    }

    if (!adminPassword) {
      // Hash the default password
      const hashedPassword = await bcrypt.hash('password123', 10);
      await storage.setSetting('admin_password', hashedPassword, true);

      // Verify the exact password hash was saved correctly
      const savedPassword = await storage.getSetting('admin_password');
      if (savedPassword !== hashedPassword) {
        console.error('❌ Password initialization verification failed - hash mismatch');
        console.error(`Expected: ${hashedPassword.substring(0, 20)}...`);
        console.error(`Got: ${savedPassword?.substring(0, 20) || 'null'}...`);
        throw new Error('Admin password write verification failed - hash mismatch');
      }

      console.log('⚠️  Admin credentials initialized with default password (admin/password123)');
      console.log('⚠️  Please change the admin password immediately via the admin dashboard!');
    }
  } catch (error) {
    console.error('❌ Critical error initializing admin credentials:', error);
    throw error; // Re-throw to be caught by the outer catch
  }
}

// Call initialization (async, doesn't block server start)
initializeAdminCredentials().catch(err => {
  console.error('❌ FATAL: Failed to initialize admin credentials:', err);
  console.error('❌ Admin login may not work until credentials are manually configured in the database');
});

// Middleware to verify JWT token or OAuth access token
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Try JWT verification first (for existing users)
  jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
    if (!err) {
      // Valid JWT token
      // Check if user is banned
      try {
        const userRecord = await storage.getUser(user.userId);
        if (userRecord) {
          const isBanned = await storage.isEmailBanned(userRecord.email);
          if (isBanned) {
            return res.status(403).json({
              error: 'This account has been suspended, please reach out to support@neonvideo.ai if you think this is a mistake'
            });
          }
        }
      } catch (banCheckError) {
        console.error('Error checking ban status:', banCheckError);
      }

      req.user = user;
      return next();
    }

    // JWT failed, try OAuth access token
    try {
      const oauthToken = await storage.getOauthAccessToken(token);

      if (!oauthToken) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }

      // Check if token has expired
      if (new Date() > oauthToken.expiresAt) {
        await storage.deleteExpiredOauthTokens();
        return res.status(403).json({ error: 'Token has expired' });
      }

      // Check if user is banned
      try {
        const userRecord = await storage.getUser(oauthToken.userId);
        if (userRecord) {
          const isBanned = await storage.isEmailBanned(userRecord.email);
          if (isBanned) {
            return res.status(403).json({
              error: 'This account has been suspended, please reach out to support@neonvideo.ai if you think this is a mistake'
            });
          }
        }
      } catch (banCheckError) {
        console.error('Error checking ban status:', banCheckError);
      }

      // Valid OAuth token - set user from token data
      req.user = {
        userId: oauthToken.userId,
        clientId: oauthToken.clientId,
        scopes: oauthToken.scopes,
        isOAuth: true
      };
      next();
    } catch (oauthError) {
      console.error('OAuth token verification error:', oauthError);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  });
}

// Middleware to verify admin JWT token
function authenticateAdmin(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  // Support token from header or query parameter (for browser access)
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.adminToken;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Check if this is an admin token
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
    next();
  });
}

function removeSceneFromOrder(sceneOrder: number[] | null | undefined, removedIdx: number): number[] | undefined {
  if (!sceneOrder || sceneOrder.length === 0) return undefined;
  const next = sceneOrder
    .filter((oldIdx) => oldIdx !== removedIdx)
    .map((oldIdx) => (oldIdx > removedIdx ? oldIdx - 1 : oldIdx));
  return next.length > 0 ? next : undefined;
}

function buildMusicVideoSceneRemoval(project: Project, sceneIndex: number): Partial<Project> {
  const sceneImages = [...((project.sceneImages as string[] | null) || [])];
  if (sceneIndex < 0 || sceneIndex >= sceneImages.length) {
    throw new Error("Invalid scene index");
  }
  const scenePrompts = [...((project.scenePrompts as string[] | null) || [])];
  const sceneLipsync = [...((project.sceneLipsyncSettings as (boolean | null)[] | null) || [])];
  const n = sceneImages.length;
  sceneImages.splice(sceneIndex, 1);
  if (scenePrompts.length > sceneIndex) scenePrompts.splice(sceneIndex, 1);
  if (sceneLipsync.length > sceneIndex) sceneLipsync.splice(sceneIndex, 1);

  const order = project.sceneOrder as number[] | null | undefined;
  const newOrder = removeSceneFromOrder(order, sceneIndex);

  const updates: Partial<Project> = {
    sceneImages: sceneImages.length ? sceneImages : null,
    scenePrompts: scenePrompts.length ? scenePrompts : null,
    sceneLipsyncSettings: sceneLipsync.length ? sceneLipsync : null,
    sceneOrder: newOrder ?? null,
  };

  const audioSeg = project.audioSegments as string[] | null | undefined;
  if (audioSeg && audioSeg.length === n) {
    const a = [...audioSeg];
    a.splice(sceneIndex, 1);
    updates.audioSegments = a.length ? a : null;
  }
  const videoSeg = project.videoSegments as string[] | null | undefined;
  if (videoSeg && videoSeg.length === n) {
    const v = [...videoSeg];
    v.splice(sceneIndex, 1);
    updates.videoSegments = v.length ? v : null;
  }
  return updates;
}

function buildStoryVideoSceneRemoval(project: Project, sceneIndex: number): Partial<Project> {
  const sceneImages = [...((project.storySceneImages as string[] | null) || [])];
  if (sceneIndex < 0 || sceneIndex >= sceneImages.length) {
    throw new Error("Invalid scene index");
  }
  const scenePrompts = [...((project.storyScenePrompts as string[] | null) || [])];
  const script = [...((project.storyScript as unknown[] | null) || [])];
  const audioUrls = [...((project.storyAudioUrls as string[] | null) || [])];
  const audioUrlsRight = [...((project.storyAudioUrlsRight as string[] | null) || [])];
  sceneImages.splice(sceneIndex, 1);
  if (scenePrompts.length > sceneIndex) scenePrompts.splice(sceneIndex, 1);
  if (script.length > sceneIndex) script.splice(sceneIndex, 1);
  if (audioUrls.length > sceneIndex) audioUrls.splice(sceneIndex, 1);
  if (audioUrlsRight.length > sceneIndex) audioUrlsRight.splice(sceneIndex, 1);

  return {
    storySceneImages: sceneImages.length ? sceneImages : null,
    storyScenePrompts: scenePrompts.length ? scenePrompts : null,
    storyScript: script.length ? (script as Project["storyScript"]) : null,
    storyAudioUrls: audioUrls.length ? audioUrls : null,
    storyAudioUrlsRight: audioUrlsRight.length ? audioUrlsRight : null,
  } as Partial<Project>;
}

// Configure Google OAuth Strategy
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        passReqToCallback: true,
      },
      async (req: any, accessToken, refreshToken, profile, done) => {
        try {
          console.log("Google OAuth profile:", profile);
          const requestMeta = await getRequestUserMetadataAsync(req);

          // Check if user exists by Google ID or email
          let user = await storage.getUserByGoogleId(profile.id);

          if (!user && profile.emails && profile.emails[0]) {
            // If no user found by Google ID, check by email
            user = await storage.getUserByEmail(profile.emails[0].value);

            if (user) {
              // Link existing account with Google ID
              await storage.updateUserGoogleId(user.id, profile.id);

              // If user doesn't have a plan assigned, assign Free plan - CRITICAL FIX
              if (!user.planId) {
                const freePlan = await storage.getFreePlan();
                if (!freePlan) {
                  console.error("CRITICAL: Free plan not found for existing user!");
                  // Fail auth without throwing — avoids 500 + Resend alerts; fix DB/plan seeding
                  return done(null, false);
                }
                await storage.updateUser(user.id, {
                  planId: freePlan.id,
                  creditsUsed: user.creditsUsed || 0,
                  lastIpAddress: requestMeta.ipAddress,
                  lastKnownLocation: requestMeta.location,
                  lastUserAgent: requestMeta.userAgent,
                  lastDeviceType: requestMeta.deviceType,
                  lastBrowser: requestMeta.browser,
                  lastSeenAt: new Date(),
                });
                user.planId = freePlan.id;
                user.creditsUsed = user.creditsUsed || 0;
                user.lastIpAddress = requestMeta.ipAddress;
                user.lastKnownLocation = requestMeta.location;
                user.lastUserAgent = requestMeta.userAgent;
                user.lastDeviceType = requestMeta.deviceType;
                user.lastBrowser = requestMeta.browser;
                user.lastSeenAt = new Date();
              } else {
                await storage.updateUser(user.id, {
                  lastIpAddress: requestMeta.ipAddress,
                  lastKnownLocation: requestMeta.location,
                  lastUserAgent: requestMeta.userAgent,
                  lastDeviceType: requestMeta.deviceType,
                  lastBrowser: requestMeta.browser,
                  lastSeenAt: new Date(),
                });
              }
            }
          }

          if (!user) {
            // Create new user
            const email = profile.emails?.[0]?.value || '';
            const username = profile.displayName || `user_${profile.id}`;

            // Generate a unique username if it already exists
            let finalUsername = username;
            let counter = 1;
            while (await storage.getUserByUsername(finalUsername)) {
              finalUsername = `${username}_${counter}`;
              counter++;
            }

            // Get the free plan to assign to new OAuth users - CRITICAL: must assign free plan
            const freePlan = await storage.getFreePlan();
            if (!freePlan) {
              console.error("CRITICAL: Free plan not found for Google OAuth user!");
              // Fail auth without throwing — avoids 500 + Resend alerts; fix DB/plan seeding
              return done(null, false);
            }

            user = await storage.createUser({
              username: finalUsername,
              email,
              password: crypto.randomBytes(32).toString('hex'), // Random password for OAuth users
              avatarUrl: profile.photos?.[0]?.value || "/public-objects/public/avatars/anonymous.png",
              googleId: profile.id,
              emailVerified: true, // Google OAuth users are considered verified
              planId: freePlan.id, // ALWAYS assign free plan - guaranteed to exist
              creditsUsed: 0, // Initialize credits usage
              lastIpAddress: requestMeta.ipAddress,
              lastKnownLocation: requestMeta.location,
              lastUserAgent: requestMeta.userAgent,
              lastDeviceType: requestMeta.deviceType,
              lastBrowser: requestMeta.browser,
              lastSeenAt: new Date(),
            });
          }

          return done(null, user);
        } catch (error) {
          console.error("Google OAuth error:", error);
          return done(error, false);
        }
      }
    )
  );
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Passport
  app.use(passport.initialize());

  // Local FFMPEG output download route — serves merged video files from the temp output folder
  {
    const { OUTPUT_FOLDER, startOutputCleanupJob } = await import("./services/ffmpegLocal.js");
    app.get("/api/ffmpeg-local/download/:filename", (req, res) => {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(OUTPUT_FOLDER, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }
      res.sendFile(filePath);
    });
    startOutputCleanupJob();
  }

  // Proxy video for ffmpegapi captions (avoids download timeout when source is Bunny or slow merge API)
  // Token is reusable until expiry (ffmpegapi may request the URL multiple times: probe, range, retry)
  app.get("/api/proxy-video-for-captions", async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }
    const entry = proxyVideoTokens.get(token);
    if (!entry || Date.now() > entry.expiresAt) {
      // Clean up expired entries to avoid unbounded map growth
      const now = Date.now();
      for (const [k, v] of proxyVideoTokens.entries()) {
        if (v.expiresAt <= now) proxyVideoTokens.delete(k);
      }
      return res.status(404).json({ error: "Invalid or expired token" });
    }
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 120_000);
    try {
      const resp = await fetch(entry.url, { signal: ac.signal });
      clearTimeout(timeout);
      if (!resp.ok) {
        return res.status(resp.status).send(`Upstream returned ${resp.status}`);
      }
      const contentType = resp.headers.get("content-type") || "video/mp4";
      const contentLength = resp.headers.get("content-length");
      res.setHeader("Content-Type", contentType);
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (!resp.body) {
        return res.status(502).send("No body");
      }
      Readable.fromWeb(resp.body).pipe(res);
    } catch (err) {
      clearTimeout(timeout);
      console.warn("[proxy-video-for-captions]", err);
      if (!res.headersSent) {
        res.status(502).json({ error: "Failed to stream video" });
      }
    }
  });

  // Initialize OAuth keys on startup
  await initializeOAuthKeys();

  // OAuth 2.1 Well-Known Discovery Endpoints
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
    res.json({
      resource: `${baseUrl}/api/neon-single-prompt`,
      authorization_servers: [`${baseUrl}`],
      scopes_supported: ["neonvideo.app", "neon:video:create", "neon:video:read"],
      bearer_methods_supported: ["header"]
    });
  });

  app.get("/.well-known/openid-configuration", (req, res) => {
    const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      scopes_supported: ["neonvideo.app", "neon:video:create", "neon:video:read"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      subject_types_supported: ["public"]
    });
  });

  app.get("/.well-known/jwks.json", async (req, res) => {
    const jwks = await getJWKS();
    res.json(jwks);
  });

  // OAuth 2.1 Dynamic Client Registration
  // Handle CORS preflight for OAuth registration
  app.options("/oauth/register", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post("/oauth/register", async (req, res) => {
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    console.log("📝 OAuth Dynamic Client Registration Request:");
    console.log("  Headers:", JSON.stringify(req.headers, null, 2));
    console.log("  Body:", JSON.stringify(req.body, null, 2));

    try {
      const { client_name, redirect_uris, scopes } = req.body;

      if (!client_name || !redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        console.log("❌ OAuth registration failed: Missing required parameters");
        return res.status(400).json({
          error: "invalid_request",
          error_description: "client_name and redirect_uris (array) are required"
        });
      }

      // Validate redirect URIs (must be HTTPS in production)
      const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
      const isProduction = baseUrl.startsWith('https://');

      for (const uri of redirect_uris) {
        if (isProduction && !uri.startsWith('https://')) {
          return res.status(400).json({
            error: "invalid_redirect_uri",
            error_description: "Redirect URIs must use HTTPS in production"
          });
        }
      }

      // Import generateClientCredentials from oauth service
      const { generateClientCredentials } = await import("./services/oauth");
      const { clientId, clientSecret } = generateClientCredentials();

      const allowedScopes = scopes && Array.isArray(scopes)
        ? scopes.filter((s: string) => ["neonvideo.app", "neon:video:create", "neon:video:read"].includes(s))
        : ["neonvideo.app", "neon:video:create", "neon:video:read"];

      await storage.createOauthClient({
        clientId,
        clientSecret,
        clientName: client_name,
        redirectUris: redirect_uris,
        scopes: allowedScopes
      });

      console.log(`✅ OAuth client registered successfully: ${clientId} (${client_name})`);
      console.log(`   Redirect URIs: ${JSON.stringify(redirect_uris)}`);
      console.log(`   Scopes: ${JSON.stringify(allowedScopes)}`);

      const response = {
        client_id: clientId,
        client_secret: clientSecret,
        client_name,
        redirect_uris,
        scopes: allowedScopes,
        token_endpoint_auth_method: "none"
      };

      console.log("📤 Sending registration response:", JSON.stringify(response, null, 2));
      res.status(201).json(response);
    } catch (error) {
      console.error("❌ OAuth client registration error:", error);
      res.status(500).json({ error: "server_error", error_description: "Failed to register client" });
    }
  });

  // OAuth 2.1 Authorization Endpoint (API - requires JWT token)
  app.post("/oauth/authorize", authenticateToken, async (req: any, res) => {
    try {
      const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.body;

      if (!client_id || !redirect_uri || !code_challenge || !code_challenge_method) {
        return res.status(400).json({ error: "Missing required parameters: client_id, redirect_uri, code_challenge, code_challenge_method" });
      }

      if (code_challenge_method !== 'S256') {
        return res.status(400).json({ error: "Only S256 code_challenge_method is supported" });
      }

      // Verify client exists
      const client = await storage.getOauthClient(client_id as string);
      if (!client) {
        return res.status(400).json({ error: "Invalid client_id" });
      }

      // Verify redirect_uri is registered
      if (!client.redirectUris.includes(redirect_uri as string)) {
        return res.status(400).json({ error: "Invalid redirect_uri" });
      }

      const requestedScopes = scope ? (scope as string).split(' ') : client.scopes;
      const allowedScopes = requestedScopes.filter(s => client.scopes.includes(s));

      // Generate authorization code
      const { generateAuthorizationCode } = await import("./services/oauth");
      const authCode = generateAuthorizationCode();

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await storage.createOauthAuthorizationCode({
        code: authCode,
        clientId: client_id as string,
        userId: req.user.userId,
        redirectUri: redirect_uri as string,
        scopes: allowedScopes,
        codeChallenge: code_challenge as string,
        codeChallengeMethod: code_challenge_method as string,
        expiresAt
      });

      // Return the authorization code and redirect URL
      const redirectUrl = new URL(redirect_uri as string);
      redirectUrl.searchParams.append('code', authCode);
      if (state) {
        redirectUrl.searchParams.append('state', state as string);
      }

      res.json({
        redirect_url: redirectUrl.toString(),
        code: authCode
      });
    } catch (error) {
      console.error("OAuth authorize error:", error);
      res.status(500).json({ error: "Authorization failed" });
    }
  });

  // OAuth 2.1 Authorization Page (GET - for browser navigation)
  app.get("/oauth/authorize", async (req: any, res) => {
    try {
      const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.query;

      if (!client_id || !redirect_uri || !code_challenge || !code_challenge_method) {
        return res.status(400).send("Missing required parameters: client_id, redirect_uri, code_challenge, code_challenge_method");
      }

      // Verify client exists
      const client = await storage.getOauthClient(client_id as string);
      if (!client) {
        return res.status(400).send("Invalid client_id");
      }

      // Serve an HTML page that will handle the authorization with JWT token
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorize ${client.clientName}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              max-width: 400px;
              width: 100%;
            }
            h1 { margin-top: 0; color: #333; font-size: 1.5rem; }
            .client-info { background: #f3f4f6; padding: 1rem; border-radius: 4px; margin: 1rem 0; }
            .scopes { list-style: none; padding: 0; }
            .scopes li { padding: 0.5rem 0; border-bottom: 1px solid #e5e7eb; }
            .scopes li:last-child { border-bottom: none; }
            .buttons { display: flex; gap: 1rem; margin-top: 1.5rem; }
            button { flex: 1; padding: 0.75rem; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
            .authorize { background: #667eea; color: white; }
            .authorize:hover { background: #5568d3; }
            .deny { background: #e5e7eb; color: #333; }
            .deny:hover { background: #d1d5db; }
            .error { color: #dc2626; padding: 1rem; background: #fee2e2; border-radius: 4px; margin: 1rem 0; }
            .loading { text-align: center; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div id="content">
              <div class="loading">Loading...</div>
            </div>
          </div>
          <script>
            const token = localStorage.getItem('auth_token');
            const params = new URLSearchParams(window.location.search);
            
            if (!token) {
              document.getElementById('content').innerHTML = \`
                <div class="error">You must be logged in to authorize applications.</div>
                <div class="buttons">
                  <button onclick="window.location.href='/auth?redirect=' + encodeURIComponent(window.location.href)">Login</button>
                </div>
              \`;
            } else {
              document.getElementById('content').innerHTML = \`
                <h1>Authorize Application</h1>
                <div class="client-info">
                  <strong>${client.clientName}</strong> wants to access your account
                </div>
                <div>
                  <p>This application will be able to:</p>
                  <ul class="scopes">
                    ${client.scopes.map(s => `<li>${s}</li>`).join('')}
                  </ul>
                </div>
                <div class="buttons">
                  <button class="authorize" data-testid="button-authorize" onclick="authorize()">Authorize</button>
                  <button class="deny" data-testid="button-deny" onclick="deny()">Deny</button>
                </div>
              \`;
            }
            
            async function authorize() {
              try {
                const response = await fetch('/oauth/authorize', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                  },
                  body: JSON.stringify({
                    client_id: params.get('client_id'),
                    redirect_uri: params.get('redirect_uri'),
                    state: params.get('state'),
                    code_challenge: params.get('code_challenge'),
                    code_challenge_method: params.get('code_challenge_method'),
                    scope: params.get('scope')
                  })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                  window.location.href = data.redirect_url;
                } else {
                  document.getElementById('content').innerHTML = '<div class="error">Authorization failed: ' + (data.error || 'Unknown error') + '</div>';
                }
              } catch (error) {
                document.getElementById('content').innerHTML = '<div class="error">Authorization failed: ' + error.message + '</div>';
              }
            }
            
            function deny() {
              const redirectUri = params.get('redirect_uri');
              const state = params.get('state');
              const url = new URL(redirectUri);
              url.searchParams.append('error', 'access_denied');
              if (state) url.searchParams.append('state', state);
              window.location.href = url.toString();
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth authorize page error:", error);
      res.status(500).send("Authorization failed");
    }
  });

  // OAuth Test Callback Endpoint (for testing only)
  app.get("/oauth/test/callback", (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p data-testid="oauth-error">${error}</p>
        </body>
        </html>
      `);
      return;
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Authorization Successful</title></head>
      <body>
        <h1>Authorization Successful</h1>
        <p>Authorization code received successfully.</p>
        <div data-testid="oauth-code">${code}</div>
        <div data-testid="oauth-state">${state || ''}</div>
      </body>
      </html>
    `);
  });

  // OAuth 2.1 Token Endpoint
  app.post("/oauth/token", async (req, res) => {
    console.log("\n[OAUTH TOKEN] ========== Token Exchange Request ==========");
    console.log("[OAUTH TOKEN] Request body:", JSON.stringify(req.body, null, 2));
    console.log("[OAUTH TOKEN] Request headers:", JSON.stringify(req.headers, null, 2));

    try {
      const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;

      console.log("[OAUTH TOKEN] Step 1: Validating grant_type...");
      if (grant_type !== 'authorization_code') {
        console.log("[OAUTH TOKEN] ❌ Invalid grant_type:", grant_type);
        return res.status(400).json({
          error: "unsupported_grant_type",
          error_description: "Only authorization_code grant type is supported"
        });
      }
      console.log("[OAUTH TOKEN] ✅ Grant type valid");

      console.log("[OAUTH TOKEN] Step 2: Checking required parameters...");
      const missingParams = [];
      if (!code) missingParams.push('code');
      if (!redirect_uri) missingParams.push('redirect_uri');
      if (!client_id) missingParams.push('client_id');
      if (!code_verifier) missingParams.push('code_verifier');

      if (missingParams.length > 0) {
        console.log("[OAUTH TOKEN] ❌ Missing parameters:", missingParams);
        return res.status(400).json({
          error: "invalid_request",
          error_description: `Missing required parameters: ${missingParams.join(', ')}`
        });
      }
      console.log("[OAUTH TOKEN] ✅ All required parameters present");

      console.log("[OAUTH TOKEN] Step 3: Looking up authorization code:", code);
      const authCode = await storage.getOauthAuthorizationCode(code);
      if (!authCode) {
        console.log("[OAUTH TOKEN] ❌ Authorization code not found or expired");
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired authorization code"
        });
      }
      console.log("[OAUTH TOKEN] ✅ Authorization code found:", {
        clientId: authCode.clientId,
        userId: authCode.userId,
        scopes: authCode.scopes,
        redirectUri: authCode.redirectUri,
        expiresAt: authCode.expiresAt
      });

      console.log("[OAUTH TOKEN] Step 4: Verifying client_id...");
      console.log("[OAUTH TOKEN] Expected client_id:", authCode.clientId);
      console.log("[OAUTH TOKEN] Received client_id:", client_id);
      if (authCode.clientId !== client_id) {
        console.log("[OAUTH TOKEN] ❌ Client mismatch");
        return res.status(400).json({
          error: "invalid_client",
          error_description: "Client mismatch"
        });
      }
      console.log("[OAUTH TOKEN] ✅ Client verified");

      console.log("[OAUTH TOKEN] Step 5: Verifying redirect_uri...");
      console.log("[OAUTH TOKEN] Expected redirect_uri:", authCode.redirectUri);
      console.log("[OAUTH TOKEN] Received redirect_uri:", redirect_uri);
      if (authCode.redirectUri !== redirect_uri) {
        console.log("[OAUTH TOKEN] ❌ Redirect URI mismatch");
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Redirect URI mismatch"
        });
      }
      console.log("[OAUTH TOKEN] ✅ Redirect URI verified");

      console.log("[OAUTH TOKEN] Step 6: Checking expiration...");
      const now = new Date();
      console.log("[OAUTH TOKEN] Current time:", now.toISOString());
      console.log("[OAUTH TOKEN] Code expires at:", authCode.expiresAt.toISOString());
      if (now > authCode.expiresAt) {
        console.log("[OAUTH TOKEN] ❌ Authorization code has expired");
        await storage.deleteOauthAuthorizationCode(code);
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Authorization code has expired"
        });
      }
      console.log("[OAUTH TOKEN] ✅ Code not expired");

      console.log("[OAUTH TOKEN] Step 7: Verifying PKCE...");
      console.log("[OAUTH TOKEN] Code verifier length:", code_verifier.length);
      console.log("[OAUTH TOKEN] Code challenge:", authCode.codeChallenge);
      console.log("[OAUTH TOKEN] Code challenge method:", authCode.codeChallengeMethod);

      const { verifyPKCE } = await import("./services/oauth");
      const pkceValid = verifyPKCE(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod);
      console.log("[OAUTH TOKEN] PKCE verification result:", pkceValid);

      if (!pkceValid) {
        console.log("[OAUTH TOKEN] ❌ PKCE verification failed");
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid code_verifier"
        });
      }
      console.log("[OAUTH TOKEN] ✅ PKCE verified");

      console.log("[OAUTH TOKEN] Step 8: Generating access token...");
      const { generateOAuthAccessToken } = await import("./services/oauth");
      const accessToken = await generateOAuthAccessToken(
        authCode.userId,
        authCode.clientId,
        authCode.scopes,
        3600 // 1 hour
      );
      console.log("[OAUTH TOKEN] ✅ Access token generated:", accessToken.substring(0, 20) + "...");

      const tokenExpiresAt = new Date(Date.now() + 3600 * 1000);

      console.log("[OAUTH TOKEN] Step 9: Storing access token...");
      await storage.createOauthAccessToken({
        token: accessToken,
        clientId: authCode.clientId,
        userId: authCode.userId,
        scopes: authCode.scopes,
        expiresAt: tokenExpiresAt
      });
      console.log("[OAUTH TOKEN] ✅ Access token stored");

      console.log("[OAUTH TOKEN] Step 10: Deleting used authorization code...");
      await storage.deleteOauthAuthorizationCode(code);
      console.log("[OAUTH TOKEN] ✅ Authorization code deleted");

      const responseBody = {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: authCode.scopes.join(' ')
      };

      console.log("[OAUTH TOKEN] ✅ SUCCESS - Responding with token");
      console.log("[OAUTH TOKEN] Response:", {
        token_type: responseBody.token_type,
        expires_in: responseBody.expires_in,
        scope: responseBody.scope,
        access_token_preview: accessToken.substring(0, 20) + "..."
      });
      console.log("[OAUTH TOKEN] ========== End Token Exchange ==========\n");

      res.json(responseBody);
    } catch (error) {
      console.error("[OAUTH TOKEN] ❌ FATAL ERROR:", error);
      console.error("[OAUTH TOKEN] Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      console.log("[OAUTH TOKEN] ========== End Token Exchange (ERROR) ==========\n");
      res.status(500).json({ error: "server_error", error_description: "Failed to issue token" });
    }
  });

  // Google OAuth routes
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    app.get("/api/auth/google",
      passport.authenticate("google", {
        scope: ["profile", "email"]
      })
    );

    app.get("/api/auth/google/callback", (req: any, res, next) => {
      const frontendURL = () => {
        const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
        const host = req.get("host");
        return process.env.FRONTEND_URL || `${protocol}://${host}`;
      };
      const redirectOAuthFailed = () => res.redirect(`${frontendURL()}/auth?error=oauth_failed`);

      passport.authenticate("google", { session: false }, (err: any, user: any) => {
        if (err) {
          // Token exchange failures (reused/expired code, etc.) — do not propagate as 500 / error emails
          if (err?.name === "TokenError") {
            console.warn("[Google OAuth] Token exchange failed:", err.message);
            return redirectOAuthFailed();
          }
          return next(err);
        }
        if (!user) {
          return redirectOAuthFailed();
        }
        try {
          const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: "24h" }
          );
          res.redirect(`${frontendURL()}/auth?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.id,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl
          }))}`);
        } catch (error) {
          console.error("Google OAuth callback error:", error);
          redirectOAuthFailed();
        }
      })(req, res, next);
    });
  }
  // Authentication routes
  app.post("/api/register", async (req, res) => {
    try {
      const { username, email, password } = insertUserSchema.parse(req.body);
      const requestMeta = await getRequestUserMetadataAsync(req);

      // Check if email is banned
      const isBanned = await storage.isEmailBanned(email);
      if (isBanned) {
        return res.status(403).json({
          error: "This account has been suspended, please reach out to support@neonvideo.ai if you think this is a mistake"
        });
      }

      // Check for Gmail emails and reject them
      const emailDomain = email.toLowerCase().split('@')[1];
      const gmailDomains = ['gmail.com', 'googlemail.com'];
      if (gmailDomains.includes(emailDomain)) {
        return res.status(400).json({
          error: "Gmail accounts must use Google Login. Please use the \"Continue with Google\" button."
        });
      }

      // Reject subdomain emails (e.g., user@sub.domain.com)
      const knownMultiPartDomains = new Set([
        'outlook.co.uk', 'live.co.uk', 'yahoo.co.uk', 'yahoo.co.in',
      ]);
      const domainParts = emailDomain.split('.');
      if (domainParts.length > 2 && !knownMultiPartDomains.has(emailDomain)) {
        return res.status(400).json({
          error: "Please use your main email address (e.g., user@domain.com). Subdomain emails are not allowed."
        });
      }

      // Known legitimate public email domains — skip disposable check for these
      const knownPublicDomains = new Set([
        'hotmail.com', 'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk', 'msn.com',
        'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
        'aol.com',
        'icloud.com', 'me.com', 'mac.com',
        'protonmail.com', 'proton.me', 'pm.me',
        'zoho.com', 'zohomail.com',
        'mail.com', 'email.com',
        'gmx.com', 'gmx.net',
        'yandex.com', 'yandex.ru',
        'tutanota.com', 'tuta.com',
        'fastmail.com',
        'hey.com',
        'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net',
        'cox.net', 'charter.net', 'earthlink.net', 'juno.com', 'netzero.com',
      ]);

      if (!knownPublicDomains.has(emailDomain)) {
        // Unknown domain — verify with UserCheck API for disposable emails
        try {
          const usercheckResponse = await fetch(
            `https://api.usercheck.com/email/${encodeURIComponent(email)}`,
            { headers: { "Authorization": `Bearer ${process.env.USERCHECK_API_KEY}` } }
          );
          if (usercheckResponse.ok) {
            const usercheckData = await usercheckResponse.json();
            if (usercheckData.disposable) {
              return res.status(400).json({
                error: "To prevent abuse of the platform, disposable emails are not allowed, please use a valid email."
              });
            }
          }
        } catch (usercheckError) {
          console.error("UserCheck API error (proceeding with registration):", usercheckError);
        }
      }

      // Check if user already exists
      const existingUserByUsername = await storage.getUserByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Generate email verification token and expiry date
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Get the free plan for new users - CRITICAL: must assign free plan
      const freePlan = await storage.getFreePlan();
      if (!freePlan) {
        console.error("CRITICAL: Free plan not found in database!");
        return res.status(500).json({ error: "System configuration error. Please contact support." });
      }

      // Check for affiliate code and validate if provided (support both referralCode and affiliateCode for compatibility)
      let affiliateId = null;
      let shouldAwardBonus = false;
      const { referralCode, affiliateCode } = req.body;
      const codeToCheck = affiliateCode || referralCode; // Try affiliateCode first, then referralCode for backwards compatibility

      if (codeToCheck) {
        const affiliate = await storage.getAffiliateByCode(codeToCheck.toLowerCase());
        if (affiliate) {
          affiliateId = affiliate.id;
          shouldAwardBonus = true;
          console.log(`Direct registration: Found affiliate ${affiliate.id} for code "${codeToCheck}"`);
        } else {
          console.log(`Direct registration: No affiliate found for code "${codeToCheck}"`);
        }
      }

      // Create user with email verification fields - ALWAYS with Free plan
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: tokenExpiresAt,
        avatarUrl: "/public-objects/public/avatars/anonymous.png",
        planId: freePlan.id, // ALWAYS assign free plan
        creditsUsed: 0,
        bonusCredits: shouldAwardBonus ? 500 : 0,
        lastIpAddress: requestMeta.ipAddress,
        lastKnownLocation: requestMeta.location,
        lastUserAgent: requestMeta.userAgent,
        lastDeviceType: requestMeta.deviceType,
        lastBrowser: requestMeta.browser,
        lastSeenAt: new Date()
      });

      // Create affiliate signup record if user used affiliate code
      if (affiliateId) {
        try {
          await storage.createAffiliateSignup({
            affiliateId,
            signupUserId: user.id,
            bonusCreditsAwarded: 500,
            isCreditsAwarded: true
          });
          console.log(`Direct registration affiliate signup: affiliate ${affiliateId} -> user ${user.id} with 500 bonus credits awarded`);
          console.log(`Direct registration: User ${user.id} awarded 500 bonus credits via affiliate ${affiliateId}`);
        } catch (affiliateError) {
          console.error("Failed to create affiliate signup record:", affiliateError);
          // Don't fail registration if affiliate record creation fails
        }
      }

      // Send email verification instead of logging user in
      try {
        await emailService.sendEmailVerification({
          username: user.username,
          email: user.email,
          verificationToken: verificationToken
        });

        console.log(`Email verification sent to ${user.email}`);
      } catch (emailError) {
        console.error("Failed to send email verification:", emailError);
        return res.status(500).json({
          error: "Failed to send verification email. Please try again later."
        });
      }

      // Send notification email to support about new user registration
      try {
        await emailService.sendNewUserRegistrationEmail({
          username: user.username,
          email: user.email,
          createdAt: user.createdAt
        });
      } catch (emailError) {
        // Log error but don't fail the registration
        console.error("Failed to send new user registration email:", emailError);
      }

      // Return success message without token - user needs to verify email first
      res.status(201).json({
        message: "Account created successfully! Please check your email to verify your account before logging in.",
        email: user.email
      });
    } catch (error) {
      console.error("Register error:", error);
      const message = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      // Find user by username or email
      let user = await storage.getUserByUsername(username);
      if (!user) {
        user = await storage.getUserByEmail(username); // Allow login with email
      }

      if (!user) {
        return res.status(400).json({ error: "Invalid credentials" });
      }

      // Check if email is verified (skip for Google OAuth users)
      if (!user.emailVerified && !user.googleId) {
        return res.status(400).json({
          error: "Please verify your email address before logging in. Check your email for the verification link."
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const requestMeta = await getRequestUserMetadataAsync(req);
      await storage.updateUser(user.id, {
        lastIpAddress: requestMeta.ipAddress,
        lastKnownLocation: requestMeta.location,
        lastUserAgent: requestMeta.userAgent,
        lastDeviceType: requestMeta.deviceType,
        lastBrowser: requestMeta.browser,
        lastSeenAt: new Date(),
      });

      res.json({
        user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl },
        token
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Generate long-lived API token for cron jobs (requires authentication)
  app.post("/api/generate-api-token", authenticateToken, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate a token that expires in 1 year (for cron job usage)
      const apiToken = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '365d' }
      );

      console.log(`[API-TOKEN] Generated long-lived API token for user ${user.username}`);

      res.json({
        success: true,
        token: apiToken,
        expiresIn: "1 year",
        usage: {
          createVideo: `/api/neon-single-prompt?token=${apiToken}&prompt=YOUR_PROMPT_HERE`,
          checkStatus: `/api/neon-single-prompt/status/PROJECT_ID?token=${apiToken}`
        }
      });
    } catch (error) {
      console.error("[API-TOKEN] Error generating token:", error);
      res.status(500).json({ error: "Failed to generate API token" });
    }
  });

  // Email verification endpoint
  app.get("/verify-email", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">❌ Invalid Verification Link</h2>
              <p>The verification link is invalid or missing. Please check your email for the correct link.</p>
              <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Login</a>
            </body>
          </html>
        `);
      }

      // Find user by verification token
      const user = await storage.getUserByVerificationToken(token);

      if (!user) {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">❌ Invalid Verification Token</h2>
              <p>The verification token is invalid or has already been used.</p>
              <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Login</a>
            </body>
          </html>
        `);
      }

      // Check if token has expired
      if (user.emailVerificationTokenExpiresAt && new Date() > user.emailVerificationTokenExpiresAt) {
        return res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h2 style="color: #e74c3c;">⏰ Verification Link Expired</h2>
              <p>Your verification link has expired. Please register again or contact support.</p>
              <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Registration</a>
            </body>
          </html>
        `);
      }

      // Verify the user's email
      await storage.verifyUserEmail(user.id);

      // Success page
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #27ae60;">✅ Email Verified Successfully!</h2>
            <p>Welcome to neonvideo.ai, ${user.username}! Your email has been verified and you can now log in to your account.</p>
            <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Log In Now</a>
          </body>
        </html>
      `);

    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #e74c3c;">❌ Verification Error</h2>
            <p>Something went wrong during verification. Please try again or contact support.</p>
            <a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px;">Go to Login</a>
          </body>
        </html>
      `);
    }
  });

  // Resend email verification
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);

      if (!user) {
        // Don't reveal if user exists or not for security
        return res.status(200).json({ message: "If the email exists and is unverified, a new verification email has been sent." });
      }

      // Check if user is already verified
      if (user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified. You can log in normally." });
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Update user with new token
      await storage.updateUser(user.id, {
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: tokenExpiresAt
      });

      // Send new verification email
      try {
        await emailService.sendEmailVerification({
          username: user.username,
          email: user.email,
          verificationToken: verificationToken
        });

        res.json({ message: "New verification email sent. Please check your email." });
      } catch (emailError) {
        console.error("Failed to resend verification email:", emailError);
        res.status(500).json({ error: "Failed to send verification email. Please try again later." });
      }

    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // Referral endpoints
  app.get("/api/referrals", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const referrals = await storage.getUserReferrals(userId);
      const stats = await storage.getReferralStats(userId);

      res.json({ referrals, stats });
    } catch (error) {
      console.error("Get referrals error:", error);
      res.status(500).json({ error: "Failed to get referrals" });
    }
  });

  app.get("/api/referrals/code", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Generate referral code if user doesn't have one
      let referralCode = user.referralCode;
      if (!referralCode) {
        referralCode = await storage.generateReferralCode(userId);
      }

      res.json({ referralCode });
    } catch (error) {
      console.error("Get referral code error:", error);
      res.status(500).json({ error: "Failed to get referral code" });
    }
  });

  app.post("/api/referrals/code", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { code } = req.body;

      if (!code || typeof code !== 'string' || code.length < 3 || code.length > 20) {
        return res.status(400).json({ error: "Referral code must be between 3 and 20 characters" });
      }

      // Check if code contains only alphanumeric characters
      if (!/^[a-zA-Z0-9]+$/.test(code)) {
        return res.status(400).json({ error: "Referral code can only contain letters and numbers" });
      }

      const success = await storage.setReferralCode(userId, code.toUpperCase());

      if (!success) {
        return res.status(400).json({ error: "Referral code is already taken" });
      }

      res.json({ referralCode: code.toUpperCase() });
    } catch (error) {
      console.error("Set referral code error:", error);
      res.status(500).json({ error: "Failed to set referral code" });
    }
  });

  // Process referral code for OAuth users (secured endpoint)
  app.post("/api/process-oauth-referral", authenticateToken, async (req, res) => {
    try {
      const { referralCode } = req.body;
      const userId = (req as any).user.userId;

      if (!referralCode) {
        return res.status(400).json({ error: "Referral code is required" });
      }

      // Get the user to check if they already have a referrer
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.referredBy) {
        return res.status(400).json({ error: "User already has a referrer" });
      }

      // Find the referrer by referral code
      const referrer = await storage.getUserByReferralCode(referralCode);
      if (!referrer) {
        return res.status(404).json({ error: "Invalid referral code" });
      }

      // Prevent self-referral
      if (referrer.id === userId) {
        return res.status(400).json({ error: "Cannot refer yourself" });
      }

      // Update user with referrer and create referral record
      await storage.updateUser(userId, { referredBy: referrer.id });
      await storage.createReferral({
        referrerId: referrer.id,
        referredUserId: userId,
        referralCode: referralCode,
        status: 'active'
      });

      console.log(`OAuth user ${userId} referred by ${referrer.id} with code ${referralCode}`);

      res.json({
        success: true,
        message: "Referral processed successfully",
        referrerUsername: referrer.username
      });
    } catch (error) {
      console.error("Failed to process OAuth referral:", error);
      res.status(500).json({ error: "Failed to process referral" });
    }
  });

  // Affiliate endpoints
  app.get("/api/affiliates", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;

      // Check if user has an affiliate profile
      const affiliate = await storage.getAffiliate(userId);
      if (!affiliate) {
        // Return empty data if user is not an affiliate
        return res.json({
          signups: [],
          earnings: [],
          payouts: [],
          stats: {
            totalSignups: 0,
            totalEarnings: 0,
            pendingBalance: 0,
            totalPaidOut: 0
          }
        });
      }

      const signups = await storage.getAffiliateSignups(affiliate.id);
      const earnings = await storage.getAffiliateEarnings(affiliate.id);
      const payouts = await storage.getAffiliatePayouts(affiliate.id);
      const stats = await storage.getAffiliateStats(affiliate.id);

      // Enrich signups with username data
      const signupsWithUsernames = await Promise.all(
        signups.map(async (signup) => {
          const user = await storage.getUser(signup.signupUserId);
          return {
            ...signup,
            username: user?.username || 'Unknown User'
          };
        })
      );

      res.json({
        signups: signupsWithUsernames,
        earnings,
        payouts,
        stats
      });
    } catch (error) {
      console.error("Get affiliate data error:", error);
      res.status(500).json({ error: "Failed to get affiliate data" });
    }
  });

  app.get("/api/affiliates/profile", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;

      // Check if user has an affiliate profile
      let affiliate = await storage.getAffiliate(userId);

      if (!affiliate) {
        // Auto-create affiliate profile for new users
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Generate a unique affiliate code based on username
        let affiliateCode = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (affiliateCode.length < 3) {
          affiliateCode = affiliateCode + Math.random().toString(36).substring(2, 5);
        }

        // Ensure uniqueness
        let counter = 1;
        let finalCode = affiliateCode;
        while (await storage.getAffiliateByCode(finalCode)) {
          finalCode = `${affiliateCode}${counter}`;
          counter++;
        }

        affiliate = await storage.createAffiliate({
          userId: userId,
          affiliateCode: finalCode,
          commissionRate: 30,
          totalEarnings: 0,
          totalPaidOut: 0,
          paypalEmail: null,
          isActive: true
        });
      }

      res.json(affiliate);
    } catch (error) {
      console.error("Get affiliate profile error:", error);
      res.status(500).json({ error: "Failed to get affiliate profile" });
    }
  });

  app.post("/api/affiliates/code", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { code } = req.body;

      if (!code || typeof code !== 'string' || code.length < 3 || code.length > 20) {
        return res.status(400).json({ error: "Affiliate code must be between 3 and 20 characters" });
      }

      // Check if code contains only alphanumeric characters
      if (!/^[a-zA-Z0-9]+$/.test(code)) {
        return res.status(400).json({ error: "Affiliate code can only contain letters and numbers" });
      }

      const success = await storage.setAffiliateCode(userId, code.toLowerCase());

      if (!success) {
        return res.status(400).json({ error: "Affiliate code is already taken" });
      }

      res.json({ affiliateCode: code.toLowerCase() });
    } catch (error) {
      console.error("Set affiliate code error:", error);
      res.status(500).json({ error: "Failed to set affiliate code" });
    }
  });

  app.post("/api/affiliates/payout", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { paypalEmail, requestedAmount } = req.body;

      if (!paypalEmail || typeof paypalEmail !== 'string') {
        return res.status(400).json({ error: "PayPal email is required" });
      }

      if (!requestedAmount || typeof requestedAmount !== 'number' || requestedAmount < 1000) {
        return res.status(400).json({ error: "Minimum payout amount is $10.00" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(paypalEmail)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      // Check if user has an affiliate profile
      const affiliate = await storage.getAffiliate(userId);
      if (!affiliate) {
        return res.status(404).json({ error: "Affiliate profile not found" });
      }

      // Check if user has sufficient balance
      const stats = await storage.getAffiliateStats(affiliate.id);
      if (stats.pendingBalance < requestedAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Create payout request
      const payout = await storage.createAffiliatePayout({
        affiliateId: affiliate.id,
        requestedAmount,
        paypalEmail,
        status: 'pending'
      });

      res.json({
        success: true,
        message: "Payout request submitted successfully",
        payout
      });
    } catch (error) {
      console.error("Request affiliate payout error:", error);
      res.status(500).json({ error: "Failed to request payout" });
    }
  });

  // Process affiliate code for OAuth users (secured endpoint) 
  app.post("/api/process-oauth-affiliate", authenticateToken, async (req, res) => {
    try {
      const { affiliateCode } = req.body;
      const userId = (req as any).user.userId;

      if (!affiliateCode) {
        return res.status(400).json({ error: "Affiliate code is required" });
      }

      // Get the user to check if they already have been credited
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user already has bonus credits (prevent double-crediting)
      if (user.bonusCredits && user.bonusCredits > 0) {
        return res.status(400).json({ error: "User already has affiliate bonus credits" });
      }

      // Find the affiliate by code
      const affiliate = await storage.getAffiliateByCode(affiliateCode.toLowerCase());
      if (!affiliate) {
        return res.status(404).json({ error: "Invalid affiliate code" });
      }

      // Prevent self-referral
      if (affiliate.userId === userId) {
        return res.status(400).json({ error: "Cannot refer yourself" });
      }

      // Check if this user has already been tracked as a signup for this affiliate
      const allSignups = await storage.getAffiliateSignups(affiliate.id);
      const existingSignup = allSignups.find(signup => signup.signupUserId === userId);
      if (existingSignup) {
        return res.status(400).json({ error: "User already counted as affiliate signup" });
      }

      // Award 500 bonus credits to the new user
      await storage.updateUser(userId, { bonusCredits: 500 });

      // Create affiliate signup record
      await storage.createAffiliateSignup({
        affiliateId: affiliate.id,
        signupUserId: userId,
        bonusCreditsAwarded: 500
      });

      console.log(`OAuth user ${userId} signed up via affiliate ${affiliate.userId} (code: ${affiliateCode}) and awarded 500 bonus credits`);
      console.log(`OAuth affiliate signup: User ${userId} awarded 500 bonus credits`);

      res.json({
        success: true,
        message: "Affiliate signup processed successfully! You received 500 bonus credits.",
        bonusCredits: 500,
        affiliateUsername: (await storage.getUser(affiliate.userId))?.username
      });
    } catch (error) {
      console.error("Failed to process OAuth affiliate:", error);
      res.status(500).json({ error: "Failed to process affiliate signup" });
    }
  });

  // Handle Stripe payment success and award referral credits (secured endpoint)
  app.get("/api/stripe/payment-success/:sessionId", authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }

      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;

      if (!stripeSecretKey) {
        console.error("Stripe secret key not configured");
        return res.status(500).json({ error: "Payment system not configured" });
      }

      // Import Stripe dynamically to use the database key
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      // Retrieve the checkout session
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        return res.status(400).json({ error: "Payment not completed" });
      }

      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId;
      const authenticatedUserId = (req as any).user.userId;

      if (!userId || !planId) {
        return res.status(400).json({ error: "Invalid session metadata" });
      }

      // Security check: ensure the authenticated user matches the session user
      if (userId !== authenticatedUserId) {
        return res.status(403).json({ error: "Unauthorized access to payment session" });
      }

      // Get user and check if they have a referrer
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update user's plan and subscription details
      const plan = await storage.getPlanById(planId);
      if (!plan) {
        return res.status(400).json({ error: "Invalid plan" });
      }

      // Check if this is a paid plan (Basic or higher - not the free plan)
      const isPaidPlan = plan.monthlyPrice > 0 || plan.yearlyPrice > 0;
      if (!isPaidPlan) {
        return res.json({
          success: true,
          message: "Payment processed successfully",
          planUpdated: true,
          referralCreditsAwarded: false,
          note: "Free plan - no referral credits awarded"
        });
      }

      await storage.updateUser(userId, {
        planId: plan.id,
        stripeSubscriptionId: session.subscription as string,
      });

      // Award referral credits if user was referred
      if (user.referredBy) {
        try {
          // Find the referral record
          const referrals = await storage.getUserReferrals(user.referredBy);
          const referralRecord = referrals.find(ref => ref.referredUserId === userId && !ref.isRewarded);

          if (referralRecord) {
            // Award 2500 credits to the referrer
            const creditsToAward = 2500;
            const success = await storage.awardReferralCredits(referralRecord.id, creditsToAward);

            if (success) {
              // Update referral record with plan upgrade timestamp
              await storage.updateReferral(referralRecord.id, {
                planUpgradeAt: new Date()
              });

              console.log(`Awarded ${creditsToAward} credits to referrer ${user.referredBy} for user ${userId} upgrading to paid plan ${plan.name}`);
            }
          }
        } catch (referralError) {
          console.error("Failed to award referral credits:", referralError);
          // Don't fail the payment success if referral crediting fails
        }
      }

      res.json({
        success: true,
        message: "Payment processed successfully",
        planUpdated: true,
        referralCreditsAwarded: !!user.referredBy
      });

    } catch (error) {
      console.error("Payment success processing error:", error);
      res.status(500).json({ error: "Failed to process payment success" });
    }
  });

  // Database backup endpoint
  app.get("/api/admin/database-backup", authenticateAdmin, async (req, res) => {
    let responseSent = false;

    const sendError = (statusCode: number, errorMsg: string) => {
      if (responseSent || res.headersSent) {
        console.log('Response already sent, cannot send error:', errorMsg);
        return;
      }
      responseSent = true;
      res.status(statusCode).json({ error: errorMsg });
    };

    try {
      // Create temporary backup file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `neonvideo_backup_${timestamp}.sql`;
      const tempDir = path.join(process.cwd(), 'temp');

      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const backupPath = path.join(tempDir, backupFileName);

      // Database connection parameters
      const dbParams = {
        host: process.env.PGHOST,
        port: process.env.PGPORT || '5432',
        database: process.env.PGDATABASE,
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD
      };

      console.log('Database backup params:', {
        host: dbParams.host,
        port: dbParams.port,
        database: dbParams.database,
        username: dbParams.username,
        hasPassword: !!dbParams.password
      });

      // Build pg_dump command
      const pgDumpArgs = [
        '-h', dbParams.host!,
        '-p', dbParams.port,
        '-U', dbParams.username!,
        '-d', dbParams.database!,
        '--clean',
        '--create',
        '--if-exists',
        '--no-password',
        '-f', backupPath
      ];

      // Set environment for pg_dump
      const env = {
        ...process.env,
        PGPASSWORD: dbParams.password
      };

      console.log(`Starting database backup: ${backupFileName}`);
      console.log(`Backup path: ${backupPath}`);

      // Execute pg_dump
      const pgDump = spawn('pg_dump', pgDumpArgs, { env });

      let stderrOutput = '';

      pgDump.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      pgDump.on('close', (code) => {
        console.log(`pg_dump exited with code: ${code}`);

        if (code !== 0) {
          console.error(`pg_dump failed with code ${code}`);
          console.error(`stderr: ${stderrOutput}`);
          sendError(500, `Database backup failed with code ${code}`);
          return;
        }

        try {
          // Check if backup file exists and has content
          if (!fs.existsSync(backupPath)) {
            console.error('Backup file does not exist:', backupPath);
            sendError(500, "Backup file was not created");
            return;
          }

          const stats = fs.statSync(backupPath);
          console.log(`Backup file stats: size=${stats.size} bytes`);

          if (stats.size === 0) {
            console.error('Backup file is empty');
            sendError(500, "Backup file is empty");
            return;
          }

          console.log(`Database backup completed: ${backupFileName} (${stats.size} bytes)`);

          if (res.headersSent) {
            console.log('Response already sent, cannot stream file');
            return;
          }

          // Set appropriate headers for file download
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${backupFileName}"`);
          res.setHeader('Content-Length', stats.size);

          // Stream the file to the response
          const fileStream = fs.createReadStream(backupPath);

          fileStream.on('error', (streamError) => {
            console.error(`Error streaming backup file: ${streamError}`);
            if (!res.headersSent && !responseSent) {
              sendError(500, "Error downloading backup file");
            } else {
              res.end();
            }
          });

          // Mark response as being sent only when pipe starts
          responseSent = true;
          fileStream.pipe(res);

          res.on('finish', () => {
            console.log('Database backup download completed successfully');
            // Clean up temporary file after download
            setTimeout(() => {
              try {
                if (fs.existsSync(backupPath)) {
                  fs.unlinkSync(backupPath);
                  console.log(`Temporary backup file deleted: ${backupPath}`);
                }
              } catch (cleanupError) {
                console.error(`Error cleaning up backup file: ${cleanupError}`);
              }
            }, 1000);
          });

        } catch (fileError) {
          console.error(`Error processing backup file: ${fileError}`);
          sendError(500, "Error processing backup file");
        }
      });

      pgDump.on('error', (error) => {
        console.error(`pg_dump process error: ${error}`);
        sendError(500, `Failed to start database backup: ${error.message}`);
      });

    } catch (error) {
      console.error("Database backup error:", error);
      sendError(500, "Failed to create database backup");
    }
  });

  // ImageKit backup endpoint - copies songs and character images to ImageKit.io in batches
  // Supports batch processing to avoid timeouts:
  // - type: 'songs' | 'characters' | 'all' (default: 'all')
  // - limit: number of items to process per request (default: 10)
  // - offset: starting index for pagination (default: 0)
  app.get("/api/admin/backup-to-imagekit", authenticateAdmin, async (req, res) => {
    try {
      const { publicKey, privateKey, urlEndpoint, type = 'all', limit = '10', offset = '0' } = req.query as {
        publicKey: string;
        privateKey: string;
        urlEndpoint: string;
        type?: string;
        limit?: string;
        offset?: string;
      };

      if (!publicKey || !privateKey || !urlEndpoint) {
        return res.status(400).json({
          error: "Missing required ImageKit credentials",
          required: ["publicKey", "privateKey", "urlEndpoint"],
          optionalParams: {
            type: "songs | characters | all (default: all)",
            limit: "number of items per batch (default: 10)",
            offset: "starting index (default: 0)"
          }
        });
      }

      const batchLimit = Math.min(parseInt(limit, 10) || 10, 50); // Max 50 per batch
      const batchOffset = parseInt(offset, 10) || 0;
      const processType = type as 'songs' | 'characters' | 'all';

      // Import ImageKit dynamically
      const ImageKit = (await import("imagekit")).default;

      const imagekit = new ImageKit({
        publicKey,
        privateKey,
        urlEndpoint
      });

      const results = {
        songs: {
          success: [] as string[],
          failed: [] as { url: string; error: string }[],
          skipped: [] as { url: string; reason: string }[]
        },
        characters: {
          success: [] as string[],
          failed: [] as { url: string; error: string }[],
          skipped: [] as { url: string; reason: string }[]
        }
      };

      // Get already backed up paths for incremental backup (mutable for tracking within this run)
      const backedUpPaths = await storage.getBackedUpPaths();
      console.log(`Found ${backedUpPaths.size} already backed up files`);

      let totalSongs = 0;
      let totalCharacters = 0;
      let songsRemaining = 0;
      let charactersRemaining = 0;

      // Process songs
      if (processType === 'songs' || processType === 'all') {
        const allSongs = await storage.getAllSongs();
        totalSongs = allSongs.length;

        // Filter to only songs that need backup
        const songsToBackup = allSongs.filter(song =>
          song.url &&
          song.url.startsWith("/objects/") &&
          !backedUpPaths.has(song.url)
        );

        songsRemaining = songsToBackup.length;
        console.log(`Found ${songsRemaining} songs needing backup out of ${totalSongs} total`);

        // Apply pagination
        const songBatch = songsToBackup.slice(batchOffset, batchOffset + batchLimit);
        console.log(`Processing songs batch: offset=${batchOffset}, limit=${batchLimit}, batchSize=${songBatch.length}`);

        for (const song of songBatch) {
          try {
            // Get the file from object storage
            const file = await objectStorage.getObjectEntityFile(song.url);
            const [contents] = await file.download();
            const fileBuffer = contents;
            const fileName = path.basename(song.url);

            // Upload to ImageKit
            const uploadResponse = await imagekit.upload({
              file: fileBuffer.toString("base64"),
              fileName: fileName,
              folder: "/audio"
            });

            // Record the backup in the database
            await storage.recordImagekitBackup({
              originalPath: song.url,
              imagekitUrl: uploadResponse.url,
              imagekitFileId: uploadResponse.fileId,
              fileType: "song"
            });

            // Track within this run to avoid duplicates
            backedUpPaths.add(song.url);

            results.songs.success.push(song.url);
            console.log(`Uploaded song ${song.id}: ${uploadResponse.url}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            results.songs.failed.push({ url: song.url, error: errorMessage });
            console.error(`Failed to upload song ${song.id}:`, error);
          }
        }

        // Count songs already backed up
        const alreadyBackedUp = allSongs.filter(s => s.url && backedUpPaths.has(s.url)).length;
        results.songs.skipped = [{ url: "summary", reason: `${alreadyBackedUp} already backed up` }];
      }

      // Process characters
      if (processType === 'characters' || processType === 'all') {
        const allCharacters = await storage.getAllSavedCharacters();
        totalCharacters = allCharacters.length;

        // Filter to only characters that need backup
        const charactersToBackup = allCharacters.filter(char =>
          char.imageUrl &&
          char.imageUrl.startsWith("/objects/") &&
          !backedUpPaths.has(char.imageUrl)
        );

        charactersRemaining = charactersToBackup.length;
        console.log(`Found ${charactersRemaining} characters needing backup out of ${totalCharacters} total`);

        // Apply pagination
        const characterBatch = charactersToBackup.slice(batchOffset, batchOffset + batchLimit);
        console.log(`Processing characters batch: offset=${batchOffset}, limit=${batchLimit}, batchSize=${characterBatch.length}`);

        for (const character of characterBatch) {
          try {
            // Get the file from object storage
            const file = await objectStorage.getObjectEntityFile(character.imageUrl);
            const [contents] = await file.download();
            const fileBuffer = contents;
            const fileName = path.basename(character.imageUrl);

            // Upload to ImageKit
            const uploadResponse = await imagekit.upload({
              file: fileBuffer.toString("base64"),
              fileName: fileName,
              folder: "/characters"
            });

            // Record the backup in the database
            await storage.recordImagekitBackup({
              originalPath: character.imageUrl,
              imagekitUrl: uploadResponse.url,
              imagekitFileId: uploadResponse.fileId,
              fileType: "character"
            });

            // Track within this run to avoid duplicates
            backedUpPaths.add(character.imageUrl);

            results.characters.success.push(character.imageUrl);
            console.log(`Uploaded character ${character.id}: ${uploadResponse.url}`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            results.characters.failed.push({ url: character.imageUrl, error: errorMessage });
            console.error(`Failed to upload character ${character.id}:`, error);
          }
        }

        // Count characters already backed up
        const alreadyBackedUp = allCharacters.filter(c => c.imageUrl && backedUpPaths.has(c.imageUrl)).length;
        results.characters.skipped = [{ url: "summary", reason: `${alreadyBackedUp} already backed up` }];
      }

      // Calculate remaining items after this batch
      const processedSongs = results.songs.success.length + results.songs.failed.length;
      const processedCharacters = results.characters.success.length + results.characters.failed.length;

      res.json({
        success: true,
        batch: {
          type: processType,
          offset: batchOffset,
          limit: batchLimit,
          processed: processedSongs + processedCharacters
        },
        summary: {
          songs: {
            total: totalSongs,
            remaining: Math.max(0, songsRemaining - processedSongs),
            uploaded: results.songs.success.length,
            failed: results.songs.failed.length
          },
          characters: {
            total: totalCharacters,
            remaining: Math.max(0, charactersRemaining - processedCharacters),
            uploaded: results.characters.success.length,
            failed: results.characters.failed.length
          }
        },
        nextBatch: {
          songs: songsRemaining > processedSongs ? `&type=songs&offset=0&limit=${batchLimit}` : null,
          characters: charactersRemaining > processedCharacters ? `&type=characters&offset=0&limit=${batchLimit}` : null
        },
        details: results
      });

    } catch (error) {
      console.error("ImageKit backup error:", error);
      res.status(500).json({ error: "Failed to backup to ImageKit" });
    }
  });

  app.get("/api/me", authenticateToken, async (req, res) => {
    try {
      const userWithPlan = await storage.getUserWithPlan((req as any).user.userId);
      if (!userWithPlan) {
        return res.status(404).json({ error: "User not found" });
      }

      // Calculate credits remaining
      const creditsRemaining = await storage.getUserCreditsRemaining(userWithPlan.id);

      // Debug logging
      console.log('DEBUG /api/me - User credits calculation:', {
        userId: userWithPlan.id,
        username: userWithPlan.username,
        planId: userWithPlan.planId,
        planName: userWithPlan.plan?.name,
        planCredits: userWithPlan.plan?.credits,
        creditsUsed: userWithPlan.creditsUsed,
        creditsRemaining
      });

      res.json({
        id: userWithPlan.id,
        username: userWithPlan.username,
        email: userWithPlan.email,
        avatarUrl: userWithPlan.avatarUrl,
        planId: userWithPlan.planId,
        creditsUsed: userWithPlan.creditsUsed || 0,
        creditsRemaining,
        createdAt: userWithPlan.createdAt,
        plan: userWithPlan.plan ? {
          id: userWithPlan.plan.id,
          name: userWithPlan.plan.name,
          credits: userWithPlan.plan.credits,
          features: userWithPlan.plan.features,
          monthlyPrice: userWithPlan.plan.monthlyPrice,
          yearlyPrice: userWithPlan.plan.yearlyPrice
        } : null
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user info" });
    }
  });

  // Update username
  app.patch("/api/user/username", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { username } = req.body;

      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ error: "Username is required" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username.trim());
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: "Username already taken" });
      }

      // Update username
      const user = await storage.updateUser(userId, { username: username.trim() });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email
      });
    } catch (error) {
      console.error("Update username error:", error);
      res.status(500).json({ error: "Failed to update username" });
    }
  });

  // Development-only: Reset admin password
  app.post("/api/dev/reset-admin-password", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: "This endpoint is disabled in production" });
    }

    try {
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.setSetting('admin_password', hashedPassword);

      const adminUsername = await storage.getSetting('admin_username') || 'admin';

      console.log(`[DEV] Admin password reset successfully for user: ${adminUsername}`);
      res.json({
        success: true,
        message: `Admin password reset successfully. Username: ${adminUsername}`
      });
    } catch (error) {
      console.error("Reset admin password error:", error);
      res.status(500).json({ error: "Failed to reset admin password" });
    }
  });

  // Admin authentication routes
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      // Get admin credentials from database
      const adminUsername = await storage.getSetting('admin_username');
      const adminPasswordHash = await storage.getSetting('admin_password');

      if (!adminUsername || !adminPasswordHash) {
        return res.status(500).json({ error: "Admin credentials not configured" });
      }

      // Check username
      if (username !== adminUsername) {
        return res.status(401).json({ error: "Invalid admin credentials" });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, adminPasswordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid admin credentials" });
      }

      // Generate admin JWT token
      const token = jwt.sign(
        { username: adminUsername, isAdmin: true },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        admin: { username: adminUsername },
        token
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: "Admin login failed" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", authenticateAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 50));
      const planFilter = req.query.plan as string;
      const searchQuery = req.query.search as string;

      const result = await storage.getAdminUsersPaginated({
        page,
        limit,
        search: searchQuery,
        planFilter
      });

      const totalPages = Math.ceil(result.totalCount / limit);

      res.json({
        users: result.users,
        pagination: {
          page,
          limit,
          totalCount: result.totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error("Admin get users error:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  app.delete("/api/admin/users/:userId", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete user error:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.put("/api/admin/users/:userId", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { username, email } = req.body;
      await storage.updateUser(userId, { username, email });
      res.json({ success: true });
    } catch (error) {
      console.error("Admin update user error:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.put("/api/admin/users/:userId/plan", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      // Verify the plan exists
      const plans = await storage.getAllPlans();
      const planExists = plans.some(p => p.id === planId);

      if (!planExists) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      await storage.updateUser(userId, { planId });
      res.json({ success: true });
    } catch (error) {
      console.error("Admin update user plan error:", error);
      res.status(500).json({ error: "Failed to update user plan" });
    }
  });

  // CSV export endpoint for users (name and email only)
  app.get("/api/admin/characters", authenticateAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit as string) || 100));

      const result = await storage.getAllSavedCharactersWithUsersPaginated({ page, limit });

      const totalPages = Math.ceil(result.totalCount / limit);

      res.json({
        characters: result.characters,
        pagination: {
          page,
          limit,
          totalCount: result.totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error("Admin get characters error:", error);
      res.status(500).json({ error: "Failed to get characters" });
    }
  });

  app.get("/api/admin/users/export", authenticateAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();

      // Create CSV content with header
      let csvContent = "Name,Email\n";

      // Add user data (username as name, email)
      users.forEach(user => {
        // Escape commas and quotes in data
        const name = user.username.replace(/"/g, '""');
        const email = user.email.replace(/"/g, '""');
        csvContent += `"${name}","${email}"\n`;
      });

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Admin export users error:", error);
      res.status(500).json({ error: "Failed to export users" });
    }
  });

  // Admin endpoint to give bonus credits to users
  app.put("/api/admin/users/:userId/bonus-credits", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;

      // Validate request body using Zod schema
      const bonusCreditsSchema = z.object({
        bonusCredits: z.number()
          .int("Bonus credits must be an integer")
          .min(0, "Bonus credits cannot be negative")
          .max(1000000, "Bonus credits cannot exceed 1,000,000")
          .finite("Bonus credits must be a finite number")
      });

      const validation = bonusCreditsSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid bonus credits amount",
          details: validation.error.errors.map(e => e.message).join(", ")
        });
      }

      const { bonusCredits } = validation.data;

      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update user's bonus credits
      await storage.updateUser(userId, { bonusCredits });

      res.json({
        success: true,
        message: `Successfully updated bonus credits to ${bonusCredits} for user ${user.username}`
      });
    } catch (error) {
      console.error("Admin update bonus credits error:", error);
      res.status(500).json({ error: "Failed to update bonus credits" });
    }
  });

  // Admin endpoint to update credits used for a user
  app.put("/api/admin/users/:userId/credits-used", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;

      // Validate request body using Zod schema
      const creditsUsedSchema = z.object({
        creditsUsed: z.number()
          .int("Credits used must be an integer")
          .min(0, "Credits used cannot be negative")
          .max(10000000, "Credits used cannot exceed 10,000,000")
          .finite("Credits used must be a finite number")
      });

      const validation = creditsUsedSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid credits used amount",
          details: validation.error.errors.map(e => e.message).join(", ")
        });
      }

      const { creditsUsed } = validation.data;

      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Update user's credits used
      await storage.updateUser(userId, { creditsUsed });

      res.json({
        success: true,
        message: `Successfully updated credits used to ${creditsUsed} for user ${user.username}`
      });
    } catch (error) {
      console.error("Admin update credits used error:", error);
      res.status(500).json({ error: "Failed to update credits used" });
    }
  });

  app.get("/api/admin/plans", authenticateAdmin, async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans);
    } catch (error) {
      console.error("Admin get plans error:", error);
      res.status(500).json({ error: "Failed to get plans" });
    }
  });

  app.get("/api/admin/stats", authenticateAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const allProjects = await Promise.all(users.map(user => storage.getUserProjects(user.id)));
      const projects = allProjects.flat();

      // Calculate stats
      const totalUsers = users.length;
      const completedProjects = projects.filter(p => p.isCompleted).length;

      // Calculate monthly revenue - get all users with their plans
      const usersWithPlans = await Promise.all(users.map(async (user) => {
        const userWithPlan = await storage.getUserWithPlan(user.id);
        return {
          userId: user.id,
          planId: userWithPlan?.planId,
          planName: userWithPlan?.plan?.name || "Free",
          monthlyPrice: userWithPlan?.plan?.monthlyPrice || 0,
          yearlyPrice: userWithPlan?.plan?.yearlyPrice || 0,
          planIsActive: userWithPlan?.plan?.isActive ?? false,
        };
      }));

      const subscribedUsers = usersWithPlans.filter((user) => {
        const isFreeByName = user.planName.toLowerCase() === "free";
        const isFreeByPrice = user.monthlyPrice === 0;
        return !(isFreeByName || isFreeByPrice);
      }).length;

      const usersByPlanMap = usersWithPlans.reduce((acc, user) => {
        const planName = user.planName || "Free";
        acc[planName] = (acc[planName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const usersByPlan = Object.entries(usersByPlanMap).map(([planName, userCount]) => ({
        planName,
        userCount,
      }));

      // Estimate monthly revenue from users on active paid plans.
      // For yearly-only plans, approximate monthly value as yearly/12.
      const monthlyRevenue = usersWithPlans.reduce((total, user) => {
        const isPaidPlan = user.monthlyPrice > 0 || user.yearlyPrice > 0;
        if (!user.planIsActive || !isPaidPlan) {
          return total;
        }

        const monthlyEquivalentCents = user.monthlyPrice > 0
          ? user.monthlyPrice
          : Math.round(user.yearlyPrice / 12);

        return total + (monthlyEquivalentCents / 100);
      }, 0);

      // Group by creation date for charts
      const userSignupsByDay = users.reduce((acc: any, user) => {
        const date = user.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      const projectsByDay = projects.reduce((acc: any, project) => {
        const date = project.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      res.json({
        overview: {
          totalUsers,
          monthlyRevenue,
          subscribedUsers,
          completedProjects
        },
        usersByPlan,
        charts: {
          userSignups: Object.entries(userSignupsByDay).map(([date, count]) => ({ date, count })),
          projectCreations: Object.entries(projectsByDay).map(([date, count]) => ({ date, count }))
        }
      });
    } catch (error) {
      console.error("Admin get stats error:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  app.post("/api/admin/reset-password", authenticateAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Save to database with error handling
      try {
        await storage.setSetting('admin_password', hashedPassword, true);

        // Verify the exact password hash was saved correctly
        const savedPassword = await storage.getSetting('admin_password');
        if (savedPassword !== hashedPassword) {
          console.error("❌ Password verification failed - saved password doesn't match new hash");
          console.error(`Expected: ${hashedPassword.substring(0, 20)}...`);
          console.error(`Got: ${savedPassword?.substring(0, 20) || 'null'}...`);
          throw new Error("Password write verification failed - hash mismatch");
        }

        console.log("✅ Admin password updated and verified successfully");

        // Send security notification email
        const ipAddress = getClientIpAddress(req) || 'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        emailService.sendAdminSettingsChangeNotification({
          settingName: 'Admin Password',
          ipAddress,
          userAgent,
          details: 'The admin dashboard password was changed'
        }).catch(err => console.error('Failed to send admin notification email:', err));

        res.json({ success: true, message: "Admin password updated successfully" });
      } catch (storageError) {
        console.error("❌ Failed to save admin password to database:", storageError);
        throw new Error("Failed to persist password change to database");
      }
    } catch (error) {
      console.error("Admin reset password error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to reset password" });
    }
  });

  // Get Stripe settings
  app.get("/api/admin/stripe-settings", authenticateAdmin, async (req, res) => {
    try {
      const publishableKey = await storage.getSetting('stripe_publishable_key');
      const secretKey = await storage.getSetting('stripe_secret_key');
      const webhookSecret = await storage.getSetting('stripe_webhook_secret');

      res.json({
        stripePublishableKey: publishableKey || '',
        stripeSecretKey: secretKey ? '••••••••' + secretKey.slice(-4) : '', // Mask the secret key
        stripeWebhookSecret: webhookSecret ? '••••••••' + webhookSecret.slice(-8) : '', // Mask the webhook secret
        isConfigured: !!(publishableKey && secretKey && webhookSecret)
      });
    } catch (error) {
      console.error("Get Stripe settings error:", error);
      res.status(500).json({ error: "Failed to get Stripe settings" });
    }
  });

  // Update Stripe settings
  app.post("/api/admin/stripe-settings", authenticateAdmin, async (req, res) => {
    try {
      const { stripePublishableKey, stripeSecretKey, stripeWebhookSecret } = req.body;

      const changedSettings: string[] = [];

      // Save each key if provided (don't overwrite if not provided)
      if (stripePublishableKey) {
        await storage.setSetting('stripe_publishable_key', stripePublishableKey, false);
        changedSettings.push('Publishable Key');
      }

      if (stripeSecretKey && !stripeSecretKey.includes('••••')) { // Only update if not masked
        await storage.setSetting('stripe_secret_key', stripeSecretKey, true);
        changedSettings.push('Secret Key');
      }

      if (stripeWebhookSecret && !stripeWebhookSecret.includes('••••')) { // Only update if not masked
        await storage.setSetting('stripe_webhook_secret', stripeWebhookSecret, true);
        changedSettings.push('Webhook Secret');
      }

      // Send security notification email if any settings were changed
      if (changedSettings.length > 0) {
        const ipAddress = getClientIpAddress(req) || 'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        emailService.sendAdminSettingsChangeNotification({
          settingName: 'Stripe Configuration',
          ipAddress,
          userAgent,
          details: `Changed settings: ${changedSettings.join(', ')}`
        }).catch(err => console.error('Failed to send admin notification email:', err));
      }

      res.json({ success: true, message: "Stripe settings updated successfully" });
    } catch (error) {
      console.error("Update Stripe settings error:", error);
      res.status(500).json({ error: "Failed to update Stripe settings" });
    }
  });

  // Public endpoint to get active plans
  app.get("/api/plans", async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      // Filter to only show active plans, hide Free plan from public listing
      const activePlans = plans.filter(plan => plan.isActive && plan.name.toLowerCase() !== 'free');
      res.json(activePlans);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ error: "Failed to get plans" });
    }
  });

  // Plans management routes (Admin only)
  app.get("/api/admin/plans", authenticateAdmin, async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans);
    } catch (error) {
      console.error("Get plans error:", error);
      res.status(500).json({ error: "Failed to get plans" });
    }
  });

  app.post("/api/admin/plans", authenticateAdmin, async (req, res) => {
    try {
      const planData = insertPlanSchema.parse(req.body);
      const plan = await storage.createPlan(planData);
      res.status(201).json(plan);
    } catch (error) {
      console.error("Create plan error:", error);
      const message = error instanceof Error ? error.message : 'Failed to create plan';
      res.status(400).json({ error: message });
    }
  });

  app.put("/api/admin/plans/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updatedPlan = await storage.updatePlan(id, updates);
      if (!updatedPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      res.json(updatedPlan);
    } catch (error) {
      console.error("Update plan error:", error);
      res.status(500).json({ error: "Failed to update plan" });
    }
  });

  app.delete("/api/admin/plans/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deletePlan(id);

      if (!success) {
        return res.status(404).json({ error: "Plan not found" });
      }

      res.json({ success: true, message: "Plan deleted successfully" });
    } catch (error) {
      console.error("Delete plan error:", error);
      res.status(500).json({ error: "Failed to delete plan" });
    }
  });

  // Update user email verification status
  app.patch("/api/admin/users/:id/email-verification", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { emailVerified } = req.body;

      // Validate the input
      if (typeof emailVerified !== 'boolean') {
        return res.status(400).json({ error: "emailVerified must be a boolean" });
      }

      const updatedUser = await storage.updateUser(id, { emailVerified });
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        message: emailVerified ? "User email verified successfully" : "User email unverified successfully",
        emailVerified
      });
    } catch (error) {
      console.error("Admin update email verification error:", error);
      res.status(500).json({ error: "Failed to update email verification status" });
    }
  });

  // Admin - Get user's projects
  app.get("/api/admin/users/:id/projects", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const projects = await storage.getProjectsByUser(id);

      // Sort by createdAt descending (newest first)
      projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Return projects with key information for admin view
      const projectsWithDetails = projects.map(project => ({
        id: project.id,
        title: project.title,
        description: project.description,
        toolUsed: project.toolUsed,
        currentStep: project.currentStep,
        audioUrl: project.audioUrl,
        audioType: project.audioType,
        audioPrompt: project.audioPrompt,
        audioDuration: project.audioDuration,
        characterImageUrl: project.characterImageUrl,
        characterType: project.characterType,
        characterPrompt: project.characterPrompt,
        scenePrompts: project.scenePrompts,
        sceneImages: project.sceneImages,
        videoSegments: project.videoSegments,
        finalVideoUrl: project.finalVideoUrl,
        muxPlaybackId: project.muxPlaybackId,
        muxAssetStatus: project.muxAssetStatus,
        isCompleted: project.isCompleted,
        generationStatus: project.generationStatus,
        aspectRatio: project.aspectRatio,
        videoQuality: project.videoQuality,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }));

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        projects: projectsWithDetails,
      });
    } catch (error) {
      console.error("Admin get user projects error:", error);
      res.status(500).json({ error: "Failed to get user projects" });
    }
  });

  // Admin Video Management Routes
  app.get("/api/admin/videos", authenticateAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 50));
      const searchQuery = req.query.search as string;
      const statusFilter = req.query.status as string;

      const result = await storage.getAdminVideosPaginated({
        page,
        limit,
        search: searchQuery,
        statusFilter
      });

      const totalPages = Math.ceil(result.totalCount / limit);

      const videosWithUsers = await Promise.all(
        result.videos.map(async (video) => {
          const user = await storage.getUser(video.userId);

          let thumbnailUrl = null;
          if (video.sceneData) {
            try {
              const scenes = typeof video.sceneData === 'string'
                ? JSON.parse(video.sceneData)
                : video.sceneData;

              if (Array.isArray(scenes) && scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                thumbnailUrl = lastScene.imageUrl || null;
              }
            } catch (e) {
              // Silently handle parse errors for old data
            }
          }

          return {
            ...video,
            title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(video.title) ? (video.audioPrompt ? video.audioPrompt.substring(0, 50) + (video.audioPrompt.length > 50 ? '...' : '') : video.title) : video.title,
            username: user?.username || 'Unknown User',
            thumbnailUrl
          };
        })
      );

      res.json({
        videos: videosWithUsers,
        pagination: {
          page,
          limit,
          totalCount: result.totalCount,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error("Get all videos error:", error);
      res.status(500).json({ error: "Failed to get videos" });
    }
  });

  app.put("/api/admin/videos/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updatedVideo = await storage.updateVideoAsAdmin(id, updates);
      if (!updatedVideo) {
        return res.status(404).json({ error: "Video not found" });
      }

      res.json(updatedVideo);
    } catch (error) {
      console.error("Update video error:", error);
      res.status(500).json({ error: "Failed to update video" });
    }
  });

  app.delete("/api/admin/videos/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteVideoAsAdmin(id);

      if (!success) {
        return res.status(404).json({ error: "Video not found" });
      }

      res.json({ success: true, message: "Video deleted successfully" });
    } catch (error) {
      console.error("Delete video error:", error);
      res.status(500).json({ error: "Failed to delete video" });
    }
  });

  // Toggle video featured status
  app.patch("/api/admin/videos/:id/featured", authenticateAdmin, async (req, res) => {
    try {
      const { isFeatured } = req.body;
      const videoId = req.params.id;

      // Validate the input
      if (typeof isFeatured !== 'boolean') {
        return res.status(400).json({ error: "isFeatured must be a boolean" });
      }

      const success = await storage.updateProject(videoId, { isFeatured });
      if (!success) {
        return res.status(404).json({ error: "Video not found" });
      }

      // When featuring a video, push it to Bunny Stream for HLS playback (fire-and-forget)
      if (isFeatured && isBunnyStreamConfigured()) {
        const project = await storage.getProject(videoId);
        if (project?.finalVideoUrl && !project.bunnyVideoId) {
          fetchVideoToBunnyStream(project.finalVideoUrl, project.title)
            .then(async ({ videoId: streamVideoId, libraryId }) => {
              await storage.updateProject(videoId, {
                bunnyVideoId: streamVideoId,
                bunnyLibraryId: libraryId,
                bunnyVideoStatus: "processing",
              });
              console.log(`[Admin] Bunny Stream fetch initiated for featured video ${videoId} -> ${streamVideoId}`);
            })
            .catch((err) => {
              console.error(`[Admin] Failed to push featured video ${videoId} to Bunny Stream:`, err);
            });
        }
      }

      res.json({
        message: isFeatured ? "Video featured successfully" : "Video unfeatured successfully",
        isFeatured
      });
    } catch (error) {
      console.error("Admin toggle featured video error:", error);
      res.status(500).json({ error: "Failed to update video featured status" });
    }
  });

  // Admin Audio Management Routes
  app.get("/api/admin/audios", authenticateAdmin, async (req, res) => {
    try {
      const allProjects = await storage.getAllVideosForAdmin();
      // Filter only audio projects (projects with audioUrl but not finalVideoUrl)
      const audios = allProjects.filter(p => p.audioUrl && !p.finalVideoUrl);

      // Add user information to each audio
      const audiosWithUsers = await Promise.all(
        audios.map(async (audio) => {
          const user = await storage.getUser(audio.userId);
          return {
            ...audio,
            username: user?.username || 'Unknown User'
          };
        })
      );
      res.json(audiosWithUsers);
    } catch (error) {
      console.error("Get all audios error:", error);
      res.status(500).json({ error: "Failed to get audios" });
    }
  });

  app.put("/api/admin/audios/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updatedAudio = await storage.updateVideoAsAdmin(id, updates);
      if (!updatedAudio) {
        return res.status(404).json({ error: "Audio not found" });
      }

      res.json(updatedAudio);
    } catch (error) {
      console.error("Update audio error:", error);
      res.status(500).json({ error: "Failed to update audio" });
    }
  });

  app.delete("/api/admin/audios/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteVideoAsAdmin(id);

      if (!success) {
        return res.status(404).json({ error: "Audio not found" });
      }

      res.json({ success: true, message: "Audio deleted successfully" });
    } catch (error) {
      console.error("Delete audio error:", error);
      res.status(500).json({ error: "Failed to delete audio" });
    }
  });

  // Admin get all comments
  app.get("/api/admin/comments", authenticateAdmin, async (req, res) => {
    try {
      const comments = await storage.getAllComments();
      res.json(comments);
    } catch (error) {
      console.error("Admin get comments error:", error);
      res.status(500).json({ error: "Failed to get comments" });
    }
  });

  // Admin delete comment
  app.delete("/api/admin/comments/:commentId", authenticateAdmin, async (req, res) => {
    try {
      const { commentId } = req.params;

      const success = await storage.adminDeleteComment(commentId);

      if (!success) {
        return res.status(404).json({ error: "Comment not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete comment error:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Admin list scene images (music + story projects)
  app.get("/api/admin/scenes", authenticateAdmin, async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "48"), 10) || 48));
      const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);
      const sortRaw = String(req.query.sortBy || "project_updated").toLowerCase().replace(/-/g, "_");
      const sortBy =
        sortRaw === "user_created"
          ? "user_created"
          : sortRaw === "project_created"
            ? "project_created"
            : "project_updated";
      const userSearch =
        typeof req.query.search === "string" && req.query.search.trim()
          ? req.query.search.trim()
          : undefined;
      const { scenes, totalCount } = await storage.getAdminScenesPaginated({
        limit,
        offset,
        sortBy,
        userSearch,
      });
      res.json({ scenes, totalCount, limit, offset, sortBy, search: userSearch ?? null });
    } catch (error) {
      console.error("Admin get scenes error:", error);
      res.status(500).json({ error: "Failed to get scenes" });
    }
  });

  // Admin delete one scene image (Bunny file + project JSON)
  app.delete("/api/admin/scenes", authenticateAdmin, async (req, res) => {
    try {
      const projectId = req.body?.projectId as string | undefined;
      const source = req.body?.source as "music_video" | "story_video" | undefined;
      const sceneIndex = req.body?.sceneIndex;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ error: "projectId required" });
      }
      if (source !== "music_video" && source !== "story_video") {
        return res.status(400).json({ error: "source must be music_video or story_video" });
      }
      if (typeof sceneIndex !== "number" || !Number.isInteger(sceneIndex) || sceneIndex < 0) {
        return res.status(400).json({ error: "sceneIndex must be a non-negative integer" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      let imageUrl: string | undefined;
      if (source === "music_video") {
        const arr = (project.sceneImages as string[] | null) || [];
        imageUrl = arr[sceneIndex];
      } else {
        const arr = (project.storySceneImages as string[] | null) || [];
        imageUrl = arr[sceneIndex];
      }
      if (!imageUrl || !String(imageUrl).trim()) {
        return res.status(404).json({ error: "Scene not found at index" });
      }

      try {
        await deleteBunnyFileByPublicUrlIfConfigured(imageUrl);
      } catch (e) {
        console.error("[Admin] Bunny delete scene image:", e);
      }

      const updates =
        source === "music_video"
          ? buildMusicVideoSceneRemoval(project, sceneIndex)
          : buildStoryVideoSceneRemoval(project, sceneIndex);
      await storage.updateProject(projectId, updates);

      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete scene error:", error);
      const msg = error instanceof Error ? error.message : "Failed to delete scene";
      if (msg.includes("Invalid scene")) {
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: "Failed to delete scene" });
    }
  });

  // Admin ban user
  app.post("/api/admin/users/:userId/ban", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminUser = (req as any).user;

      // Get user to be banned
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Ban the user - use username from JWT token
      const bannedBy = adminUser?.username || "Admin";
      await storage.banUser(user.email, bannedBy, reason);

      res.json({ success: true, message: "User banned successfully" });
    } catch (error) {
      console.error("Admin ban user error:", error);
      res.status(500).json({ error: "Failed to ban user" });
    }
  });

  // Admin unban user
  app.post("/api/admin/users/:userId/unban", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;

      // Get user to be unbanned
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Unban the user
      await storage.unbanUser(user.email);

      res.json({ success: true, message: "User unbanned successfully" });
    } catch (error) {
      console.error("Admin unban user error:", error);
      res.status(500).json({ error: "Failed to unban user" });
    }
  });

  // Admin get all banned users
  app.get("/api/admin/banned-users", authenticateAdmin, async (req, res) => {
    try {
      const bannedUsers = await storage.getAllBannedUsers();
      res.json(bannedUsers);
    } catch (error) {
      console.error("Admin get banned users error:", error);
      res.status(500).json({ error: "Failed to get banned users" });
    }
  });

  // Admin coupon code routes
  app.get("/api/admin/coupons", authenticateAdmin, async (req, res) => {
    try {
      const coupons = await storage.getAllCouponCodes();
      res.json(coupons);
    } catch (error) {
      console.error("Admin get coupons error:", error);
      res.status(500).json({ error: "Failed to get coupons" });
    }
  });

  app.post("/api/admin/coupons", authenticateAdmin, async (req, res) => {
    try {
      const { code, credits, maxUses, expiresAt } = req.body;

      // Validate code
      if (!code || typeof code !== 'string' || code.trim().length < 3) {
        return res.status(400).json({ error: "Code must be at least 3 characters" });
      }

      // Validate credits
      const creditsNum = parseInt(credits);
      if (isNaN(creditsNum) || creditsNum < 1) {
        return res.status(400).json({ error: "Credits must be a positive number" });
      }

      // Validate maxUses if provided
      let maxUsesNum = null;
      if (maxUses !== undefined && maxUses !== null && maxUses !== '') {
        maxUsesNum = parseInt(maxUses);
        if (isNaN(maxUsesNum) || maxUsesNum < 1) {
          return res.status(400).json({ error: "Max uses must be a positive number" });
        }
      }

      // Validate expiresAt if provided
      let expiresAtDate = null;
      if (expiresAt) {
        expiresAtDate = new Date(expiresAt);
        if (isNaN(expiresAtDate.getTime())) {
          return res.status(400).json({ error: "Invalid expiration date" });
        }
      }

      // Check if code already exists
      const existingCoupon = await storage.getCouponCodeByCode(code.toUpperCase());
      if (existingCoupon) {
        return res.status(400).json({ error: "This code already exists" });
      }

      const coupon = await storage.createCouponCode({
        code: code.toUpperCase().trim(),
        credits: creditsNum,
        maxUses: maxUsesNum,
        expiresAt: expiresAtDate,
        isActive: true,
        usesCount: 0,
      });

      res.json(coupon);
    } catch (error) {
      console.error("Admin create coupon error:", error);
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });

  app.patch("/api/admin/coupons/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { isActive, maxUses, expiresAt } = req.body;

      const updates: any = {};
      if (typeof isActive === 'boolean') updates.isActive = isActive;

      // Validate maxUses if provided
      if (maxUses !== undefined) {
        if (maxUses === null || maxUses === '') {
          updates.maxUses = null;
        } else {
          const maxUsesNum = parseInt(maxUses);
          if (isNaN(maxUsesNum) || maxUsesNum < 1) {
            return res.status(400).json({ error: "Max uses must be a positive number" });
          }
          updates.maxUses = maxUsesNum;
        }
      }

      // Validate expiresAt if provided
      if (expiresAt !== undefined) {
        if (expiresAt === null || expiresAt === '') {
          updates.expiresAt = null;
        } else {
          const expiresAtDate = new Date(expiresAt);
          if (isNaN(expiresAtDate.getTime())) {
            return res.status(400).json({ error: "Invalid expiration date" });
          }
          updates.expiresAt = expiresAtDate;
        }
      }

      const coupon = await storage.updateCouponCode(id, updates);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      res.json(coupon);
    } catch (error) {
      console.error("Admin update coupon error:", error);
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });

  app.delete("/api/admin/coupons/:id", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteCouponCode(id);
      if (!success) {
        return res.status(404).json({ error: "Coupon not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete coupon error:", error);
      res.status(500).json({ error: "Failed to delete coupon" });
    }
  });

  // User coupon redemption route
  app.post("/api/redeem-coupon", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: "Code is required" });
      }

      const result = await storage.redeemCouponCode(code.toUpperCase(), userId);

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      res.json(result);
    } catch (error) {
      console.error("Redeem coupon error:", error);
      res.status(500).json({ error: "Failed to redeem coupon" });
    }
  });

  // Update password
  app.patch("/api/user/password", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters long" });
      }

      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      const updatedUser = await storage.updateUser(userId, { password: hashedPassword });
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({ error: "Failed to update password" });
    }
  });

  // Delete account (actually bans the user)
  app.post("/api/user/delete-account", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;

      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user has an active subscription (not Free plan)
      const userPlan = await storage.getPlanById(user.planId);
      if (userPlan && userPlan.name !== "Free") {
        return res.status(400).json({
          error: "Please downgrade to the Free plan before deleting your account",
          hasActiveSubscription: true
        });
      }

      // Instead of deleting, ban the user with reason "Deleted" and bannedBy "User"
      await storage.banUser(user.email, "User", "Deleted");

      res.json({
        success: true,
        message: "Account deleted successfully. You will be logged out shortly."
      });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Get video generation configurations
  app.get("/api/video-generation-configs", async (req, res) => {
    try {
      const configs = await storage.getAllVideoGenerationConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Get video generation configs error:", error);
      res.status(500).json({ error: "Failed to get video generation configurations" });
    }
  });

  // Get avatar upload URL
  app.post("/api/user/avatar/upload-url", authenticateToken, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Get avatar upload URL error:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Update user avatar
  app.patch("/api/user/avatar", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { avatarUrl } = req.body;

      if (!avatarUrl) {
        return res.status(400).json({ error: "Avatar URL is required" });
      }

      // For public avatars (predefined avatars), store the URL as-is
      // For uploaded avatars, we would normalize them, but predefined avatars don't need normalization
      const finalAvatarUrl = avatarUrl;

      // Update user avatar
      const user = await storage.updateUser(userId, { avatarUrl: finalAvatarUrl });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl
      });
    } catch (error) {
      console.error("Update avatar error:", error);
      res.status(500).json({ error: "Failed to update avatar" });
    }
  });

  // Get avatar options with production-safe URLs
  app.get("/api/avatar-options", authenticateToken, async (req, res) => {
    try {
      const avatarOptions = [];

      // Always use fallback URLs for avatars since the actual files may not exist in object storage
      // This ensures avatars display consistently in both development and production

      // Add anonymous avatar (default for new users)
      avatarOptions.push({
        id: 0,
        url: `https://neonvideo.b-cdn.net/avatars/anonymous.png`,
        localUrl: `https://neonvideo.b-cdn.net/avatars/anonymous.png`
      });

      for (let i = 1; i <= 19; i++) {
        avatarOptions.push({
          id: i,
          url: `https://neonvideo.b-cdn.net/avatars/${i}.png`,
          localUrl: `https://neonvideo.b-cdn.net/avatars/${i}.png`
        });
      }

      // Avatar URLs now use ImageKit, no need for signed URL generation
      // Development and production now use the same avatar array structure

      res.json({ avatarOptions });
    } catch (error) {
      console.error("Error getting avatar options:", error);
      res.status(500).json({ error: "Failed to get avatar options" });
    }
  });


  // Serve sitemap.xml
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const path = await import("path");
      const fs = await import("fs");
      const sitemapPath = path.join(process.cwd(), "public", "sitemap.xml");

      if (fs.existsSync(sitemapPath)) {
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.sendFile(sitemapPath);
      } else {
        res.status(404).send('Sitemap not found');
      }
    } catch (error) {
      console.error('Error serving sitemap:', error);
      res.status(500).send('Error serving sitemap');
    }
  });

  // Serve public objects (like avatars)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    try {
      const filePath = req.params.filePath;
      console.log(`Public object request: ${filePath}`);

      // Check if ImageKit is configured
      const { isImageKitConfigured } = await import("./services/imagekit");
      const imageKitConfigured = isImageKitConfigured();

      // Skip object storage search if ImageKit is configured (especially for subtitles)
      // or in production for certain file types
      let shouldSearchObjectStorage = true;

      if (imageKitConfigured) {
        // ImageKit is configured - don't use GCS
        // For subtitles, they should be in ImageKit, not GCS
        if (filePath.includes('subtitles/')) {
          shouldSearchObjectStorage = false;
          console.log("ImageKit configured - skipping GCS search for subtitle file. Subtitle should be in ImageKit.");
        }
      }

      if (process.env.NODE_ENV === 'production') {
        // In production, skip object storage search for watermark to avoid auth errors
        if (filePath.includes('neonlogo_watermark.png')) {
          shouldSearchObjectStorage = false;
          console.log("Skipping object storage search for watermark in production - using SVG fallback");
        }
      }

      if (shouldSearchObjectStorage && !imageKitConfigured) {
        try {
          const objectStorageService = new ObjectStorageService();

          // Try to find the file in object storage (only if ImageKit is not configured)
          const file = await objectStorageService.searchPublicObject(filePath);
          if (file) {
            console.log(`Found file in object storage: ${filePath}`);
            return objectStorageService.downloadObject(file, res);
          } else {
            console.log(`File not found in object storage: ${filePath}`);
          }
        } catch (storageError) {
          console.warn(`Object storage search failed for ${filePath}:`, storageError);
        }
      } else if (imageKitConfigured && filePath.includes('subtitles/')) {
        // ImageKit is configured and this is a subtitle - return 404 since it should be accessed via ImageKit URL
        console.log(`Subtitle file requested via /public-objects/ but ImageKit is configured. Subtitle should be accessed via ImageKit URL.`);
        return res.status(404).json({ error: "Subtitle file not found. When ImageKit is configured, subtitles are stored in ImageKit and should be accessed via ImageKit URL." });
      }

      // If it's an avatar request and file doesn't exist, provide a generic fallback
      if (filePath.includes('avatars/')) {
        // Generate a simple SVG avatar as fallback
        const avatarMatch = filePath.match(/avatar(\d+)\.png/);
        const avatarId = avatarMatch ? avatarMatch[1] : '?';
        const isAnonymous = filePath.includes('anonymous.png');
        const displayText = isAnonymous ? '?' : avatarId;

        const svgContent = `
        <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="grad" cx="50%" cy="30%" r="70%">
              <stop offset="0%" style="stop-color:#6366f1;stop-opacity:0.8" />
              <stop offset="100%" style="stop-color:#3730a3;stop-opacity:1" />
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="32" fill="url(#grad)"/>
          <text x="32" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
                text-anchor="middle" fill="white">${displayText}</text>
        </svg>`;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(svgContent);
      }

      // If it's a watermark request and file doesn't exist, provide a fallback watermark
      if (filePath.includes('neonlogo_watermark.png')) {
        // Generate a simple SVG watermark as fallback
        const svgWatermark = `
        <svg width="200" height="60" viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="neonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#ff00ff;stop-opacity:0.9" />
              <stop offset="50%" style="stop-color:#00ffff;stop-opacity:0.9" />
              <stop offset="100%" style="stop-color:#ff00ff;stop-opacity:0.9" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <rect width="200" height="60" fill="rgba(0,0,0,0.7)" rx="8"/>
          <text x="100" y="35" font-family="Arial, sans-serif" font-size="18" font-weight="bold" 
                text-anchor="middle" fill="url(#neonGrad)" filter="url(#glow)">NEONVIDEO.AI</text>
        </svg>`;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(svgWatermark);
      }

      // For non-avatar files, return 404
      return res.status(404).json({ error: "File not found" });
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve avatar images
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      // First check if we have an ImageKit URL for this object
      const imagekitBackup = await storage.getImagekitBackupByPath(req.path);
      if (imagekitBackup && imagekitBackup.imagekitUrl) {
        // Redirect to ImageKit URL for better performance
        return res.redirect(302, imagekitBackup.imagekitUrl);
      }

      // If ImageKit is configured but no backup found, the file doesn't exist in ImageKit
      const { isImageKitConfigured } = await import("./services/imagekit");
      if (isImageKitConfigured()) {
        console.warn(`[ObjectStorage] ImageKit is configured but no backup found for ${req.path}. File may not exist or was not uploaded to ImageKit.`);
        return res.sendStatus(404);
      }

      // Fall back to serving from internal object storage (only if ImageKit is not configured)
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof Error) {
        if (error.message === "Object not found") {
          return res.sendStatus(404);
        }
        // If error is about ImageKit being configured, return 404 (file doesn't exist in ImageKit)
        if (error.message.includes("ImageKit is configured")) {
          console.warn(`[ObjectStorage] ${error.message} for ${req.path}`);
          return res.sendStatus(404);
        }
      }
      return res.sendStatus(500);
    }
  });

  // Create a new project
  app.post("/api/projects", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projectData = {
        ...req.body,
        userId, // Use authenticated user ID
        toolUsed: req.body?.toolUsed ?? "pro_video_mode",
      };

      console.log("Creating project with data:", projectData);
      const validatedData = insertProjectSchema.parse(projectData);
      console.log("Validated data:", validatedData);
      const project = await storage.createProject(validatedData);
      res.json(project);
    } catch (error) {
      console.error("Create project error:", error);
      if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
        console.error("Validation errors:", (error as any).errors);
        res.status(400).json({ error: "Validation failed", details: (error as any).errors });
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: "Invalid project data", message });
      }
    }
  });

  // Generate a single scene image without updating any project (for edit mode)
  app.post("/api/generate-single-scene", authenticateToken, async (req, res) => {
    try {
      const { prompt, characterImageUrl, aspectRatio, currentSceneImageUrl } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      // Check for profanity in prompt
      const profanityCheck = checkProfanity(prompt);
      if (!profanityCheck.isClean) {
        console.log("Scene prompt contains inappropriate content:", profanityCheck.detectedWords);
        return res.status(400).json({
          error: "Content Policy Violation",
          details: getCategoryMessage(profanityCheck.category || 'unknown'),
          category: profanityCheck.category
        });
      }

      // Character image URL is optional (for instrumental videos)
      // If not provided, the function will use text-to-image generation
      if (!characterImageUrl) {
        console.log(`[generate-single-scene] No character image URL provided - using text-to-image for instrumental video`);
      }

      // Use the aspect ratio from the request, default to 16:9 for horizontal
      const projectAspectRatio = aspectRatio || "16:9";

      console.log(`Generating single scene with prompt: ${prompt}, aspect ratio: ${projectAspectRatio}`);
      if (currentSceneImageUrl) {
        console.log(`Current scene image URL provided for edit-plus model`);
      }

      // Generate scene image using the same method as regular scene generation
      // If characterImageUrl is not provided, it will use text-to-image (for instrumental videos)
      // If currentSceneImageUrl is provided, it will use edit-plus model with both images
      const storedImageUrl = await generateSingleSceneImage(prompt, characterImageUrl, projectAspectRatio, currentSceneImageUrl);

      // Resolve to ImageKit URL for the response (internal storage URL is stored in database)
      const resolvedImageUrl = await resolveUrlWithImageKitFallback(storedImageUrl);
      console.log(`[generate-single-scene] Resolved image URL: ${resolvedImageUrl}`);

      res.json({ imageUrl: resolvedImageUrl });
    } catch (error) {
      console.error("Generate single scene error:", error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: "Failed to generate scene", message });
    }
  });

  // Clone/regenerate a completed project for editing
  app.post("/api/projects/:id/clone", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const sourceProjectId = req.params.id;
      const { updatedScenes, sceneOrder: providedSceneOrder, videoQuality: providedVideoQuality } = req.body; // Receive updated scenes, order, and video quality from frontend

      // Get the source project
      const sourceProject = await storage.getProject(sourceProjectId);
      if (!sourceProject) {
        return res.status(404).json({ error: "Source project not found" });
      }

      // Verify ownership
      if (sourceProject.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to clone this project" });
      }

      console.log(`Cloning project ${sourceProjectId} for regeneration...`);

      // Deep copy scene data from request or source project
      const scenePrompts = updatedScenes
        ? updatedScenes.map((s: any) => s.prompt)
        : (sourceProject.scenePrompts ? JSON.parse(JSON.stringify(sourceProject.scenePrompts)) : undefined);
      const sceneImages = updatedScenes
        ? updatedScenes.map((s: any) => s.imageUrl)
        : (sourceProject.sceneImages ? JSON.parse(JSON.stringify(sourceProject.sceneImages)) : undefined);

      // Extract per-scene lipsync settings from updated scenes or copy from source project
      const sceneLipsyncSettings = updatedScenes
        ? updatedScenes.map((s: any) => s.lipsync !== undefined ? s.lipsync : null)
        : ((sourceProject as any).sceneLipsyncSettings ? JSON.parse(JSON.stringify((sourceProject as any).sceneLipsyncSettings)) : undefined);

      // Extract regenerated video URLs from updated scenes if they exist
      // This allows using the latest regenerated video parts when creating the final video
      const regeneratedVideoUrls = updatedScenes
        ? updatedScenes.map((s: any) => s.videoUrl || null)
        : null;

      // Use provided scene order or copy from source project
      const sceneOrder = providedSceneOrder
        ? providedSceneOrder
        : ((sourceProject as any).sceneOrder ? JSON.parse(JSON.stringify((sourceProject as any).sceneOrder)) : undefined);

      // Deep copy audio segments (use undefined instead of null to let Zod apply defaults)
      const audioSegments = sourceProject.audioSegments
        ? JSON.parse(JSON.stringify(sourceProject.audioSegments))
        : undefined;

      // Create a new project with all the same data except:
      // - New ID (auto-generated)
      // - Reset completion status and generation tracking
      // - Reset final video and MUX data
      // - Reset video segments (will be regenerated)
      // - Use updated scenes if provided
      // - Keep all other data (audio, character, etc.)
      const clonedProjectData: any = {
        userId: sourceProject.userId,
        title: sourceProject.title || "NeonVideo Song",
        description: sourceProject.description || "AI-generated music video project",
        currentStep: 4, // Set to step 4 (ready for video generation)
        audioUrl: sourceProject.audioUrl,
        audioType: sourceProject.audioType,
        audioPrompt: sourceProject.audioPrompt,
        audioTags: sourceProject.audioTags,
        audioLyrics: sourceProject.audioLyrics,
        audioDuration: sourceProject.audioDuration,
        addSubtitles: sourceProject.addSubtitles,
        subtitleStyle: (sourceProject as any).subtitleStyle || defaultSubtitleStyle,
        subtitleFileUrl: sourceProject.subtitleFileUrl,
        kieTaskId: sourceProject.kieTaskId,
        kieAudioId: sourceProject.kieAudioId,
        characterImageUrl: sourceProject.characterImageUrl,
        characterType: sourceProject.characterType,
        characterPrompt: sourceProject.characterPrompt,
        makeCharacterSing: sourceProject.makeCharacterSing,
        aspectRatio: sourceProject.aspectRatio || "16:9", // Copy aspect ratio from source
        videoQuality: providedVideoQuality || (sourceProject as any).videoQuality || "quick",
        isCompleted: false, // Not completed yet
        generationStatus: 'idle',
      };

      // Add optional fields only if they have values (undefined fields are omitted)
      if (scenePrompts !== undefined) clonedProjectData.scenePrompts = scenePrompts;
      if (sceneImages !== undefined) clonedProjectData.sceneImages = sceneImages;
      if (sceneOrder !== undefined) clonedProjectData.sceneOrder = sceneOrder;
      if (sceneLipsyncSettings !== undefined) clonedProjectData.sceneLipsyncSettings = sceneLipsyncSettings;
      if (audioSegments !== undefined) clonedProjectData.audioSegments = audioSegments;

      // If regenerated video URLs are provided, use them instead of source project's video segments
      // This allows using the latest regenerated video parts when creating the final video
      if (regeneratedVideoUrls && regeneratedVideoUrls.some((url: string | null) => url !== null)) {
        // Start with source project's video segments (if they exist)
        const sourceVideoSegments = (sourceProject.videoSegments as string[]) || [];
        const finalVideoSegments = regeneratedVideoUrls.map((url: string | null, index: number) => {
          // Use regenerated URL if available, otherwise use source project's video segment
          return url || sourceVideoSegments[index] || "";
        });
        clonedProjectData.videoSegments = finalVideoSegments;
        console.log(`Using regenerated video URLs: ${regeneratedVideoUrls.filter((url: string | null) => url !== null).length} out of ${regeneratedVideoUrls.length} scenes have regenerated videos`);
      }

      const validatedData = insertProjectSchema.parse(clonedProjectData);
      const clonedProject = await storage.createProject(validatedData);

      console.log(`Successfully cloned project ${sourceProjectId} to new project ${clonedProject.id}`);

      res.json(clonedProject);
    } catch (error) {
      console.error("Clone project error:", error);
      if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
        console.error("Validation errors:", (error as any).errors);
        res.status(400).json({ error: "Validation failed", details: (error as any).errors });
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: "Failed to clone project", message });
      }
    }
  });

  // Regenerate only modified scene videos (partial regeneration)
  // This endpoint clones the project but preserves existing video segments for unmodified scenes
  app.post("/api/projects/:id/regenerate-modified-scenes", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const sourceProjectId = req.params.id;
      const {
        updatedScenes,
        sceneOrder: providedSceneOrder,
        modifiedSceneIndices,
        videoQuality: providedVideoQuality
      } = req.body;

      // Validate required fields
      if (!updatedScenes || !Array.isArray(modifiedSceneIndices) || modifiedSceneIndices.length === 0) {
        return res.status(400).json({
          error: "Missing required data: updatedScenes and modifiedSceneIndices are required"
        });
      }

      // Get the source project
      const sourceProject = await storage.getProject(sourceProjectId);
      if (!sourceProject) {
        return res.status(404).json({ error: "Source project not found" });
      }

      // Verify ownership
      if (sourceProject.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to regenerate this project" });
      }

      // Check if source project has video segments (required for partial regeneration)
      const sourceVideoSegments = sourceProject.videoSegments as string[];
      if (!sourceVideoSegments || sourceVideoSegments.length === 0) {
        return res.status(400).json({
          error: "Cannot perform partial regeneration: source project has no video segments"
        });
      }

      // Validate that video segments count matches scene count for safe partial regeneration
      const sourceSceneImages = sourceProject.sceneImages as string[];
      if (!sourceSceneImages || sourceVideoSegments.length !== sourceSceneImages.length) {
        return res.status(400).json({
          error: "Cannot perform partial regeneration: video segments count doesn't match scene count. Please use full regeneration instead.",
          videoSegmentsCount: sourceVideoSegments.length,
          sceneImagesCount: sourceSceneImages?.length || 0
        });
      }

      // Also validate that updatedScenes count matches
      if (updatedScenes.length !== sourceSceneImages.length) {
        return res.status(400).json({
          error: "Cannot perform partial regeneration: scene count has changed. Please use full regeneration instead.",
          originalSceneCount: sourceSceneImages.length,
          newSceneCount: updatedScenes.length
        });
      }

      // Validate modified scene indices are within bounds
      const invalidIndices = modifiedSceneIndices.filter((idx: number) => idx < 0 || idx >= updatedScenes.length);
      if (invalidIndices.length > 0) {
        return res.status(400).json({
          error: "Invalid modified scene indices: some indices are out of bounds",
          invalidIndices,
          maxValidIndex: updatedScenes.length - 1
        });
      }

      // Calculate credits needed for partial regeneration (500 credits per modified scene)
      const CREDITS_PER_SCENE = 500;
      const creditsRequired = modifiedSceneIndices.length * CREDITS_PER_SCENE;

      // Check if user has enough credits
      const canAfford = await storage.canUserAffordCredits(userId, creditsRequired);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for partial regeneration",
          creditsRequired,
          creditsRemaining,
          modifiedScenesCount: modifiedSceneIndices.length
        });
      }

      console.log(`Partial regeneration: Cloning project ${sourceProjectId} for regenerating ${modifiedSceneIndices.length} modified scenes...`);

      // Deep copy scene data from request
      const scenePrompts = updatedScenes.map((s: any) => s.prompt);
      const sceneImages = updatedScenes.map((s: any) => s.imageUrl);

      // Extract per-scene lipsync settings from updated scenes
      const sceneLipsyncSettings = updatedScenes.map((s: any) => s.lipsync !== undefined ? s.lipsync : null);

      // Use provided scene order or copy from source project
      const sceneOrder = providedSceneOrder
        ? providedSceneOrder
        : ((sourceProject as any).sceneOrder ? JSON.parse(JSON.stringify((sourceProject as any).sceneOrder)) : undefined);

      // Deep copy audio segments from source project
      const audioSegments = sourceProject.audioSegments
        ? JSON.parse(JSON.stringify(sourceProject.audioSegments))
        : undefined;

      // Create a new project with all the same data but:
      // - Mark it for partial regeneration with modified scene indices
      // - Copy existing video segments to reuse for unmodified scenes
      const clonedProjectData: any = {
        userId: sourceProject.userId,
        title: sourceProject.title || "NeonVideo Song",
        description: sourceProject.description || "AI-generated music video project",
        currentStep: 4, // Set to step 4 (ready for video generation)
        audioUrl: sourceProject.audioUrl,
        audioType: sourceProject.audioType,
        audioPrompt: sourceProject.audioPrompt,
        audioTags: sourceProject.audioTags,
        audioLyrics: sourceProject.audioLyrics,
        audioDuration: sourceProject.audioDuration,
        addSubtitles: sourceProject.addSubtitles,
        subtitleStyle: (sourceProject as any).subtitleStyle || defaultSubtitleStyle,
        subtitleFileUrl: sourceProject.subtitleFileUrl,
        kieTaskId: sourceProject.kieTaskId,
        kieAudioId: sourceProject.kieAudioId,
        characterImageUrl: sourceProject.characterImageUrl,
        characterType: sourceProject.characterType,
        characterPrompt: sourceProject.characterPrompt,
        makeCharacterSing: sourceProject.makeCharacterSing,
        aspectRatio: sourceProject.aspectRatio || "16:9",
        videoQuality: providedVideoQuality || (sourceProject as any).videoQuality || "quick",
        isCompleted: false,
        generationStatus: 'idle',
      };

      // Add optional fields only if they have values
      if (scenePrompts !== undefined) clonedProjectData.scenePrompts = scenePrompts;
      if (sceneImages !== undefined) clonedProjectData.sceneImages = sceneImages;
      if (sceneOrder !== undefined) clonedProjectData.sceneOrder = sceneOrder;
      if (sceneLipsyncSettings !== undefined) clonedProjectData.sceneLipsyncSettings = sceneLipsyncSettings;
      if (audioSegments !== undefined) clonedProjectData.audioSegments = audioSegments;

      // Store video segments from source project to reuse unchanged ones
      // Also check if any scenes already have regenerated video URLs from "Regenerate Video" button
      const finalVideoSegments = JSON.parse(JSON.stringify(sourceVideoSegments));

      console.log(`\n=== CLONING PROJECT WITH VIDEO SEGMENTS ===`);
      console.log(`Source video segments count: ${sourceVideoSegments.length}`);
      console.log(`Updated scenes count: ${updatedScenes.length}`);

      // Check updatedScenes for videoUrls that were regenerated via "Regenerate Video" button
      // Update videoSegments with any regenerated video URLs (for both modified and unmodified scenes)
      updatedScenes.forEach((scene: any, index: number) => {
        if (scene.videoUrl && scene.videoUrl.trim() !== "") {
          // This scene has a regenerated video URL (from "Regenerate Video" button)
          console.log(`Scene ${index + 1} has regenerated video URL from updatedScenes, will use it: ${scene.videoUrl.substring(0, 50)}...`);
          if (index < finalVideoSegments.length) {
            const oldUrl = finalVideoSegments[index];
            finalVideoSegments[index] = scene.videoUrl;
            console.log(`  Updated videoSegments[${index}]: ${oldUrl ? oldUrl.substring(0, 30) + '...' : 'empty'} → ${scene.videoUrl.substring(0, 30)}...`);
          } else {
            // Pad array if needed
            while (finalVideoSegments.length < index) {
              finalVideoSegments.push("");
            }
            finalVideoSegments.push(scene.videoUrl);
            console.log(`  Added new videoSegments[${index}]: ${scene.videoUrl.substring(0, 30)}...`);
          }
        } else {
          console.log(`Scene ${index + 1} has no videoUrl in updatedScenes`);
        }
      });

      console.log(`Final video segments count after update: ${finalVideoSegments.length}`);
      console.log(`Final video segments:`, finalVideoSegments.map((url, idx) => `${idx}: ${url ? url.substring(0, 30) + '...' : 'empty'}`).join(', '));
      console.log(`=== END CLONING ===\n`);

      clonedProjectData.videoSegments = finalVideoSegments;

      const validatedData = insertProjectSchema.parse(clonedProjectData);
      const clonedProject = await storage.createProject(validatedData);

      // Store the partial regeneration metadata in a separate field
      // We'll use the generation log to store this information
      // Include the original scene order for alignment verification during video generation
      await storage.addGenerationLog({
        projectId: clonedProject.id,
        step: "partial_regeneration_setup",
        message: `Partial regeneration: ${modifiedSceneIndices.length} scenes to regenerate`,
        status: "started",
        metadata: {
          modifiedSceneIndices,
          isPartialRegeneration: true,
          sourceProjectId: sourceProjectId,
          creditsToCharge: creditsRequired,
          originalSceneOrder: sceneOrder,
          originalSceneCount: sourceSceneImages.length,
          originalVideoSegmentsCount: sourceVideoSegments.length
        }
      });

      console.log(`Successfully created partial regeneration project ${clonedProject.id} from source ${sourceProjectId}`);
      console.log(`Modified scenes to regenerate: [${modifiedSceneIndices.join(', ')}]`);

      res.json(clonedProject);
    } catch (error) {
      console.error("Partial regeneration error:", error);
      if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
        console.error("Validation errors:", (error as any).errors);
        res.status(400).json({ error: "Validation failed", details: (error as any).errors });
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: "Failed to start partial regeneration", message });
      }
    }
  });

  // Delete a project
  app.delete("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projectId = req.params.id;

      // Check if the project exists and belongs to the user
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (project.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this project" });
      }

      // Delete the project and its related generation logs
      await storage.deleteProjectWithLogs(projectId);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Delete project error:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Get all user's completed videos
  // Get a single public video by ID (no auth required)
  app.get("/api/videos/:videoId", async (req, res) => {
    try {
      const { videoId } = req.params;

      // Get the project/video
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Get the creator/user
      const user = await storage.getUser(project.userId);
      if (!user) {
        return res.status(404).json({ error: "Creator not found" });
      }

      // Resolve ImageKit URLs for thumbnails
      const thumbnailUrl = await resolveUrlWithImageKitFallback(project.characterImageUrl, storage);

      // Format the response
      const videoData = {
        id: project.id,
        title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(project.title) ? (project.audioPrompt ? project.audioPrompt.substring(0, 30) + (project.audioPrompt.length > 30 ? '...' : '') : project.title) : project.title,
        videoUrl: project.finalVideoUrl,
        thumbnailUrl,
        createdAt: project.createdAt,
        duration: project.audioDuration || 30,
        likesCount: project.likesCount || 0,
        aspectRatio: project.aspectRatio || "16:9",
        mux: {
          playbackId: project.muxPlaybackId || null,
          assetStatus: project.muxAssetStatus || null
        },
        bunnyStorageUrl: isBunnyUrl(project.finalVideoUrl || '') ? project.finalVideoUrl : null,
        creator: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl
        }
      };

      res.json(videoData);
    } catch (error) {
      console.error("Get video error:", error);
      res.status(500).json({ error: "Failed to get video" });
    }
  });

  // Get public videos for a user by username (no auth required)
  app.get("/api/users/:username/videos", async (req, res) => {
    try {
      const { username } = req.params;

      // Find user by username
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get user's videos that have final videos (completed)
      const projects = await storage.getProjectsByUser(user.id);
      const videosWithFinal = projects.filter(p => p.isCompleted && p.finalVideoUrl);

      // Format the response with ImageKit URL resolution
      const publicVideos = await Promise.all(videosWithFinal.map(async project => ({
        id: project.id,
        title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(project.title) ? (project.audioPrompt ? project.audioPrompt.substring(0, 30) + (project.audioPrompt.length > 30 ? '...' : '') : project.title) : project.title,
        videoUrl: project.finalVideoUrl,
        thumbnailUrl: await resolveUrlWithImageKitFallback(project.characterImageUrl, storage),
        createdAt: project.createdAt,
        duration: project.audioDuration || 30
      })));

      res.json({
        user: {
          username: user.username,
          avatarUrl: user.avatarUrl
        },
        videos: publicVideos
      });
    } catch (error) {
      console.error("Get public videos error:", error);
      res.status(500).json({ error: "Failed to get public videos" });
    }
  });

  // Get community videos with alternating newest/random algorithm (no auth required)
  app.get("/api/community/videos", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50); // Max 50 items per request
      const afterId = req.query.afterId as string;
      const excludeUserId = req.query.excludeUserId as string | undefined;
      const sessionSeed = req.query.seed as string; // Accept seed from frontend for session stability

      // Use session seed if provided, otherwise create time-based seed
      const currentSeed = sessionSeed || Math.floor(Date.now() / (5 * 60 * 1000)).toString();

      // Get all completed projects with final videos from all users
      const allProjects = await storage.getAllVideosForAdmin();

      // Filter for completed AND PUBLIC videos only (critical security fix)
      const publicVideos = allProjects.filter(p => {
        // Filter out videos from excluded user if specified
        if (excludeUserId && p.userId === excludeUserId) {
          return false;
        }
        // Only show completed, public videos with finalVideoUrl
        return p.isCompleted && p.finalVideoUrl && p.isPublic !== false; // Include if isPublic is true or undefined
      });

      // Sort all videos by creation date (newest first)
      const sortedByDate = publicVideos.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Implement alternating newest/random algorithm FIRST, then apply pagination
      const recentVideos = sortedByDate.slice(0, Math.ceil(sortedByDate.length * 0.3)); // Top 30% recent
      const olderVideos = sortedByDate.slice(Math.ceil(sortedByDate.length * 0.3)); // Remaining 70% older

      // Shuffle older videos using session seed for stable randomization
      const shuffleWithSeed = (array: typeof olderVideos, seed: string) => {
        const shuffled = [...array];
        let currentIndex = shuffled.length;
        let temporaryValue, randomIndex;

        // Convert string seed to number for consistent randomness
        let seededRandom = seed.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);

        const random = () => {
          seededRandom = (seededRandom * 9301 + 49297) % 233280;
          return Math.abs(seededRandom) / 233280;
        };

        while (currentIndex !== 0) {
          randomIndex = Math.floor(random() * currentIndex);
          currentIndex -= 1;
          temporaryValue = shuffled[currentIndex];
          shuffled[currentIndex] = shuffled[randomIndex];
          shuffled[randomIndex] = temporaryValue;
        }
        return shuffled;
      };

      const shuffledOlderVideos = shuffleWithSeed(olderVideos, currentSeed);

      // Create alternating pattern FIRST: newest[0], random(older), newest[1], random(older), etc.
      const alternatingVideos: typeof publicVideos = [];
      const maxItems = recentVideos.length + shuffledOlderVideos.length;

      let recentIndex = 0;
      let olderIndex = 0;

      for (let i = 0; i < maxItems; i++) {
        if (i % 2 === 0) {
          // Even positions: use newest videos
          if (recentIndex < recentVideos.length) {
            alternatingVideos.push(recentVideos[recentIndex]);
            recentIndex++;
          } else if (olderIndex < shuffledOlderVideos.length) {
            // Fallback to older videos if we run out of recent ones
            alternatingVideos.push(shuffledOlderVideos[olderIndex]);
            olderIndex++;
          }
        } else {
          // Odd positions: use random older videos
          if (olderIndex < shuffledOlderVideos.length) {
            alternatingVideos.push(shuffledOlderVideos[olderIndex]);
            olderIndex++;
          } else if (recentIndex < recentVideos.length) {
            // Fallback to recent videos if we run out of older ones
            alternatingVideos.push(recentVideos[recentIndex]);
            recentIndex++;
          }
        }
      }

      // THEN apply pagination to the alternating order (CRITICAL FIX)
      let paginatedVideos = alternatingVideos;
      if (afterId) {
        const afterIndex = alternatingVideos.findIndex(video => video.id === afterId);
        if (afterIndex >= 0) {
          paginatedVideos = alternatingVideos.slice(afterIndex + 1);
        }
      }

      const sortedVideos = paginatedVideos.slice(0, limit);

      // Format the response with user info
      const communityVideos = await Promise.all(
        sortedVideos.map(async (project) => {
          // Get the user info for each video
          const user = await storage.getUser(project.userId);

          // Get thumbnail from scene data or character image
          let thumbnailUrl = null;
          if (project.sceneData) {
            try {
              const scenes = typeof project.sceneData === 'string'
                ? JSON.parse(project.sceneData)
                : project.sceneData;

              if (Array.isArray(scenes) && scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                thumbnailUrl = lastScene.imageUrl || null;
              }
            } catch (e) {
              // Silently handle parse errors
            }
          }

          // Fallback to character image if no scene thumbnail
          if (!thumbnailUrl) {
            thumbnailUrl = project.characterImageUrl || null;
          }

          // Resolve ImageKit URL for thumbnail
          thumbnailUrl = await resolveUrlWithImageKitFallback(thumbnailUrl, storage);

          return {
            id: project.id,
            title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(project.title) ? (project.audioPrompt ? project.audioPrompt.substring(0, 30) + (project.audioPrompt.length > 30 ? '...' : '') : project.title) : project.title,
            videoUrl: project.finalVideoUrl,
            thumbnailUrl,
            createdAt: project.createdAt,
            duration: project.audioDuration || 30,
            mux: {
              playbackId: project.muxPlaybackId || null,
              assetStatus: project.muxAssetStatus || null,
              hlsUrl: project.muxPlaybackId ? `https://stream.mux.com/${project.muxPlaybackId}.m3u8` : null
            },
            bunnyStorageUrl: isBunnyUrl(project.finalVideoUrl || '') ? project.finalVideoUrl : null,
            creator: {
              id: user?.id || project.userId,
              username: user?.username || 'Unknown User',
              avatarUrl: user?.avatarUrl || null
            }
          };
        })
      );

      // Prepare pagination info with session seed for stability
      const hasMore = paginatedVideos.length > limit;
      const nextAfterId = hasMore ? sortedVideos[sortedVideos.length - 1].id : null;

      res.json({
        videos: communityVideos,
        pagination: {
          hasMore,
          nextAfterId,
          seed: currentSeed // Include seed for session stability
        }
      });
    } catch (error) {
      console.error("Get community videos error:", error);
      res.status(500).json({ error: "Failed to get community videos" });
    }
  });

  // Get trending/public videos (no auth required)
  app.get("/api/trending-videos", async (req, res) => {
    try {
      // Get excludeUserId from query params if provided
      const excludeUserId = req.query.excludeUserId as string | undefined;
      const requestedLimit = parseInt(req.query.limit as string, 10);
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 200;

      // Get all completed projects with final videos from all users
      const allProjects = await storage.getAllVideosForAdmin(); // Reuse admin function to get all videos

      // Filter for completed AND FEATURED videos and sort by creation date (newest first)
      const trendingVideos = allProjects
        .filter(p => {
          // Filter out videos from excluded user if specified
          if (excludeUserId && p.userId === excludeUserId) {
            return false;
          }
          // Only show completed, public videos that are marked as featured by admin
          return p.isCompleted && p.finalVideoUrl && p.isFeatured && p.isPublic !== false;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)
        .map(async (project) => {
          // Get the user info for each video
          const user = await storage.getUser(project.userId);

          // Get thumbnail
          let thumbnailUrl = null;
          if (project.sceneData) {
            try {
              const scenes = typeof project.sceneData === 'string'
                ? JSON.parse(project.sceneData)
                : project.sceneData;

              if (Array.isArray(scenes) && scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                thumbnailUrl = lastScene.imageUrl || null;
              }
            } catch (e) {
              // Silently handle parse errors
            }
          }

          const streamVideoId = project.bunnyVideoId || null;
          const streamThumbnailUrl = streamVideoId ? getBunnyStreamThumbnailUrl(streamVideoId) : null;
          const streamEmbedUrl = streamVideoId ? getBunnyStreamEmbedUrl(streamVideoId) : null;

          return {
            id: project.id,
            title: ["My Music Video", "NeonVideo Song", "AI Generated Song"].includes(project.title) ? (project.audioPrompt ? project.audioPrompt.substring(0, 30) + (project.audioPrompt.length > 30 ? '...' : '') : project.title) : project.title,
            videoUrl: project.finalVideoUrl,
            thumbnailUrl,
            streamVideoId,
            streamThumbnailUrl,
            streamEmbedUrl,
            createdAt: project.createdAt,
            duration: project.audioDuration || 30,
            creator: {
              username: user?.username || 'Unknown User',
              avatarUrl: user?.avatarUrl || null
            }
          };
        });

      // Wait for all promises to resolve
      const videos = await Promise.all(trendingVideos);

      res.json(videos);
    } catch (error) {
      console.error("Get trending videos error:", error);
      res.status(500).json({ error: "Failed to get trending videos" });
    }
  });

  app.get("/api/my-videos", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projects = await storage.getProjectsByUser(userId);
      // Filter only completed projects with final videos
      const completedVideos = projects
        .filter(p => p.isCompleted && p.finalVideoUrl)
        .map(p => {
          // Get the last scene image if available
          let thumbnailUrl = null;
          if (p.sceneData) {
            try {
              // Parse sceneData if it's a string
              const scenes = typeof p.sceneData === 'string'
                ? JSON.parse(p.sceneData)
                : p.sceneData;

              if (Array.isArray(scenes) && scenes.length > 0) {
                const lastScene = scenes[scenes.length - 1];
                thumbnailUrl = lastScene.imageUrl || null;
              }
            } catch (e) {
              // Silently handle parse errors for old data
            }
          }

          return {
            id: p.id,
            title: p.title || p.audioPrompt || "Untitled Video",
            videoUrl: p.finalVideoUrl,
            thumbnailUrl,
            sceneImages: p.sceneImages || [],
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            isPublic: p.isPublic !== false,
            aspectRatio: p.aspectRatio || "16:9",
            projectType: p.projectType || "music_video",
            mux: {
              playbackId: p.muxPlaybackId || null,
              assetStatus: p.muxAssetStatus || null,
              hlsUrl: p.muxPlaybackId ? `https://stream.mux.com/${p.muxPlaybackId}.m3u8` : null
            },
            bunnyStorageUrl: isBunnyUrl(p.finalVideoUrl || '') ? p.finalVideoUrl : null,
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(completedVideos);
    } catch (error) {
      console.error("Get my videos error:", error);
      res.status(500).json({ error: "Failed to get videos" });
    }
  });

  // Like a video
  app.post("/api/videos/:videoId/like", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const userId = (req as any).user.userId;

      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Like the video
      const liked = await storage.likeVideo(videoId, userId);
      if (!liked) {
        return res.status(400).json({ error: "Video already liked" });
      }

      // Get updated likes count
      const likesCount = await storage.getVideoLikesCount(videoId);

      res.json({
        success: true,
        liked: true,
        likesCount
      });
    } catch (error) {
      console.error("Like video error:", error);
      res.status(500).json({ error: "Failed to like video" });
    }
  });

  // Add captions to an existing video (my-videos page); creates a new video and uploads to ImageKit
  app.post("/api/videos/:videoId/add-captions", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const userId = (req as any).user.userId;
      const { subtitleStyle: subtitleStyleInput, position } = req.body;

      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to add captions to this video" });
      }

      const subtitleStyle = isSubtitleStyle(subtitleStyleInput) ? subtitleStyleInput : defaultSubtitleStyle;
      const validPositions = ["top", "center", "bottom"];
      const captionPosition = typeof position === "string" && validPositions.includes(position) ? position : "bottom";

      const videoUrl = await resolveUrlWithImageKitFallback(project.finalVideoUrl, storage);
      if (!videoUrl) {
        return res.status(400).json({ error: "Could not resolve video URL for captions" });
      }

      // Pass the resolved URL directly to ffmpegapi (Bunny CDN or other public URL)
      console.log(`[ADD-CAPTIONS] Passing video URL to ffmpegapi: ${videoUrl}`);

      const { addTikTokCaptions } = await import("./services/ffmpegCaptions");
      const captionResult = await addTikTokCaptions({
        videoUrl,
        subtitleStyle,
        position: captionPosition,
        aspectRatio: project.aspectRatio || "16:9",
      });

      const ObjectStorageService = (await import("./objectStorage")).ObjectStorageService;
      const objectStorageService = new ObjectStorageService();
      const captionedResult = await objectStorageService.uploadVideoFromUrl(
        captionResult.download_url,
        `neonvideo_${Date.now()}_captioned.mp4`,
      );

      const newProject = await storage.createProject({
        userId,
        title: `${project.title} (with captions)`,
        finalVideoUrl: captionedResult.url,
        isCompleted: true,
        currentStep: 6,
        aspectRatio: project.aspectRatio || "16:9",
        isPublic: project.isPublic !== false,
      });

      res.json({
        success: true,
        videoId: newProject.id,
        title: newProject.title,
      });
    } catch (error) {
      console.error("Add captions error:", error);
      res.status(500).json({
        error: "Failed to add captions",
        details: (error as Error).message,
      });
    }
  });

  // Video Tools: Add captions from URL or uploaded video (upload goes to Bunny VideoScenes)
  app.post("/api/tools/add-captions", authenticateToken, videoToolUpload.single("video"), async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const subtitleStyleInput = req.body.subtitleStyle;
      const position = req.body.position;
      const subtitleStyle = isSubtitleStyle(subtitleStyleInput) ? subtitleStyleInput : defaultSubtitleStyle;
      const validPositions = ["top", "center", "bottom"];
      const captionPosition = typeof position === "string" && validPositions.includes(position) ? position : "bottom";

      let videoUrl: string;

      if (req.file && req.file.buffer) {
        const fileName = `add-captions_${Date.now()}_${req.file.originalname || "video.mp4"}`.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { uploadToBunnyStorage } = await import("./services/bunny");
        const result = await uploadToBunnyStorage("scenes", fileName, req.file.buffer);
        videoUrl = result.url;
        console.log(`[ADD-CAPTIONS-TOOL] Uploaded video to Bunny VideoScenes: ${videoUrl}`);
      } else if (typeof req.body.videoUrl === "string" && req.body.videoUrl.trim()) {
        videoUrl = req.body.videoUrl.trim();
      } else {
        return res.status(400).json({ error: "Provide a video URL or upload a video file." });
      }

      const { addTikTokCaptions } = await import("./services/ffmpegCaptions");
      const captionResult = await addTikTokCaptions({
        videoUrl,
        subtitleStyle,
        position: captionPosition,
        aspectRatio: "9:16",
      });

      const ObjectStorageService = (await import("./objectStorage")).ObjectStorageService;
      const objectStorageService = new ObjectStorageService();
      const captionedResult = await objectStorageService.uploadVideoFromUrl(
        captionResult.download_url,
        `neonvideo_${Date.now()}_captioned.mp4`,
      );

      const newProject = await storage.createProject({
        userId,
        title: `Add Captions ${new Date().toISOString().slice(0, 10)}`,
        finalVideoUrl: captionedResult.url,
        isCompleted: true,
        currentStep: 6,
        aspectRatio: "9:16",
        isPublic: false,
      });

      res.json({
        success: true,
        videoId: newProject.id,
        title: newProject.title,
      });
    } catch (error) {
      console.error("Add captions tool error:", error);
      res.status(500).json({
        error: "Failed to add captions",
        details: (error as Error).message,
      });
    }
  });

  // Video Tools: Trim video from URL or uploaded video (upload goes to Bunny VideoScenes); returns ffmpegapi result, no save to storage
  app.post("/api/tools/trim-video", authenticateToken, videoToolUpload.single("video"), async (req, res) => {
    try {
      const startTime = Math.max(0, Number(req.body.start_time));
      const endTime = Number(req.body.end_time);
      if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
        return res.status(400).json({ error: "Invalid start_time or end_time (end must be greater than start)." });
      }

      let videoUrl: string;

      if (req.file && req.file.buffer) {
        const fileName = `trim-video_${Date.now()}_${req.file.originalname || "video.mp4"}`.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { uploadToBunnyStorage } = await import("./services/bunny");
        const result = await uploadToBunnyStorage("scenes", fileName, req.file.buffer);
        videoUrl = result.url;
        console.log(`[TRIM-VIDEO-TOOL] Uploaded video to Bunny VideoScenes: ${videoUrl}`);
      } else if (typeof req.body.videoUrl === "string" && req.body.videoUrl.trim()) {
        videoUrl = req.body.videoUrl.trim();
      } else {
        return res.status(400).json({ error: "Provide a video URL or upload a video file." });
      }

      const { trimVideo } = await import("./services/ffmpeg");
      const trimResult = await trimVideo(videoUrl, startTime, endTime);

      res.json({
        success: true,
        download_url: trimResult.download_url,
      });
    } catch (error) {
      console.error("Trim video tool error:", error);
      res.status(500).json({
        error: "Failed to trim video",
        details: (error as Error).message,
      });
    }
  });

  // Video Tools: Trim audio from URL or uploaded file (upload goes to Bunny audios folder)
  // Supports either: (1) desired_length in seconds — trim from start with fade, or (2) startTime + endTime in ms — trim to selected range
  app.post("/api/tools/trim-audio", authenticateToken, audioToolUpload.single("audio"), async (req, res) => {
    try {
      const startTimeMs = req.body.startTime != null ? Number(req.body.startTime) : null;
      const endTimeMs = req.body.endTime != null ? Number(req.body.endTime) : null;
      const useRange = startTimeMs != null && endTimeMs != null && !Number.isNaN(startTimeMs) && !Number.isNaN(endTimeMs) && startTimeMs < endTimeMs;

      let audioUrl: string;

      if (req.file && req.file.buffer) {
        const fileName = `trim-audio_${Date.now()}_${req.file.originalname || "audio.mp3"}`.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { uploadAudio } = await import("./services/bunny");
        const result = await uploadAudio(fileName, req.file.buffer);
        audioUrl = result.url;
        console.log(`[TRIM-AUDIO-TOOL] Uploaded audio to Bunny audios: ${audioUrl}`);
      } else if (typeof req.body.audioUrl === "string" && req.body.audioUrl.trim()) {
        audioUrl = req.body.audioUrl.trim();
      } else {
        return res.status(400).json({ error: "Provide an audio URL or upload an audio file." });
      }

      if (useRange) {
        const { splitAudioByTime } = await import("./services/ffmpeg");
        const trimResult = await splitAudioByTime(audioUrl, startTimeMs, endTimeMs);
        res.json({
          success: true,
          download_url: trimResult.download_url,
          filename: trimResult.filename,
        });
      } else {
        const desiredLength = Number(req.body.desired_length);
        if (Number.isNaN(desiredLength) || desiredLength <= 0) {
          return res.status(400).json({ error: "Invalid desired_length (must be a positive number of seconds), or provide startTime and endTime in milliseconds." });
        }
        const { trimAudio } = await import("./services/ffmpeg");
        const trimResult = await trimAudio(audioUrl, desiredLength);
        res.json({
          success: true,
          download_url: trimResult.download_url,
          trimmed_length: trimResult.trimmed_length,
        });
      }
    } catch (error) {
      console.error("Trim audio tool error:", error);
      res.status(500).json({
        error: "Failed to trim audio",
        details: (error as Error).message,
      });
    }
  });

  // Video Tools: Video Upscaler (Wavespeed) - charges credits and returns upscaled video URL
  app.post("/api/tools/video-upscaler", authenticateToken, videoToolUpload.single("video"), async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const targetResolutionRaw = (req.body.target_resolution || req.body.targetResolution || "1080p") as string;
      const targetResolution = String(targetResolutionRaw).toLowerCase();

      const validResolutions = ["1080p", "2k", "4k"];
      const normalizedResolution =
        targetResolution === "1080p"
          ? "1080p"
          : targetResolution === "2k"
            ? "2k"
            : targetResolution === "4k"
              ? "4k"
              : "1080p";

      if (!validResolutions.includes(normalizedResolution)) {
        return res.status(400).json({ error: "Invalid target_resolution. Must be one of: 1080p, 2k, 4k." });
      }

      const durationSecondsRaw = Number(req.body.duration_seconds || req.body.durationSeconds || 0);
      const durationSeconds = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0 ? durationSecondsRaw : 15;

      // Credits: per 15 seconds, rounded up
      const units = Math.max(1, Math.ceil(durationSeconds / 15));
      const ratePerUnit =
        normalizedResolution === "1080p"
          ? 250
          : normalizedResolution === "2k"
            ? 500
            : 1000; // 4k
      const creditsRequired = units * ratePerUnit;

      // Ensure user can afford
      const canAfford = await storage.canUserAffordCredits(userId, creditsRequired);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Video Upscaler",
          creditsRequired,
          creditsRemaining,
        });
      }

      let videoUrl: string;

      if (req.file && req.file.buffer) {
        const fileName = `video-upscaler_${Date.now()}_${req.file.originalname || "video.mp4"}`.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { uploadToBunnyStorage } = await import("./services/bunny");
        const result = await uploadToBunnyStorage("scenes", fileName, req.file.buffer);
        videoUrl = result.url;
        console.log(`[VIDEO-UPSCALER-TOOL] Uploaded video to Bunny VideoScenes: ${videoUrl}`);
      } else if (typeof req.body.videoUrl === "string" && req.body.videoUrl.trim()) {
        videoUrl = req.body.videoUrl.trim();
      } else {
        return res.status(400).json({ error: "Provide a video URL or upload a video file." });
      }

      const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || "";
      if (!WAVESPEED_API_KEY) {
        return res.status(500).json({ error: "WaveSpeed API key not configured" });
      }

      // Submit upscaling job
      const submitResponse = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/video-upscaler", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          target_resolution: normalizedResolution,
          video: videoUrl,
        }),
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        console.error("[VIDEO-UPSCALER-TOOL] Submit error:", errorText);
        return res.status(500).json({ error: `Video upscaler submit failed: ${submitResponse.status}` });
      }

      const submitJson: any = await submitResponse.json();
      const requestId = submitJson?.data?.id;
      if (!requestId) {
        console.error("[VIDEO-UPSCALER-TOOL] Unexpected submit response:", submitJson);
        return res.status(500).json({ error: "Video upscaler did not return a request ID" });
      }

      console.log(`[VIDEO-UPSCALER-TOOL] Submitted job. Request ID: ${requestId}`);

      // Poll for result
      let attempts = 0;
      const maxAttempts = 60; // ~10 minutes with 10s interval
      let finalUrl: string | null = null;
      let lastStatus: any = null;

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const statusResponse = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, {
          headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` },
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error("[VIDEO-UPSCALER-TOOL] Status error:", errorText);
          return res.status(500).json({ error: `Video upscaler status failed: ${statusResponse.status}` });
        }

        const statusJson: any = await statusResponse.json();
        lastStatus = statusJson;
        const status = statusJson?.data?.status || statusJson?.data?.statusText;

        if (status === "completed") {
          const outputs = statusJson?.data?.outputs;
          if (Array.isArray(outputs) && outputs.length > 0) {
            finalUrl = outputs[0];
            break;
          }
        } else if (status === "failed") {
          const errorMessage = statusJson?.data?.error || statusJson?.message || "Video upscaler job failed";
          console.error("[VIDEO-UPSCALER-TOOL] Job failed:", errorMessage);
          return res.status(500).json({ error: errorMessage });
        }
      }

      if (!finalUrl) {
        console.error("[VIDEO-UPSCALER-TOOL] Timed out waiting for result. Last status:", lastStatus);
        return res.status(504).json({ error: "Timed out waiting for video upscaler result" });
      }

      // Deduct credits after successful upscaling
      const creditDeducted = await storage.deductUserCredits(userId, creditsRequired);
      if (!creditDeducted) {
        console.error("[VIDEO-UPSCALER-TOOL] Failed to deduct credits, but video was upscaled");
      } else {
        console.log(`[VIDEO-UPSCALER-TOOL] Deducted ${creditsRequired} credits (${units} x 15s @ ${normalizedResolution}) from user ${userId}`);
      }

      res.json({
        success: true,
        download_url: finalUrl,
        creditsRequired,
        units,
        target_resolution: normalizedResolution,
      });
    } catch (error) {
      console.error("Video upscaler tool error:", error);
      res.status(500).json({
        error: "Failed to upscale video",
        details: (error as Error).message,
      });
    }
  });

  // Video Tools: AI Video Edition (Wavespeed ltx-2-retake) - targeted retakes, 500 credits per 15s
  app.post("/api/tools/ai-video-edition", authenticateToken, videoToolUpload.single("video"), async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const prompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required." });
      }
      const mode = typeof req.body.mode === "string" && req.body.mode.trim() ? req.body.mode.trim() : "replace_video";

      const durationSecondsRaw = Number(req.body.duration_seconds || req.body.durationSeconds || 0);
      const durationSeconds = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0 ? durationSecondsRaw : 15;

      const CREDITS_PER_15S = 500;
      const units = Math.max(1, Math.ceil(durationSeconds / 15));
      const creditsRequired = units * CREDITS_PER_15S;

      const canAfford = await storage.canUserAffordCredits(userId, creditsRequired);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for AI Video Edition",
          creditsRequired,
          creditsRemaining,
        });
      }

      let videoUrl: string;

      if (req.file && req.file.buffer) {
        const fileName = `ai-video-edition_${Date.now()}_${req.file.originalname || "video.mp4"}`.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { uploadToBunnyStorage } = await import("./services/bunny");
        const result = await uploadToBunnyStorage("scenes", fileName, req.file.buffer);
        videoUrl = result.url;
        console.log(`[AI-VIDEO-EDITION-TOOL] Uploaded video to Bunny VideoScenes: ${videoUrl}`);
      } else if (typeof req.body.videoUrl === "string" && req.body.videoUrl.trim()) {
        videoUrl = req.body.videoUrl.trim();
      } else {
        return res.status(400).json({ error: "Provide a video URL or upload a video file." });
      }

      const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || "";
      if (!WAVESPEED_API_KEY) {
        return res.status(500).json({ error: "WaveSpeed API key not configured" });
      }

      const submitResponse = await fetch("https://api.wavespeed.ai/api/v3/lightricks/ltx-2-retake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({
          mode,
          prompt,
          video: videoUrl,
        }),
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        console.error("[AI-VIDEO-EDITION-TOOL] Submit error:", errorText);
        return res.status(500).json({ error: `AI Video Edition submit failed: ${submitResponse.status}` });
      }

      const submitJson: any = await submitResponse.json();
      const requestId = submitJson?.data?.id;
      if (!requestId) {
        console.error("[AI-VIDEO-EDITION-TOOL] Unexpected submit response:", submitJson);
        return res.status(500).json({ error: "AI Video Edition did not return a request ID" });
      }

      console.log(`[AI-VIDEO-EDITION-TOOL] Submitted job. Request ID: ${requestId}`);

      let attempts = 0;
      const maxAttempts = 60;
      let finalUrl: string | null = null;
      let lastStatus: any = null;

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const statusResponse = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, {
          headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` },
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error("[AI-VIDEO-EDITION-TOOL] Status error:", errorText);
          return res.status(500).json({ error: `AI Video Edition status failed: ${statusResponse.status}` });
        }

        const statusJson: any = await statusResponse.json();
        lastStatus = statusJson;
        const status = statusJson?.data?.status || statusJson?.data?.statusText;

        if (status === "completed") {
          const outputs = statusJson?.data?.outputs;
          if (Array.isArray(outputs) && outputs.length > 0) {
            finalUrl = outputs[0];
            break;
          }
        } else if (status === "failed") {
          const errorMessage = statusJson?.data?.error || statusJson?.message || "AI Video Edition job failed";
          console.error("[AI-VIDEO-EDITION-TOOL] Job failed:", errorMessage);
          return res.status(500).json({ error: errorMessage });
        }
      }

      if (!finalUrl) {
        console.error("[AI-VIDEO-EDITION-TOOL] Timed out. Last status:", lastStatus);
        return res.status(504).json({ error: "Timed out waiting for AI Video Edition result" });
      }

      const creditDeducted = await storage.deductUserCredits(userId, creditsRequired);
      if (!creditDeducted) {
        console.error("[AI-VIDEO-EDITION-TOOL] Failed to deduct credits, but video was generated");
      } else {
        console.log(`[AI-VIDEO-EDITION-TOOL] Deducted ${creditsRequired} credits (${units} x 15s) from user ${userId}`);
      }

      res.json({
        success: true,
        download_url: finalUrl,
        creditsRequired,
        units,
      });
    } catch (error) {
      console.error("AI Video Edition tool error:", error);
      res.status(500).json({
        error: "Failed to run AI Video Edition",
        details: (error as Error).message,
      });
    }
  });

  // Video Tools: Video Background Remover (Wavespeed) - 250 credits per 15s
  app.post("/api/tools/video-background-remover", authenticateToken, videoToolUpload.single("video"), async (req, res) => {
    try {
      const userId = (req as any).user.userId;

      const durationSecondsRaw = Number(req.body.duration_seconds || req.body.durationSeconds || 0);
      const durationSeconds = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0 ? durationSecondsRaw : 15;

      const CREDITS_PER_15S = 250;
      const units = Math.max(1, Math.ceil(durationSeconds / 15));
      const creditsRequired = units * CREDITS_PER_15S;

      const canAfford = await storage.canUserAffordCredits(userId, creditsRequired);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Video Background Remover",
          creditsRequired,
          creditsRemaining,
        });
      }

      let videoUrl: string;

      if (req.file && req.file.buffer) {
        const fileName = `video-bg-remover_${Date.now()}_${req.file.originalname || "video.mp4"}`.replace(/[^a-zA-Z0-9._-]/g, "_");
        const { uploadToBunnyStorage } = await import("./services/bunny");
        const result = await uploadToBunnyStorage("scenes", fileName, req.file.buffer);
        videoUrl = result.url;
        console.log(`[VIDEO-BG-REMOVER-TOOL] Uploaded video to Bunny VideoScenes: ${videoUrl}`);
      } else if (typeof req.body.videoUrl === "string" && req.body.videoUrl.trim()) {
        videoUrl = req.body.videoUrl.trim();
      } else {
        return res.status(400).json({ error: "Provide a video URL or upload a video file." });
      }

      const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || "";
      if (!WAVESPEED_API_KEY) {
        return res.status(500).json({ error: "WaveSpeed API key not configured" });
      }

      const submitResponse = await fetch("https://api.wavespeed.ai/api/v3/wavespeed-ai/video-background-remover", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
        body: JSON.stringify({ video: videoUrl }),
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        console.error("[VIDEO-BG-REMOVER-TOOL] Submit error:", errorText);
        return res.status(500).json({ error: `Video background remover submit failed: ${submitResponse.status}` });
      }

      const submitJson: any = await submitResponse.json();
      const requestId = submitJson?.data?.id;
      if (!requestId) {
        console.error("[VIDEO-BG-REMOVER-TOOL] Unexpected submit response:", submitJson);
        return res.status(500).json({ error: "Video background remover did not return a request ID" });
      }

      console.log(`[VIDEO-BG-REMOVER-TOOL] Submitted job. Request ID: ${requestId}`);

      let attempts = 0;
      const maxAttempts = 60;
      let finalUrl: string | null = null;
      let lastStatus: any = null;

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const statusResponse = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`, {
          headers: { Authorization: `Bearer ${WAVESPEED_API_KEY}` },
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error("[VIDEO-BG-REMOVER-TOOL] Status error:", errorText);
          return res.status(500).json({ error: `Video background remover status failed: ${statusResponse.status}` });
        }

        const statusJson: any = await statusResponse.json();
        lastStatus = statusJson;
        const status = statusJson?.data?.status || statusJson?.data?.statusText;

        if (status === "completed") {
          const outputs = statusJson?.data?.outputs;
          if (Array.isArray(outputs) && outputs.length > 0) {
            finalUrl = outputs[0];
            break;
          }
        } else if (status === "failed") {
          const errorMessage = statusJson?.data?.error || statusJson?.message || "Video background remover job failed";
          console.error("[VIDEO-BG-REMOVER-TOOL] Job failed:", errorMessage);
          return res.status(500).json({ error: errorMessage });
        }
      }

      if (!finalUrl) {
        console.error("[VIDEO-BG-REMOVER-TOOL] Timed out. Last status:", lastStatus);
        return res.status(504).json({ error: "Timed out waiting for Video Background Remover result" });
      }

      const creditDeducted = await storage.deductUserCredits(userId, creditsRequired);
      if (!creditDeducted) {
        console.error("[VIDEO-BG-REMOVER-TOOL] Failed to deduct credits, but video was processed");
      } else {
        console.log(`[VIDEO-BG-REMOVER-TOOL] Deducted ${creditsRequired} credits (${units} x 15s) from user ${userId}`);
      }

      res.json({
        success: true,
        download_url: finalUrl,
        creditsRequired,
        units,
      });
    } catch (error) {
      console.error("Video background remover tool error:", error);
      res.status(500).json({
        error: "Failed to remove video background",
        details: (error as Error).message,
      });
    }
  });

  // Unlike a video
  app.delete("/api/videos/:videoId/like", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const userId = (req as any).user.userId;

      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Unlike the video
      const unliked = await storage.unlikeVideo(videoId, userId);
      if (!unliked) {
        return res.status(400).json({ error: "Video not liked" });
      }

      // Get updated likes count
      const likesCount = await storage.getVideoLikesCount(videoId);

      res.json({
        success: true,
        liked: false,
        likesCount
      });
    } catch (error) {
      console.error("Unlike video error:", error);
      res.status(500).json({ error: "Failed to unlike video" });
    }
  });

  // Check if a video is liked by the current user
  app.get("/api/videos/:videoId/like", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const userId = (req as any).user.userId;

      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Check if user has liked the video
      const isLiked = await storage.isVideoLikedByUser(videoId, userId);
      const likesCount = await storage.getVideoLikesCount(videoId);

      res.json({
        liked: isLiked,
        likesCount
      });
    } catch (error) {
      console.error("Check video like error:", error);
      res.status(500).json({ error: "Failed to check video like status" });
    }
  });

  // Get comments for a video (no auth required)
  app.get("/api/videos/:videoId/comments", async (req, res) => {
    try {
      const { videoId } = req.params;

      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Get comments
      const comments = await storage.getComments(videoId);

      // Get user details for each comment
      const commentsWithUsers = await Promise.all(
        comments.map(async (comment) => {
          const user = await storage.getUser(comment.userId);
          return {
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            user: {
              id: user?.id || '',
              username: user?.username || 'Unknown User',
              avatarUrl: user?.avatarUrl || null
            }
          };
        })
      );

      res.json(commentsWithUsers);
    } catch (error) {
      console.error("Get video comments error:", error);
      res.status(500).json({ error: "Failed to get video comments" });
    }
  });

  // Add a comment to a video
  app.post("/api/videos/:videoId/comments", authenticateToken, async (req, res) => {
    try {
      const { videoId } = req.params;
      const { content } = req.body;
      const userId = (req as any).user.userId;

      // Validate input
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: "Comment content is required" });
      }

      if (content.length > 500) {
        return res.status(400).json({ error: "Comment too long (max 500 characters)" });
      }

      // Server-side profanity filtering
      const { checkProfanity, getCategoryMessage } = await import('../server/profanity-filter.js');
      const profanityCheck = checkProfanity(content.trim());
      if (!profanityCheck.isClean) {
        return res.status(400).json({
          error: getCategoryMessage(profanityCheck.category || ""),
          type: "profanity_detected"
        });
      }

      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Add comment
      const comment = await storage.addComment({
        projectId: videoId,
        userId,
        content: content.trim()
      });

      // Get user details for response
      const user = await storage.getUser(userId);

      res.status(201).json({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        user: {
          id: user?.id || '',
          username: user?.username || 'Unknown User',
          avatarUrl: user?.avatarUrl || null
        }
      });
    } catch (error) {
      console.error("Add video comment error:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Delete a comment
  app.delete("/api/videos/:videoId/comments/:commentId", authenticateToken, async (req, res) => {
    try {
      const { videoId, commentId } = req.params;
      const userId = (req as any).user.userId;

      // Check if video exists
      const project = await storage.getProject(videoId);
      if (!project || !project.isCompleted || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not found" });
      }

      // Get all comments for this video to verify comment belongs to this video
      const comments = await storage.getComments(videoId);
      const comment = comments.find(c => c.id === commentId);

      if (!comment) {
        return res.status(404).json({ error: "Comment not found on this video" });
      }

      if (comment.userId !== userId) {
        return res.status(403).json({ error: "You don't have permission to delete this comment" });
      }

      // Delete comment
      const success = await storage.deleteComment(commentId, userId);

      if (!success) {
        return res.status(500).json({ error: "Failed to delete comment" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Delete video comment error:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // ==================== GREETING CARDS API ====================

  // Create a new greeting card
  app.post("/api/greeting-cards", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { projectId, senderEmail, recipientEmail, message, scheduledDate, sendNow } = req.body;

      // Validate required fields
      if (!projectId || !senderEmail || !recipientEmail) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(senderEmail) || !emailRegex.test(recipientEmail)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      // Verify the project belongs to the user and is completed
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Video not found" });
      }
      if (project.userId !== userId) {
        return res.status(403).json({ error: "You don't have permission to share this video" });
      }
      if (!project.isCompleted || !project.finalVideoUrl) {
        return res.status(400).json({ error: "Video is not yet completed" });
      }

      // Get user info for sender name
      const user = await storage.getUser(userId);

      // Generate unique token for viewing
      const uniqueToken = nanoid(32);

      // Determine scheduled date
      let scheduleDate: Date;
      if (sendNow) {
        scheduleDate = new Date();
      } else if (scheduledDate) {
        scheduleDate = new Date(scheduledDate);
        if (isNaN(scheduleDate.getTime())) {
          return res.status(400).json({ error: "Invalid scheduled date" });
        }
      } else {
        // Default to next day
        scheduleDate = new Date();
        scheduleDate.setDate(scheduleDate.getDate() + 1);
        scheduleDate.setHours(9, 0, 0, 0);
      }

      // Create the greeting card
      const greetingCard = await storage.createGreetingCard({
        projectId,
        senderEmail,
        senderName: user?.username || senderEmail.split('@')[0],
        recipientEmail,
        message: message || null,
        scheduledDate: scheduleDate,
        uniqueToken,
        status: sendNow ? 'pending' : 'pending', // Will be picked up by cron
      });

      // If sendNow, immediately send the email
      if (sendNow) {
        try {
          const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
          const viewUrl = `${baseUrl}/greeting/${uniqueToken}`;

          const emailSent = await emailService.sendGreetingCardEmail({
            recipientEmail,
            senderName: user?.username || senderEmail.split('@')[0],
            senderEmail,
            videoTitle: project.title || 'A Special Video',
            message: message || null,
            viewUrl
          });

          if (emailSent) {
            await storage.updateGreetingCard(greetingCard.id, {
              status: 'sent',
              sentAt: new Date()
            });
          } else {
            await storage.updateGreetingCard(greetingCard.id, {
              status: 'failed'
            });
          }
        } catch (emailError) {
          console.error('Failed to send greeting card email:', emailError);
          await storage.updateGreetingCard(greetingCard.id, {
            status: 'failed'
          });
        }
      }

      res.status(201).json({
        success: true,
        greetingCardId: greetingCard.id,
        message: sendNow ? 'Greeting card sent!' : 'Greeting card scheduled successfully!'
      });
    } catch (error) {
      console.error("Create greeting card error:", error);
      res.status(500).json({ error: "Failed to create greeting card" });
    }
  });

  // Cron endpoint to send pending greeting cards (secured with secret key)
  app.get("/api/cron/send-greeting-cards", async (req, res) => {
    try {
      // Verify secret key for cron-job.org
      const cronSecret = req.query.secret || req.headers['x-cron-secret'];
      const expectedSecret = process.env.CRON_SECRET;

      if (!expectedSecret || cronSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get all pending greeting cards scheduled for today
      const pendingCards = await storage.getPendingGreetingCardsForToday();
      console.log(`[Cron] Found ${pendingCards.length} pending greeting cards to send`);

      let sentCount = 0;
      let failedCount = 0;

      for (const card of pendingCards) {
        try {
          const project = await storage.getProject(card.projectId);
          if (!project || !project.finalVideoUrl) {
            await storage.updateGreetingCard(card.id, { status: 'failed' });
            failedCount++;
            continue;
          }

          const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
          const viewUrl = `${baseUrl}/greeting/${card.uniqueToken}`;

          const emailSent = await emailService.sendGreetingCardEmail({
            recipientEmail: card.recipientEmail,
            senderName: card.senderName || card.senderEmail.split('@')[0],
            senderEmail: card.senderEmail,
            videoTitle: project.title || 'A Special Video',
            message: card.message,
            viewUrl
          });

          if (emailSent) {
            await storage.updateGreetingCard(card.id, {
              status: 'sent',
              sentAt: new Date()
            });
            sentCount++;
          } else {
            await storage.updateGreetingCard(card.id, { status: 'failed' });
            failedCount++;
          }
        } catch (cardError) {
          console.error(`[Cron] Failed to send greeting card ${card.id}:`, cardError);
          await storage.updateGreetingCard(card.id, { status: 'failed' });
          failedCount++;
        }
      }

      res.json({
        success: true,
        processed: pendingCards.length,
        sent: sentCount,
        failed: failedCount
      });
    } catch (error) {
      console.error("Cron send greeting cards error:", error);
      res.status(500).json({ error: "Failed to process greeting cards" });
    }
  });

  // Get greeting card details for public viewing
  app.get("/api/greeting/:token", async (req, res) => {
    try {
      const { token } = req.params;

      const greetingCard = await storage.getGreetingCardByToken(token);
      if (!greetingCard) {
        return res.status(404).json({ error: "Greeting card not found" });
      }

      const project = await storage.getProject(greetingCard.projectId);
      if (!project || !project.finalVideoUrl) {
        return res.status(404).json({ error: "Video not available" });
      }

      res.json({
        senderName: greetingCard.senderName || 'Someone',
        message: greetingCard.message,
        videoTitle: project.title || 'A Special Video',
        videoUrl: project.finalVideoUrl,
        thumbnailUrl: project.thumbnailUrl || null,
        muxPlaybackId: project.muxPlaybackId || null,
        bunnyStorageUrl: isBunnyUrl(project.finalVideoUrl || '') ? project.finalVideoUrl : null,
        aspectRatio: project.aspectRatio || '16:9',
        createdAt: greetingCard.createdAt
      });
    } catch (error) {
      console.error("Get greeting card error:", error);
      res.status(500).json({ error: "Failed to get greeting card" });
    }
  });

  // Get all user's generated songs
  app.get("/api/my-songs", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      console.log("=== FETCHING SONGS FOR USER ===");
      console.log("User ID:", userId);

      const songs = await storage.getSongs(userId);
      console.log("Raw songs from database:", songs.length);
      console.log("Songs data:", JSON.stringify(songs, null, 2));

      const userWithPlan = await storage.getUserWithPlan(userId);
      const isPaidUser = userWithPlan?.plan && (userWithPlan.plan as any).monthlyPrice > 0;
      const songLimit = isPaidUser ? null : FREE_USER_SONG_LIBRARY_LIMIT;
      const atLimit = songLimit !== null && songs.length >= songLimit;

      // Sort by newest first and format for frontend with ImageKit URL resolution
      const sortedSongs = songs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const formattedSongs = await Promise.all(
        sortedSongs.map(async song => ({
          id: song.id,
          title: song.title,
          audioUrl: await resolveUrlWithImageKitFallback(song.url, storage),
          audioTags: song.tags,
          audioLyrics: song.lyrics,
          duration: song.duration,
          thumbnailUrl: (song as any).thumbnailUrl
            ? await resolveUrlWithImageKitFallback((song as any).thumbnailUrl, storage)
            : null,
          subtitleStyle: (song as any).subtitleStyle || defaultSubtitleStyle,
          subtitleFileUrl: song.subtitleFileUrl,
          kieTaskId: song.kieTaskId,
          kieAudioId: song.kieAudioId,
          createdAt: song.createdAt,
          updatedAt: song.createdAt // Songs table doesn't have updatedAt
        }))
      );

      console.log("Formatted songs to return:", formattedSongs.length);
      res.json({
        songs: formattedSongs,
        songLimit: songLimit ?? undefined,
        atLimit: songLimit !== null ? atLimit : undefined,
      });
    } catch (error) {
      console.error("Get my songs error:", error);
      res.status(500).json({ error: "Failed to get songs" });
    }
  });

  // Delete user's own song
  app.delete("/api/my-songs/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const songId = req.params.id;

      // First check if the song exists and belongs to the user
      const song = await storage.getSong(songId);

      if (!song) {
        // Song doesn't exist - return 404 but frontend treats this as success
        return res.status(404).json({ error: "Song not found" });
      }

      // Check if the song belongs to the requesting user
      if (song.userId !== userId) {
        return res.status(403).json({ error: "You can only delete your own songs" });
      }

      // Delete the song
      await storage.deleteSong(songId);
      res.json({ message: "Song deleted successfully" });
    } catch (error) {
      console.error("Delete song error:", error);
      res.status(500).json({ error: "Failed to delete song" });
    }
  });

  // Music Tools: generate lyrics with OpenAI (no project required)
  app.post("/api/music-tools/generate-lyrics", authenticateToken, async (req, res) => {
    try {
      const { description, duration = 120 } = req.body || {};
      if (description) {
        const profanityCheck = checkProfanity(description);
        if (!profanityCheck.isClean) {
          return res.status(400).json({
            error: "Content Policy Violation",
            details: getCategoryMessage(profanityCheck.category || "unknown"),
            category: profanityCheck.category,
          });
        }
      }
      let lyrics: string;
      let title: string;
      try {
        const { generateLyricsWithTitle } = await import("./services/openai");
        const openaiResult = await generateLyricsWithTitle(description || "a song", duration);
        lyrics = openaiResult.lyrics;
        title = openaiResult.title;
      } catch (openaiError) {
        try {
          const { generateLyricsWithKieAndTitle } = await import("./services/kie");
          const kieResult = await generateLyricsWithKieAndTitle(description || "a song", duration);
          lyrics = kieResult.lyrics;
          title = kieResult.title;
        } catch (kieError) {
          console.error("Music Tools generate-lyrics: OpenAI and KIE failed", openaiError, kieError);
          return res.status(500).json({
            error: "Lyrics generation failed, please try again.",
            details: "Both OpenAI and KIE.AI generation methods failed",
          });
        }
      }
      const profanityCheck = checkProfanity(lyrics);
      if (!profanityCheck.isClean) {
        return res.status(400).json({
          error: "Generated lyrics contain inappropriate content",
          details: getCategoryMessage(profanityCheck.category || "unknown"),
          category: profanityCheck.category,
        });
      }
      res.json({ lyrics, title });
    } catch (error) {
      console.error("Music Tools generate-lyrics error:", error);
      res.status(500).json({ error: "Failed to generate lyrics" });
    }
  });

  // Music Tools: generate song options (4 parallel, first 2 + album covers). Image generation runs in parallel with music so covers are usually ready before songs.
  // Title is generated from description/tags via OpenAI so songs don't all show "NeonVideo Song".
  app.post("/api/music-tools/generate-song", authenticateToken, async (req, res) => {
    try {
      const { description, tags, lyrics } = req.body || {};
      const { generateMultipleSongsForSelection } = await import("./services/minimax");
      const coverPrompt = [description, tags].filter(Boolean).join(", ") || "music";
      // Start album cover generation and AI title generation in parallel with music
      const thumbnailPromises = Array.from({ length: 4 }, () =>
        generateAlbumCoverSeedreamV5Lite(coverPrompt).catch((err) => {
          console.error("[Music Tools] Album cover failed:", err);
          return null;
        })
      );
      const [minimaxSongs, thumbnailUrls, generatedTitle] = await Promise.all([
        generateMultipleSongsForSelection(
          tags || "",
          lyrics || undefined,
          description || undefined
        ),
        Promise.all(thumbnailPromises),
        generateSongTitle(description, tags),
      ]);
      if (minimaxSongs.length === 0) {
        return res.status(500).json({ error: "Failed to generate any songs" });
      }
      const title = (generatedTitle && generatedTitle.trim()) || "NeonVideo Song";
      const songs = minimaxSongs.map((song, index) => ({
        id: `generated-${index}`,
        title,
        audioUrl: song.audioUrl,
        audioTags: tags || null,
        audioLyrics: lyrics || null,
        duration: song.duration,
        thumbnailUrl: thumbnailUrls[index] ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      res.json({ songs });
    } catch (error) {
      console.error("Music Tools generate-song error:", error);
      res.status(500).json({ error: "Failed to generate songs" });
    }
  });

  // Music Tools: transcribe lyrics from audio (OpenAI Whisper) — URL or uploaded file
  app.post("/api/music-tools/transcribe-lyrics", authenticateToken, audioToolUpload.single("audio"), async (req, res) => {
    let tempPath: string | null = null;
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      let buffer: Buffer;
      let ext = ".mp3";

      if (req.file && req.file.buffer) {
        buffer = req.file.buffer;
        const base = (req.file.originalname || "audio").replace(/[^a-zA-Z0-9._-]/g, "_");
        const match = base.match(/\.[a-zA-Z0-9]+$/);
        if (match) ext = match[0].toLowerCase();
      } else if (typeof req.body.audioUrl === "string" && req.body.audioUrl.trim()) {
        const audioUrl = req.body.audioUrl.trim();
        const fetchRes = await fetch(audioUrl);
        if (!fetchRes.ok) {
          return res.status(400).json({ error: "Failed to fetch audio from URL", details: `${fetchRes.status}` });
        }
        const ab = await fetchRes.arrayBuffer();
        buffer = Buffer.from(ab);
        try {
          const urlPath = new URL(audioUrl).pathname;
          const urlMatch = urlPath.match(/\.[a-zA-Z0-9]+$/);
          if (urlMatch) ext = urlMatch[0].toLowerCase();
        } catch {
          // keep .mp3 default
        }
      } else if (typeof req.body.audio === "string" && req.body.audio.trim()) {
        const audioUrl = req.body.audio.trim();
        const fetchRes = await fetch(audioUrl);
        if (!fetchRes.ok) {
          return res.status(400).json({ error: "Failed to fetch audio from URL", details: `${fetchRes.status}` });
        }
        const ab = await fetchRes.arrayBuffer();
        buffer = Buffer.from(ab);
        try {
          const urlPath = new URL(audioUrl).pathname;
          const urlMatch = urlPath.match(/\.[a-zA-Z0-9]+$/);
          if (urlMatch) ext = urlMatch[0].toLowerCase();
        } catch {
          // keep .mp3 default
        }
      } else {
        return res.status(400).json({ error: "Provide an audio URL or upload an audio file." });
      }

      const baseName = `transcribe-lyrics_${Date.now()}${ext}`;
      tempPath = path.join(os.tmpdir(), baseName);
      fs.writeFileSync(tempPath, buffer);

      const lyrics = await transcribeAudio(tempPath);
      return res.json({ lyrics: (lyrics || "").trim() || "(No lyrics extracted)" });
    } catch (error) {
      console.error("[AUDIO-TO-LYRICS] Error:", error);
      res.status(500).json({
        error: "Failed to transcribe lyrics",
        details: (error as Error).message,
      });
    } finally {
      if (tempPath) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  // Music Tools: save chosen song to library (upload audio + thumbnail to Bunny)
  app.post("/api/music-tools/save-song", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { audioUrl, thumbnailUrl, title, tags, lyrics, duration, description } = req.body || {};
      if (!audioUrl || !title || duration == null) {
        return res.status(400).json({ error: "Missing required fields: audioUrl, title, duration" });
      }
      const userWithPlan = await storage.getUserWithPlan(userId);
      const isPaidUser = userWithPlan?.plan && (userWithPlan.plan as any).monthlyPrice > 0;
      if (!isPaidUser) {
        const existingSongs = await storage.getSongs(userId);
        if (existingSongs.length >= FREE_USER_SONG_LIBRARY_LIMIT) {
          return res.status(403).json({
            error: "Song library limit reached",
            message: `Free users can have up to ${FREE_USER_SONG_LIBRARY_LIMIT} songs in their library. Subscribe to add more.`,
            limit: FREE_USER_SONG_LIBRARY_LIMIT,
          });
        }
      }
      const fetch = (await import("node-fetch")).default;
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        return res.status(502).json({ error: "Failed to download audio" });
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      const audioFileName = `song_${userId}_${Date.now()}.mp3`;
      const { url: persistentAudioUrl } = await uploadSongAudio(audioFileName, audioBuffer);

      let persistentThumbnailUrl: string | null = null;
      if (thumbnailUrl && thumbnailUrl.trim()) {
        try {
          const imgRes = await fetch(thumbnailUrl);
          if (imgRes.ok) {
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            const imgExt = ".jpg";
            const imgFileName = `cover_${userId}_${Date.now()}${imgExt}`;
            const { url } = await uploadSongCover(imgFileName, imgBuffer);
            persistentThumbnailUrl = url;
          }
        } catch (imgErr) {
          console.error("[Music Tools] Thumbnail upload failed:", imgErr);
        }
      }

      const songData = {
        userId,
        title: String(title).trim(),
        url: persistentAudioUrl,
        duration: Number(duration),
        tags: tags ?? null,
        lyrics: lyrics ?? null,
        prompt: description ?? null,
        thumbnailUrl: persistentThumbnailUrl,
        subtitleStyle: defaultSubtitleStyle,
        subtitleFileUrl: null,
        kieTaskId: null,
        kieAudioId: null,
      };
      const savedSong = await storage.addSong(songData as any);
      res.json({ song: savedSong });
    } catch (error) {
      console.error("Music Tools save-song error:", error);
      res.status(500).json({ error: "Failed to save song" });
    }
  });

  // Get user's current project (most recent)
  app.get("/api/current-project", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projects = await storage.getProjectsByUser(userId);
      // Get the most recent project (in-progress or completed)
      const currentProject = projects
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

      if (!currentProject) {
        return res.status(404).json({ error: "No project found" });
      }

      // Resolve ImageKit URLs for media fields
      const resolvedProject = {
        ...currentProject,
        characterImageUrl: await resolveUrlWithImageKitFallback(currentProject.characterImageUrl, storage),
        audioUrl: await resolveUrlWithImageKitFallback(currentProject.audioUrl, storage),
        sceneImages: currentProject.sceneImages
          ? await Promise.all(currentProject.sceneImages.map(url => resolveUrlWithImageKitFallback(url, storage)))
          : null
      };

      res.json(resolvedProject);
    } catch (error) {
      console.error("Get current project error:", error);
      res.status(500).json({ error: "Failed to get current project" });
    }
  });

  // Get project by ID
  app.get("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const resolvedProject = {
        ...project,
        characterImageUrl: await resolveUrlWithImageKitFallback(project.characterImageUrl, storage),
        audioUrl: await resolveUrlWithImageKitFallback(project.audioUrl, storage),
        sceneImages: project.sceneImages
          ? await Promise.all(project.sceneImages.map(url => resolveUrlWithImageKitFallback(url, storage)))
          : null,
      };

      res.json(resolvedProject);
    } catch (error) {
      console.error("Get project error:", error);
      res.status(500).json({ error: "Failed to get project" });
    }
  });

  // Update project (owner only; allowed fields: title, isPublic, etc.)
  app.patch("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const existing = await storage.getProject(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ error: "You can only update your own projects" });
      }
      // Only allow safe updatable fields
      const allowed = ["title", "isPublic"] as const;
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          if (key === "isPublic") {
            updates[key] = req.body[key] === true || req.body[key] === "true";
          } else {
            updates[key] = req.body[key];
          }
        }
      }
      const project = await storage.updateProject(req.params.id, updates);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Update project error:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // Upload audio file
  app.post("/api/projects/:id/upload-audio", audioUpload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Get the project to find the user
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get user with plan to check if they're paid
      const userWithPlan = await storage.getUserWithPlan(project.userId);
      const isPaidUser = userWithPlan?.plan && userWithPlan.plan.monthlyPrice > 0;

      // Cap duration based on user plan: Free users max 120s (2 min), Paid users max 240s (4 min)
      const maxDuration = isPaidUser ? 240 : 120;

      // Get song title, description, lyrics, subtitles toggle and aspect ratio from request (optional)
      const songTitle = req.body.title || "";
      const songDescription = req.body.description || "";
      const songLyrics = req.body.lyrics || "";
      const addSubtitles = req.body.addSubtitles === 'true' || req.body.addSubtitles === true;
      const subtitleStyle = isSubtitleStyle(req.body.subtitleStyle) ? req.body.subtitleStyle : defaultSubtitleStyle;
      const aspectRatio = req.body.aspectRatio || "16:9"; // Default to horizontal
      // Normalize boolean values - treat 'false' string as false, anything else defaults appropriately
      const includeWatermark = req.body.includeWatermark === 'false' ? false : (req.body.includeWatermark === 'true' || req.body.includeWatermark === true || req.body.includeWatermark === undefined);
      const isPublic = req.body.isPublic === 'false' ? false : (req.body.isPublic === 'true' || req.body.isPublic === true || req.body.isPublic === undefined);

      console.log(`Uploading audio file (user plan: ${isPaidUser ? 'paid' : 'free'}, max allowed: ${maxDuration}s, subtitles: ${addSubtitles})${songTitle ? `, title: "${songTitle}"` : ''}${songDescription ? `, description: "${songDescription.substring(0, 50)}..."` : ''}${songLyrics ? ', with lyrics' : ''}`);

      // First, store the uploaded audio to object storage to get a public URL
      const objectStorageService = new ObjectStorageService();
      const audioPath = `songs/${crypto.randomUUID()}.${req.file.originalname.split('.').pop()}`;
      const audioBuffer = fs.readFileSync(req.file.path);

      // Upload to object storage (ImageKit if configured, otherwise Google Cloud Storage)
      const uploadedUrl = await objectStorageService.uploadAudioBuffer(audioBuffer, audioPath);

      // If ImageKit is configured, uploadedUrl is already the full ImageKit URL, so use it directly
      // Otherwise, get a signed URL from Google Cloud Storage
      const publicAudioUrl = uploadedUrl.startsWith('http')
        ? uploadedUrl
        : await objectStorageService.getSignedUrlForPath(`/objects/${audioPath}`, 86400);

      console.log(`Audio uploaded to object storage: ${uploadedUrl}`);

      // Get the actual duration of the uploaded audio file
      let actualDuration: number;
      let audioWasTrimmed = false; // Track if audio was trimmed explicitly
      let trimmedAudioBuffer: Buffer | null = null; // Save trimmed buffer for transcription if needed

      try {
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "audio_upload",
          message: "Detecting audio duration...",
          status: "progress",
          metadata: {}
        });

        const { getAudioDurationFromFile, trimAudio } = await import("./services/ffmpeg");
        actualDuration = await getAudioDurationFromFile(req.file.path);

        console.log(`Detected audio duration: ${actualDuration} seconds`);

        // Auto-trim if duration exceeds the maximum for user's plan
        if (actualDuration > maxDuration) {
          const originalDuration = actualDuration;
          audioWasTrimmed = true; // Explicitly mark that trimming occurred

          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "audio_upload",
            message: `Audio file is ${originalDuration}s long, automatically trimming to ${maxDuration}s...`,
            status: "progress",
            metadata: { originalDuration, maxDuration }
          });

          console.log(`Audio is ${originalDuration}s, trimming to ${maxDuration}s`);

          // Trim the audio using the FFMPEG API
          const trimResult = await trimAudio(publicAudioUrl, maxDuration);

          // Download the trimmed audio
          const trimmedResponse = await fetch(trimResult.download_url);
          trimmedAudioBuffer = Buffer.from(await trimmedResponse.arrayBuffer());

          // Replace the original audio in object storage with the trimmed version
          await objectStorageService.uploadAudioBuffer(trimmedAudioBuffer, audioPath);

          // Update duration to the trimmed length
          actualDuration = maxDuration;

          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "audio_upload",
            message: `Audio automatically trimmed from ${originalDuration}s to ${maxDuration}s`,
            status: "completed",
            metadata: { originalDuration, trimmedDuration: actualDuration }
          });

          console.log(`Audio trimmed successfully to ${actualDuration}s`);
        }

      } catch (durationError) {
        console.error("Failed to detect audio duration:", durationError);
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "audio_upload",
          message: "Failed to detect audio duration, using estimate",
          status: "warning",
          metadata: { error: (durationError as Error).message }
        });
        // Default to 60 seconds if detection fails
        actualDuration = 60;
      }

      const finalAudioUrl = uploadedUrl;

      const isInstrumental = project.isInstrumental === true;
      let lyricsForProject = songLyrics || null;

      // Transcribe audio to extract lyrics if none provided (for non-instrumental projects)
      if (!songLyrics && addSubtitles && !isInstrumental) {
        try {
          console.log("No lyrics provided, transcribing audio with Whisper...");
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation",
            message: "Transcribing audio using AI...",
            status: "progress",
            metadata: {}
          });

          const { transcribeAudio } = await import("./services/openai");
          let transcriptionFilePath = req.file?.path;
          let tempTrimmedFile: string | null = null;

          if (audioWasTrimmed && trimmedAudioBuffer) {
            tempTrimmedFile = path.join(uploadDir, `trimmed-${crypto.randomUUID()}.mp3`);
            fs.writeFileSync(tempTrimmedFile, trimmedAudioBuffer);
            transcriptionFilePath = tempTrimmedFile;
          }

          if (transcriptionFilePath && fs.existsSync(transcriptionFilePath)) {
            lyricsForProject = await transcribeAudio(transcriptionFilePath);
            console.log("Transcription completed, length:", lyricsForProject.length);
            if (tempTrimmedFile && fs.existsSync(tempTrimmedFile)) {
              fs.unlinkSync(tempTrimmedFile);
            }
          }
        } catch (transcribeError) {
          console.error("Transcription failed:", transcribeError);
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation",
            message: `Transcription failed: ${(transcribeError as Error).message}`,
            status: "warning",
            metadata: { error: (transcribeError as Error).message }
          });
        }
      } else if (isInstrumental) {
        // For instrumental projects (like lyric videos), transcribe audio if no lyrics provided
        // This allows auto-populating the lyrics field from the uploaded song
        // We do this regardless of addSubtitles flag since lyrics extraction is separate from subtitle generation
        if (!songLyrics) {
          try {
            console.log("No lyrics provided for instrumental project, transcribing audio with Whisper...");
            await storage.addGenerationLog({
              projectId: req.params.id,
              step: "subtitle_generation",
              message: "Transcribing audio to extract lyrics...",
              status: "progress",
              metadata: {}
            });

            const { transcribeAudio } = await import("./services/openai");

            // Determine which audio file to use for transcription
            let transcriptionFilePath = req.file?.path;
            let tempTrimmedFile: string | null = null;

            // If audio was trimmed, use the trimmed buffer for transcription
            // to ensure lyrics match the actual audio length
            if (audioWasTrimmed && trimmedAudioBuffer) {
              console.log("Audio was trimmed, using trimmed buffer for transcription...");
              // Save trimmed buffer to temp file for Whisper
              tempTrimmedFile = path.join(uploadDir, `trimmed-${crypto.randomUUID()}.mp3`);
              fs.writeFileSync(tempTrimmedFile, trimmedAudioBuffer);
              transcriptionFilePath = tempTrimmedFile;
              console.log("Trimmed audio saved for transcription:", tempTrimmedFile);
            }

            if (transcriptionFilePath && fs.existsSync(transcriptionFilePath)) {
              const transcribedLyrics = await transcribeAudio(transcriptionFilePath);
              lyricsForProject = transcribedLyrics;
              console.log("Transcription completed for instrumental project, length:", transcribedLyrics.length);

              // Clean up temp trimmed file if created
              if (tempTrimmedFile && fs.existsSync(tempTrimmedFile)) {
                fs.unlinkSync(tempTrimmedFile);
                console.log("Temp trimmed file cleaned up:", tempTrimmedFile);
              }

              await storage.addGenerationLog({
                projectId: req.params.id,
                step: "subtitle_generation",
                message: "Lyrics extracted from audio successfully",
                status: "completed",
                metadata: { lyricsLength: transcribedLyrics.length }
              });
            } else {
              console.log("No audio file available for transcription");
            }
          } catch (transcribeError) {
            console.error("Transcription failed for instrumental project:", transcribeError);
            await storage.addGenerationLog({
              projectId: req.params.id,
              step: "subtitle_generation",
              message: `Transcription failed: ${(transcribeError as Error).message}`,
              status: "warning",
              metadata: { error: (transcribeError as Error).message }
            });
          }
        } else if (addSubtitles) {
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation",
            message: "Instrumental project: captions will be generated from text overlay during video generation",
            status: "info",
            metadata: {}
          });
        }
      }

      // Clean up the temporary uploaded file
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log("Temporary file cleaned up:", req.file.path);
        }
      } catch (cleanupError) {
        console.error("Failed to clean up uploaded file:", cleanupError);
      }

      // Run forced alignment to get word-level timestamps for lyrics
      let subtitleFileUrlForUpload: string | null = null;
      if (lyricsForProject && lyricsForProject.trim().length > 0 && addSubtitles) {
        try {
          console.log("Running forced alignment on uploaded audio...");
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation",
            message: "Aligning lyrics to audio for word-level timestamps...",
            status: "progress",
            metadata: {}
          });

          const { createForcedAlignment, convertElevenLabsAlignmentToASS, storeElevenLabsSubtitleFile } = await import("./services/elevenlabs");
          const alignment = await createForcedAlignment(
            uploadedUrl.startsWith('http') ? uploadedUrl : publicAudioUrl,
            lyricsForProject
          );
          const assContent = convertElevenLabsAlignmentToASS(alignment);
          subtitleFileUrlForUpload = await storeElevenLabsSubtitleFile(assContent);

          console.log("Forced alignment completed for uploaded audio, subtitle URL:", subtitleFileUrlForUpload);
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation",
            message: "Lyrics aligned to audio successfully",
            status: "completed",
            metadata: { subtitleFileUrl: subtitleFileUrlForUpload }
          });
        } catch (alignmentError) {
          console.error("Forced alignment failed for uploaded audio (non-fatal):", alignmentError);
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation",
            message: `Lyrics alignment failed: ${(alignmentError as Error).message}`,
            status: "warning",
            metadata: { error: (alignmentError as Error).message }
          });
        }
      }

      // Update project with audio URL and description
      // For uploaded audio, we store the description in audioPrompt to generate scenes
      const updateData: any = {
        audioUrl: finalAudioUrl,
        audioType: 'uploaded',
        audioDuration: actualDuration,
        audioPrompt: songDescription || null,
        audioLyrics: lyricsForProject,
        addSubtitles: !!addSubtitles,
        subtitleStyle,
        subtitleFileUrl: subtitleFileUrlForUpload,
        aspectRatio: aspectRatio,
        includeWatermark: includeWatermark,
        isPublic: isPublic
      };

      // Only update title if user provided one
      if (songTitle.trim()) {
        updateData.title = songTitle.trim();
      }

      const updatedProject = await storage.updateProject(req.params.id, updateData);

      if (!updatedProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_upload",
        message: `Audio file uploaded successfully (${actualDuration}s)${songDescription ? ', with description' : ''}`,
        status: "completed",
        metadata: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          audioUrl: finalAudioUrl,
          duration: actualDuration,
          hasDescription: !!songDescription,
          subtitleStyle,
          subtitleFileUrl: subtitleFileUrlForUpload,
        }
      });

      res.json({
        audioUrl: finalAudioUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        duration: actualDuration,
        hasDescription: !!songDescription,
        hasSubtitles: !!subtitleFileUrlForUpload,
        subtitleFileUrl: subtitleFileUrlForUpload,
        subtitleStyle,
        lyrics: lyricsForProject
      });
    } catch (error) {
      console.error("Upload audio error:", error);

      // Clean up file if it was uploaded but processing failed
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("Failed to clean up uploaded file:", cleanupError);
        }
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_upload",
        message: `Audio upload failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });

      res.status(500).json({ error: "Failed to upload audio file" });
    }
  });

  // Trim audio file using split_audio_time endpoint
  app.post("/api/projects/:id/trim-audio", async (req, res) => {
    try {
      const { audioUrl, startTime, endTime, title, description, addSubtitles, subtitleStyle: subtitleStyleInput, lyrics, sourceSubtitleFileUrl } = req.body; // startTime and endTime in milliseconds

      if (!audioUrl || startTime === undefined || endTime === undefined) {
        return res.status(400).json({ error: "Missing required parameters: audioUrl, startTime, endTime" });
      }

      if (startTime >= endTime) {
        return res.status(400).json({ error: "startTime must be less than endTime" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Subtract 10ms from endTime to ensure the trimmed audio doesn't exceed the requested duration
      // This prevents cases where FFmpeg might include a bit more audio due to frame boundaries
      // Ensure adjustedEndTime is still greater than startTime (with at least 10ms difference)
      const adjustedEndTime = Math.max(startTime + 10, endTime - 10);

      console.log(`Trimming audio: ${audioUrl} from ${startTime}ms to ${endTime}ms (adjusted endTime: ${adjustedEndTime}ms)`);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_trim",
        message: `Trimming audio from ${Math.floor(startTime / 1000)}s to ${Math.floor(endTime / 1000)}s...`,
        status: "progress",
        metadata: { startTime, endTime, adjustedEndTime }
      });

      const { splitAudioByTime } = await import("./services/ffmpeg");
      const result = await splitAudioByTime(audioUrl, startTime, adjustedEndTime);

      // Download the trimmed audio
      const trimmedResponse = await fetch(result.download_url);
      const trimmedBuffer = Buffer.from(await trimmedResponse.arrayBuffer());

      // Upload trimmed audio to object storage
      const objectStorageService = new ObjectStorageService();
      const audioPath = `songs/${crypto.randomUUID()}.mp3`;
      const trimmedUrl = await objectStorageService.uploadAudioBuffer(trimmedBuffer, audioPath);

      // Get public URL
      const publicAudioUrl = trimmedUrl.startsWith('http')
        ? trimmedUrl
        : await objectStorageService.getSignedUrlForPath(`/objects/${audioPath}`, 86400);

      // Get duration of trimmed audio
      const { getAudioDurationFromFile } = await import("./services/ffmpeg");
      const tempFilePath = path.join(uploadDir, `trimmed-${crypto.randomUUID()}.mp3`);
      fs.writeFileSync(tempFilePath, trimmedBuffer);
      const trimmedDuration = await getAudioDurationFromFile(tempFilePath);
      fs.unlinkSync(tempFilePath); // Clean up temp file

      const subtitleStyle = isSubtitleStyle(subtitleStyleInput)
        ? subtitleStyleInput
        : isSubtitleStyle((project as any).subtitleStyle)
          ? (project as any).subtitleStyle
          : defaultSubtitleStyle;
      let subtitleFileUrl: string | null = null;
      const lyricsForTrimmedSong: string | null =
        typeof lyrics === "string" && lyrics.trim().length > 0 ? lyrics.trim() : null;

      // Run forced alignment on trimmed audio to get word-level timestamps for lyrics
      if (lyricsForTrimmedSong && publicAudioUrl) {
        try {
          console.log("Running forced alignment on trimmed audio...");
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "audio_trim",
            message: "Aligning lyrics to trimmed audio...",
            status: "progress",
            metadata: {}
          });

          const { createForcedAlignment, convertElevenLabsAlignmentToASS, storeElevenLabsSubtitleFile } = await import("./services/elevenlabs");
          const alignment = await createForcedAlignment(publicAudioUrl, lyricsForTrimmedSong);
          const assContent = convertElevenLabsAlignmentToASS(alignment);
          subtitleFileUrl = await storeElevenLabsSubtitleFile(assContent);

          console.log("Forced alignment completed for trimmed audio, subtitle URL:", subtitleFileUrl);
        } catch (alignmentError) {
          console.error("Forced alignment failed for trimmed audio (non-fatal):", alignmentError);
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "audio_trim",
            message: `Lyrics alignment failed: ${(alignmentError as Error).message}`,
            status: "warning",
            metadata: { error: (alignmentError as Error).message }
          });
        }
      }

      // Save trimmed audio to user's library (skip if free user at song limit)
      let savedSong = null;
      try {
        const userWithPlan = await storage.getUserWithPlan(project.userId);
        const isPaidUser = userWithPlan?.plan && (userWithPlan.plan as any).monthlyPrice > 0;
        const atSongLimit = !isPaidUser && (await storage.getSongs(project.userId)).length >= FREE_USER_SONG_LIBRARY_LIMIT;
        if (!atSongLimit) {
          const songTitle = title || `Trimmed Audio (${Math.floor(startTime / 1000)}s - ${Math.floor(endTime / 1000)}s)`;
          const songData = {
            userId: project.userId,
            title: songTitle,
            url: publicAudioUrl,
            duration: trimmedDuration,
            tags: null,
            lyrics: lyricsForTrimmedSong,
            prompt: description || null,
            subtitleStyle,
            subtitleFileUrl,
            kieTaskId: null,
            kieAudioId: null
          };

          console.log("=== SAVING TRIMMED AUDIO TO USER LIBRARY ===");
          console.log("Song data:", JSON.stringify(songData, null, 2));

          savedSong = await storage.addSong(songData);
          console.log("✅ Trimmed audio successfully saved to user library!");
          console.log("Saved song ID:", savedSong.id);
          console.log("Saved song URL:", savedSong.url);
        } else {
          console.log("=== SKIPPING SAVE TO LIBRARY (free user at song limit) ===");
        }
      } catch (libraryError) {
        console.error("❌ FAILED to save trimmed audio to library:", libraryError);
        // Continue even if saving to library fails - the trim was successful
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_trim",
        message: `Audio trimmed successfully (${trimmedDuration}s)${savedSong ? ' and saved to library' : ''}`,
        status: "completed",
        metadata: {
          originalUrl: audioUrl,
          trimmedUrl: publicAudioUrl,
          duration: trimmedDuration,
          startTime,
          endTime,
          subtitleStyle,
          subtitleFileUrl,
          savedToLibrary: !!savedSong,
          songId: savedSong?.id || null
        }
      });

      res.json({
        audioUrl: publicAudioUrl,
        duration: trimmedDuration,
        startTime,
        endTime,
        subtitleStyle,
        subtitleFileUrl,
        hasSubtitles: !!subtitleFileUrl,
        lyrics: lyricsForTrimmedSong,
        songId: savedSong?.id || null,
        savedToLibrary: !!savedSong
      });
    } catch (error) {
      console.error("Trim audio error:", error);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_trim",
        message: `Audio trimming failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });

      res.status(500).json({ error: "Failed to trim audio file" });
    }
  });

  // Re-apply captions with new settings after trimming
  app.post("/api/projects/:id/reapply-captions", authenticateToken, async (req, res) => {
    try {
      const { subtitleStyle: subtitleStyleInput, textPosition, captionPosition, fontFamily: requestedFontFamily, addSubtitles } = req.body;

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Validate subtitle style
      const subtitleStyle = isSubtitleStyle(subtitleStyleInput)
        ? subtitleStyleInput
        : isSubtitleStyle((project as any).subtitleStyle)
          ? (project as any).subtitleStyle
          : defaultSubtitleStyle;

      // Validate caption position
      const validTextPositions = ["top", "center", "bottom"];
      const captionPos = validTextPositions.includes(textPosition || captionPosition)
        ? (textPosition || captionPosition)
        : (project as any).captionPosition || "bottom";

      // Validate font family
      const fontFamily = isGoogleFont(requestedFontFamily) ? requestedFontFamily : (project as any).fontFamily || defaultGoogleFont;

      const shouldAddSubtitles = addSubtitles === true || addSubtitles === "true" || (addSubtitles === undefined && (project as any).addSubtitles);

      // Check if we have trimmed audio and lyrics
      if (!project.audioUrl) {
        return res.status(400).json({ error: "No audio URL found. Please trim the audio first." });
      }

      const audioLyrics = project.audioLyrics || (project as any).audioLyrics;
      if (!audioLyrics || audioLyrics.trim().length === 0) {
        return res.status(400).json({ error: "No lyrics found. Cannot regenerate captions without lyrics." });
      }

      // Save caption settings to the project; captions are auto-generated
      // by ffmpegapi during video generation, not during this step.
      const updateData: any = {
        subtitleStyle,
        fontFamily,
        captionPosition: shouldAddSubtitles ? captionPos : undefined,
        addSubtitles: shouldAddSubtitles,
      };

      await storage.updateProject(req.params.id, updateData);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "subtitle_generation",
        message: "Caption settings updated successfully",
        status: "completed",
        metadata: { subtitleStyle, captionPosition: captionPos, fontFamily, addSubtitles: shouldAddSubtitles }
      });

      return res.status(200).json({
        success: true,
        subtitleFileUrl: null,
        subtitleStyle,
        captionPosition: captionPos,
        fontFamily,
        addSubtitles: shouldAddSubtitles,
      });
    } catch (error) {
      console.error("Re-apply captions error:", error);
      return res.status(500).json({
        error: "Failed to re-apply captions",
        message: (error as Error).message,
      });
    }
  });

  // Generate lyrics with OpenAI and KIE.AI fallback
  app.post("/api/projects/:id/generate-lyrics", async (req, res) => {
    try {
      const { description, duration = 120 } = req.body; // Duration in seconds

      // Check for profanity in description
      if (description) {
        const profanityCheck = checkProfanity(description);
        if (!profanityCheck.isClean) {
          console.log("Description contains inappropriate content:", profanityCheck.detectedWords);

          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "lyrics_generation",
            message: `Lyrics generation blocked: description contains inappropriate content (${profanityCheck.category})`,
            status: "error",
            metadata: {
              detectedWords: profanityCheck.detectedWords,
              category: profanityCheck.category
            }
          });

          return res.status(400).json({
            error: "Content Policy Violation",
            details: getCategoryMessage(profanityCheck.category || 'unknown'),
            category: profanityCheck.category
          });
        }
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: "Starting lyrics generation",
        status: "started",
        metadata: { description }
      });

      let lyrics: string;
      let title: string;
      let generationMethod = "OpenAI";

      try {
        // First, try OpenAI lyrics generation
        console.log("Attempting lyrics generation with OpenAI...");
        const { generateLyricsWithTitle } = await import("./services/openai");
        const openaiResult = await generateLyricsWithTitle(description, duration);
        lyrics = openaiResult.lyrics;
        title = openaiResult.title;
        generationMethod = "OpenAI";

        console.log("OpenAI lyrics generation successful");
      } catch (openaiError) {
        console.log("OpenAI lyrics generation failed, trying KIE.AI fallback...");
        console.error("OpenAI error:", (openaiError as Error).message);

        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "lyrics_generation",
          message: `OpenAI failed, trying KIE.AI fallback: ${(openaiError as Error).message}`,
          status: "retry",
          metadata: { openaiError: (openaiError as Error).message }
        });

        try {
          // Fallback to KIE.AI lyrics generation
          const { generateLyricsWithKieAndTitle } = await import("./services/kie");
          const kieResult = await generateLyricsWithKieAndTitle(description, duration);
          lyrics = kieResult.lyrics;
          title = kieResult.title;
          generationMethod = "KIE.AI";

          console.log("KIE.AI lyrics generation successful");
        } catch (kieError) {
          console.log("Both OpenAI and KIE.AI lyrics generation failed");
          console.error("KIE.AI error:", (kieError as Error).message);

          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "lyrics_generation",
            message: `Both OpenAI and KIE.AI failed. OpenAI: ${(openaiError as Error).message}. KIE.AI: ${(kieError as Error).message}`,
            status: "error",
            metadata: {
              openaiError: (openaiError as Error).message,
              kieError: (kieError as Error).message
            }
          });

          // Both methods failed
          return res.status(500).json({
            error: "Lyrics generation failed, please try again.",
            details: "Both OpenAI and KIE.AI generation methods failed"
          });
        }
      }

      // Check for profanity in generated lyrics
      const profanityCheck = checkProfanity(lyrics);
      if (!profanityCheck.isClean) {
        console.log("Generated lyrics contain inappropriate content:", profanityCheck.detectedWords);

        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "lyrics_generation",
          message: `Generated lyrics contain inappropriate content: ${profanityCheck.category}`,
          status: "error",
          metadata: {
            detectedWords: profanityCheck.detectedWords,
            category: profanityCheck.category
          }
        });

        return res.status(400).json({
          error: "Generated lyrics contain inappropriate content",
          details: getCategoryMessage(profanityCheck.category || 'unknown'),
          category: profanityCheck.category
        });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: `Lyrics and title generated successfully using ${generationMethod}`,
        status: "completed",
        metadata: { lyrics, title, generationMethod }
      });

      // Update the project title with the AI-generated title
      if (title) {
        await storage.updateProject(req.params.id, { title });
      }

      res.json({ lyrics, title, generationMethod });
    } catch (error) {
      console.error("Generate lyrics error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: `Lyrics generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({
        error: "Lyrics generation failed, please try again.",
        details: (error as Error).message
      });
    }
  });

  // Generate song
  app.post("/api/projects/:id/generate-song", async (req, res) => {
    try {
      const { description, tags, lyrics, songTitle, addSubtitles = false, subtitleStyle: subtitleStyleInput, includeWatermark = true, isPublic = true, aspectRatio = "16:9" } = req.body;
      const subtitleStyle = isSubtitleStyle(subtitleStyleInput) ? subtitleStyleInput : defaultSubtitleStyle;

      // Check for profanity in user-provided lyrics
      if (lyrics) {
        const profanityCheck = checkProfanity(lyrics);
        if (!profanityCheck.isClean) {
          console.log("User-provided lyrics contain inappropriate content:", profanityCheck.detectedWords);

          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "song_generation",
            message: `Song generation blocked: lyrics contain inappropriate content (${profanityCheck.category})`,
            status: "error",
            metadata: {
              detectedWords: profanityCheck.detectedWords,
              category: profanityCheck.category
            }
          });

          return res.status(400).json({
            error: "Content Policy Violation",
            details: getCategoryMessage(profanityCheck.category || 'unknown'),
            category: profanityCheck.category
          });
        }
      }

      // Get project to find the user
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const userWithPlan = await storage.getUserWithPlan(project.userId);
      const isPaidUser = userWithPlan?.plan && userWithPlan.plan.monthlyPrice > 0;
      const isPremiumUser = userWithPlan?.plan?.name === "Premium";

      // Only Premium users can disable watermark - enforce server-side
      const finalIncludeWatermark = isPremiumUser ? includeWatermark : true;

      // Only Premium users can make videos private - enforce server-side
      const finalIsPublic = isPremiumUser ? isPublic : true;

      // Song generation is free - credits are only consumed for video generation

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: "Starting song generation",
        status: "started",
        metadata: { tags, lyrics, addSubtitles, subtitleStyle, includeWatermark: finalIncludeWatermark, isPublic: finalIsPublic, isPremiumUser, aspectRatio }
      });

      await storage.updateProject(req.params.id, {
        addSubtitles: addSubtitles === true || addSubtitles === 'true',
        subtitleStyle,
        includeWatermark: finalIncludeWatermark,
        isPublic: finalIsPublic,
        aspectRatio,
      } as any);

      let result;
      let subtitleFileUrl = null;
      let generatedSubtitlesContent = null;
      let kieTaskId = null;
      let kieAudioId = null;

      // Use Minimax Music 02 for song generation - 4 in parallel, show first 2 to finish
      console.log("Using Minimax Music 02 for song generation (4 parallel, first 2 to finish)...");

      // Generate 4 songs in parallel; return first 2 that complete - user selects one, then trims
      const { generateMultipleSongsForSelection } = await import("./services/minimax");
      const minimaxSongs = await generateMultipleSongsForSelection(tags, lyrics, description);

      if (minimaxSongs.length === 0) {
        throw new Error("Failed to generate any songs");
      }

      console.log(`Generated ${minimaxSongs.length} song(s) for user selection`);

      // Log song generation for traceability
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: `Generated ${minimaxSongs.length} song(s) for user selection`,
        status: "completed",
        metadata: {
          songsGenerated: minimaxSongs.length,
          songDurations: minimaxSongs.map(s => s.duration)
        }
      });

      // Create result format with multiple songs for user selection
      // Format songs to match expected structure
      const formattedSongs = minimaxSongs.map((song, index) => ({
        id: `generated-${index}`,
        title: song.title,
        audioUrl: song.audioUrl,
        audioTags: tags || null,
        audioLyrics: lyrics || null,
        duration: song.duration,
        subtitleFileUrl: null, // Will be generated after selection if needed
        kieTaskId: null,
        kieAudioId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // Return the songs for user selection
      // Note: Subtitles and library saving will happen after user selects a song and trims it
      res.json({
        songs: formattedSongs,
        generatedSubtitlesContent: null,
        subtitleFileUrl: null
      });
    } catch (error) {
      console.error("Generate song error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: `Song generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate song" });
    }
  });


  // Generate character
  app.post("/api/projects/:id/generate-character", async (req, res) => {
    try {
      console.log("Character generation route called with body:", req.body);
      const { prompt, aspectRatio = "16:9" } = req.body;
      console.log("Extracted prompt:", prompt);
      console.log("Aspect ratio:", aspectRatio);

      if (!prompt || !prompt.trim()) {
        throw new Error("No prompt provided");
      }

      // Validate prompt for inappropriate content
      validateCharacterGenerationPrompt(prompt);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Starting character generation",
        status: "started",
        metadata: { prompt }
      });

      console.log("About to call generateCharacterImage with aspect ratio:", aspectRatio);
      const imageUrl = await generateCharacterImage(prompt, aspectRatio);
      console.log("generateCharacterImage returned:", imageUrl);

      // Persist to Bunny Storage (or ImageKit/GCS) so DB and client get a permanent URL
      let finalImageUrl = imageUrl;
      if (!isBunnyUrl(imageUrl) && !imageUrl.startsWith('/objects/')) {
        const storedImage = await downloadAndStoreImage(imageUrl, "characters");
        finalImageUrl = storedImage.storedUrl;
        console.log("Character image persisted to storage:", finalImageUrl);
      }

      await storage.updateProject(req.params.id, {
        characterImageUrl: finalImageUrl,
        characterType: "generated",
        characterPrompt: prompt,
        currentStep: 3
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character generated successfully",
        status: "completed",
        metadata: { imageUrl: finalImageUrl }
      });

      res.json({ imageUrl: finalImageUrl });
    } catch (error) {
      console.error("Generate character error:", error);
      const errorMessage = (error as Error).message;
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: `Character generation failed: ${errorMessage}`,
        status: "error",
        metadata: { error: errorMessage }
      });
      res.status(500).json({ error: errorMessage });
    }
  });

  // Get character styles from characters.json
  app.get("/api/characters/styles", async (req, res) => {
    try {
      const charactersJsonPath = path.join(process.cwd(), "characters.json");
      const charactersData = JSON.parse(fs.readFileSync(charactersJsonPath, "utf-8"));

      // Add "No style" option at the beginning
      const noStyleOption = {
        style_name: "No style",
        model: "alibaba/wan-2.5/text-to-image",
        thumbnail_image: "https://neonvideo.b-cdn.net/characterpublic/no_style.jpg",
        prompt_enhancer: null
      };

      const styles = [
        noStyleOption,
        ...charactersData
      ];

      console.log("Serving character styles. First style (No style):", JSON.stringify(noStyleOption, null, 2));
      console.log(`Total styles: ${styles.length}`);

      res.json(styles);
    } catch (error) {
      console.error("Get character styles error:", error);
      res.status(500).json({ error: "Failed to get character styles" });
    }
  });

  // Generate multiple character options (KIE.ai API)
  app.post("/api/projects/:id/generate-character-options", async (req, res) => {
    try {
      console.log("Character options generation route called with body:", req.body);
      const { prompt, aspectRatio = "16:9", style = "3d", model, promptEnhancer } = req.body;
      console.log("Extracted prompt:", prompt);
      console.log("Aspect ratio:", aspectRatio);
      console.log("Style:", style);
      console.log("Model:", model);
      console.log("Prompt enhancer:", promptEnhancer);

      if (!prompt || !prompt.trim()) {
        throw new Error("No prompt provided");
      }

      // Validate prompt and enhancer for inappropriate content
      validateCharacterGenerationPrompt(prompt, promptEnhancer);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Starting character options generation",
        status: "started",
        metadata: { prompt, style, model, promptEnhancer }
      });

      // Use new style-based approach if model is provided, otherwise fallback to old style-based logic
      let imageUrls: string[];
      if (model !== undefined) {
        console.log("About to call generateCharacterImages with model:", model, "and prompt enhancer:", promptEnhancer);
        imageUrls = await generateCharacterImages(prompt, aspectRatio, style, model, promptEnhancer);
      } else {
        console.log("About to call generateCharacterImages with aspect ratio:", aspectRatio, "and style:", style);
        imageUrls = await generateCharacterImages(prompt, aspectRatio, style);
      }
      console.log("generateCharacterImages returned:", imageUrls);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character options generated successfully",
        status: "completed",
        metadata: { imageUrls, count: imageUrls.length }
      });

      res.json({ imageUrls, prompt });
    } catch (error) {
      console.error("Generate character options error:", error);
      const errorMessage = (error as Error).message;
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: `Character options generation failed: ${errorMessage}`,
        status: "error",
        metadata: { error: errorMessage }
      });
      res.status(500).json({ error: errorMessage });
    }
  });

  // Save selected character option to project  
  app.post("/api/projects/:id/save-character-option", async (req, res) => {
    try {
      console.log("Save character option request body:", req.body);
      const { imageUrl, prompt } = req.body;

      if (!imageUrl || !prompt) {
        return res.status(400).json({ error: "Image URL and prompt are required" });
      }

      let finalImageUrl: string;

      // Already stored: object storage path or Bunny Storage URL
      if (imageUrl.startsWith('/objects/') || isBunnyUrl(imageUrl)) {
        console.log("Image already stored, using existing URL:", imageUrl.substring(0, 60) + "...");
        finalImageUrl = imageUrl;
      } else {
        // Download and store to Bunny (or ImageKit/GCS fallback) permanently
        console.log("Downloading and storing character image...");
        const storedImage = await downloadAndStoreImage(imageUrl, "characters");
        console.log("Image stored successfully:", storedImage.storedUrl);
        finalImageUrl = storedImage.storedUrl;
      }

      const project = await storage.updateProject(req.params.id, {
        characterImageUrl: finalImageUrl,
        characterType: "generated",
        characterPrompt: prompt,
        currentStep: 3
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character option saved successfully with permanent storage",
        status: "completed",
        metadata: {
          originalImageUrl: imageUrl,
          storedImageUrl: finalImageUrl,
          prompt
        }
      });

      res.json({
        characterImageUrl: project?.characterImageUrl,
        message: 'Character saved successfully'
      });
    } catch (error) {
      console.error("Save character option error:", error);
      res.status(500).json({ error: "Failed to save character option" });
    }
  });

  // Generate character image-to-image with style
  app.post("/api/projects/:id/generate-character-image-to-image", async (req, res) => {
    try {
      console.log("Character image-to-image generation route called with body:", req.body);
      const { imageUrl, prompt, promptEnhancer } = req.body;
      console.log("Image URL:", imageUrl);
      console.log("Prompt:", prompt);
      console.log("Prompt enhancer:", promptEnhancer);

      if (!imageUrl || !prompt || !prompt.trim()) {
        throw new Error("Image URL and prompt are required");
      }

      // Validate prompt and enhancer for inappropriate content
      validateCharacterGenerationPrompt(prompt, promptEnhancer);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Starting character image-to-image generation",
        status: "started",
        metadata: { imageUrl, prompt, promptEnhancer }
      });

      console.log("About to call generateCharacterImageToImage");
      const resultImageUrl = await generateCharacterImageToImage(
        imageUrl,
        prompt,
        promptEnhancer || null
      );
      console.log("generateCharacterImageToImage returned:", resultImageUrl);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character image-to-image generation completed successfully",
        status: "completed",
        metadata: { resultImageUrl }
      });

      res.json({ imageUrl: resultImageUrl, prompt });
    } catch (error) {
      console.error("Generate character image-to-image error:", error);
      const errorMessage = (error as Error).message;
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: `Character image-to-image generation failed: ${errorMessage}`,
        status: "error",
        metadata: { error: errorMessage }
      });
      res.status(500).json({ error: errorMessage });
    }
  });

  // Enhance character image to hyper real (free - no credits charged)
  app.post("/api/characters/enhance-hyper-real", async (req, res) => {
    try {
      console.log("Hyper real enhancement request body:", req.body);
      const { imageUrl, prompt } = req.body;

      if (!imageUrl || !prompt) {
        return res.status(400).json({ error: "Image URL and prompt are required" });
      }

      console.log("Starting hyper real enhancement...");
      const enhancedImageUrl = await enhanceImageHyperReal(imageUrl, prompt);
      console.log("Enhancement completed:", enhancedImageUrl);

      // Download and store the enhanced image
      const storedImage = await downloadAndStoreImage(enhancedImageUrl, "characters");
      console.log("Enhanced image stored:", storedImage.storedUrl);

      res.json({
        enhancedImageUrl: storedImage.storedUrl,
        message: 'Character enhanced to hyper real successfully'
      });
    } catch (error) {
      console.error("Hyper real enhancement error:", error);
      res.status(500).json({ error: "Failed to enhance character to hyper real" });
    }
  });

  // Select song for project (handles both generated songs and library songs)
  app.post("/api/projects/:id/select-song", authenticateToken, async (req, res) => {
    try {
      const { audioUrl, audioTags, audioLyrics, audioType, duration, subtitleFileUrl, subtitleStyle: subtitleStyleInput, kieTaskId, kieAudioId, title, aspectRatio, addSubtitles, includeWatermark, isPublic, saveToLibrary, audioPrompt, textPosition, captionPosition, fontFamily: requestedFontFamily } = req.body;
      const subtitleStyle = isSubtitleStyle(subtitleStyleInput) ? subtitleStyleInput : defaultSubtitleStyle;

      // Validate and set captionPosition (accept both textPosition and captionPosition for compatibility)
      const validTextPositions = ["top", "center", "bottom"];
      const captionPos = validTextPositions.includes(textPosition || captionPosition) ? (textPosition || captionPosition) : undefined;

      // Validate and set fontFamily
      const fontFamily = isGoogleFont(requestedFontFamily) ? requestedFontFamily : undefined;

      console.log("=== SELECT-SONG REQUEST ===");
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      console.log("Duration received:", duration);

      // Build update data based on what's provided
      const updateData: any = {
        audioUrl,
        currentStep: 2
      };

      // Add optional fields if provided (for library songs)
      if (audioTags) updateData.audioTags = audioTags;
      if (audioLyrics) updateData.audioLyrics = audioLyrics;
      if (audioType) updateData.audioType = audioType;
      if (duration) updateData.audioDuration = duration;
      if (title && title.trim()) updateData.title = title.trim();
      if (audioPrompt && audioPrompt.trim()) updateData.audioPrompt = audioPrompt.trim();
      if (aspectRatio) updateData.aspectRatio = aspectRatio; // Store aspect ratio ('16:9' or '3:4')
      // Handle boolean values that might come as strings from JSON or form data
      if (addSubtitles !== undefined) updateData.addSubtitles = addSubtitles === true || addSubtitles === 'true';
      if (includeWatermark !== undefined) updateData.includeWatermark = includeWatermark === true || includeWatermark === 'true';
      if (isPublic !== undefined) updateData.isPublic = isPublic === true || isPublic === 'true';
      updateData.subtitleStyle = subtitleStyle;
      if (fontFamily) updateData.fontFamily = fontFamily;
      if (captionPos) updateData.captionPosition = captionPos;
      if (subtitleFileUrl) {
        updateData.addSubtitles = true;
        updateData.subtitleFileUrl = subtitleFileUrl;
        updateData.kieTaskId = kieTaskId;
        updateData.kieAudioId = kieAudioId;
      }

      console.log("Update data to save:", JSON.stringify(updateData, null, 2));

      const project = await storage.updateProject(req.params.id, updateData);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Save full version of generated song to user's library (only when explicitly requested; skip if free user at limit)
      let savedFullSong = null;
      if (saveToLibrary && audioType === "generated" && audioUrl) {
        const userWithPlan = await storage.getUserWithPlan(project.userId);
        const isPaidUser = userWithPlan?.plan && (userWithPlan.plan as any).monthlyPrice > 0;
        const atSongLimit = !isPaidUser && (await storage.getSongs(project.userId)).length >= FREE_USER_SONG_LIBRARY_LIMIT;
        if (!atSongLimit) {
        try {
          let urlToSave = audioUrl;
          // Persist to Bunny if URL is temporary (e.g. WaveSpeed expires after 7 days)
          if (!isBunnyUrl(audioUrl)) {
            try {
              const fetch = (await import("node-fetch")).default;
              const audioRes = await fetch(audioUrl);
              if (audioRes.ok) {
                const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
                const audioFileName = `song_${project.userId}_${Date.now()}.mp3`;
                const { url } = await uploadSongAudio(audioFileName, audioBuffer);
                urlToSave = url;
                console.log("✅ Generated song audio uploaded to Bunny for library");
              }
            } catch (uploadErr) {
              console.error("❌ Failed to upload generated song to Bunny, saving original URL:", uploadErr);
            }
          }
          const songData = {
            userId: project.userId,
            title: title || audioTags || "Generated Song",
            url: urlToSave,
            duration: duration || null,
            tags: audioTags || null,
            lyrics: audioLyrics || null,
            prompt: null,
            thumbnailUrl: null, // Story-mode saves don't have album cover; library shows default icon
            subtitleStyle: subtitleStyle || null,
            subtitleFileUrl: subtitleFileUrl || null,
            kieTaskId: kieTaskId || null,
            kieAudioId: kieAudioId || null
          };

          console.log("=== SAVING FULL GENERATED SONG TO USER LIBRARY ===");
          console.log("Song data:", JSON.stringify(songData, null, 2));

          savedFullSong = await storage.addSong(songData as any);
          console.log("✅ Full generated song successfully saved to user library!");
          console.log("Saved song ID:", savedFullSong.id);
        } catch (libraryError) {
          console.error("❌ FAILED to save full generated song to library:", libraryError);
          // Continue even if saving to library fails - the selection was successful
        }
        } else {
          console.log("=== SKIPPING SAVE TO LIBRARY (free user at song limit) ===");
        }
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_selection",
        message: "Song selected for project",
        status: "completed",
        metadata: {
          audioUrl,
          audioTags,
          audioLyrics,
          duration,
          savedFullSongToLibrary: !!savedFullSong,
          fullSongId: savedFullSong?.id || null
        }
      });

      res.json({
        audioUrl: project.audioUrl,
        message: 'Song selected successfully',
        savedFullSongToLibrary: !!savedFullSong,
        fullSongId: savedFullSong?.id || null
      });
    } catch (error) {
      console.error("Select song error:", error);
      res.status(500).json({ error: "Failed to select song" });
    }
  });

  // Save selected character to project
  app.post("/api/projects/:id/save-character", authenticateToken, async (req, res) => {
    try {
      console.log("Save character request body:", JSON.stringify(req.body, null, 2));
      console.log("Project ID:", req.params.id);

      const { imageUrl, prompt } = req.body;

      if (!imageUrl || !prompt) {
        console.log("Missing required fields - imageUrl:", !!imageUrl, "prompt:", !!prompt);
        return res.status(400).json({ error: "Image URL and prompt are required" });
      }

      // Get the project to check its aspect ratio
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const projectAspectRatio = project.aspectRatio || "16:9";
      console.log(`Project aspect ratio: ${projectAspectRatio}`);

      let characterImageUrl = imageUrl;

      // Already on Bunny Storage: use as-is
      if (isBunnyUrl(imageUrl)) {
        console.log("Character image already on Bunny Storage, using as-is");
      } else if (imageUrl.startsWith('/objects/')) {
        // For library characters (object storage URLs), check if aspect ratio conversion is needed
        console.log("Processing library character for aspect ratio conversion...");

        // Read the image from object storage and check/convert aspect ratio
        const objectPath = imageUrl.replace('/objects/', '');
        const privateDir = process.env.PRIVATE_OBJECT_DIR || '.private';
        const fullPath = path.join('/', process.env.REPL_ID ? `replit-objstore-${process.env.REPL_ID}` : 'replit-objstore', privateDir, objectPath);

        try {
          const imageBuffer = await objectStorage.readFile(fullPath);
          const metadata = await sharp(imageBuffer).metadata();

          if (metadata.width && metadata.height) {
            const currentRatio = metadata.width / metadata.height;
            const [widthPart, heightPart] = projectAspectRatio.split(':').map(Number);
            const targetRatio = widthPart / heightPart;
            const isCurrentVertical = currentRatio < 1;
            const isTargetVertical = targetRatio < 1;

            console.log(`Current image: ${metadata.width}x${metadata.height}, ratio: ${currentRatio.toFixed(2)}`);
            console.log(`Target ratio: ${targetRatio.toFixed(2)} (${projectAspectRatio})`);

            // If aspect ratio mismatch, crop and resize
            if (Math.abs(currentRatio - targetRatio) > 0.1) {
              console.log("Aspect ratio mismatch detected, converting character image...");

              const targetWidth = isTargetVertical ? 720 : 1280;
              const targetHeight = isTargetVertical ? 960 : 720;

              let cropWidth: number;
              let cropHeight: number;
              let cropLeft: number;
              let cropTop: number;

              if (currentRatio > targetRatio) {
                cropHeight = metadata.height;
                cropWidth = Math.round(metadata.height * targetRatio);
                cropLeft = Math.round((metadata.width - cropWidth) / 2);
                cropTop = 0;
              } else {
                cropWidth = metadata.width;
                cropHeight = Math.round(metadata.width / targetRatio);
                cropLeft = 0;
                cropTop = Math.round((metadata.height - cropHeight) / 2);
              }

              console.log(`Cropping to ${cropWidth}x${cropHeight} from (${cropLeft}, ${cropTop})`);

              const processedImageBuffer = await sharp(imageBuffer)
                .extract({
                  left: cropLeft,
                  top: cropTop,
                  width: cropWidth,
                  height: cropHeight
                })
                .resize(targetWidth, targetHeight, {
                  fit: 'fill',
                  withoutEnlargement: false
                })
                .jpeg({ quality: 90 })
                .toBuffer();

              // Store the converted image: Bunny Storage when configured, else object storage
              const uniqueId = crypto.randomUUID();
              const filename = `${uniqueId}.jpg`;
              if (isBunnyConfigured("characters")) {
                const bunnyResult = await uploadCharacterImage(filename, processedImageBuffer);
                characterImageUrl = bunnyResult.url;
                console.log(`Converted character stored at Bunny: ${characterImageUrl}`);
              } else {
                const storagePath = path.join('/', process.env.REPL_ID ? `replit-objstore-${process.env.REPL_ID}` : 'replit-objstore', privateDir, 'characters', filename);
                await objectStorage.writeFile(storagePath, processedImageBuffer);
                characterImageUrl = `/objects/characters/${filename}`;
                console.log(`Converted character stored at: ${characterImageUrl}`);
              }
            } else {
              console.log("Aspect ratios match, using original character image");
            }
          }
        } catch (error) {
          console.error("Error processing library character:", error);
          // Fall back to using original image if conversion fails
        }
      } else if (imageUrl.startsWith('http')) {
        console.log("Downloading and storing external character image...");
        const storedImage = await downloadAndStoreImage(imageUrl, "characters");
        console.log("Image stored successfully:", storedImage.storedUrl);
        characterImageUrl = storedImage.storedUrl;
      }

      const updateData = {
        characterImageUrl,
        characterPrompt: prompt,
        characterType: "selected",
        currentStep: 3
      };

      console.log("Updating project with data:", JSON.stringify(updateData, null, 2));

      const updatedProject = await storage.updateProject(req.params.id, updateData);

      console.log("Updated project result:", JSON.stringify(updatedProject, null, 2));

      res.json({ success: true });
    } catch (error) {
      console.error("Save character to project error:", error);
      res.status(500).json({ error: "Failed to save character to project" });
    }
  });

  // In-memory lock for scene generation to prevent concurrent requests for the same project
  const sceneGenerationLocks = new Map<string, { inProgress: boolean; startTime: number; requestId: string }>();
  const SCENE_GEN_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  const acquireSceneGenLock = (projectId: string, requestId: string): boolean => {
    const existingLock = sceneGenerationLocks.get(projectId);
    if (existingLock?.inProgress) {
      // Check if lock is stale
      const elapsed = Date.now() - existingLock.startTime;
      if (elapsed < SCENE_GEN_LOCK_TIMEOUT_MS) {
        console.log(`[SCENE-GEN-LOCK] Lock acquisition FAILED for project ${projectId} - already held by ${existingLock.requestId} (${elapsed}ms elapsed)`);
        return false;
      }
      console.log(`[SCENE-GEN-LOCK] Stale lock detected for project ${projectId}, clearing (${elapsed}ms elapsed)`);
    }
    sceneGenerationLocks.set(projectId, { inProgress: true, startTime: Date.now(), requestId });
    console.log(`[SCENE-GEN-LOCK] Lock acquired for project ${projectId} by request ${requestId}`);
    return true;
  };

  const releaseSceneGenLock = (projectId: string, requestId: string) => {
    const lock = sceneGenerationLocks.get(projectId);
    if (lock && lock.requestId === requestId) {
      lock.inProgress = false;
      console.log(`[SCENE-GEN-LOCK] Lock released for project ${projectId} by request ${requestId}`);
    } else {
      console.log(`[SCENE-GEN-LOCK] Lock release skipped for project ${projectId} - lock held by different request`);
    }
  };

  // Generate scenes
  app.post("/api/projects/:id/generate-scenes", async (req, res) => {
    const requestId = `REQ-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    const projectId = req.params.id;

    console.log(`\n========================================`);
    console.log(`[SCENE-GEN-API ${new Date().toISOString()}] REQUEST RECEIVED`);
    console.log(`[SCENE-GEN-API] Request ID: ${requestId}`);
    console.log(`[SCENE-GEN-API] Project ID: ${projectId}`);
    console.log(`========================================\n`);

    // Try to acquire lock FIRST before any processing
    if (!acquireSceneGenLock(projectId, requestId)) {
      console.log(`[SCENE-GEN-API ${requestId}] BLOCKED: Another request is already generating scenes for this project`);
      return res.status(409).json({
        error: "Scene generation already in progress",
        message: "Another request is currently generating scenes for this project. Please wait."
      });
    }

    try {
      const project = await storage.getProject(projectId);
      console.log(`[SCENE-GEN-API ${requestId}] Project data for scene generation:`, JSON.stringify(project, null, 2));

      if (!project) {
        console.log("No project found for ID:", req.params.id);
        releaseSceneGenLock(projectId, requestId);
        return res.status(400).json({ error: "Project not found" });
      }

      if (!project.characterImageUrl) {
        console.log("Missing characterImageUrl in project:", project.characterImageUrl);
        releaseSceneGenLock(projectId, requestId);
        return res.status(400).json({ error: "Character image URL is required. Please create or select a character first." });
      }

      // Backend-side duplicate prevention: Check if scenes already exist
      // This prevents duplicate API calls from generating scenes twice
      if (project.sceneImages && Array.isArray(project.sceneImages) && project.sceneImages.length > 0) {
        console.log(`[SCENE-GEN-API ${requestId}] BLOCKED: Project already has ${project.sceneImages.length} scene images`);
        console.log(`[SCENE-GEN-API ${requestId}] Returning existing scenes instead of regenerating`);
        releaseSceneGenLock(projectId, requestId);

        // Resolve ImageKit URLs for existing scene images
        const resolvedSceneImages = await Promise.all(
          project.sceneImages.map(url => resolveUrlWithImageKitFallback(url, storage))
        );

        return res.json({
          scenePrompts: project.scenePrompts || [],
          sceneImages: resolvedSceneImages,
          alreadyGenerated: true
        });
      }

      // Create a prompt based on what we have
      let audioPrompt = "";

      // Always prioritize the user's typed prompt/description when available.
      // Lyrics are useful context, but should never override the user's intent.
      if (project.audioPrompt && project.audioPrompt.trim()) {
        audioPrompt = project.audioPrompt.trim();
        if (project.audioLyrics && project.audioLyrics.trim()) {
          const lyricsPreview = project.audioLyrics.substring(0, 200);
          audioPrompt = `${audioPrompt}. Supporting lyrics context: ${lyricsPreview}`;
          console.log("Using user prompt + lyrics context:", audioPrompt);
        } else {
          console.log("Using user prompt:", audioPrompt);
        }
      } else if (project.audioLyrics) {
        // If no user prompt exists, fall back to lyrics-only guidance.
        const tags = project.audioTags || "music";
        const lyricsPreview = project.audioLyrics.substring(0, 200);
        audioPrompt = `${tags} music video based on these lyrics: ${lyricsPreview}`;
        console.log("Using lyrics-based prompt (no user prompt found):", audioPrompt);
      } else if (project.audioType === 'uploaded') {
        // Last resort for uploaded audio without description
        audioPrompt = "Create a music video with dramatic scenes";
        console.log("Using generic uploaded prompt");
      } else {
        // Last resort fallback
        audioPrompt = "Create an engaging music video";
        console.log("Using generic fallback prompt");
      }

      // Combine audio description with character description for better scene generation
      let combinedPrompt = audioPrompt;
      if (project.characterPrompt) {
        combinedPrompt = `Music theme: ${audioPrompt}. Character: ${project.characterPrompt}`;
      }

      // Get audio duration to determine configuration
      const audioDuration = project.audioDuration || 120; // Use stored duration or default to 2 minutes

      console.log("=== SCENE GENERATION DURATION CHECK ===");
      console.log("Project audioDuration:", project.audioDuration);
      console.log("Final audioDuration used:", audioDuration);

      // Calculate number of scenes dynamically based on 6-second segments
      // Apply the new logic: segments must be 6s each, and last segment must be >= 2s
      const fullSegments = Math.floor(audioDuration / 6);
      const remainder = audioDuration % 6;
      // Only include remainder if it's >= 2 seconds (minimum for AI models)
      const numberOfScenes = remainder >= 2 ? fullSegments + 1 : fullSegments;
      const numberOfAudioParts = numberOfScenes;

      if (remainder > 0 && remainder < 2) {
        console.log(`⚠️ Last segment would be ${remainder}s (less than 2s minimum) - excluding it from scene generation`);
        console.log(`   Will generate ${numberOfScenes} scenes instead of ${fullSegments + 1}`);
      }

      console.log("Dynamically calculated scene count:", numberOfScenes);
      console.log("Number of audio parts:", numberOfAudioParts);

      // Split lyrics into sections based on calculated parts
      let lyricsSections: string[] | undefined;
      if (project.audioLyrics) {
        lyricsSections = splitLyricsIntoSections(project.audioLyrics, numberOfAudioParts);
        console.log(`Split lyrics into ${numberOfAudioParts} sections:`, lyricsSections.map(s => s.substring(0, 50) + "..."));
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Generating ${numberOfScenes} scene prompts`,
        status: "started",
        metadata: {
          combinedPrompt,
          hasSections: !!lyricsSections,
          numberOfScenes
        }
      });

      console.log(`[SCENE-GEN-API ${requestId}] Generating scene prompts...`);
      const scenePrompts = await generateScenePrompts(combinedPrompt, numberOfScenes, lyricsSections);
      console.log(`[SCENE-GEN-API ${requestId}] Scene prompts generated: ${scenePrompts.length} prompts`);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Generating ${numberOfScenes} scene images`,
        status: "progress",
        metadata: { scenePrompts, numberOfScenes, requestId }
      });

      // Use the aspect ratio from the project (set in step 1) - defaults to 16:9 for horizontal
      const aspectRatio = project.aspectRatio || "16:9";
      console.log(`[SCENE-GEN-API ${requestId}] Using aspect ratio for scene generation: ${aspectRatio}`);
      console.log(`[SCENE-GEN-API ${requestId}] Calling generateSceneImages with ${scenePrompts.length} prompts...`);

      const sceneImages = await generateSceneImages(scenePrompts, project.characterImageUrl, aspectRatio);

      const duration = Date.now() - startTime;
      console.log(`\n========================================`);
      console.log(`[SCENE-GEN-API ${requestId}] REQUEST COMPLETED`);
      console.log(`[SCENE-GEN-API ${requestId}] Duration: ${duration}ms`);
      console.log(`[SCENE-GEN-API ${requestId}] Scenes generated: ${sceneImages.length}`);
      console.log(`========================================\n`);

      await storage.updateProject(req.params.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages,
        currentStep: 4
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: "Scene generation completed",
        status: "completed",
        metadata: { scenePrompts, sceneImages, requestId, durationMs: duration }
      });

      // Resolve ImageKit URLs for newly generated scene images
      const resolvedSceneImages = await Promise.all(
        sceneImages.map(url => resolveUrlWithImageKitFallback(url, storage))
      );

      // Release lock on success
      releaseSceneGenLock(projectId, requestId);
      res.json({ scenePrompts, sceneImages: resolvedSceneImages });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`\n========================================`);
      console.error(`[SCENE-GEN-API ${requestId}] REQUEST FAILED`);
      console.error(`[SCENE-GEN-API ${requestId}] Duration: ${duration}ms`);
      console.error(`[SCENE-GEN-API ${requestId}] Error:`, error);
      console.error(`========================================\n`);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Scene generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message, requestId, durationMs: duration }
      });

      // Release lock on error
      releaseSceneGenLock(projectId, requestId);
      res.status(500).json({ error: "Failed to generate scenes" });
    }
  });

  // Regenerate individual scene endpoint
  app.post("/api/projects/:id/regenerate-scene", async (req, res) => {
    try {
      const { sceneIndex, prompt, lipsyncScene } = req.body;

      if (sceneIndex === undefined || !prompt) {
        return res.status(400).json({ error: "Scene index and prompt are required" });
      }

      // Check for profanity in prompt
      const profanityCheck = checkProfanity(prompt);
      if (!profanityCheck.isClean) {
        console.log("Scene regeneration prompt contains inappropriate content:", profanityCheck.detectedWords);

        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "scene_regeneration",
          message: `Scene regeneration blocked: prompt contains inappropriate content (${profanityCheck.category})`,
          status: "error",
          metadata: {
            sceneIndex,
            detectedWords: profanityCheck.detectedWords,
            category: profanityCheck.category
          }
        });

        return res.status(400).json({
          error: "Content Policy Violation",
          details: getCategoryMessage(profanityCheck.category || 'unknown'),
          category: profanityCheck.category
        });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }

      if (!project.characterImageUrl) {
        return res.status(400).json({ error: "Character image URL is required" });
      }

      // Get current scene arrays from project
      const scenePrompts = (project.scenePrompts as string[]) || [];
      const sceneImages = (project.sceneImages as string[]) || [];

      if (sceneIndex < 0 || sceneIndex >= scenePrompts.length) {
        return res.status(400).json({ error: "Invalid scene index" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: `Regenerating scene ${sceneIndex + 1}`,
        status: "started",
        metadata: { sceneIndex, prompt }
      });

      // Use the aspect ratio from the project (set in step 1) - defaults to 16:9 for horizontal
      const aspectRatio = project.aspectRatio || "16:9";

      // For regular videos (not lipsync), only use character image to avoid confusing the AI.
      // For lipsync scenes we pass current scene image for edit-plus behavior.
      const currentSceneImageUrl = lipsyncScene ? (sceneImages[sceneIndex] || undefined) : undefined;
      if (currentSceneImageUrl) {
        console.log(`Using current scene image for edit-plus model (lipsync scene): ${currentSceneImageUrl}`);
      }

      // Generate a single scene image with the custom prompt
      // If currentSceneImageUrl exists (lipsync only), it will use edit-plus model with both images
      const imageUrl = await generateSingleSceneImage(prompt, project.characterImageUrl, aspectRatio, currentSceneImageUrl);

      // Update the arrays with new values
      scenePrompts[sceneIndex] = prompt;
      sceneImages[sceneIndex] = imageUrl;

      // Save updated arrays to database
      await storage.updateProject(req.params.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: `Scene ${sceneIndex + 1} regenerated successfully`,
        status: "completed",
        metadata: { sceneIndex, newImageUrl: imageUrl, newPrompt: prompt }
      });

      // Resolve ImageKit URL for the regenerated scene image
      const resolvedImageUrl = await resolveUrlWithImageKitFallback(imageUrl, storage);

      res.json({
        imageUrl: resolvedImageUrl,
        sceneIndex: sceneIndex
      });
    } catch (error) {
      console.error("Scene regeneration error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: "Scene regeneration failed",
        status: "failed",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to regenerate scene" });
    }
  });

  // Upload custom scene image endpoint (crops to project's aspect ratio)
  app.post("/api/projects/:id/upload-scene-image", sceneImageUpload.single('image'), async (req: any, res) => {
    try {
      const sceneIndex = parseInt(req.body.sceneIndex);

      if (isNaN(sceneIndex)) {
        return res.status(400).json({ error: "Scene index is required" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Image file is required" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }

      // Get current scene arrays from project
      const scenePrompts = (project.scenePrompts as string[]) || [];
      const sceneImages = (project.sceneImages as string[]) || [];

      if (sceneIndex < 0 || sceneIndex >= scenePrompts.length) {
        return res.status(400).json({ error: "Invalid scene index" });
      }

      console.log(`Processing uploaded scene image for project ${req.params.id}, scene ${sceneIndex + 1}`);

      // Get original image metadata
      const originalImage = sharp(req.file.buffer);
      const metadata = await originalImage.metadata();

      if (!metadata.width || !metadata.height) {
        return res.status(400).json({ error: "Could not read image dimensions" });
      }

      console.log(`Original image dimensions: ${metadata.width}x${metadata.height}`);

      // Use the aspect ratio from the project (set in step 1) - defaults to 16:9 for horizontal
      const aspectRatioStr = project.aspectRatio || "16:9";
      const [widthPart, heightPart] = aspectRatioStr.split(':').map(Number);
      const targetRatio = widthPart / heightPart; // 16:9 = 1.78 (horizontal), 3:4 = 0.75 (vertical)
      const currentRatio = metadata.width / metadata.height;

      // Determine target dimensions based on aspect ratio
      const isVertical = targetRatio < 1;
      const targetWidth = isVertical ? 720 : 1280;
      const targetHeight = isVertical ? 960 : 720;

      let cropWidth: number;
      let cropHeight: number;
      let cropLeft: number;
      let cropTop: number;

      if (currentRatio > targetRatio) {
        // Image is wider than target, crop width (center crop)
        cropHeight = metadata.height;
        cropWidth = Math.round(metadata.height * targetRatio);
        cropLeft = Math.round((metadata.width - cropWidth) / 2);
        cropTop = 0;
      } else {
        // Image is taller than target, crop height (center crop)
        cropWidth = metadata.width;
        cropHeight = Math.round(metadata.width / targetRatio);
        cropLeft = 0;
        cropTop = Math.round((metadata.height - cropHeight) / 2);
      }

      console.log(`Cropping to ${aspectRatioStr}: ${cropWidth}x${cropHeight} from (${cropLeft}, ${cropTop})`);

      // Process the image: crop to target ratio and resize to standard size
      const processedImageBuffer = await sharp(req.file.buffer)
        .extract({
          left: cropLeft,
          top: cropTop,
          width: cropWidth,
          height: cropHeight
        })
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          withoutEnlargement: false
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      console.log(`Processed image size: ${processedImageBuffer.length} bytes`);

      const { randomUUID } = await import("crypto");
      const filename = `${randomUUID()}.jpg`;
      let storedUrl: string;

      if (isBunnyConfigured("imageScenes")) {
        const bunnyResult = await uploadSceneImage(filename, processedImageBuffer);
        storedUrl = bunnyResult.url;
        console.log(`[Bunny Storage] Scene image uploaded: ${storedUrl}`);
      } else {
        const imagePath = `scenes/${filename}`;
        const objectStorageService = new ObjectStorageService();
        const privateObjectDir = objectStorageService.getPrivateObjectDir();
        const fullPath = `${privateObjectDir}/${imagePath}`;
        const pathParts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
        const bucketName = pathParts[0];
        const objectName = pathParts.slice(1).join("/");
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        await file.save(processedImageBuffer, {
          metadata: {
            contentType: 'image/jpeg',
            metadata: {
              category: 'scenes',
              uploadedAt: new Date().toISOString(),
              projectId: req.params.id,
              sceneIndex: sceneIndex.toString(),
              isUserUpload: 'true'
            },
          },
        });
        storedUrl = `/objects/${imagePath}`;
        console.log(`Scene image stored at: ${storedUrl}`);
      }

      // Update the scene image in the project
      sceneImages[sceneIndex] = storedUrl;

      await storage.updateProject(req.params.id, {
        sceneImages: sceneImages
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_upload",
        message: `Scene ${sceneIndex + 1} image uploaded successfully`,
        status: "completed",
        metadata: { sceneIndex, imageUrl: storedUrl }
      });

      res.json({
        imageUrl: storedUrl,
        sceneIndex: sceneIndex
      });
    } catch (error) {
      console.error("Scene image upload error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_upload",
        message: "Scene image upload failed",
        status: "failed",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to upload scene image" });
    }
  });

  // Endpoint for uploading scene image without project (for edit mode)
  app.post("/api/upload-scene-image", sceneImageUpload.single('image'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Image file is required" });
      }

      console.log(`Processing standalone scene image upload`);

      // Get original image metadata
      const originalImage = sharp(req.file.buffer);
      const metadata = await originalImage.metadata();

      if (!metadata.width || !metadata.height) {
        return res.status(400).json({ error: "Could not read image dimensions" });
      }

      console.log(`Original image dimensions: ${metadata.width}x${metadata.height}`);

      // Get aspect ratio from request body (defaults to 16:9 for horizontal)
      const aspectRatioStr = req.body?.aspectRatio || "16:9";
      const [widthPart, heightPart] = aspectRatioStr.split(':').map(Number);
      const targetRatio = widthPart / heightPart; // 16:9 = 1.78 (horizontal), 3:4 = 0.75 (vertical)
      const currentRatio = metadata.width / metadata.height;

      // Determine target dimensions based on aspect ratio
      const isVertical = targetRatio < 1;
      const targetWidth = isVertical ? 720 : 1280;
      const targetHeight = isVertical ? 960 : 720;

      let cropWidth: number;
      let cropHeight: number;
      let cropLeft: number;
      let cropTop: number;

      if (currentRatio > targetRatio) {
        // Image is wider than target, crop width (center crop)
        cropHeight = metadata.height;
        cropWidth = Math.round(metadata.height * targetRatio);
        cropLeft = Math.round((metadata.width - cropWidth) / 2);
        cropTop = 0;
      } else {
        // Image is taller than target, crop height (center crop)
        cropWidth = metadata.width;
        cropHeight = Math.round(metadata.width / targetRatio);
        cropLeft = 0;
        cropTop = Math.round((metadata.height - cropHeight) / 2);
      }

      console.log(`Cropping to ${aspectRatioStr}: ${cropWidth}x${cropHeight} from (${cropLeft}, ${cropTop})`);

      // Process the image: crop to target ratio and resize to standard size
      const processedImageBuffer = await sharp(req.file.buffer)
        .extract({
          left: cropLeft,
          top: cropTop,
          width: cropWidth,
          height: cropHeight
        })
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          withoutEnlargement: false
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      console.log(`Processed image size: ${processedImageBuffer.length} bytes`);

      const { randomUUID } = await import("crypto");
      const filename = `${randomUUID()}.jpg`;

      let imageUrl: string;

      if (isBunnyConfigured("imageScenes")) {
        const bunnyResult = await uploadSceneImage(filename, processedImageBuffer);
        imageUrl = bunnyResult.url;
        console.log(`[Bunny Storage] Standalone scene image uploaded: ${imageUrl}`);
      } else {
        const imagePath = `scenes/${filename}`;
        const objectStorageService = new ObjectStorageService();
        const privateObjectDir = objectStorageService.getPrivateObjectDir();
        const fullPath = `${privateObjectDir}/${imagePath}`;
        const pathParts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
        const bucketName = pathParts[0];
        const objectName = pathParts.slice(1).join("/");
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        await file.save(processedImageBuffer, {
          metadata: {
            contentType: "image/jpeg",
            metadata: {
              category: "scenes",
              uploadedAt: new Date().toISOString(),
              isUserUpload: "true",
            },
          },
        });
        imageUrl = `/objects/${imagePath}`;
        console.log(`Scene image stored at: ${imageUrl}`);
      }

      res.json({
        imageUrl,
      });
    } catch (error) {
      console.error("Scene image upload error:", error);
      res.status(500).json({ error: "Failed to upload scene image" });
    }
  });

  // AI Image Edit tool: upload image (no crop), returns imageUrl for use with POST /api/ai-image-edit
  app.post("/api/ai-image-edit/upload", authenticateToken, upload.single("image"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Image file is required" });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Use JPEG, PNG, GIF, or WebP." });
      }
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({ error: "Image must be under 10MB." });
      }
      let buffer = req.file.buffer;
      if (req.file.mimetype !== "image/jpeg") {
        buffer = await sharp(req.file.buffer).jpeg({ quality: 90 }).toBuffer();
      }
      const { randomUUID } = await import("crypto");
      const filename = `ai-edit-${randomUUID()}.jpg`;
      let imageUrl: string;
      if (isBunnyConfigured("imageScenes")) {
        const bunnyResult = await uploadSceneImage(filename, buffer);
        imageUrl = bunnyResult.url;
      } else {
        const imagePath = `scenes/${filename}`;
        const objectStorageService = new ObjectStorageService();
        const privateObjectDir = objectStorageService.getPrivateObjectDir();
        const fullPath = `${privateObjectDir}/${imagePath}`;
        const pathParts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
        const bucketName = pathParts[0];
        const objectName = pathParts.slice(1).join("/");
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        await file.save(buffer, {
          metadata: {
            contentType: "image/jpeg",
            metadata: { category: "scenes", uploadedAt: new Date().toISOString() },
          },
        });
        imageUrl = `/objects/${imagePath}`;
      }
      res.json({ imageUrl });
    } catch (error) {
      console.error("AI image edit upload error:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // AI Image Edit tool: run seedream-v4.5/edit on imageUrl with prompt and aspectRatio
  app.post("/api/ai-image-edit", authenticateToken, async (req, res) => {
    try {
      const { imageUrl, prompt, aspectRatio } = req.body ?? {};
      if (!imageUrl || typeof imageUrl !== "string" || !prompt || typeof prompt !== "string") {
        return res.status(400).json({ error: "imageUrl and prompt are required" });
      }
      const ratio = typeof aspectRatio === "string" ? aspectRatio : "16:9";
      const resultImageUrl = await generateAiImageEdit(imageUrl.trim(), prompt.trim(), ratio);
      const stored = await downloadAndStoreImage(resultImageUrl, "scenes");
      res.json({ imageUrl: stored.storedUrl });
    } catch (error) {
      console.error("AI image edit error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "AI image edit failed",
      });
    }
  });

  // Regenerate individual scene video endpoint
  app.post("/api/projects/:id/regenerate-scene-video", authenticateToken, async (req, res) => {
    try {
      const { sceneIndex, imageUrl, prompt, lipsync, videoQuality } = req.body;

      if (sceneIndex === undefined || !imageUrl || !prompt) {
        return res.status(400).json({ error: "Scene index, image URL, and prompt are required" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }

      if (!project.audioUrl || !project.audioDuration) {
        return res.status(400).json({ error: "Project audio is required" });
      }

      const sceneIndexNum = parseInt(sceneIndex);
      if (isNaN(sceneIndexNum) || sceneIndexNum < 0) {
        return res.status(400).json({ error: "Invalid scene index" });
      }

      const scenePrompts = (project.scenePrompts as string[]) || [];
      if (sceneIndexNum >= scenePrompts.length) {
        return res.status(400).json({ error: "Scene index out of range" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_video_regeneration",
        message: `Regenerating video for scene ${sceneIndexNum + 1}`,
        status: "started",
        metadata: { sceneIndex: sceneIndexNum, lipsync, videoQuality }
      });

      // Get or create audio segments
      let audioSegments = project.audioSegments as any[];
      if (!audioSegments || audioSegments.length === 0) {
        // Need to split audio
        const objectStorageService = new ObjectStorageService();
        let audioUrl = project.audioUrl;
        if (audioUrl.startsWith('/objects/')) {
          audioUrl = await objectStorageService.getSignedUrlForPath(audioUrl, 3600);
        } else if (audioUrl.startsWith('/')) {
          const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
          if (replitDevDomain) {
            audioUrl = `https://${replitDevDomain}${audioUrl}`;
          } else {
            const replSlug = process.env.REPL_SLUG;
            const replOwner = process.env.REPL_OWNER;
            if (replSlug && replOwner) {
              audioUrl = `https://${replSlug}-${replOwner}.replit.app${audioUrl}`;
            } else {
              const host = req.get('host') || 'localhost:5000';
              audioUrl = host.includes('localhost') ? `http://${host}${audioUrl}` : `https://${host}${audioUrl}`;
            }
          }
        }

        // Calculate number of segments
        const fullSegments = Math.floor(project.audioDuration! / 6);
        const remainder = project.audioDuration! % 6;
        const numberOfAudioParts = remainder >= 2 ? fullSegments + 1 : fullSegments;

        audioSegments = await splitAudio(audioUrl, numberOfAudioParts, project.audioDuration!);
      }

      // Get the audio segment for this scene
      if (sceneIndexNum >= audioSegments.length) {
        return res.status(400).json({ error: "Scene index exceeds available audio segments" });
      }

      const audioSegment = audioSegments[sceneIndexNum];
      const audioSegmentUrl = audioSegment.download_url || audioSegment.part;
      const segmentDuration = audioSegment.duration || 6;

      // Determine model based on lipsync setting
      const useLipsync = lipsync === true || lipsync === "true";
      const model: "infinitetalk" | "seedance" = useLipsync ? "infinitetalk" : "seedance";
      const quality = (videoQuality || project.videoQuality || "quick") as "quick" | "medium" | "premium";

      console.log(`Regenerating scene ${sceneIndexNum + 1} video: model=${model}, quality=${quality}, duration=${segmentDuration}s`);

      // Ensure image URL is a signed URL if it's an internal path
      let publicImageUrl = imageUrl;
      if (imageUrl.startsWith('/objects/')) {
        const objectStorageService = new ObjectStorageService();
        publicImageUrl = await objectStorageService.getSignedUrlForPath(imageUrl, 86400);
      }

      // Extract aspect ratio from project (default to 16:9 if not set)
      const aspectRatio = (project as any).aspectRatio || "16:9";

      // Generate the video segment
      let videoUrl = await generateVideoSegment(
        audioSegmentUrl,
        publicImageUrl,
        prompt,
        model,
        segmentDuration,
        quality,
        aspectRatio
      );

      // Persist scene video to Bunny Storage when configured (Wavespeed URLs expire after 7 days).
      if (isBunnyConfigured("scenes")) {
        try {
          console.log(`[Bunny Storage] Uploading scene ${sceneIndexNum + 1} video`);
          const resp = await fetch(videoUrl);
          if (resp.ok) {
            const buffer = Buffer.from(await resp.arrayBuffer());
            const bunnyResult = await uploadToBunnyStorage(
              "scenes",
              `scene_${req.params.id}_${sceneIndexNum + 1}_${Date.now()}.mp4`,
              buffer
            );
            videoUrl = bunnyResult.url;
            console.log(`[Bunny Storage] Scene video uploaded: ${videoUrl}`);
          }
        } catch (bunnyErr) {
          console.warn("[Bunny Storage] Scene video upload failed (non-blocking), keeping original URL:", bunnyErr);
        }
      }

      // Update the videoSegments array in the project (Bunny URL when upload succeeded)
      const videoSegments = (project.videoSegments as string[]) || [];
      if (sceneIndexNum < videoSegments.length) {
        videoSegments[sceneIndexNum] = videoUrl;
      } else {
        while (videoSegments.length < sceneIndexNum) {
          videoSegments.push("");
        }
        videoSegments.push(videoUrl);
      }

      // Save updated video segments to project
      await storage.updateProject(req.params.id, {
        videoSegments: videoSegments
      } as any);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_video_regeneration",
        message: `Scene ${sceneIndexNum + 1} video regenerated successfully`,
        status: "completed",
        metadata: { sceneIndex: sceneIndexNum, videoUrl, model, quality }
      });

      // Resolve URL for response
      const resolvedVideoUrl = isBunnyUrl(videoUrl) ? videoUrl : await resolveUrlWithImageKitFallback(videoUrl, storage);

      res.json({
        videoUrl: resolvedVideoUrl,
        sceneIndex: sceneIndexNum
      });
    } catch (error) {
      console.error("Scene video regeneration error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_video_regeneration",
        message: "Scene video regeneration failed",
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to regenerate scene video: " + (error as Error).message });
    }
  });

  // Change camera angle for a scene image using WaveSpeed API
  app.post("/api/change-camera-angle", authenticateToken, async (req, res) => {
    try {
      const { imageUrl, horizontalAngle = 45, verticalAngle = 0, distance = 1 } = req.body;

      if (!imageUrl) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      console.log(`Changing camera angle for image: ${imageUrl}`);
      console.log(`Parameters: horizontal=${horizontalAngle}, vertical=${verticalAngle}, distance=${distance}`);

      // WaveSpeed API: horizontal_angle >= 0; vertical_angle 0..60 (at most 60).
      // UI uses horizontal -180..180 and vertical -90..90; convert to 0..360 and 0..60.
      const horizontalForApi = horizontalAngle >= 0 ? horizontalAngle : horizontalAngle + 360;
      const verticalForApi = Math.min(60, Math.max(0, Math.round(((verticalAngle + 90) / 180) * 60))); // -90..90 -> 0..60

      // Convert relative URL to absolute URL if needed
      let absoluteImageUrl = imageUrl;
      if (imageUrl.startsWith('/objects/')) {
        const baseUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
            : 'http://localhost:5000';
        absoluteImageUrl = `${baseUrl}${imageUrl}`;
      }

      const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || '';

      if (!WAVESPEED_API_KEY) {
        return res.status(500).json({ error: "WaveSpeed API key not configured" });
      }

      // Call WaveSpeed edit-multiple-angles API
      const wavespeedResponse = await fetch('https://api.wavespeed.ai/api/v3/wavespeed-ai/qwen-image/edit-multiple-angles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WAVESPEED_API_KEY}`
        },
        body: JSON.stringify({
          distance: distance,
          enable_base64_output: false,
          enable_sync_mode: false,
          horizontal_angle: horizontalForApi,
          images: [absoluteImageUrl],
          output_format: "jpeg",
          seed: -1,
          vertical_angle: verticalForApi
        })
      });

      if (!wavespeedResponse.ok) {
        const errorText = await wavespeedResponse.text();
        console.error("WaveSpeed API error:", errorText);
        return res.status(500).json({ error: `WaveSpeed API error: ${wavespeedResponse.status}` });
      }

      const result = await wavespeedResponse.json();
      const requestId = result.data?.id || result.id;

      if (!requestId) {
        console.error("No request ID from WaveSpeed:", result);
        return res.status(500).json({ error: "No request ID received from WaveSpeed" });
      }

      console.log(`Camera angle change submitted, request ID: ${requestId}`);

      // Poll for results
      let attempts = 0;
      const maxAttempts = 60; // 10 minutes with 10-second intervals

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

        const statusResponse = await fetch(
          `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
          {
            headers: {
              'Authorization': `Bearer ${WAVESPEED_API_KEY}`
            }
          }
        );

        if (!statusResponse.ok) {
          attempts++;
          continue;
        }

        const statusResult = await statusResponse.json();

        if (statusResult.data?.status === 'completed' && statusResult.data.outputs && statusResult.data.outputs.length > 0) {
          const newImageUrl = statusResult.data.outputs[0];
          console.log(`Camera angle change completed: ${newImageUrl}`);
          return res.json({ imageUrl: newImageUrl });
        } else if (statusResult.data?.status === 'failed') {
          console.error("Camera angle change failed:", statusResult.data.error);
          return res.status(500).json({ error: statusResult.data.error || "Camera angle change failed" });
        }

        attempts++;
      }

      return res.status(500).json({ error: "Camera angle change timed out" });
    } catch (error) {
      console.error("Camera angle change error:", error);
      res.status(500).json({ error: "Failed to change camera angle" });
    }
  });

  // Update scene prompts (for edited prompts without regeneration)
  app.post("/api/projects/:id/update-scenes", async (req, res) => {
    try {
      const { scenes } = req.body;

      if (!scenes || !Array.isArray(scenes)) {
        return res.status(400).json({ error: "Scenes array is required" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }

      // Extract prompts and images from the scenes array
      const scenePrompts = scenes.map((scene: any) => scene.prompt);
      const sceneImages = scenes.map((scene: any) => scene.imageUrl);

      // Update the project with the new scene data
      await storage.updateProject(req.params.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages
      });

      console.log(`Updated scene data for project ${req.params.id}`);
      res.json({
        message: "Scenes updated successfully",
        scenePrompts,
        sceneImages
      });
    } catch (error) {
      console.error("Update scenes error:", error);
      res.status(500).json({ error: "Failed to update scenes" });
    }
  });

  // Update scene order (for drag and drop reordering)
  app.post("/api/projects/:id/update-scene-order", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user?.userId;
      const { sceneOrder } = req.body;

      if (!sceneOrder || !Array.isArray(sceneOrder)) {
        return res.status(400).json({ error: "Scene order array is required" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }

      // Verify ownership
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this project" });
      }

      // Get scene count (allow empty if scenes not generated yet)
      const sceneCount = ((project as any).scenePrompts as any[] || []).length;

      // If no scenes yet, just save the order (it will be validated later when scenes exist)
      if (sceneCount === 0 && sceneOrder.length === 0) {
        await storage.updateProject(req.params.id, {
          sceneOrder: sceneOrder
        } as any);
        console.log(`Saved empty scene order for project ${req.params.id}`);
        return res.json({ message: "Scene order saved", sceneOrder });
      }

      // Validate that the order contains valid scene indices
      const isValidOrder = sceneOrder.every((index: number) =>
        typeof index === 'number' && index >= 0 && index < sceneCount
      );

      if (!isValidOrder || sceneOrder.length !== sceneCount) {
        return res.status(400).json({
          error: "Invalid scene order: indices must match scene count",
          sceneCount,
          orderLength: sceneOrder.length
        });
      }

      // Check for duplicates
      const uniqueIndices = new Set(sceneOrder);
      if (uniqueIndices.size !== sceneOrder.length) {
        return res.status(400).json({ error: "Invalid scene order: duplicate indices found" });
      }

      // Update the project with the new scene order
      await storage.updateProject(req.params.id, {
        sceneOrder: sceneOrder
      } as any);

      console.log(`Updated scene order for project ${req.params.id}: ${sceneOrder.join(', ')}`);
      res.json({
        message: "Scene order updated successfully",
        sceneOrder
      });
    } catch (error) {
      console.error("Update scene order error:", error);
      res.status(500).json({ error: "Failed to update scene order" });
    }
  });

  // Generate video
  app.post("/api/projects/:id/generate-video", async (req, res) => {
    let isInQueue = false;

    try {
      const project = await storage.getProject(req.params.id);
      if (!project || !project.audioUrl || !project.sceneImages || !project.scenePrompts) {
        return res.status(400).json({ error: "Missing required project data" });
      }

      // Extract aspect ratio from project (default to 16:9 if not set)
      const aspectRatio = (project as any).aspectRatio || "16:9";

      // Check if this is a partial regeneration by looking for the setup log
      const generationLogs = await storage.getGenerationLogs(req.params.id);
      const partialRegenLog = generationLogs.find(
        (log: any) => log.step === "partial_regeneration_setup" && log.metadata?.isPartialRegeneration
      );
      const isPartialRegeneration = !!partialRegenLog;
      const partialRegenMetadata = partialRegenLog?.metadata as {
        modifiedSceneIndices?: number[];
        creditsToCharge?: number;
        sourceProjectId?: string;
      } | undefined;

      console.log(`Video generation starting for project ${req.params.id}`);
      console.log(`Is partial regeneration: ${isPartialRegeneration}`);
      if (isPartialRegeneration && partialRegenMetadata) {
        console.log(`Modified scene indices: [${partialRegenMetadata.modifiedSceneIndices?.join(', ')}]`);
        console.log(`Credits to charge: ${partialRegenMetadata.creditsToCharge}`);
      }

      // Calculate credits needed for video generation based on duration
      // Pricing: 1000 credits per 15 seconds, rounded up
      const audioDuration = project.audioDuration || 120; // Default to 2 minutes

      let VIDEO_GENERATION_CREDITS: number;

      if (isPartialRegeneration && partialRegenMetadata?.creditsToCharge) {
        // Use the pre-calculated credits for partial regeneration
        VIDEO_GENERATION_CREDITS = partialRegenMetadata.creditsToCharge;
        console.log(`Using partial regeneration credits: ${VIDEO_GENERATION_CREDITS}`);
      } else {
        // Full video generation: 1000 credits per 15 seconds
        const units = Math.ceil(audioDuration / 15);
        const baseCredits = units * 1000; // 1000 credits per 15-second block

        // Add extra credits based on video quality
        const projectVideoQuality = (project as any).videoQuality || "quick";
        const qualityCost = projectVideoQuality === "medium" ? 1000 : projectVideoQuality === "premium" ? 2000 : 0;
        VIDEO_GENERATION_CREDITS = baseCredits + qualityCost;
      }

      // Check if user has enough credits for video generation
      const canAfford = await storage.canUserAffordCredits(project.userId, VIDEO_GENERATION_CREDITS);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(project.userId);
        return res.status(402).json({
          error: "Insufficient credits for video generation",
          creditsRequired: VIDEO_GENERATION_CREDITS,
          creditsRemaining,
          videoDuration: audioDuration
        });
      }

      // Check if video generation is already in progress or completed
      if ((project as any).generationStatus === 'generating') {
        // Check if generation has timed out (30 minutes)
        const generationStarted = (project as any).generationStartedAt;
        if (generationStarted) {
          const timeoutThreshold = new Date(generationStarted.getTime() + 30 * 60 * 1000);
          if (new Date() > timeoutThreshold) {
            // Mark as failed due to timeout
            await storage.updateProject(req.params.id, {
              generationStatus: 'failed' as any,
              currentStep: 3, // Reset to step 3 so user can try again
            });
          } else {
            // Generation is still active, don't start new one
            return res.status(409).json({
              error: "Video generation already in progress. Please wait for it to complete.",
              generationId: (project as any).generationId
            });
          }
        }
      }

      if ((project as any).generationStatus === 'completed' && project.finalVideoUrl) {
        // Video already generated successfully
        return res.json({
          message: "Video already generated",
          finalVideoUrl: project.finalVideoUrl
        });
      }

      // Generate unique identifier for this generation attempt
      const generationId = crypto.randomUUID();
      const now = new Date();
      const timeoutAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now

      // Mark generation as started
      await storage.updateProject(req.params.id, {
        generationId: generationId as any,
        generationStatus: 'generating' as any,
        generationStartedAt: now as any,
        generationTimeoutAt: timeoutAt as any,
      });

      // Import video queue service
      const { videoQueueService } = await import("./services/videoQueue");

      // Check queue and either start immediately or wait
      const queueResult = await videoQueueService.requestVideoGeneration(req.params.id, project.userId);

      if (!queueResult.canStart) {
        isInQueue = true;

        // Log queue status
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: `Video queued at position ${queueResult.queuePosition}. Waiting for processing capacity...`,
          status: "progress",
          metadata: { queuePosition: queueResult.queuePosition, queued: true }
        });

        // Wait for queue position
        const canProcess = await videoQueueService.waitForQueuePosition(req.params.id, 300000); // 5 minute timeout

        if (!canProcess) {
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: "Video generation timeout - please try again",
            status: "error",
            metadata: { error: "Queue timeout" }
          });
          return res.status(408).json({ error: "Video generation queue timeout. Please try again." });
        }

        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: "Queue position reached - starting video generation",
          status: "progress",
          metadata: { startingProcessing: true }
        });
      } else {
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: "Starting video generation immediately",
          status: "progress",
          metadata: { immediateStart: true }
        });
      }

      // Return immediately to avoid gateway timeout - video generation continues in background
      res.json({
        message: "Video generation started",
        generationId: generationId,
        status: "generating"
      });

      // Continue video generation in background (async, non-blocking)
      (async () => {
        try {
          // Get configuration based on audio duration (reuse the variable from earlier)
          // audioDuration is already declared above

          console.log(`Using audio duration: ${audioDuration} seconds for video generation`);

          // Check if this is an instrumental project
          const isInstrumental = (project as any).isInstrumental === true;
          console.log(`[VIDEO-GEN] Project type: ${isInstrumental ? 'INSTRUMENTAL' : 'PRO MODE'}`);

          let numberOfAudioParts: number;
          let numberOfScenes: number;
          let numberOfVideosLipsync: number;
          let numberOfVideosRegularApi: number;
          let audioSegments: any[];
          let audioUrls: string[];
          let segmentDurations: number[];

          if (isInstrumental) {
            // For instrumental videos: no audio splitting, use full audio for each scene, only seedance model
            console.log(`[VIDEO-GEN] Instrumental mode: skipping audio splitting, using full audio for each scene`);

            // Use existing scene images count
            const existingSceneImages = (project.sceneImages as string[]) || [];
            const existingSceneImagesCount = existingSceneImages.length;

            if (existingSceneImagesCount === 0) {
              throw new Error(`No scene images found in project for instrumental video. Project ID: ${project.id}. Scene images must be generated before video generation.`);
            }

            numberOfScenes = existingSceneImagesCount;
            numberOfAudioParts = numberOfScenes; // One audio per scene (but all use the same full audio)
            numberOfVideosLipsync = 0; // No lipsync for instrumental
            numberOfVideosRegularApi = numberOfScenes; // All videos use seedance

            console.log(`[VIDEO-GEN] Instrumental video parameters:`);
            console.log(`- Number of scenes: ${numberOfScenes}`);
            console.log(`- Regular videos (seedance): ${numberOfVideosRegularApi}`);
            console.log(`- Lipsync videos: ${numberOfVideosLipsync} (disabled for instrumental)`);

            // For instrumental: each scene uses the full audio (not split)
            // Calculate segment durations based on scene count (divide audio evenly)
            const segmentDuration = Math.floor(audioDuration / numberOfScenes);
            const lastSegmentDuration = audioDuration - (segmentDuration * (numberOfScenes - 1));

            // Store segment durations for later use (audio URL will be converted below)
            segmentDurations = [];
            for (let i = 0; i < numberOfScenes; i++) {
              const duration = i === numberOfScenes - 1 ? lastSegmentDuration : segmentDuration;
              segmentDurations.push(duration);
            }

            console.log(`[VIDEO-GEN] Calculated ${numberOfScenes} segment durations: ${segmentDurations.join(', ')}s`);
          } else {
            // For pro mode: calculate segments and use lipsync logic
            // Calculate the correct number of scenes based on audio duration
            // Apply the new logic: segments must be 6s each, and last segment must be >= 2s
            const fullSegments = Math.floor(audioDuration / 6);
            const remainder = audioDuration % 6;
            // Only include remainder if it's >= 2 seconds (minimum for AI models)
            const calculatedSceneCount = remainder >= 2 ? fullSegments + 1 : fullSegments;

            // Check if existing scene images match the calculated count
            const existingSceneImagesCount = (project.sceneImages as string[])?.length || 0;

            // If scene images don't match the calculated count, we need to recalculate
            // This handles cases where old projects had different segment logic
            if (existingSceneImagesCount !== calculatedSceneCount) {
              console.log(`⚠️ Scene images count mismatch: existing=${existingSceneImagesCount}, calculated=${calculatedSceneCount}`);
              console.log(`   Audio duration: ${audioDuration}s → ${fullSegments} full segments + ${remainder}s remainder`);
              if (remainder < 2) {
                console.log(`   Remainder (${remainder}s) is < 2s, so it will be excluded`);
              }
            }

            // Use calculated scene count (not existing scene images count) to ensure correct splitting
            numberOfAudioParts = calculatedSceneCount;
            numberOfScenes = calculatedSceneCount;

            console.log(`Scene images count from project: ${existingSceneImagesCount}`);
            console.log(`Calculated scene count: ${calculatedSceneCount}`);
            console.log(`Calculated from duration would be: ${Math.ceil(audioDuration / 6)}`);

            // Split roughly 50/50 between regular and lipsync videos
            numberOfVideosLipsync = Math.floor(numberOfScenes / 2);
            numberOfVideosRegularApi = numberOfScenes - numberOfVideosLipsync;

            console.log("Dynamically calculated video generation parameters:");
            console.log("- Number of audio parts:", numberOfAudioParts);
            console.log("- Number of scenes:", numberOfScenes);
            console.log("- Regular videos:", numberOfVideosRegularApi);
            console.log("- Lipsync videos:", numberOfVideosLipsync);
          }

          // Initialize ObjectStorageService once for reuse throughout video generation
          const objectStorageService = new ObjectStorageService();

          // Convert audio URL to externally accessible signed URL (needed for both modes)
          let audioUrl = project.audioUrl;
          if (audioUrl.startsWith('/objects/')) {
            // Generate signed URL for object storage files (publicly accessible by external APIs)
            audioUrl = await objectStorageService.getSignedUrlForPath(audioUrl, 3600); // 1 hour TTL
          } else if (audioUrl.startsWith('/')) {
            // For truly local files (e.g., /uploads/...) use Replit domain
            // Note: This is only for self-hosted tests; object storage files use signed URLs above
            const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;

            if (replitDevDomain) {
              audioUrl = `https://${replitDevDomain}${audioUrl}`;
            } else {
              const replSlug = process.env.REPL_SLUG;
              const replOwner = process.env.REPL_OWNER;

              if (replSlug && replOwner) {
                audioUrl = `https://${replSlug}-${replOwner}.replit.app${audioUrl}`;
              } else {
                const host = req.get('host') || 'localhost:5000';
                audioUrl = host.includes('localhost') ? `http://${host}${audioUrl}` : `https://${host}${audioUrl}`;
              }
            }
          }

          console.log("=== AUDIO URL DEBUG ===");
          console.log("Original audio URL:", project.audioUrl);
          console.log("REPLIT_DEV_DOMAIN:", process.env.REPLIT_DEV_DOMAIN);
          console.log("Host:", req.get('host'));
          console.log("Final audio URL for FFMPEG:", audioUrl);
          console.log("Audio type:", project.audioType);
          console.log("=== END DEBUG ===");

          // Step 1: Split audio (skip for instrumental)
          if (!isInstrumental) {
            await storage.addGenerationLog({
              projectId: req.params.id,
              step: "video_generation",
              message: `Splitting audio into ${numberOfAudioParts} segments`,
              status: "progress",
              metadata: { step: 1, total: 4, numberOfSegments: numberOfAudioParts }
            });

            // Split audio into fixed 6-second segments for pro mode
            // CRITICAL: All segments must be exactly 6 seconds, only the last segment can be shorter
            // This ensures proper lipsync synchronization when merging videos
            // Example: 30-second song → [6s, 6s, 6s, 6s, 6s, 0s] NOT [5s, 5s, 5s, 5s, 5s, 5s]
            console.log(`Splitting audio into fixed 6-second segments (audio type: ${project.audioType}, total duration: ${audioDuration}s)`);
            let splitAudioSegments = await splitAudio(audioUrl, numberOfAudioParts, audioDuration);
            console.log("Audio segments result:", JSON.stringify(splitAudioSegments, null, 2));

            // Filter out last segment if it's less than 2 seconds (minimum required by AI models)
            // This prevents errors when trying to generate videos from very short audio segments
            if (splitAudioSegments.length > 0) {
              const lastSegment = splitAudioSegments[splitAudioSegments.length - 1];
              if (lastSegment.duration < 2) {
                console.log(`⚠️ Last audio segment is ${lastSegment.duration}s (less than 2s minimum) - removing it from video generation`);
                splitAudioSegments = splitAudioSegments.slice(0, -1); // Remove last segment

                // Update scene count to match filtered segments
                const originalSceneCount = numberOfScenes;
                const filteredSceneCount = splitAudioSegments.length;
                console.log(`Updated scene count: ${originalSceneCount} → ${filteredSceneCount} (removed 1 segment < 2s)`);

                // Update variables
                numberOfScenes = filteredSceneCount;
                numberOfVideosRegularApi = filteredSceneCount - numberOfVideosLipsync;
              }
            }

            audioSegments = splitAudioSegments;
            audioUrls = audioSegments.map(segment => segment.download_url);
            segmentDurations = audioSegments.map(segment => segment.duration);
            console.log("Audio URLs for video generation (after filtering):", audioUrls);
            console.log("Segment durations for video generation (after filtering):", segmentDurations);
            console.log(`Final segment count: ${audioSegments.length} (will generate ${audioSegments.length} scenes)`);

            await storage.updateProject(req.params.id, {
              audioSegments: audioSegments
            });
          } else {
            // For instrumental: use full audio, no splitting
            console.log(`[VIDEO-GEN] Using full audio for instrumental video (no splitting)`);
            // segmentDurations are already calculated above
            // audioUrls not needed for instrumental (seedance doesn't use audio)
            // Create a dummy audioSegments array to match the number of scenes for compatibility
            audioSegments = Array(numberOfScenes).fill(null).map((_, i) => ({
              download_url: project.audioUrl || '',
              duration: segmentDurations[i] || 0,
              index: i
            }));
            console.log(`[VIDEO-GEN] Created ${audioSegments.length} dummy audio segments for instrumental video`);
          }

          // Step 2: Generate video segments dynamically based on calculation
          const makeCharacterSing = isInstrumental ? false : (project.makeCharacterSing || true);
          const videoGenerationMessage = isInstrumental
            ? `Generating ${numberOfVideosRegularApi} videos using seedance (instrumental mode)`
            : makeCharacterSing
              ? `Generating ${numberOfVideosRegularApi} regular videos (seedance) and ${numberOfVideosLipsync} lipsync videos (multitalk)`
              : `Generating ${numberOfVideosRegularApi} regular videos (seedance only)`;

          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: videoGenerationMessage,
            status: "progress",
            metadata: {
              step: 2,
              total: 5,
              regularVideos: numberOfVideosRegularApi,
              lipsyncVideos: isInstrumental ? 0 : (makeCharacterSing ? numberOfVideosLipsync : 0),
              isInstrumental: isInstrumental
            }
          });

          // Load subtitle data if available for smart lyrics detection
          let subtitleData: { assContent?: string; totalDuration?: number } | undefined;
          if (project.subtitleFileUrl) {
            try {
              console.log("Loading subtitle file for smart lyrics detection:", project.subtitleFileUrl);

              // Read the subtitle file content from object storage
              const { ObjectStorageService, objectStorageClient } = await import("./objectStorage");
              const objectStorageService = new ObjectStorageService();

              if (project.subtitleFileUrl.startsWith('/objects/') || project.subtitleFileUrl.startsWith('/public-objects/')) {
                let fullPath: string;

                if (project.subtitleFileUrl.startsWith('/public-objects/')) {
                  // Public object path (ElevenLabs subtitles)
                  const objectPath = project.subtitleFileUrl.replace('/public-objects/', '');
                  const publicPaths = objectStorageService.getPublicObjectSearchPaths();
                  fullPath = `${publicPaths[0]}/${objectPath}`;
                  console.log("Loading public subtitle file from:", fullPath);
                } else {
                  // Private object path (KIE subtitles)
                  const objectPath = project.subtitleFileUrl.replace('/objects/', '');
                  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR || "";
                  fullPath = `${privateObjectDir}/${objectPath}`;
                  console.log("Loading private subtitle file from:", fullPath);
                }

                // Parse bucket and object name
                const pathParts = fullPath.split('/');
                const bucketName = pathParts[1];
                const objectName = pathParts.slice(2).join('/');

                // Download the subtitle file
                const bucket = objectStorageClient.bucket(bucketName);
                const file = bucket.file(objectName);
                const [exists] = await file.exists();

                if (exists) {
                  const [content] = await file.download();
                  subtitleData = {
                    assContent: content.toString('utf-8'),
                    totalDuration: audioDuration
                  };
                  console.log("Successfully loaded subtitle file for smart lyrics detection");
                  console.log("Subtitle file length:", content.length, "bytes");
                } else {
                  console.log("Subtitle file not found in object storage");
                }
              } else if (
                project.subtitleFileUrl.startsWith("http://") ||
                project.subtitleFileUrl.startsWith("https://")
              ) {
                console.log(
                  "Loading external subtitle file for smart lyrics detection:",
                  project.subtitleFileUrl,
                );
                const subtitleResponse = await fetch(project.subtitleFileUrl);
                if (!subtitleResponse.ok) {
                  throw new Error(
                    `Failed to fetch subtitle file from URL: ${subtitleResponse.status} ${subtitleResponse.statusText}`,
                  );
                }
                const assContent = await subtitleResponse.text();
                subtitleData = {
                  assContent,
                  totalDuration: audioDuration,
                };
                console.log(
                  "Successfully loaded subtitle file from external URL for smart lyrics detection",
                );
                console.log("Subtitle file length:", assContent.length, "chars");
              } else {
                console.log("Unrecognized subtitle file URL format:", project.subtitleFileUrl);
              }
            } catch (error) {
              console.error("Error loading subtitle file for smart detection:", error);
              // Continue without subtitle data - will use default pattern
            }
          } else {
            console.log("No subtitle file URL found in project - will use default lipsync pattern");
          }

          // Convert scene images to signed URLs for Wavespeed API
          console.log("Converting scene images to signed URLs for Wavespeed API...");
          const originalSceneImages = (project.sceneImages as string[]) || [];
          const originalScenePrompts = (project.scenePrompts as string[]) || [];
          const originalSceneLipsyncSettings = ((project as any).sceneLipsyncSettings as (boolean | null)[]) || [];

          // Validate that we have scene images
          if (!originalSceneImages || originalSceneImages.length === 0) {
            throw new Error(`No scene images found in project. Project ID: ${project.id}, sceneImages: ${JSON.stringify(project.sceneImages)}`);
          }

          const sceneOrder = ((project as any).sceneOrder as number[]) || originalSceneImages.map((_, i) => i);

          // Restrict sceneOrder to in-bounds indices to avoid undefined scene images
          // (e.g. partial regeneration clone has 13 images but source sceneOrder had 14 indices)
          const validIndices = sceneOrder.filter(
            (idx: number) => typeof idx === 'number' && idx >= 0 && idx < originalSceneImages.length
          );
          if (validIndices.length < sceneOrder.length) {
            console.log(`⚠️ sceneOrder had ${sceneOrder.length} indices but only ${originalSceneImages.length} scene images; using ${validIndices.length} valid indices`);
          }

          // Apply custom scene order if provided (reorder scenes for video merge)
          let sceneImages = validIndices.map(idx => originalSceneImages[idx]);
          let orderedScenePrompts = validIndices.map(idx => originalScenePrompts[idx]);
          // Apply scene order to lipsync settings as well
          let orderedSceneLipsyncSettings = validIndices.map(idx =>
            originalSceneLipsyncSettings[idx] !== undefined ? originalSceneLipsyncSettings[idx] : null
          );

          // IMPORTANT: Filter scene images/prompts to match filtered audio segments
          // This handles cases where:
          // 1. Last audio segment was < 2s and removed
          // 2. Old projects had different segment counts (e.g., 4 scenes for 31s instead of 3)

          // Safety check: ensure audioSegments is defined
          if (!audioSegments || !Array.isArray(audioSegments)) {
            throw new Error(`Audio segments not initialized. Project ID: ${project.id}, isInstrumental: ${isInstrumental}`);
          }

          // Safety check: ensure sceneImages is defined
          if (!sceneImages || !Array.isArray(sceneImages)) {
            throw new Error(`Scene images not properly initialized. Project ID: ${project.id}, originalSceneImages length: ${originalSceneImages.length}, sceneOrder: ${JSON.stringify(sceneOrder)}`);
          }

          if (sceneImages.length !== audioSegments.length) {
            console.log(`⚠️ Scene images count (${sceneImages.length}) doesn't match audio segments (${audioSegments.length}) - trimming to match`);
            if (sceneImages.length > audioSegments.length) {
              // Trim excess scenes (e.g., old 4-scene project now needs 3 scenes)
              sceneImages = sceneImages.slice(0, audioSegments.length);
              orderedScenePrompts = orderedScenePrompts.slice(0, audioSegments.length);
              orderedSceneLipsyncSettings = orderedSceneLipsyncSettings.slice(0, audioSegments.length);
              console.log(`   Trimmed to ${audioSegments.length} scenes to match audio segments`);

              // Save the filtered scenes back to the project so the UI shows the correct count
              // This fixes old projects that had incorrect scene counts
              await storage.updateProject(req.params.id, {
                sceneImages: sceneImages,
                scenePrompts: orderedScenePrompts,
                sceneLipsyncSettings: orderedSceneLipsyncSettings
              });
              console.log(`   Updated project with filtered scene images (${sceneImages.length} scenes)`);
            } else {
              // Scene images fewer than audio segments (e.g. partial regen clone has 13 images, audio split into 14)
              // Trim audio segments to match scene count so we don't reference undefined scene images
              console.warn(`   Scene images (${sceneImages.length}) are fewer than audio segments (${audioSegments.length}) - trimming audio to match scenes`);
              audioSegments = audioSegments.slice(0, sceneImages.length);
              audioUrls = audioSegments.map((seg: any) => seg.download_url);
              segmentDurations = audioSegments.map((seg: any) => seg.duration);
              await storage.updateProject(req.params.id, { audioSegments });
              console.log(`   Trimmed audio to ${audioSegments.length} segments to match scene images`);
            }
          }

          console.log(`Applied scene order: [${validIndices.join(', ')}]`);
          console.log(`Ordered lipsync settings: [${orderedSceneLipsyncSettings.map(s => s === null ? 'null' : s).join(', ')}]`);
          console.log(`Final scene count after filtering: ${sceneImages.length} scenes, ${audioSegments.length} audio segments`);

          let signedSceneUrls: string[] = [];

          try {
            for (let i = 0; i < sceneImages.length; i++) {
              const imageUrl = sceneImages[i];
              if (!imageUrl || typeof imageUrl !== 'string') {
                throw new Error(
                  `Scene ${i + 1} has missing or invalid image URL (sceneOrder index may be out of bounds or image was not set). ` +
                  `sceneImages.length=${sceneImages.length}, originalSceneImages.length=${originalSceneImages.length}.`
                );
              }
              if (imageUrl.startsWith('/objects/')) {
                // Private object storage URL - convert to signed URL
                const signedUrl = await objectStorageService.getSignedUrlForPath(imageUrl, 86400); // 24 hours
                signedSceneUrls.push(signedUrl);
                console.log(`Scene ${i + 1}: ${imageUrl} -> signed URL generated`);
              } else if (imageUrl.startsWith('/public-objects/')) {
                // Public object storage URL - convert to signed URL
                const signedUrl = await objectStorageService.getSignedUrlForPublicObject(imageUrl, 86400); // 24 hours
                signedSceneUrls.push(signedUrl);
                console.log(`Scene ${i + 1}: ${imageUrl} -> signed URL generated`);
              } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                // Already a public URL - use as-is
                signedSceneUrls.push(imageUrl);
                console.log(`Scene ${i + 1}: using external URL as-is`);
              } else {
                throw new Error(`Unrecognized scene image URL format: ${imageUrl}`);
              }
            }
            console.log(`Successfully converted ${signedSceneUrls.length} scene images to signed URLs`);
          } catch (error) {
            const errorMsg = `Failed to convert scene images to signed URLs: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(errorMsg);
            await storage.addGenerationLog({
              projectId: req.params.id,
              step: "video_generation",
              message: errorMsg,
              status: "error",
              metadata: { error: errorMsg }
            });
            // Do not send response here - we are inside background async and response was already sent
            throw error;
          }

          const videoQuality = (project as any).videoQuality || "quick";

          // CRITICAL: Filter out last segment if it's less than 4 seconds for seedance model (quick quality)
          // Seedance v1.5 Pro requires minimum 4 seconds duration
          // This prevents API errors when the last segment is too short
          if (videoQuality === "quick" && !isInstrumental && audioUrls.length > 0 && segmentDurations.length > 0) {
            const lastSegmentDuration = segmentDurations[segmentDurations.length - 1];
            if (lastSegmentDuration < 4) {
              console.log(`⚠️ Last segment duration (${lastSegmentDuration}s) is less than 4 seconds minimum for seedance - removing it`);
              console.log(`   Original segment count: ${audioUrls.length}`);

              // Remove last segment from all arrays
              audioUrls = audioUrls.slice(0, -1);
              signedSceneUrls = signedSceneUrls.slice(0, -1);
              orderedScenePrompts = orderedScenePrompts.slice(0, -1);
              segmentDurations = segmentDurations.slice(0, -1);
              orderedSceneLipsyncSettings = orderedSceneLipsyncSettings.slice(0, -1);

              // Update scene count
              numberOfScenes = audioUrls.length;
              numberOfVideosRegularApi = numberOfScenes - numberOfVideosLipsync;

              console.log(`   Filtered segment count: ${audioUrls.length}`);
              console.log(`   Updated scene count: ${numberOfScenes}`);
              console.log(`   Updated regular videos: ${numberOfVideosRegularApi}, lipsync videos: ${numberOfVideosLipsync}`);

              // Update project with filtered scenes
              await storage.updateProject(req.params.id, {
                sceneImages: sceneImages.slice(0, -1),
                scenePrompts: orderedScenePrompts,
                sceneLipsyncSettings: orderedSceneLipsyncSettings
              });

              await storage.addGenerationLog({
                projectId: req.params.id,
                step: "video_generation",
                message: `Removed last scene (${lastSegmentDuration}s < 4s minimum) - generating ${audioUrls.length} scenes instead`,
                status: "progress",
                metadata: {
                  removedLastSegment: true,
                  originalDuration: lastSegmentDuration,
                  finalSceneCount: audioUrls.length
                }
              });
            }
          }

          let allVideoUrls: string[];
          let segmentPairs: any;

          // Determine if partial regeneration is valid and should proceed
          let shouldUsePartialRegeneration = isPartialRegeneration && partialRegenMetadata?.modifiedSceneIndices;
          const existingVideoSegments = project.videoSegments as string[];
          let partialRegenError: string | null = null;

          // Check if we have existing video segments that can be reused
          // This happens when videos were regenerated via "Regenerate Video" button
          const hasExistingValidVideoSegments = existingVideoSegments &&
            existingVideoSegments.length === sceneImages.length &&
            existingVideoSegments.every(url => url && url.trim() !== "");

          // Safety validation for partial regeneration - MUST pass all checks
          if (shouldUsePartialRegeneration) {
            const currentSceneCount = originalSceneImages.length;

            // Check 1: Video segment count must match scene count
            if (!existingVideoSegments || existingVideoSegments.length !== currentSceneCount) {
              partialRegenError = `Video segment count (${existingVideoSegments?.length || 0}) doesn't match scene count (${currentSceneCount})`;
              console.error(`Partial regeneration validation failed: ${partialRegenError}`);
              shouldUsePartialRegeneration = false;
            }

            // Check 2: Scene order must match the original order from partial regeneration setup
            const originalSceneOrder = partialRegenMetadata?.originalSceneOrder as number[] | undefined;
            if (shouldUsePartialRegeneration && originalSceneOrder) {
              const orderMatches = sceneOrder.length === originalSceneOrder.length &&
                sceneOrder.every((val, idx) => val === originalSceneOrder[idx]);

              if (!orderMatches) {
                partialRegenError = "Scene order has changed since partial regeneration was set up";
                console.error(`Partial regeneration validation failed: ${partialRegenError}`);
                console.error(`Current order: [${sceneOrder.join(', ')}]`);
                console.error(`Original order: [${originalSceneOrder.join(', ')}]`);
                shouldUsePartialRegeneration = false;
              }
            }

            // Check 3: Ensure partial regen metadata has all required fields
            if (shouldUsePartialRegeneration && !partialRegenMetadata?.creditsToCharge) {
              partialRegenError = "Invalid partial regeneration metadata (missing credits)";
              console.error(`Partial regeneration validation failed: ${partialRegenError}`);
              shouldUsePartialRegeneration = false;
            }

            // If partial regeneration validation failed, return an error instead of silently falling back
            // This prevents unexpected overcharging and gives the user a clear choice
            if (isPartialRegeneration && !shouldUsePartialRegeneration && partialRegenError) {
              await storage.addGenerationLog({
                projectId: req.params.id,
                step: "video_generation",
                message: `Partial regeneration failed: ${partialRegenError}. Please use full regeneration.`,
                status: "error",
                metadata: {
                  error: partialRegenError,
                  requiresFullRegeneration: true
                }
              });

              // Reset project status so user can try again
              await storage.updateProject(req.params.id, {
                generationStatus: 'idle' as any,
                currentStep: 3,
              });

              // Remove from queue if queued
              if (isInQueue) {
                const { videoQueueService } = await import("./services/videoQueue");
                videoQueueService.removeFromQueue(req.params.id);
              }

              throw new Error(`Partial regeneration is no longer valid: ${partialRegenError}. Please use full video regeneration instead.`);
            }
          }

          // Check if this is a valid partial regeneration
          if (shouldUsePartialRegeneration && partialRegenMetadata?.modifiedSceneIndices) {
            const modifiedIndices = partialRegenMetadata.modifiedSceneIndices;

            console.log(`\n=== PARTIAL REGENERATION MODE ===`);
            console.log(`Modified scene indices: [${modifiedIndices.join(', ')}]`);
            console.log(`Existing video segments count: ${existingVideoSegments?.length || 0}`);
            console.log(`Existing video segments:`, existingVideoSegments?.map((url, idx) => `${idx}: ${url ? url.substring(0, 50) + '...' : 'empty'}`).join(', '));

            // Map scene order positions to actual scene indices for video generation
            // When scenes are reordered, we need to know which positions in the final video correspond to modified scenes
            const modifiedPositions = modifiedIndices.map(originalIndex => sceneOrder.indexOf(originalIndex));
            console.log(`Modified scene positions in ordered video: [${modifiedPositions.join(', ')}]`);

            // Filter to only include scenes that need video regeneration
            // Only regenerate videos for scenes that don't already have video URLs
            // IMPORTANT: Check videoSegments by original scene index, not ordered position
            const scenesToRegenerate = modifiedPositions.filter((pos, idx) => {
              if (pos < 0) {
                console.log(`Position ${pos} is invalid (negative)`);
                return false;
              }
              // Get the original scene index for this position
              const originalIndex = modifiedIndices[idx];
              if (originalIndex < 0 || originalIndex >= existingVideoSegments.length) {
                console.log(`Original index ${originalIndex} is out of bounds (max: ${existingVideoSegments.length - 1})`);
                return false;
              }
              // Check videoSegments by original index (videoSegments array is indexed by original scene index)
              const videoUrl = existingVideoSegments[originalIndex];
              // If video URL exists and is not empty, skip regeneration
              if (videoUrl && videoUrl.trim() !== "") {
                console.log(`Scene at original index ${originalIndex} (position ${pos}) already has video URL: ${videoUrl.substring(0, 50)}..., skipping regeneration`);
                return false;
              }
              console.log(`Scene at original index ${originalIndex} (position ${pos}) needs video regeneration (no video URL)`);
              return true;
            });

            console.log(`Scenes that need video regeneration: [${scenesToRegenerate.join(', ')}] out of ${modifiedPositions.length} modified scenes`);

            if (scenesToRegenerate.length > 0) {
              await storage.addGenerationLog({
                projectId: req.params.id,
                step: "video_generation",
                message: `Partial regeneration: regenerating ${scenesToRegenerate.length} modified scene videos`,
                status: "progress",
                metadata: {
                  step: 2,
                  total: 4,
                  modifiedPositions: scenesToRegenerate,
                  isPartialRegeneration: true
                }
              });

              // Get audio segments and scene data only for modified scenes
              const modifiedAudioUrls = scenesToRegenerate.map(pos => audioUrls[pos]);
              const modifiedSceneUrls = scenesToRegenerate.map(pos => signedSceneUrls[pos]);
              const modifiedPrompts = scenesToRegenerate.map(pos => orderedScenePrompts[pos]);
              const modifiedDurations = scenesToRegenerate.map(pos => segmentDurations[pos]);
              // Get the per-scene lipsync settings for the modified scenes
              const modifiedLipsyncSettings = scenesToRegenerate.map(pos => orderedSceneLipsyncSettings[pos]);

              console.log(`Regenerating videos for positions: [${scenesToRegenerate.join(', ')}]`);
              console.log(`Lipsync settings for modified scenes: [${modifiedLipsyncSettings.map(s => s === null ? 'null' : s).join(', ')}]`);

              // Generate only the modified scene videos using the per-scene lipsync settings
              const { videoUrls: regeneratedVideoUrls } = await generateAllVideoSegmentsDynamic(
                modifiedAudioUrls,
                modifiedSceneUrls,
                modifiedPrompts,
                {
                  numberOfVideosRegularApi: Math.ceil(scenesToRegenerate.length / 2),
                  numberOfVideosLipsync: Math.floor(scenesToRegenerate.length / 2),
                  makeCharacterSing: makeCharacterSing,
                  videoQuality: videoQuality,
                  sceneLipsyncSettings: modifiedLipsyncSettings,
                  isInstrumental: isInstrumental, // Pass instrumental flag
                  aspectRatio: aspectRatio // Pass aspect ratio from project
                },
                subtitleData,
                modifiedDurations
              );

              // Merge regenerated videos with existing ones
              // Start with existing video segments (which may already include regenerated videos from "Regenerate Video" button)
              allVideoUrls = [...existingVideoSegments];

              for (let i = 0; i < scenesToRegenerate.length; i++) {
                const position = scenesToRegenerate[i];
                if (position < allVideoUrls.length && position < regeneratedVideoUrls.length) {
                  console.log(`Replacing video at position ${position} with newly regenerated video`);
                  allVideoUrls[position] = regeneratedVideoUrls[i];
                } else if (position < allVideoUrls.length) {
                  console.log(`Warning: Position ${position} is valid but no regenerated video available at index ${i}`);
                } else {
                  console.log(`Position ${position} out of bounds, appending regenerated video`);
                  allVideoUrls.push(regeneratedVideoUrls[i]);
                }
              }

              console.log(`Final merged video URLs count: ${allVideoUrls.length}`);
            } else {
              // All modified scenes already have video URLs (from "Regenerate Video" button)
              // Skip video generation and use existing segments directly
              console.log(`All modified scenes already have video URLs, skipping video generation and proceeding to merge`);
              allVideoUrls = existingVideoSegments;

              await storage.addGenerationLog({
                projectId: req.params.id,
                step: "video_generation",
                message: `All modified scenes already have video URLs, skipping regeneration and proceeding to merge`,
                status: "progress",
                metadata: {
                  step: 2,
                  total: 4,
                  skippedRegeneration: true,
                  modifiedPositions: modifiedPositions
                }
              });
            }

            segmentPairs = null; // Not used in partial regeneration
            console.log(`=== PARTIAL REGENERATION COMPLETE ===\n`);
          } else if (hasExistingValidVideoSegments) {
            // Full regeneration but we have existing valid video segments (from "Regenerate Video" button)
            // Use them instead of regenerating everything
            console.log(`\n=== USING EXISTING VIDEO SEGMENTS ===`);
            console.log(`Found ${existingVideoSegments.length} existing video segments, using them for final video merge`);
            allVideoUrls = existingVideoSegments;
            segmentPairs = null;

            await storage.addGenerationLog({
              projectId: req.params.id,
              step: "video_generation",
              message: `Using ${existingVideoSegments.length} existing video segments for final video`,
              status: "progress",
              metadata: {
                step: 2,
                total: 4,
                usingExistingSegments: true
              }
            });
          } else {
            // Full video generation
            if (isInstrumental) {
              // For instrumental: use only seedance model, no lipsync
              console.log(`[VIDEO-GEN] Generating instrumental videos using seedance only`);

              // CRITICAL: Filter out last segment if it's less than 4 seconds for seedance model
              // Seedance v1.5 Pro requires minimum 4 seconds duration
              let filteredSignedSceneUrls = signedSceneUrls;
              let filteredOrderedScenePrompts = orderedScenePrompts;
              let filteredSegmentDurations = segmentDurations;
              let filteredNumberOfScenes = numberOfScenes;

              if (videoQuality === "quick" && segmentDurations.length > 0) {
                const lastSegmentDuration = segmentDurations[segmentDurations.length - 1];
                if (lastSegmentDuration < 4) {
                  console.log(`⚠️ Last segment duration (${lastSegmentDuration}s) is less than 4 seconds minimum for seedance - removing it`);
                  console.log(`   Original scene count: ${numberOfScenes}`);

                  // Remove last segment from all arrays
                  filteredSignedSceneUrls = signedSceneUrls.slice(0, -1);
                  filteredOrderedScenePrompts = orderedScenePrompts.slice(0, -1);
                  filteredSegmentDurations = segmentDurations.slice(0, -1);
                  filteredNumberOfScenes = filteredSignedSceneUrls.length;

                  console.log(`   Filtered scene count: ${filteredNumberOfScenes}`);

                  // Update project with filtered scene images
                  const originalSceneImages = (project.sceneImages as string[]) || [];
                  if (originalSceneImages.length > filteredNumberOfScenes) {
                    await storage.updateProject(req.params.id, {
                      sceneImages: originalSceneImages.slice(0, filteredNumberOfScenes),
                      scenePrompts: filteredOrderedScenePrompts
                    });
                    console.log(`   Updated project with filtered scene images (${filteredNumberOfScenes} scenes)`);
                  }

                  await storage.addGenerationLog({
                    projectId: req.params.id,
                    step: "video_generation",
                    message: `Removed last scene (${lastSegmentDuration}s < 4s minimum) - generating ${filteredNumberOfScenes} scenes instead`,
                    status: "progress",
                    metadata: {
                      removedLastSegment: true,
                      originalDuration: lastSegmentDuration,
                      finalSceneCount: filteredNumberOfScenes
                    }
                  });
                }
              }

              // Generate videos using seedance for all scenes
              const videoPromises = filteredSignedSceneUrls.map((imageUrl, index) => {
                const duration = filteredSegmentDurations[index] || Math.floor(audioDuration / filteredNumberOfScenes);
                console.log(`[VIDEO-GEN] Generating video ${index + 1}/${filteredNumberOfScenes} with seedance (duration: ${duration}s)`);

                // Use seedance model (no audio needed for seedance, but we pass empty string)
                return generateVideoSegment(
                  "", // No audio for seedance (it's image-to-video, not lipsync)
                  imageUrl,
                  filteredOrderedScenePrompts[index],
                  "seedance", // Always use seedance for instrumental
                  duration,
                  videoQuality,
                  aspectRatio
                );
              });

              allVideoUrls = await Promise.all(videoPromises);
              segmentPairs = null; // Not used for instrumental

              console.log(`[VIDEO-GEN] Generated ${allVideoUrls.length} instrumental video segments`);
            } else {
              // Pro mode: use existing logic with per-scene lipsync settings
              const result = await generateAllVideoSegmentsDynamic(
                audioUrls,
                signedSceneUrls,
                orderedScenePrompts,
                {
                  numberOfVideosRegularApi,
                  numberOfVideosLipsync,
                  makeCharacterSing: makeCharacterSing,
                  videoQuality: videoQuality,
                  sceneLipsyncSettings: orderedSceneLipsyncSettings,
                  isInstrumental: false, // Pro mode is not instrumental
                  aspectRatio: aspectRatio // Pass aspect ratio from project
                },
                subtitleData,
                segmentDurations // Pass segment durations for proper video length matching
              );

              allVideoUrls = result.videoUrls;
              segmentPairs = result.segmentPairs;
            }
          }

          // Always persist scene videos to Bunny Storage when configured (Wavespeed keeps URLs only 7 days).
          // Upload only non-Bunny URLs; keep already-Bunny URLs as-is to avoid re-uploading.
          if (isBunnyConfigured("scenes")) {
            console.log(`[Bunny Storage] Persisting ${allVideoUrls.length} scene videos to Bunny Storage`);
            const bunnySceneUrls = await Promise.all(
              allVideoUrls.map(async (url, idx) => {
                if (isBunnyUrl(url)) {
                  console.log(`[Bunny Storage] Scene ${idx + 1} already on Bunny, keeping: ${url.substring(0, 50)}...`);
                  return url;
                }
                try {
                  const resp = await fetch(url);
                  if (!resp.ok) {
                    console.warn(`[Bunny Storage] Scene ${idx + 1} fetch failed (${resp.status}), keeping original URL`);
                    return url;
                  }
                  const buffer = Buffer.from(await resp.arrayBuffer());
                  const result = await uploadToBunnyStorage(
                    "scenes",
                    `scene_${req.params.id}_${idx + 1}_${Date.now()}.mp4`,
                    buffer
                  );
                  console.log(`[Bunny Storage] Scene ${idx + 1} uploaded: ${result.url}`);
                  return result.url;
                } catch (err) {
                  console.warn(`[Bunny Storage] Scene ${idx + 1} upload failed (non-blocking):`, err);
                  return url;
                }
              })
            );
            allVideoUrls = bunnySceneUrls;
          }

          await storage.updateProject(req.params.id, {
            videoSegments: allVideoUrls
          });

          // Step 3: Merge final video directly from all individual segments (simplified workflow)
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: `Merging final video from ${allVideoUrls.length} individual segments + outro video`,
            status: "progress",
            metadata: { step: 3, total: 4 }
          });

          console.log("\n=== STARTING FINAL VIDEO MERGE (SIMPLIFIED) ===");
          console.log("Number of individual videos to merge:", allVideoUrls.length);
          console.log("Individual video URLs to merge:", allVideoUrls);

          // Convert video URLs to signed URLs for external FFMPEG API
          const signedVideoUrls: string[] = [];
          try {
            for (let i = 0; i < allVideoUrls.length; i++) {
              const videoUrl = allVideoUrls[i];

              if (videoUrl.startsWith('/objects/')) {
                // Private object storage URL - convert to signed URL
                const signedUrl = await objectStorageService.getSignedUrlForPath(videoUrl, 7200); // 2 hours
                signedVideoUrls.push(signedUrl);
                console.log(`Generated signed URL for segment ${i + 1}: ${videoUrl} -> signed`);
              } else if (videoUrl.startsWith('/public-objects/')) {
                // Public object storage URL - convert to signed URL
                const signedUrl = await objectStorageService.getSignedUrlForPublicObject(videoUrl, 7200); // 2 hours
                signedVideoUrls.push(signedUrl);
                console.log(`Generated signed URL for segment ${i + 1}: ${videoUrl} -> signed`);
              } else if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
                // Already a public URL - use as-is
                signedVideoUrls.push(videoUrl);
                console.log(`Using external URL for segment ${i + 1}: ${videoUrl}`);
              } else {
                throw new Error(`Unrecognized video URL format: ${videoUrl}`);
              }
            }
            console.log(`Successfully converted ${signedVideoUrls.length} video segments to signed URLs`);
          } catch (error) {
            const errorMsg = `Failed to convert video segments to signed URLs: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(errorMsg);
            await storage.addGenerationLog({
              projectId: req.params.id,
              step: "video_generation",
              message: errorMsg,
              status: "error",
              metadata: { error: errorMsg }
            });
            return res.status(500).json({ error: errorMsg });
          }

          // Outro URL by aspect ratio (passed as outro_url to neonvideo_merge_videos API, not in video_urls)
          const isPortrait = aspectRatio === "3:4" || aspectRatio === "9:16";
          const outroVideoUrl = isPortrait
            ? "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_vertical.mp4"
            : "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_horizontal.mp4";
          console.log("Outro URL for merge:", outroVideoUrl, `(aspect ${aspectRatio}, ${isPortrait ? "portrait" : "landscape"})`);

          // Dimensions for merge API (width x height from aspect ratio)
          const dimensions = aspectRatio === "9:16" ? "1080x1920" : aspectRatio === "3:4" ? "1080x1440" : "1920x1080";
          console.log("Signed video URLs for FFMPEG merge (scene segments only):", signedVideoUrls);

          // Convert audio URL to signed URL if it's an internal object storage URL
          let finalAudioUrl = project.audioUrl; // Use original audio URL from project
          if (finalAudioUrl.startsWith('/objects/')) {
            // Internal object storage URL - convert to signed URL
            finalAudioUrl = await objectStorageService.getSignedUrlForPath(finalAudioUrl, 7200); // 2 hours
            console.log("Generated signed URL for audio:", project.audioUrl, "->", finalAudioUrl);
          } else {
            console.log("Using external audio URL:", finalAudioUrl);
          }
          console.log("Final audio URL for FFMPEG merge:", finalAudioUrl);

          let finalVideo;
          let savedFinalVideoUrl: string;
          try {
            // Auto-generated videos are posted to social channels; skip watermark overlays.
            const watermarkUrl: string | undefined = undefined;

            console.log("=== VIDEO MERGE CONFIG ===");
            console.log("Captions will be added via ffmpegapi after upload (not during merge)");
            console.log("========================");

            finalVideo = await mergeVideos(
              signedVideoUrls,
              finalAudioUrl ?? undefined,
              undefined,
              watermarkUrl,
              outroVideoUrl,
              dimensions,
            );
            console.log("Final video merge successful:", finalVideo.download_url);

            // Save the merged video to object storage
            console.log("Saving final video to object storage...");
            const objectStorageService = new ObjectStorageService();

            try {
              let uploadResult: { url: string };
              if (finalVideo.download_url.includes("/api/ffmpeg-local/download/")) {
                const { OUTPUT_FOLDER } = await import("./services/ffmpegLocal.js");
                const localFilePath = path.join(OUTPUT_FOLDER, finalVideo.filename);
                const videoBuffer = fs.readFileSync(localFilePath);
                uploadResult = await objectStorageService.uploadVideoBuffer(
                  videoBuffer,
                  `neonvideo_${Date.now()}.mp4`,
                );
              } else {
                uploadResult = await objectStorageService.uploadVideoFromUrl(
                  finalVideo.download_url,
                  `neonvideo_${Date.now()}.mp4`
                );
              }
              savedFinalVideoUrl = uploadResult.url;
              console.log("Final video saved to storage:", savedFinalVideoUrl);
            } catch (storageError) {
              console.warn("Failed to save video to object storage, using temporary URL:", storageError);
              savedFinalVideoUrl = finalVideo.download_url;

              await storage.addGenerationLog({
                projectId: req.params.id,
                step: "video_generation",
                message: `Video generated successfully but storage failed. Using temporary URL: ${(storageError as Error).message}`,
                status: "warning",
                metadata: {
                  temporaryUrl: finalVideo.download_url,
                  storageError: (storageError as Error).message
                }
              });
            }

            // Add TikTok-style captions via ffmpegapi (auto-transcribes and burns captions)
            if (project.addSubtitles) {
              try {
                const projectSubtitleStyle = (project as any).subtitleStyle || "yellow-bg";
                await storage.addGenerationLog({
                  projectId: req.params.id,
                  step: "video_generation",
                  message: `Adding TikTok-style captions (${projectSubtitleStyle})`,
                  status: "progress",
                  metadata: { step: 4, total: 4, captionStyle: projectSubtitleStyle },
                });

                // Use the Bunny CDN URL (savedFinalVideoUrl) for captions — this matches the
                // my-videos add-captions flow which works reliably. The ffmpegapi.net download URL
                // times out even though it's their own server.
                const captionInputUrl = savedFinalVideoUrl;
                console.log(`[CAPTIONS] Using Bunny CDN URL for captions: ${captionInputUrl}`);

                const { addTikTokCaptions } = await import("./services/ffmpegCaptions");
                const captionResult = await addTikTokCaptions({
                  videoUrl: captionInputUrl,
                  subtitleStyle: projectSubtitleStyle,
                  aspectRatio: project.aspectRatio,
                  position: (project as any).captionPosition || "bottom",
                });

                // Upload the captioned video to storage (replaces the uncaptioned upload)
                const captionedUploadResult = await objectStorageService.uploadVideoFromUrl(
                  captionResult.download_url,
                  `neonvideo_${Date.now()}_captioned.mp4`,
                );
                savedFinalVideoUrl = captionedUploadResult.url;
                console.log("Captioned video saved to storage:", savedFinalVideoUrl);
              } catch (captionError) {
                console.warn("ffmpegapi caption rendering failed, proceeding without captions:", captionError);
                await storage.addGenerationLog({
                  projectId: req.params.id,
                  step: "video_generation",
                  message: `Caption rendering failed, using uncaptioned video: ${(captionError as Error).message}`,
                  status: "warning",
                  metadata: { error: (captionError as Error).message },
                });
              }
            }
          } catch (mergeError) {
            console.error("Final video merge failed:", mergeError);
            await storage.addGenerationLog({
              projectId: req.params.id,
              step: "video_generation",
              message: `Final video merge failed: ${(mergeError as Error).message}`,
              status: "error",
              metadata: {
                error: (mergeError as Error).message,
                videosAttempted: allVideoUrls
              }
            });
            throw new Error(`Final video merge failed: ${(mergeError as Error).message}`);
          }

          await storage.updateProject(req.params.id, {
            finalVideoUrl: savedFinalVideoUrl,
            isCompleted: true,
            currentStep: 6,
            generationStatus: 'completed' as any,
          });

          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: "Video generation completed",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl }
          });

          // Complete video processing in queue
          await videoQueueService.completeVideoGeneration(req.params.id, true);

          // Create Mux asset from the Bunny Storage URL (Mux can ingest from public URLs)
          try {
            await createMuxAssetForVideo(req.params.id, savedFinalVideoUrl);
          } catch (muxError) {
            console.error("Failed to create Mux asset (non-blocking):", muxError);
          }

          // Deduct credits for successful video generation
          const creditDeducted = await storage.deductUserCredits(project.userId, VIDEO_GENERATION_CREDITS);
          if (!creditDeducted) {
            console.error("Failed to deduct credits for video generation, but video was already generated");
          } else {
            console.log(`Deducted ${VIDEO_GENERATION_CREDITS} credits for video generation (${audioDuration}s) from user ${project.userId}`);
          }

        } catch (error) {
          console.error("Background video generation error:", error);
          const errorMessage = (error as Error).message;

          // Mark generation as failed
          await storage.updateProject(req.params.id, {
            generationStatus: 'failed' as any,
            currentStep: 3, // Reset to step 3 so user can try again
          });

          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: `Video generation failed: ${errorMessage}`,
            status: "error",
            metadata: { error: errorMessage }
          });

          // Complete video processing in queue (mark as failed)
          if (isInQueue) {
            await videoQueueService.completeVideoGeneration(req.params.id, false);
          }
        }
      })();
    } catch (error) {
      console.error("Generate video error:", error);
      const errorMessage = (error as Error).message;

      // Mark generation as failed
      await storage.updateProject(req.params.id, {
        generationStatus: 'failed' as any,
        currentStep: 3, // Reset to step 3 so user can try again
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Video generation failed: ${errorMessage}`,
        status: "error",
        metadata: { error: errorMessage }
      });

      // Complete video processing in queue (mark as failed)
      if (isInQueue) {
        const { videoQueueService } = await import("./services/videoQueue");
        await videoQueueService.completeVideoGeneration(req.params.id, false);
      }

      // Send specific error message to help with debugging
      res.status(500).json({
        error: errorMessage || "Failed to generate video",
        details: "Check server logs for detailed FFMPEG API requests and responses"
      });
    }
  });

  // Get generation logs
  app.get("/api/projects/:id/logs", async (req, res) => {
    try {
      const logs = await storage.getGenerationLogs(req.params.id);
      res.json(logs);
    } catch (error) {
      console.error("Get logs error:", error);
      res.status(500).json({ error: "Failed to get logs" });
    }
  });

  // Get video queue status
  app.get("/api/video-queue/status", async (req, res) => {
    try {
      const stats = await videoQueueService.getQueueStats();
      res.json(stats);
    } catch (error) {
      console.error("Queue status error:", error);
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  // Get queue position for a specific project
  app.get("/api/projects/:id/queue-position", async (req, res) => {
    try {
      const position = await videoQueueService.getQueuePosition(req.params.id);
      res.json({ queuePosition: position });
    } catch (error) {
      console.error("Queue position error:", error);
      res.status(500).json({ error: "Failed to get queue position" });
    }
  });

  // Generate character options for standalone character creation (without project)
  app.post("/api/characters/generate-options", authenticateToken, async (req, res) => {
    try {
      console.log("Standalone character options generation route called with body:", req.body);
      const { prompt, aspectRatio = "16:9", style = "3d", model, promptEnhancer, shotType = "front shot" } = req.body;
      console.log("Extracted prompt:", prompt);
      console.log("Aspect ratio:", aspectRatio);
      console.log("Style:", style);
      console.log("Model:", model);
      console.log("Prompt enhancer:", promptEnhancer);
      console.log("Shot type:", shotType);

      if (!prompt || !prompt.trim()) {
        throw new Error("No prompt provided");
      }

      // Validate prompt and enhancer for inappropriate content
      validateCharacterGenerationPrompt(prompt, promptEnhancer);

      // Use new style-based approach if model is provided, otherwise fallback to old style-based logic
      let imageUrls: string[];
      if (model !== undefined) {
        console.log("About to call generateCharacterImages with model:", model, "and prompt enhancer:", promptEnhancer);
        imageUrls = await generateCharacterImages(prompt, aspectRatio, style, model, promptEnhancer, shotType);
      } else {
        console.log("About to call generateCharacterImages with aspect ratio:", aspectRatio, "and style:", style);
        imageUrls = await generateCharacterImages(prompt, aspectRatio, style, undefined, undefined, shotType);
      }
      console.log("generateCharacterImages returned:", imageUrls);

      res.json({ imageUrls, prompt });
    } catch (error) {
      console.error("Generate standalone character options error:", error);
      const errorMessage = (error as Error).message;
      res.status(500).json({ error: errorMessage });
    }
  });

  // Standalone character image-to-image generation
  app.post("/api/characters/generate-image-to-image", authenticateToken, async (req, res) => {
    try {
      console.log("Standalone character image-to-image generation route called with body:", req.body);
      const { imageUrl, prompt, promptEnhancer, aspectRatio = "1:1", shotType = "front shot" } = req.body;
      console.log("Image URL:", imageUrl);
      console.log("Prompt:", prompt);
      console.log("Prompt enhancer:", promptEnhancer);
      console.log("Aspect ratio:", aspectRatio);
      console.log("Shot type:", shotType);

      if (!imageUrl || !prompt || !prompt.trim()) {
        throw new Error("Image URL and prompt are required");
      }

      // Validate prompt and enhancer for inappropriate content
      validateCharacterGenerationPrompt(prompt, promptEnhancer);

      console.log("About to call generateCharacterImageToImage");
      const resultImageUrl = await generateCharacterImageToImage(
        imageUrl,
        prompt,
        promptEnhancer || null,
        aspectRatio,
        shotType
      );
      console.log("generateCharacterImageToImage returned:", resultImageUrl);

      res.json({ imageUrl: resultImageUrl, prompt });
    } catch (error) {
      console.error("Generate standalone character image-to-image error:", error);
      const errorMessage = (error as Error).message;
      res.status(500).json({ error: errorMessage });
    }
  });

  // Standalone character upload
  app.post("/api/characters/upload", authenticateToken, upload.single('image'), async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.userId) {
        return res.status(401).json({ error: "User authentication required" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Please upload JPEG, PNG, or GIF images." });
      }

      // Validate file size (5MB limit)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Please upload images under 5MB." });
      }

      const preserveAspectRatio =
        String(req.body?.preserveAspectRatio ?? "").toLowerCase() === "true" ||
        String(req.query?.preserveAspectRatio ?? "").toLowerCase() === "true";

      // Process with sharp: default square crop for character avatars; optional preserve aspect (motion control / swap reference)
      let processedBuffer: Buffer;
      try {
        if (preserveAspectRatio) {
          processedBuffer = await sharp(file.buffer)
            .rotate()
            .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 90 })
            .toBuffer();
          console.log(`Image processed preserving aspect ratio (max edge 2048, fit inside)`);
        } else {
          processedBuffer = await sharp(file.buffer)
            .rotate()
            .resize(1024, 1024, { fit: "cover", position: "center" })
            .jpeg({ quality: 90 })
            .toBuffer();
          console.log(`Image processed to 1024x1024`);
        }
      } catch (sharpError) {
        console.error("Error processing image with sharp:", sharpError);
        // If sharp processing fails, use original buffer
        processedBuffer = file.buffer;
      }

      // Generate unique filename
      const filename = `character_${nanoid()}.jpg`;
      const imagePath = `characters/${filename}`;

      // Prefer Bunny Storage for character images when configured; otherwise Google Cloud Storage
      let permanentPath: string;

      if (isBunnyConfigured("characters")) {
        // Upload to Bunny Storage (characters folder)
        console.log(`[Bunny Storage] Uploading character image: ${filename}`);
        const bunnyResult = await uploadCharacterImage(filename, processedBuffer);
        permanentPath = bunnyResult.url;
        console.log(`[Bunny Storage] Character image uploaded: ${permanentPath}`);

        const moderationResult = await moderateImageContent(permanentPath);

        if (!moderationResult.safe) {
          console.log(`[Content Moderation] Image rejected (already uploaded to Bunny): ${permanentPath}`);
          if (moderationResult.error) {
            return res.status(503).json({ error: moderationResult.error });
          }
          const violationList = moderationResult.violations.join(", ");
          return res.status(400).json({
            error: `Image rejected: Our AI detected content that doesn't comply with our policies (${violationList}). Please upload a different image.`
          });
        }
      } else {
        // Google Cloud Storage
        console.log("[Storage] Bunny not configured for characters, using Google Cloud Storage");
        const objectPath = `${objectStorage.getPrivateObjectDir()}/${imagePath}`;
        const { bucketName, objectName } = objectStorage.parseObjectPath(objectPath);

        const bucket = objectStorageClient.bucket(bucketName);
        const fileObj = bucket.file(objectName);

        await fileObj.save(processedBuffer, {
          metadata: { contentType: 'image/jpeg' },
        });

        permanentPath = `/objects/${imagePath}`;
        console.log(`Character image stored at: ${permanentPath}`);
      }

      res.json({ imageUrl: permanentPath });
    } catch (error) {
      console.error("Character upload error:", error);
      res.status(500).json({ error: "Failed to upload character image" });
    }
  });

  // Saved characters routes
  app.get("/api/characters", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const characters = await storage.getSavedCharacters(userId);

      // Resolve ImageKit URLs for character images
      const resolvedCharacters = await Promise.all(
        characters.map(async (char) => {
          const resolvedUrl = await resolveUrlWithImageKitFallback(char.imageUrl, storage);
          if (char.imageUrl !== resolvedUrl) {
            console.log(`[ImageKit] Resolved character image: ${char.imageUrl} -> ${resolvedUrl}`);
          }
          return {
            ...char,
            imageUrl: resolvedUrl
          };
        })
      );

      res.json(resolvedCharacters);
    } catch (error) {
      console.error("Get saved characters error:", error);
      res.status(500).json({ error: "Failed to get saved characters" });
    }
  });

  // Get character count and limit info for current user
  app.get("/api/characters/limit", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const characters = await storage.getSavedCharacters(userId);
      const characterCount = characters.length;

      // Get user's plan to check if they're on free plan
      const userWithPlan = await storage.getUserWithPlan(userId);
      const isFreePlan = !userWithPlan?.plan || userWithPlan.plan.name.toLowerCase() === 'free';

      const FREE_CHARACTER_LIMIT = 30;
      const isAtLimit = isFreePlan && characterCount >= FREE_CHARACTER_LIMIT;

      res.json({
        count: characterCount,
        limit: isFreePlan ? FREE_CHARACTER_LIMIT : null,
        isFreePlan,
        isAtLimit,
        canCreate: !isAtLimit
      });
    } catch (error) {
      console.error("Get character limit error:", error);
      res.status(500).json({ error: "Failed to get character limit info" });
    }
  });

  app.post("/api/characters", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { imageUrl, ...restData } = req.body;

      // Check character limit for free users
      const FREE_CHARACTER_LIMIT = 30;
      const userWithPlan = await storage.getUserWithPlan(userId);
      const isFreePlan = !userWithPlan?.plan || userWithPlan.plan.name.toLowerCase() === 'free';

      if (isFreePlan) {
        const existingCharacters = await storage.getSavedCharacters(userId);
        if (existingCharacters.length >= FREE_CHARACTER_LIMIT) {
          return res.status(403).json({
            error: "Character limit reached",
            message: "Free users can save up to 30 characters. Please upgrade to a paid plan for unlimited characters, or delete some existing characters.",
            isLimitError: true
          });
        }
      }

      let finalImageUrl = imageUrl;

      // Only download and re-upload if the image is from an external URL
      // If it's already in our storage (/objects/... or Bunny URL), use it directly
      if (!imageUrl.startsWith('/objects/') && !isBunnyUrl(imageUrl)) {
        console.log("Downloading and storing external character image for library...");
        const storedImage = await downloadAndStoreImage(imageUrl, "saved-characters");
        console.log("Image stored successfully:", storedImage.storedUrl);
        finalImageUrl = storedImage.storedUrl;
      } else {
        console.log("Using existing storage URL:", imageUrl.substring(0, 60) + "...");
      }

      const characterData = {
        ...restData,
        imageUrl: finalImageUrl,
        userId
      };

      const validatedData = insertSavedCharacterSchema.parse(characterData);
      const character = await storage.saveCharacter(validatedData);
      res.status(201).json(character);
    } catch (error) {
      console.error("Save character error:", error);
      const message = error instanceof Error ? error.message : 'Failed to save character';
      res.status(400).json({ error: message });
    }
  });

  app.patch("/api/characters/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Name is required" });
      }

      const updated = await storage.updateSavedCharacter(req.params.id, userId, { name: name.trim() });
      if (!updated) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Update character error:", error);
      res.status(500).json({ error: "Failed to update character" });
    }
  });

  app.delete("/api/characters/:id", authenticateToken, async (req, res) => {
    try {
      const deleted = await storage.deleteSavedCharacter(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete character error:", error);
      res.status(500).json({ error: "Failed to delete character" });
    }
  });


  // Stripe Subscription Endpoints
  app.post("/api/stripe/create-checkout-session", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { planId, billingPeriod } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;

      if (!stripeSecretKey) {
        console.error("Stripe secret key not configured");
        return res.status(500).json({ error: "Payment system not configured. Please contact support." });
      }

      // Import Stripe dynamically to use the database key
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      // Get user and plan details
      const user = await storage.getUser(userId);
      const plan = await storage.getPlanById(planId);

      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Determine the price ID to use
      const priceId = billingPeriod === 'yearly' ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;

      if (!priceId) {
        return res.status(400).json({ error: "Price ID not configured for this plan" });
      }

      // Create Stripe customer if not exists
      let stripeCustomerId = user?.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user?.email,
          name: user?.username,
          metadata: {
            userId: userId
          }
        });
        stripeCustomerId = customer.id;

        // Save Stripe customer ID to user
        await storage.updateUser(userId, { stripeCustomerId });
      }

      // Auto-apply $1 trial coupon for the Basic $1 Trial plan
      const BASIC_TRIAL_PLAN_ID = '9f518d2b-d15e-4afe-b48d-3f584dbbcc49';
      const isTrialPlan = planId === BASIC_TRIAL_PLAN_ID;

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        ...(isTrialPlan
          ? { discounts: [{ promotion_code: 'promo_1TKA1UQxrAsbY9f0WroqAiTX' }] }
          : { allow_promotion_codes: true }),
        success_url: `${req.headers.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/plans`,
        metadata: {
          userId,
          planId,
        },
      });

      res.json({ sessionUrl: session.url });
    } catch (error) {
      console.error("Create checkout session error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create checkout session" });
    }
  });

  // Get subscription status
  app.get("/api/stripe/subscription-status", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const user = await storage.getUser(userId);

      if (!user?.stripeCustomerId || !user?.stripeSubscriptionId) {
        return res.json({ hasSubscription: false });
      }

      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;

      if (!stripeSecretKey) {
        return res.json({ hasSubscription: false });
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

        res.json({
          hasSubscription: true,
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
      } catch (error) {
        // Subscription not found or invalid
        res.json({ hasSubscription: false });
      }
    } catch (error) {
      console.error("Get subscription status error:", error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // Cancel subscription
  app.post("/api/stripe/cancel-subscription", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const user = await storage.getUser(userId);

      if (!user?.stripeSubscriptionId) {
        return res.status(400).json({ error: "No active subscription found" });
      }

      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;

      if (!stripeSecretKey) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      // Cancel at period end (don't immediately cancel)
      const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      res.json({
        success: true,
        message: "Subscription will be cancelled at the end of the current billing period",
        cancelAt: new Date(subscription.cancel_at! * 1000).toISOString()
      });
    } catch (error) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // Create checkout session for one-time credit purchase
  app.post("/api/stripe/create-credit-checkout-session", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user has a paid plan (Basic or Premium)
      if (!user.planId || user.plan?.name === 'Free') {
        return res.status(403).json({ error: "Only paid subscribers can purchase additional credits" });
      }

      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;

      if (!stripeSecretKey) {
        console.error("Stripe secret key not configured");
        return res.status(500).json({ error: "Payment system not configured. Please contact support." });
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      // Get or create Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId }
        });
        stripeCustomerId = customer.id;
        await storage.updateUser(userId, { stripeCustomerId });
      }

      // Create checkout session for one-time payment
      // Price: $9 for 5000 credits
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [{
          price: 'price_1SQfnqQxrAsbY9f0PatqnzYy', // Stripe price ID for credit purchase
          quantity: 1,
        }],
        mode: 'payment', // One-time payment
        success_url: `${req.headers.origin}/profile?credit_purchase=success`,
        cancel_url: `${req.headers.origin}/profile?credit_purchase=cancelled`,
        metadata: {
          userId,
          type: 'credit_purchase',
          creditsToAdd: '5000'
        },
      });

      res.json({ sessionUrl: session.url });
    } catch (error) {
      console.error("Create credit checkout session error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create checkout session" });
    }
  });

  // NOTE: Stripe webhook handler is defined in server/index.ts before JSON parsing middleware
  // This ensures the raw body is preserved for signature verification
  // All webhook events (subscriptions, credit purchases, etc.) are handled there

  // ============= GIFT SUBSCRIPTION ENDPOINTS =============

  // Create checkout session for gift subscription
  app.post("/api/stripe/gift/create-checkout-session", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { planId, billingPeriod, recipientEmail, recipientName, personalMessage } = req.body;

      if (!planId || !billingPeriod || !recipientEmail) {
        return res.status(400).json({ error: "Plan ID, billing period, and recipient email are required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipientEmail)) {
        return res.status(400).json({ error: "Invalid recipient email address" });
      }

      // Get Stripe settings from database
      const stripeSettings = await storage.getAllSettings();
      const stripeSecretKey = stripeSettings.find(s => s.key === 'stripe_secret_key')?.value;

      if (!stripeSecretKey) {
        console.error("Stripe secret key not configured");
        return res.status(500).json({ error: "Payment system not configured. Please contact support." });
      }

      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      // Get user and plan details
      const user = await storage.getUser(userId);
      const plan = await storage.getPlanById(planId);

      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      // Get the price based on billing period
      const price = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

      if (!price) {
        return res.status(400).json({ error: "Price not configured for this billing period" });
      }

      // Generate unique redemption code
      const { nanoid } = await import('nanoid');
      const redemptionCode = `GIFT-${nanoid(10).toUpperCase()}`;

      // Calculate expiration date (1 year from now for gift codes)
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      // Create gift subscription record (status: pending until payment completes)
      const giftSubscription = await storage.createGiftSubscription({
        purchaserUserId: userId,
        recipientEmail,
        recipientName: recipientName || null,
        personalMessage: personalMessage || null,
        planId,
        billingPeriod,
        amount: price,
        redemptionCode,
        status: 'pending',
        expiresAt
      });

      // Create Stripe customer if not exists
      let stripeCustomerId = user?.stripeCustomerId;
      if (!stripeCustomerId && user) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.username,
          metadata: {
            userId: userId
          }
        });
        stripeCustomerId = customer.id;
        await storage.updateUser(userId, { stripeCustomerId });
      }

      // Create checkout session for one-time payment
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId || undefined,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Gift: ${plan.name} Plan (${billingPeriod === 'yearly' ? '1 Year' : '1 Month'})`,
              description: `Gift subscription for ${recipientEmail}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${req.headers.origin}/gift-success?code=${redemptionCode}`,
        cancel_url: `${req.headers.origin}/gift?cancelled=true`,
        metadata: {
          type: 'gift_subscription',
          giftSubscriptionId: giftSubscription.id,
          purchaserUserId: userId,
          recipientEmail,
          planId,
          billingPeriod,
          redemptionCode
        },
      });

      // Update gift subscription with Stripe session ID
      await storage.updateGiftSubscription(giftSubscription.id, {
        stripeSessionId: session.id
      });

      res.json({ sessionUrl: session.url });
    } catch (error) {
      console.error("Create gift checkout session error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create checkout session" });
    }
  });

  // Get gift subscriptions sent by the current user
  app.get("/api/gifts/sent", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const gifts = await storage.getGiftSubscriptionsByPurchaser(userId);

      // Get plan details for each gift
      const giftsWithPlans = await Promise.all(gifts.map(async (gift) => {
        const plan = await storage.getPlanById(gift.planId);
        return {
          ...gift,
          plan: plan ? { name: plan.name, credits: plan.credits } : null
        };
      }));

      res.json(giftsWithPlans);
    } catch (error) {
      console.error("Get sent gifts error:", error);
      res.status(500).json({ error: "Failed to get sent gifts" });
    }
  });

  // Validate a gift code (for redemption page)
  app.get("/api/gifts/validate/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const gift = await storage.getGiftSubscriptionByCode(code);

      if (!gift) {
        return res.status(404).json({ error: "Gift code not found", valid: false });
      }

      if (gift.status === 'redeemed') {
        return res.status(400).json({ error: "This gift has already been redeemed", valid: false });
      }

      if (gift.status !== 'paid') {
        return res.status(400).json({ error: "This gift is not yet active", valid: false });
      }

      if (new Date() > gift.expiresAt) {
        return res.status(400).json({ error: "This gift code has expired", valid: false });
      }

      // Get plan details
      const plan = await storage.getPlanById(gift.planId);

      res.json({
        valid: true,
        recipientEmail: gift.recipientEmail,
        recipientName: gift.recipientName,
        personalMessage: gift.personalMessage,
        billingPeriod: gift.billingPeriod,
        plan: plan ? { name: plan.name, credits: plan.credits } : null,
        expiresAt: gift.expiresAt
      });
    } catch (error) {
      console.error("Validate gift code error:", error);
      res.status(500).json({ error: "Failed to validate gift code", valid: false });
    }
  });

  // Redeem a gift subscription
  app.post("/api/gifts/redeem", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: "Gift code is required" });
      }

      // Get the gift subscription
      const gift = await storage.getGiftSubscriptionByCode(code);

      if (!gift) {
        return res.status(404).json({ error: "Gift code not found" });
      }

      if (gift.status === 'redeemed') {
        return res.status(400).json({ error: "This gift has already been redeemed" });
      }

      if (gift.status !== 'paid') {
        return res.status(400).json({ error: "This gift is not yet active" });
      }

      if (new Date() > gift.expiresAt) {
        return res.status(400).json({ error: "This gift code has expired" });
      }

      // Get the user and check if they already have a subscription
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user already has the same or higher plan
      if (user.planId) {
        const currentPlan = await storage.getPlanById(user.planId);
        const giftPlan = await storage.getPlanById(gift.planId);

        if (currentPlan && giftPlan && currentPlan.credits >= giftPlan.credits && currentPlan.name !== 'Free') {
          return res.status(400).json({
            error: "You already have an equal or higher tier subscription. Gift cannot be applied."
          });
        }
      }

      // Redeem the gift
      const redeemedGift = await storage.redeemGiftSubscription(code, userId);

      if (!redeemedGift) {
        return res.status(500).json({ error: "Failed to redeem gift subscription" });
      }

      // Update the user's plan
      await storage.updateUser(userId, {
        planId: gift.planId,
        creditsUsed: 0 // Reset credits for the new subscription
      });

      // Get plan details for response
      const plan = await storage.getPlanById(gift.planId);

      res.json({
        success: true,
        message: `Successfully redeemed ${plan?.name || 'subscription'} plan!`,
        plan: plan ? { name: plan.name, credits: plan.credits } : null,
        billingPeriod: gift.billingPeriod
      });
    } catch (error) {
      console.error("Redeem gift error:", error);
      res.status(500).json({ error: "Failed to redeem gift subscription" });
    }
  });

  // ============= END GIFT SUBSCRIPTION ENDPOINTS =============

  // Public reCAPTCHA site key for contact form (safe to expose; used at runtime so build doesn't need VITE_*)
  app.get("/api/recaptcha-site-key", (_req, res) => {
    const siteKey = (process.env.VITE_RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SITE_KEY || "").trim();
    res.json({ siteKey: siteKey || "" });
  });

  // Contact form submission endpoint
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, subject, message, captchaToken } = req.body;

      // Validate required fields
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Validate captcha token
      if (!captchaToken) {
        return res.status(400).json({ error: "Captcha verification is required" });
      }

      // Verify captcha with Google
      const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
      if (!recaptchaSecret) {
        console.error("RECAPTCHA_SECRET_KEY not configured");
        return res.status(500).json({ error: "Captcha verification service not configured" });
      }

      try {
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
        const verifyResponse = await fetch(verifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `secret=${recaptchaSecret}&response=${captchaToken}`,
        });

        const verifyData = await verifyResponse.json();

        if (!verifyData.success) {
          console.warn("Captcha verification failed:", verifyData['error-codes']);
          return res.status(400).json({ error: "Captcha verification failed. Please try again." });
        }
      } catch (captchaError) {
        console.error("Error verifying captcha:", captchaError);
        return res.status(500).json({ error: "Failed to verify captcha" });
      }

      // Log the contact form submission
      console.log("Contact form submission:", {
        name,
        email,
        subject,
        message,
        timestamp: new Date().toISOString()
      });

      // Send emails using the email service
      const emailSent = await emailService.sendContactFormEmail({
        name,
        email,
        subject,
        message
      });

      if (!emailSent) {
        // If email fails, still log it but notify that email failed
        console.warn("Email service failed, but contact form was logged");
        return res.json({
          success: true,
          message: "Contact form submitted successfully. We'll review your message soon."
        });
      }

      res.json({ success: true, message: "Contact form submitted successfully. You should receive a confirmation email shortly." });
    } catch (error) {
      console.error("Contact form error:", error);
      res.status(500).json({ error: "Failed to submit contact form" });
    }
  });

  // ===== BUNNY.NET WEBHOOK (deprecated - Bunny Storage doesn't use webhooks) =====

  app.post("/api/webhooks/bunny", async (_req, res) => {
    console.log("[Bunny Webhook] Received webhook (deprecated - now using Bunny Storage)");
    res.json({ received: true });
  });

  // ===== MUX MIGRATION ENDPOINTS =====

  // Admin endpoint to migrate existing videos to Mux
  app.post("/api/admin/migrate-videos-to-mux", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get all completed videos without Mux assets
      const allProjects = await storage.getAllVideosForAdmin();
      const videosToMigrate = allProjects.filter(p =>
        p.isCompleted &&
        p.finalVideoUrl &&
        !p.muxAssetId &&
        !p.muxPlaybackId
      );

      console.log(`Found ${videosToMigrate.length} videos to migrate to Mux`);

      // Start migration process for each video
      const migrationResults = [];
      for (const project of videosToMigrate) {
        try {
          // Create Mux asset for this video (non-blocking)
          const asyncJob = createMuxAssetForVideo(project.id, project.finalVideoUrl!);

          migrationResults.push({
            projectId: project.id,
            title: project.title,
            status: 'queued',
            message: 'Mux asset creation initiated'
          });

          console.log(`Initiated Mux migration for video ${project.id}`);
        } catch (error) {
          console.error(`Failed to initiate migration for video ${project.id}:`, error);
          migrationResults.push({
            projectId: project.id,
            title: project.title,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({
        message: `Migration initiated for ${videosToMigrate.length} videos`,
        totalVideos: videosToMigrate.length,
        results: migrationResults
      });
    } catch (error) {
      console.error("Video migration error:", error);
      res.status(500).json({ error: "Failed to migrate videos to Mux" });
    }
  });

  // Admin endpoint to check Mux migration status
  app.get("/api/admin/mux-migration-status", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const allProjects = await storage.getAllVideosForAdmin();
      const completedVideos = allProjects.filter(p => p.isCompleted && p.finalVideoUrl);

      const muxStats = {
        totalCompletedVideos: completedVideos.length,
        videosWithMuxAssets: completedVideos.filter(p => p.muxAssetId).length,
        videosWithMuxReady: completedVideos.filter(p => p.muxAssetStatus === 'ready').length,
        videosWithMuxPreparing: completedVideos.filter(p => p.muxAssetStatus === 'preparing').length,
        videosWithMuxErrored: completedVideos.filter(p => p.muxAssetStatus === 'errored').length,
        videosWithoutMux: completedVideos.filter(p => !p.muxAssetId).length,
      };

      res.json(muxStats);
    } catch (error) {
      console.error("Mux migration status error:", error);
      res.status(500).json({ error: "Failed to get migration status" });
    }
  });

  // Reset failed Mux migrations endpoint
  app.post("/api/admin/reset-failed-mux-migrations", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { resetFailedMuxMigrations } = await import('./services/mux.js');
      const result = await resetFailedMuxMigrations();

      res.json({
        success: true,
        message: `Successfully reset ${result.resetCount} failed Mux migrations`,
        resetCount: result.resetCount
      });
    } catch (error) {
      console.error("Reset failed Mux migrations error:", error);
      res.status(500).json({ error: "Failed to reset failed migrations" });
    }
  });


  // Upload character image
  app.post("/api/projects/:id/upload-character", authenticateToken, upload.single('image'), async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user?.userId) {
        return res.status(401).json({ error: "User authentication required" });
      }

      const { id: projectId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Please upload JPEG, PNG, or GIF images." });
      }

      // Validate file size (5MB limit)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Please upload images under 5MB." });
      }

      // Verify project ownership
      const project = await storage.getProject(projectId);
      if (!project || project.userId !== user.userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get the project's aspect ratio to crop/resize the uploaded image accordingly
      const projectAspectRatio = project.aspectRatio || "16:9";
      console.log(`Processing character image for aspect ratio: ${projectAspectRatio}`);

      // Parse aspect ratio to get target dimensions
      // 16:9 (horizontal) = 1280x720, 3:4 (vertical) = 720x960
      let targetWidth: number;
      let targetHeight: number;
      if (projectAspectRatio === "3:4") {
        targetWidth = 720;
        targetHeight = 960;
      } else {
        targetWidth = 1280;
        targetHeight = 720;
      }

      // Process the image with sharp to match the project's aspect ratio
      let processedBuffer: Buffer;
      try {
        const image = sharp(file.buffer);
        const metadata = await image.metadata();

        if (metadata.width && metadata.height) {
          const sourceAspect = metadata.width / metadata.height;
          const targetAspect = targetWidth / targetHeight;

          let cropWidth: number;
          let cropHeight: number;

          if (sourceAspect > targetAspect) {
            // Source is wider than target - crop width
            cropHeight = metadata.height;
            cropWidth = Math.round(metadata.height * targetAspect);
          } else {
            // Source is taller than target - crop height
            cropWidth = metadata.width;
            cropHeight = Math.round(metadata.width / targetAspect);
          }

          // Center crop then resize to target dimensions
          const left = Math.round((metadata.width - cropWidth) / 2);
          const top = Math.round((metadata.height - cropHeight) / 2);

          processedBuffer = await sharp(file.buffer)
            .extract({ left, top, width: cropWidth, height: cropHeight })
            .resize(targetWidth, targetHeight, { fit: 'fill' })
            .jpeg({ quality: 90 })
            .toBuffer();

          console.log(`Image processed: original ${metadata.width}x${metadata.height}, cropped to ${cropWidth}x${cropHeight}, resized to ${targetWidth}x${targetHeight}`);
        } else {
          // Fallback if metadata can't be read
          processedBuffer = await sharp(file.buffer)
            .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 90 })
            .toBuffer();
          console.log(`Image processed with fallback resize to ${targetWidth}x${targetHeight}`);
        }
      } catch (sharpError) {
        console.error("Error processing image with sharp:", sharpError);
        // If sharp processing fails, use original buffer
        processedBuffer = file.buffer;
      }

      // Generate unique filename (always jpg since we convert to jpeg)
      const filename = `character_${nanoid()}.jpg`;
      const imagePath = `characters/${filename}`;

      // Prefer Bunny Storage for character images when configured; otherwise Google Cloud Storage
      let permanentPath: string;

      if (isBunnyConfigured("characters")) {
        console.log(`[Bunny Storage] Uploading character image: ${filename}`);
        const bunnyResult = await uploadCharacterImage(filename, processedBuffer);
        permanentPath = bunnyResult.url;
        console.log(`[Bunny Storage] Character image uploaded: ${permanentPath}`);

        const moderationResult = await moderateImageContent(permanentPath);

        if (!moderationResult.safe) {
          console.log(`[Content Moderation] Image rejected (already uploaded to Bunny): ${permanentPath}`);
          if (moderationResult.error) {
            return res.status(503).json({ error: moderationResult.error });
          }
          const violationList = moderationResult.violations.join(", ");
          return res.status(400).json({
            error: `Image rejected: Our AI detected content that doesn't comply with our policies (${violationList}). Please upload a different image.`
          });
        }
      } else {
        console.log("[Storage] Bunny not configured for characters, using Google Cloud Storage");
        const objectPath = `${objectStorage.getPrivateObjectDir()}/${imagePath}`;
        const { bucketName, objectName } = objectStorage.parseObjectPath(objectPath);

        const bucket = objectStorageClient.bucket(bucketName);
        const fileObj = bucket.file(objectName);

        await fileObj.save(processedBuffer, {
          metadata: { contentType: 'image/jpeg' },
        });

        permanentPath = `/objects/${imagePath}`;
        const signedUrl = await objectStorage.getSignedUrlForPath(permanentPath, 300);
        const moderationResult = await moderateImageContent(signedUrl);

        if (!moderationResult.safe) {
          console.log(`[Content Moderation] Image rejected, deleting: ${permanentPath}`);
          try {
            await fileObj.delete();
          } catch (deleteError) {
            console.error("[Content Moderation] Failed to delete rejected image:", deleteError);
          }
          if (moderationResult.error) {
            return res.status(503).json({ error: moderationResult.error });
          }
          const violationList = moderationResult.violations.join(", ");
          return res.status(400).json({
            error: `Image rejected: Our AI detected content that doesn't comply with our policies (${violationList}). Please upload a different image.`
          });
        }
      }

      await storage.updateProject(projectId, {
        characterImageUrl: permanentPath
      });

      console.log(`Character image uploaded and processed for ${projectAspectRatio} aspect ratio: ${permanentPath}`);

      res.json({
        imageUrl: permanentPath,
        message: "Character image uploaded successfully"
      });
    } catch (error) {
      console.error("Character image upload error:", error);
      res.status(500).json({ error: "Failed to upload character image" });
    }
  });

  // Re-process all videos that need Mux conversion
  app.post("/api/admin/reprocess-all-mux-videos", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { reprocessAllMuxVideos } = await import('./services/mux.js');
      const result = await reprocessAllMuxVideos();

      res.json({
        success: true,
        message: `Re-processing initiated for ${result.processedCount} videos`,
        processedCount: result.processedCount,
        results: result.results
      });
    } catch (error) {
      console.error("Re-process all Mux videos error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Migrate single video to Mux for testing
  app.post("/api/admin/migrate-single-video-to-mux", authenticateToken, async (req, res) => {
    try {
      // Check if user is admin
      const user = (req as any).user;
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { migrateSingleVideoToMux } = await import('./services/mux.js');
      const result = await migrateSingleVideoToMux();

      if (result.success) {
        res.json({
          success: true,
          message: `Successfully started migration for project ${result.projectId}`,
          projectId: result.projectId,
          videoUrl: result.videoUrl
        });
      } else {
        res.status(500).json({
          success: false,
          error: `Migration failed for project ${result.projectId}: ${result.error}`,
          projectId: result.projectId,
          videoUrl: result.videoUrl
        });
      }
    } catch (error) {
      console.error("Migrate single video to Mux error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Helper function to post a video to Postiz
  async function postVideoToPostiz(projectId: string) {
    console.log(`[POSTIZ] Starting post for project ${projectId}`);

    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.isCompleted || !project.finalVideoUrl) {
      throw new Error("Video must be completed with a final video URL");
    }

    // Check if already posted
    const existingPost = await storage.getPostizPostByProjectId(projectId);
    if (existingPost && existingPost.postedFacebook && existingPost.postedYoutube && existingPost.postedTiktok && existingPost.postedReddit) {
      throw new Error("Video has already been posted to Facebook, YouTube, TikTok, and Reddit");
    }

    const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY;
    const FACEBOOK_CHANNEL_ID = "cmgi638zj005ulb0yf9dlmz4g";
    const YOUTUBE_CHANNEL_ID = "cmgheacv20174lb0yszfbkfrg";
    const TIKTOK_CHANNEL_ID = "cmgi2xrxq0036lb0ykwos7wny";
    const REDDIT_CHANNEL_ID = "cmkzpyncb00sant0yy54mt640";

    if (!POSTIZ_API_KEY) {
      throw new Error("POSTIZ_API_KEY not configured");
    }

    // Prepare video URL and content
    const videoUrl = project.finalVideoUrl;
    const hashtags = "#ai #aivideo #musicvideo #neonvideo";
    const shareableLink = `https://neonvideo.ai/v/${projectId}`;

    // Generate AI description for Reddit using OpenAI
    // Build context from project data
    const projectContext = {
      title: project.title,
      characterPrompt: project.characterPrompt || "",
      audioPrompt: project.audioPrompt || "",
      description: project.description || "",
    };

    console.log(`[POSTIZ] Generating AI description for Reddit...`);
    let redditTitle = `AI Music Video: ${project.title}`;
    let redditDescription = `Check out this AI-generated music video created with NeonVideo.ai - the best AI music video generator!`;

    // Only attempt AI generation if OPENAI_API_KEY is available
    if (process.env.OPENAI_API_KEY) {
      try {
        const OpenAI = (await import("openai")).default;
        const openaiClient = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });

        const aiResponse = await openaiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a social media content creator writing Reddit posts for AI-generated music videos. 
Write in natural, conversational human language. Be enthusiastic but not over-the-top.
Include SEO keywords naturally: "AI music video", "music video", "music video generator", "AI video generator".
Keep it brief and engaging - around 2-3 sentences for the description.`
            },
            {
              role: "user",
              content: `Create a Reddit post title and description for this AI music video:

Title: ${projectContext.title}
Character: ${projectContext.characterPrompt}
Theme/Audio: ${projectContext.audioPrompt}
Description: ${projectContext.description}

Format your response as JSON:
{
  "title": "short catchy title with 'AI Music Video' included",
  "description": "2-3 sentence description in natural language"
}`
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.8,
          max_tokens: 200
        });

        // Safely parse AI response with defensive guards
        const messageContent = aiResponse?.choices?.[0]?.message?.content;
        if (messageContent) {
          const aiContent = JSON.parse(messageContent);
          if (aiContent.title) redditTitle = aiContent.title;
          if (aiContent.description) redditDescription = aiContent.description;
          console.log(`[POSTIZ] AI generated title: ${redditTitle}`);
          console.log(`[POSTIZ] AI generated description: ${redditDescription}`);
        } else {
          console.log(`[POSTIZ] AI response was empty, using default description`);
        }
      } catch (aiError) {
        console.error(`[POSTIZ] AI description generation failed, using default:`, aiError);
      }
    } else {
      console.log(`[POSTIZ] OPENAI_API_KEY not configured, using default description`);
    }

    // Build full Reddit content with link
    const redditContent = `${redditDescription}\n\nWatch the full video: ${shareableLink}`;

    // Resolve video URL - use ImageKit URL if available, otherwise get signed URL
    const { resolveUrlWithImageKitFallback } = await import('./services/imagekit.js');
    const { ObjectStorageService } = await import('./objectStorage.js');
    const objStorage = new ObjectStorageService();
    let fullVideoUrl: string;

    try {
      // First try to resolve ImageKit URL from backup (if video was uploaded to ImageKit)
      const resolvedUrl = await resolveUrlWithImageKitFallback(videoUrl, storage);

      if (resolvedUrl && resolvedUrl.startsWith('http')) {
        // It's already an ImageKit URL or full URL, use it directly
        fullVideoUrl = resolvedUrl;
        console.log(`[POSTIZ] Using ImageKit URL for video: ${fullVideoUrl.substring(0, 50)}...`);
      } else {
        // Try to get signed URL from object storage (fallback for local storage)
        try {
          fullVideoUrl = await objStorage.getSignedUrlForPath(videoUrl, 3600);
          console.log(`[POSTIZ] Generated signed URL for video`);
        } catch (signedUrlError) {
          console.error(`[POSTIZ] Failed to generate signed URL:`, signedUrlError);
          // Final fallback to direct URL
          const baseUrl = "https://neonvideo.ai";
          fullVideoUrl = videoUrl.startsWith('http') ? videoUrl : `${baseUrl}${videoUrl}`;
        }
      }
    } catch (error) {
      console.error(`[POSTIZ] Failed to resolve video URL:`, error);
      // Fallback to direct URL (might not work but better than failing)
      const baseUrl = "https://neonvideo.ai";
      fullVideoUrl = videoUrl.startsWith('http') ? videoUrl : `${baseUrl}${videoUrl}`;
    }

    const content = `Create your own AI Music Videos Now! 🤩\n\n${hashtags}`;

    // TikTok only: different caption and max 5 hashtags from allowed pool (TikTok limit)
    const TIKTOK_HASHTAG_POOL = [
      "#aimusic", "#newmusic", "#aimusicvideo", "#fypsounds", "#fyp",
      "#aigeneratedart", "#aivideo", "#viralsong", "#musicdiscovery", "#newmusicalert"
    ];
    const tiktokHashtags = [...TIKTOK_HASHTAG_POOL]
      .sort(() => Math.random() - 0.5)
      .slice(0, 5)
      .join(" ");
    const tiktokContent = `Create your Music Videos Now! 🤩\n\n${tiktokHashtags}`;

    console.log(`[POSTIZ] Posting to Facebook, YouTube, and TikTok for project: ${project.title}`);
    console.log(`[POSTIZ] Video URL for upload: ${fullVideoUrl}`);

    // Step 1: Download video from object storage
    console.log(`[POSTIZ] Downloading video from object storage...`);
    const videoResponse = await fetch(fullVideoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    const videoBuffer = await videoResponse.arrayBuffer();
    console.log(`[POSTIZ] Downloaded video (${videoBuffer.byteLength} bytes)`);

    // Step 2: Upload video to Postiz as multipart form data
    console.log(`[POSTIZ] Uploading video to Postiz...`);
    const FormData = (await import('form-data')).default;
    const nodeFetch = (await import('node-fetch')).default;

    const formData = new FormData();
    formData.append('file', Buffer.from(videoBuffer), {
      filename: `${project.title.replace(/[^a-z0-9]/gi, '_')}.mp4`,
      contentType: 'video/mp4'
    });

    const uploadResponse = await nodeFetch("https://api.postiz.com/public/v1/upload", {
      method: "POST",
      headers: {
        "Authorization": POSTIZ_API_KEY,
        ...formData.getHeaders()
      },
      body: formData as any
    });

    const uploadResponseText = await uploadResponse.text();
    console.log(`[POSTIZ] Upload response status: ${uploadResponse.status}`);
    console.log(`[POSTIZ] Upload response:`, uploadResponseText);

    if (!uploadResponse.ok) {
      throw new Error(`Postiz upload error (${uploadResponse.status}): ${uploadResponseText}`);
    }

    const uploadResult = JSON.parse(uploadResponseText);
    console.log(`[POSTIZ] Video uploaded successfully. Response:`, uploadResult);

    // Step 2: Create post with uploaded video for both Facebook and YouTube
    const groupId = `neonvideo-${Date.now()}`;
    const postBody = {
      type: "now",
      date: new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: FACEBOOK_CHANNEL_ID },
          value: [
            {
              content: content,
              image: [
                {
                  id: uploadResult.id,
                  path: uploadResult.path || uploadResult.url
                }
              ]
            }
          ],
          group: groupId
        },
        {
          integration: { id: YOUTUBE_CHANNEL_ID },
          value: [
            {
              content: content,
              image: [
                {
                  id: uploadResult.id,
                  path: uploadResult.path || uploadResult.url
                }
              ]
            }
          ],
          settings: {
            title: "Create your own AI Music Video now with NeonVideo.AI",
            type: "public"
          },
          group: groupId
        },
        {
          integration: { id: TIKTOK_CHANNEL_ID },
          value: [
            {
              content: tiktokContent,
              image: [
                {
                  id: uploadResult.id,
                  path: uploadResult.path || uploadResult.url
                }
              ]
            }
          ],
          settings: {
            privacy_level: "PUBLIC_TO_EVERYONE",
            duet: true,
            stitch: true,
            comment: true,
            autoAddMusic: "no",
            brand_content_toggle: false,
            brand_organic_toggle: false,
            content_posting_method: "DIRECT_POST"
          },
          group: groupId
        },
      ]
    };

    console.log(`[POSTIZ] Creating post for Facebook, YouTube, TikTok...`);
    console.log(`[POSTIZ] Post body:`, JSON.stringify(postBody, null, 2));

    const postResponse = await fetch("https://api.postiz.com/public/v1/posts", {
      method: "POST",
      headers: {
        "Authorization": POSTIZ_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(postBody)
    });

    const postResponseText = await postResponse.text();
    console.log(`[POSTIZ] Post response status: ${postResponse.status}`);
    console.log(`[POSTIZ] Post response:`, postResponseText);

    if (!postResponse.ok) {
      throw new Error(`Postiz API error (${postResponse.status}): ${postResponseText}`);
    }

    const postResult = JSON.parse(postResponseText);
    const postId = postResult.id || postResult.data?.id || null;

    console.log(`[POSTIZ] Successfully posted to Facebook, YouTube, and TikTok. Post ID: ${postId}`);

    // Post to Reddit separately to isolate failures
    let redditPostId: string | null = null;
    let redditPostedTime: Date | null = null;

    try {
      console.log(`[POSTIZ] Creating separate Reddit post...`);

      // Get subreddit from environment variable or use default
      const REDDIT_SUBREDDIT = process.env.REDDIT_SUBREDDIT || "videos";

      const redditPostBody = {
        type: "now",
        date: new Date().toISOString(),
        shortLink: false,
        tags: [],
        posts: [
          {
            integration: { id: REDDIT_CHANNEL_ID },
            value: [
              {
                content: redditContent,
                image: [
                  {
                    id: uploadResult.id,
                    path: uploadResult.path || uploadResult.url
                  }
                ]
              }
            ],
            settings: {
              "__type": "reddit",
              "subreddit": [
                {
                  "value": {
                    "subreddit": REDDIT_SUBREDDIT,
                    "title": redditTitle,
                    "type": "video",
                    "url": "",
                    "is_flair_required": false,
                    "flair": null
                  }
                }
              ]
            },
            group: `neonvideo-reddit-${Date.now()}`
          }
        ]
      };

      console.log(`[POSTIZ] Reddit post body:`, JSON.stringify(redditPostBody, null, 2));

      const redditResponse = await fetch("https://api.postiz.com/public/v1/posts", {
        method: "POST",
        headers: {
          "Authorization": POSTIZ_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(redditPostBody)
      });

      const redditResponseText = await redditResponse.text();
      console.log(`[POSTIZ] Reddit post response status: ${redditResponse.status}`);
      console.log(`[POSTIZ] Reddit post response:`, redditResponseText);

      if (redditResponse.ok) {
        const redditResult = JSON.parse(redditResponseText);
        redditPostId = redditResult.id || redditResult.data?.id || null;
        redditPostedTime = new Date();
        console.log(`[POSTIZ] ✅ Successfully posted to Reddit. Post ID: ${redditPostId}`);
      } else {
        console.error(`[POSTIZ] ⚠️ Reddit post failed (${redditResponse.status}): ${redditResponseText}`);
      }
    } catch (redditError) {
      console.error(`[POSTIZ] ⚠️ Reddit post error (isolated, other platforms succeeded):`, redditError);
    }

    // Record the post in database
    const now = new Date();
    if (existingPost) {
      await storage.updatePostizPost(projectId, {
        postedFacebook: now,
        postedYoutube: now,
        postedTiktok: now,
        postedReddit: redditPostedTime,
        facebookPostId: postId,
        youtubePostId: postId,
        tiktokPostId: postId,
        redditPostId: redditPostId
      });
      console.log(`[POSTIZ] ✅ Updated post record for project ${projectId} - marked as posted to all platforms at ${now.toISOString()}`);
    } else {
      await storage.createPostizPost({
        projectId: projectId,
        postedFacebook: now,
        postedYoutube: now,
        postedTiktok: now,
        postedReddit: redditPostedTime,
        facebookPostId: postId,
        youtubePostId: postId,
        tiktokPostId: postId,
        redditPostId: redditPostId
      });
      console.log(`[POSTIZ] ✅ Created post record for project ${projectId} - marked as posted to all platforms at ${now.toISOString()}`);
    }

    return { postId, projectTitle: project.title, videoUrl: project.finalVideoUrl };
  }

  // Admin endpoint to post a specific video to social media
  app.post("/api/admin/videos/:id/post-to-social", authenticateAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      // Check if already posted to all platforms
      const postRecord = await storage.getPostizPostByProjectId(id);
      if (postRecord && postRecord.postedFacebook && postRecord.postedYoutube && postRecord.postedTiktok && postRecord.postedReddit) {
        return res.status(400).json({
          success: false,
          error: "This video has already been posted to all platforms",
          alreadyPosted: true
        });
      }

      const result = await postVideoToPostiz(id);

      res.json({
        success: true,
        message: "Video posted to Facebook, YouTube, TikTok, and Reddit successfully",
        video: {
          id: id,
          title: result.projectTitle,
          url: result.videoUrl
        },
        postId: result.postId
      });
    } catch (error) {
      console.error("[POSTIZ] Admin post error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Cron endpoint for auto-posting videos to social media
  app.post("/api/cron/auto-post-to-social", async (req, res) => {
    try {
      console.log("[AUTO-POST] Starting auto-post job at", new Date().toISOString());

      // Get all completed videos that haven't been posted yet
      const allProjects = await storage.getAllProjects();
      const completedVideos = allProjects.filter(p =>
        p.isCompleted &&
        p.finalVideoUrl &&
        p.isPublic !== false // Only include public videos (true or undefined for backwards compatibility)
      );

      console.log(`[AUTO-POST] Found ${completedVideos.length} completed videos`);

      // Check which ones haven't been posted to Facebook, YouTube, TikTok, and Reddit yet
      const unpostedVideos = [];
      for (const video of completedVideos) {
        const postRecord = await storage.getPostizPostByProjectId(video.id);
        if (!postRecord || !postRecord.postedFacebook || !postRecord.postedYoutube || !postRecord.postedTiktok || !postRecord.postedReddit) {
          unpostedVideos.push(video);
        }
      }

      console.log(`[AUTO-POST] Found ${unpostedVideos.length} unposted videos`);

      if (unpostedVideos.length === 0) {
        return res.json({
          success: true,
          message: "No videos to post",
          posted: 0
        });
      }

      // Sort by creation date DESC and get the first one
      const videoToPost = unpostedVideos.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      console.log(`[AUTO-POST] Selected video to post: ${videoToPost.id} - ${videoToPost.title}`);

      // Use the helper function to post
      const result = await postVideoToPostiz(videoToPost.id);

      res.json({
        success: true,
        message: "Video posted to Facebook, YouTube, TikTok, and Reddit successfully",
        posted: 1,
        video: {
          id: videoToPost.id,
          title: result.projectTitle,
          url: result.videoUrl
        },
        postId: result.postId
      });

    } catch (error) {
      console.error("[AUTO-POST] Error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Middleware to extract token from URL query and set as Authorization header
  function extractTokenFromUrl(req: any, res: any, next: any) {
    if (!req.headers['authorization'] && req.query.token) {
      req.headers['authorization'] = `Bearer ${req.query.token}`;
    }
    next();
  }

  // Background function to process auto-generated video
  async function processAutoGenerateVideo(
    userId: string,
    projectId: string,
    generatedPrompt: string,
    parsed: any,
    style: string,
    aspectRatio: string,
    videoQuality: string,
    targetDuration: number
  ): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      const userEmail = user?.email;
      const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';

      // Step 3: Generate lyrics and title
      const lyricsPrompt = parsed.song_title
        ? `${parsed.song_title}. ${parsed.video_description}`
        : parsed.video_description || generatedPrompt;
      console.log(`[AUTO-GENERATE] Step 3: Generating lyrics and title with OpenAI for ${targetDuration}s...`);
      const { lyrics, title: aiGeneratedTitle } = await generateLyricsWithTitle(lyricsPrompt, targetDuration);
      await storage.updateProject(projectId, {
        audioLyrics: lyrics,
        title: aiGeneratedTitle,
        audioDuration: targetDuration,
        currentStep: 1
      });
      console.log(`[AUTO-GENERATE] Generated lyrics (${lyrics.length} chars) and title: ${aiGeneratedTitle}`);

      // Step 4: Generate song with Minimax Music 02 (single song, then trim to target duration)
      // Use song_description for the music prompt (genre, mood, instruments), not video_description
      console.log(`[AUTO-GENERATE] Step 4: Generating song with Minimax Music 02...`);
      const vocalGender = inferCharacterVocalGender(parsed.character);

      let songDescriptionForMusic = parsed.song_description || parsed.video_description || generatedPrompt;

      if (vocalGender === "female" && !/female (singer|voice)/i.test(songDescriptionForMusic)) {
        songDescriptionForMusic = `${songDescriptionForMusic} Featuring a female singer with a female voice.`;
      } else if (vocalGender === "male" && !/male (singer|voice)/i.test(songDescriptionForMusic)) {
        songDescriptionForMusic = `${songDescriptionForMusic} Featuring a male singer with a male voice.`;
      }

      const songTags = parsed.song_title
        ? `${parsed.song_title}. ${songDescriptionForMusic}`
        : songDescriptionForMusic;

      // Generate a single song (no longer generating 2 and picking the best). Pass "" for description to avoid duplicating song_description in the prompt.
      const songResult = await generateSingleSong(songTags, lyrics, "", 1);
      const originalSongDuration = songResult.duration;
      console.log(`[AUTO-GENERATE] Song generated: ${originalSongDuration}s`);

      // Step 4.5: Trim the generated song to target duration (default 45 seconds for auto-generate)
      const trimDuration = targetDuration;
      console.log(`[AUTO-GENERATE] Step 4.5: Trimming audio to exactly ${trimDuration} seconds (0ms to ${trimDuration * 1000}ms)...`);

      const startTime = 0; // Start at 0 seconds
      const endTime = trimDuration * 1000; // End at target duration (in milliseconds)
      const adjustedEndTime = Math.max(startTime + 10, endTime - 10); // Subtract 10ms to prevent exceeding duration

      const { splitAudioByTime } = await import("./services/ffmpeg");
      const trimResult = await splitAudioByTime(songResult.audioUrl, startTime, adjustedEndTime);

      // Download the trimmed audio
      const trimmedResponse = await fetch(trimResult.download_url);
      const trimmedBuffer = Buffer.from(await trimmedResponse.arrayBuffer());

      // Upload trimmed audio to object storage
      const objectStorageService = new ObjectStorageService();
      const audioPath = `songs/${crypto.randomUUID()}.mp3`;
      const trimmedUrl = await objectStorageService.uploadAudioBuffer(trimmedBuffer, audioPath);

      // Get public URL
      const publicAudioUrl = trimmedUrl.startsWith('http')
        ? trimmedUrl
        : await objectStorageService.getSignedUrlForPath(`/objects/${audioPath}`, 86400);

      // Get duration of trimmed audio
      const { getAudioDurationFromFile } = await import("./services/ffmpeg");
      const tempFilePath = path.join(uploadDir, `trimmed-${crypto.randomUUID()}.mp3`);
      fs.writeFileSync(tempFilePath, trimmedBuffer);
      const trimmedDuration = await getAudioDurationFromFile(tempFilePath);
      fs.unlinkSync(tempFilePath); // Clean up temp file

      console.log(`[AUTO-GENERATE] Audio trimmed successfully: ${trimmedDuration}s`);

      // Update project with trimmed audio (target duration for auto-generate, default 45s)
      await storage.updateProject(projectId, {
        audioUrl: publicAudioUrl,
        audioDuration: trimmedDuration,
        currentStep: 2
      });

      const actualSongDuration = trimmedDuration; // Use trimmed duration for subsequent steps

      // Step 5: Generate character image
      const characterDescription = parsed.character || generatedPrompt;

      // Validate character description for inappropriate content
      validateCharacterGenerationPrompt(characterDescription);

      console.log(`[AUTO-GENERATE] Step 5: Generating character image...`);
      const characterImageUrls = await generateCharacterImages(characterDescription, aspectRatio, style);
      const characterImageUrl = characterImageUrls[0];

      await storage.updateProject(projectId, {
        characterImageUrl,
        currentStep: 3
      });
      console.log(`[AUTO-GENERATE] Character image generated`);

      const { numberOfSegments: numberOfScenes, segmentDurations } = calculateVideoSegments(actualSongDuration);
      console.log(`[AUTO-GENERATE] Calculated ${numberOfScenes} scenes for ${actualSongDuration}s video`);

      // Step 6: Generate scene prompts
      console.log(`[AUTO-GENERATE] Step 6: Generating scene prompts...`);
      const scenePrompts = await generateScenePrompts(
        parsed.video_description || generatedPrompt,
        numberOfScenes
      );

      // Step 7: Generate scene images
      console.log(`[AUTO-GENERATE] Step 7: Generating scene images...`);
      const sceneImages = await generateSceneImages(
        scenePrompts,
        characterImageUrl,
        aspectRatio
      );

      await storage.updateProject(projectId, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages,
        currentStep: 4
      });
      console.log(`[AUTO-GENERATE] Generated ${sceneImages.length} scene images`);

      // Step 8: Generate final video
      console.log(`[AUTO-GENERATE] Step 8: Triggering final video generation...`);

      await storage.updateProject(projectId, {
        currentStep: 5,
        isCompleted: false
      });

      // Trigger video generation asynchronously
      let finalVideoUrl: string | null = null;
      let videoError: string | null = null;

      try {
        // Background job has no req; use env BASE_URL/API_URL or localhost
        const baseUrl = getBaseUrl();
        const videoGenResponse = await fetch(`${baseUrl}/api/projects/${projectId}/generate-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });

        if (videoGenResponse.ok) {
          console.log(`[AUTO-GENERATE] Video generation completed for project ${projectId}`);
          // Fetch the updated project to get the final video URL
          const updatedProject = await storage.getProject(projectId);
          if (updatedProject && updatedProject.finalVideoUrl) {
            finalVideoUrl = updatedProject.finalVideoUrl;
            console.log(`[AUTO-GENERATE] Final video URL retrieved: ${finalVideoUrl}`);
          } else {
            console.log(`[AUTO-GENERATE] Warning: Project updated but finalVideoUrl is missing. isCompleted: ${updatedProject?.isCompleted}`);
          }
        } else {
          const errorData = await videoGenResponse.json();
          console.error(`[AUTO-GENERATE] Video generation failed:`, errorData);
          videoError = errorData.error || errorData.message || "Video generation failed";
        }
      } catch (error) {
        console.error(`[AUTO-GENERATE] Video generation failed:`, error);
        videoError = error instanceof Error ? error.message : String(error);
      }

      console.log(`[AUTO-GENERATE] All steps completed! Project ${projectId} finished.`);

      // Send email notification
      if (userEmail) {
        if (videoError) {
          // Send failure email
          await emailService.sendEmail({
            to: userEmail,
            subject: 'Your auto-generated video failed',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #f44336; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0;">Video Generation Failed</h1>
                </div>
                <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="font-size: 16px; color: #333;">
                    We're sorry, but your auto-generated video failed to complete.
                  </p>
                  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Error:</strong> ${videoError}</p>
                  </div>
                  <p style="font-size: 14px; color: #666;">
                    You can try generating a new video or contact support if this issue persists.
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${baseUrl}/projects/${projectId}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                      View Project
                    </a>
                  </div>
                </div>
              </div>
            `
          });
        } else if (finalVideoUrl) {
          // Send success email
          await emailService.sendEmail({
            to: userEmail,
            subject: 'Your auto-generated video is ready! 🎉',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0;">Your Video is Ready! 🎉</h1>
                </div>
                <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="font-size: 16px; color: #333;">
                    Great news! Your auto-generated music video has been completed successfully.
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${baseUrl}/projects/${projectId}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
                      Watch Your Video
                    </a>
                  </div>
                  <p style="font-size: 14px; color: #666; text-align: center;">
                    Or copy this link: <a href="${baseUrl}/projects/${projectId}">${baseUrl}/projects/${projectId}</a>
                  </p>
                </div>
              </div>
            `
          });
        }
      }
    } catch (error: any) {
      console.error(`[AUTO-GENERATE] Background processing error:`, error);

      // Send error email if user email is available
      try {
        const user = await storage.getUser(userId);
        if (user?.email) {
          const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
          await emailService.sendEmail({
            to: user.email,
            subject: 'Your auto-generated video encountered an error',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #f44336; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0;">Video Generation Error</h1>
                </div>
                <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="font-size: 16px; color: #333;">
                    We encountered an error while processing your auto-generated video.
                  </p>
                  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Error:</strong> ${error.message || "Unknown error occurred"}</p>
                  </div>
                  <p style="font-size: 14px; color: #666;">
                    Please try generating a new video or contact support if this issue persists.
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${baseUrl}/projects/${projectId}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                      View Project
                    </a>
                  </div>
                </div>
              </div>
            `
          });
        }
      } catch (emailError) {
        console.error(`[AUTO-GENERATE] Failed to send error email:`, emailError);
      }
    }
  }

  // Auto-generate random video - generates a creative prompt with OpenAI and creates a video
  app.get("/api/auto-generate-video", extractTokenFromUrl, authenticateToken, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const userId = req.user!.userId;
      const { style: requestedStyle, aspectRatio: requestedAspectRatio, duration: requestedDurationParam, quality: requestedQuality } = req.query;

      // Parse and validate video quality (default medium, options: medium, premium)
      const validQualities = ["medium", "premium"];
      const videoQuality = validQualities.includes(requestedQuality) ? requestedQuality : "medium";
      console.log(`[AUTO-GENERATE] Video quality: ${videoQuality}`);

      // Parse and validate duration (default 45 seconds, max 60 seconds for auto-generate)
      let targetDuration = 45;
      if (requestedDurationParam) {
        const parsedDuration = parseInt(requestedDurationParam, 10);
        if (!isNaN(parsedDuration) && parsedDuration >= 15 && parsedDuration <= 60) {
          targetDuration = parsedDuration;
        }
      }
      console.log(`[AUTO-GENERATE] Target duration: ${targetDuration} seconds`);

      console.log(`[AUTO-GENERATE] Starting auto video generation for user ${userId}`);

      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Generate a random creative music video prompt optimized for vertical format
      console.log(`[AUTO-GENERATE] Generating random creative prompt with OpenAI...`);

      const promptResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a creative music video concept generator. Generate a unique, creative, and fun music video concept optimized for VERTICAL video format (like TikTok/Reels/Shorts).

Include:
- A detailed character description (appearance, personality, style) - make them visually striking and memorable
- A video/song theme or story that works well in vertical format (focus on the character, close-ups, dynamic movements)
- The mood and visual style

Be creative and diverse! Mix genres, styles, time periods. Examples:
- A neon-lit cyberpunk DJ with glowing tattoos spinning in a futuristic club
- A magical ice queen with crystalline hair in a frozen palace
- A streetwear-wearing dragon dancing in a graffiti alley
- A golden pharaoh emerging from ancient ruins with cosmic powers
- A bioluminescent mermaid singing in an underwater city

Keep the response under 150 words. Be vivid, specific, and visually dramatic.`
          },
          {
            role: "user",
            content: "Generate a unique and creative music video concept that hasn't been done before. Make it visually stunning and perfect for vertical video format!"
          }
        ],
        temperature: 1.2, // High temperature for more creativity/randomness
        max_tokens: 350
      });

      const generatedPrompt = promptResponse.choices[0].message.content || "";
      console.log(`[AUTO-GENERATE] Generated prompt: ${generatedPrompt}`);

      if (!generatedPrompt || generatedPrompt.trim().length === 0) {
        return res.status(500).json({ error: "Failed to generate creative prompt" });
      }

      // Always use vertical format (9:16) for this endpoint
      const aspectRatio = "9:16";

      // Allowed styles for auto-generate endpoint
      const allowedStyles = ["3d", "radiant", "hyperrealistic", "realistic"];
      let style: string;
      if (requestedStyle && allowedStyles.includes(requestedStyle)) {
        style = requestedStyle;
        console.log(`[AUTO-GENERATE] Requested style "${requestedStyle}" is valid, using it`);
      } else {
        // Pick a random style from the allowed options
        const randomIndex = Math.floor(Math.random() * allowedStyles.length);
        style = allowedStyles[randomIndex];
        console.log(`[AUTO-GENERATE] No valid style requested (got: "${requestedStyle}"), randomly selected index ${randomIndex} = "${style}" from ${JSON.stringify(allowedStyles)}`);
      }

      console.log(`[AUTO-GENERATE] Using style: ${style}, aspectRatio: ${aspectRatio}`);

      // Now process like the regular single-prompt endpoint
      console.log(`[AUTO-GENERATE] Step 1: Parsing generated prompt with OpenAI...`);

      const parseResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that extracts structured information from music video prompts. 
            Extract the following from the user's prompt:
            - character: A detailed description of the main character (appearance, style, personality) - REQUIRED
            - video_description: What the music video should be about (scenes, mood, story) - REQUIRED
            - song_title: The title or theme of the song - OPTIONAL (can be null if not specified)
            - song_description: A short description for MUSIC generation only (genre, mood, tempo, instruments, vocal style). 1-2 sentences on how the music should SOUND, not the video visuals. E.g. "Epic orchestral with brass and strings, grand crescendo, cinematic." Derive from the theme/mood if not explicit. - REQUIRED (infer if missing). IMPORTANT: If the main character clearly appears female, explicitly mention a female singer or female voice in the song_description (e.g. "female singer", "female voice"). If the main character clearly appears male, explicitly mention a male singer or male voice (e.g. "male singer", "male voice"). If the character's gender is unclear or non-binary, keep the vocal description gender-neutral.
            
            Only mark character and video_description as missing if they are truly unclear or absent.
            Song title is optional. song_description must always be provided (infer from mood/theme if needed).
            Respond ONLY with valid JSON in this format:
            {
              "character": "description or null",
              "song_title": "title or null", 
              "video_description": "description or null",
              "song_description": "1-2 sentences for music generation API (genre, mood, instruments, vocal style, and when clear the singer's gender so that it matches the main character)",
              "missing": ["list of REQUIRED missing elements only"],
              "suggestion": "helpful suggestion if anything is missing"
            }`
          },
          {
            role: "user",
            content: generatedPrompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(parseResponse.choices[0].message.content || "{}");
      // Fallback: if parser didn't return song_description, use video_description so Minimax still gets something
      if (!parsed.song_description || !parsed.song_description.trim()) {
        parsed.song_description = parsed.video_description || "";
      }
      console.log(`[AUTO-GENERATE] Parsed prompt:`, parsed);

      // Step 2: Create a new project
      console.log(`[AUTO-GENERATE] Step 2: Creating project...`);
      const project = await storage.createProject({
        userId,
        title: parsed.song_title || parsed.video_description?.substring(0, 50) || "Auto-Generated Video",
        description: parsed.video_description || generatedPrompt,
        aspectRatio: aspectRatio,
        videoQuality: videoQuality,
        currentStep: 1
      });
      console.log(`[AUTO-GENERATE] Created project ${project.id}`);

      // Start background processing (fire and forget)
      processAutoGenerateVideo(
        userId,
        project.id,
        generatedPrompt,
        parsed,
        style,
        aspectRatio,
        videoQuality,
        targetDuration
      ).catch((error) => {
        console.error(`[AUTO-GENERATE] Background processing failed:`, error);
      });

      // Return immediately with project info
      const timestamp = new Date().toISOString();
      res.json({
        success: true,
        projectId: project.id,
        message: "Auto-generated video is being processed. You will receive an email when it's ready!",
        generatedPrompt: generatedPrompt,
        timestamp: timestamp,
        statusUrl: `/api/neon-single-prompt/status/${project.id}`,
        projectUrl: `${process.env.FRONTEND_URL || 'https://neonvideo.ai'}/projects/${project.id}`,
        details: {
          character: parsed.character,
          video_description: parsed.video_description,
          song_description: parsed.song_description || null,
          style: style,
          quality: videoQuality
        }
      });

    } catch (error: any) {
      console.error(`[AUTO-GENERATE] Error:`, error);
      const timestamp = new Date().toISOString();
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to auto-generate video",
        timestamp: timestamp
      });
    }
  });

  // CORS preflight for NeonSinglePrompt endpoint
  app.options("/api/neon-single-prompt", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  // NeonSinglePrompt: Generate complete music video from a single prompt (GET with token in URL for cron jobs)
  app.get("/api/neon-single-prompt", extractTokenFromUrl, authenticateToken, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const { prompt, aspectRatio: requestedAspectRatio, style: requestedStyle } = req.query;
      const userId = req.user!.userId;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({
          error: "Please provide a prompt describing your music video"
        });
      }

      const validAspectRatios = ["16:9", "9:16"];
      const validStyles = ["3d", "cartoon", "realistic", "artistic", "radiant", "anime", "hyperrealistic"];

      const aspectRatio = validAspectRatios.includes(requestedAspectRatio) ? requestedAspectRatio : "16:9";

      let style: string;
      if (validStyles.includes(requestedStyle)) {
        style = requestedStyle;
      } else {
        const promptLower = prompt.toLowerCase();
        if (promptLower.includes("hyper realistic") || promptLower.includes("hyperrealistic") || promptLower.includes("hyper-realistic")) {
          style = "hyperrealistic";
        } else if (promptLower.includes("realistic")) {
          style = "realistic";
        } else if (promptLower.includes("anime")) {
          style = "anime";
        } else if (promptLower.includes("cartoon")) {
          style = "cartoon";
        } else {
          style = "3d";
        }
      }

      console.log(`[NEON-SINGLE-PROMPT-GET] Starting video generation for user ${userId}`);
      console.log(`[NEON-SINGLE-PROMPT-GET] Prompt: ${prompt}`);
      console.log(`[NEON-SINGLE-PROMPT-GET] Aspect Ratio: ${aspectRatio}, Style: ${style}`);

      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      console.log(`[NEON-SINGLE-PROMPT-GET] Step 1: Parsing prompt with OpenAI...`);

      const parseResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that extracts structured information from music video prompts. 
            Extract the following from the user's prompt:
            - character: A detailed description of the main character (appearance, style, personality) - REQUIRED
            - video_description: What the music video should be about (scenes, mood, story) - REQUIRED
            - song_title: The title or theme of the song - OPTIONAL (can be null if not specified)
            - song_description: A short description for MUSIC generation only (genre, mood, tempo, instruments, vocal style). 1-2 sentences on how the music should SOUND, not the video visuals. E.g. "Epic orchestral with brass and strings, grand crescendo, cinematic." Derive from the theme/mood if not explicit. - REQUIRED (infer if missing)
            
            Only mark character and video_description as missing if they are truly unclear or absent.
            Song title is optional. song_description must always be provided (infer from mood/theme if needed).
            Respond ONLY with valid JSON in this format:
            {
              "character": "description or null",
              "song_title": "title or null", 
              "video_description": "description or null",
              "song_description": "1-2 sentences for music generation API (genre, mood, instruments)",
              "missing": ["list of REQUIRED missing elements only"],
              "suggestion": "helpful suggestion if anything is missing"
            }`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(parseResponse.choices[0].message.content || "{}");
      if (!parsed.song_description || !parsed.song_description.trim()) {
        parsed.song_description = parsed.video_description || "";
      }
      console.log(`[NEON-SINGLE-PROMPT-GET] Parsed prompt:`, parsed);

      const requiredMissing = parsed.missing?.filter((item: string) => item !== 'song_title') || [];

      if (requiredMissing.length > 0) {
        console.log(`[NEON-SINGLE-PROMPT-GET] Missing required elements:`, requiredMissing);
        return res.status(400).json({
          error: "Incomplete prompt",
          missing: requiredMissing,
          suggestion: parsed.suggestion || "Please provide a character description and video description.",
          example: "Create a music video about a cute little cowboy hamster in the wild west."
        });
      }

      // Step 2: Create a new project
      console.log(`[NEON-SINGLE-PROMPT-GET] Step 2: Creating project...`);
      const project = await storage.createProject({
        userId,
        title: parsed.song_title || parsed.video_description.substring(0, 50),
        description: parsed.video_description,
        aspectRatio: aspectRatio,
        currentStep: 1
      });
      console.log(`[NEON-SINGLE-PROMPT-GET] Created project ${project.id}`);

      // Step 3: Generate lyrics and title
      const lyricsPrompt = parsed.song_title
        ? `${parsed.song_title}. ${parsed.video_description}`
        : parsed.video_description;
      console.log(`[NEON-SINGLE-PROMPT-GET] Step 3: Generating lyrics and title with OpenAI...`);
      const { lyrics, title: aiGeneratedTitle } = await generateLyricsWithTitle(lyricsPrompt, 30);
      await storage.updateProject(project.id, {
        audioLyrics: lyrics,
        title: aiGeneratedTitle,
        audioDuration: 30,
        currentStep: 1
      });
      console.log(`[NEON-SINGLE-PROMPT-GET] Generated lyrics (${lyrics.length} chars) and title: ${aiGeneratedTitle}`);

      // Step 4: Generate song with Minimax Music 02 (single song, then trim to 30 seconds)
      // Use song_description for the music prompt (genre, mood, instruments), not video_description
      console.log(`[NEON-SINGLE-PROMPT-GET] Step 4: Generating song with Minimax Music 02...`);
      const songDescriptionForMusic = parsed.song_description || parsed.video_description;
      const songTags = parsed.song_title
        ? `${parsed.song_title}. ${songDescriptionForMusic}`
        : songDescriptionForMusic;

      // Generate a single song (no retries unless it fails). Pass "" for description to avoid duplicating song_description in the prompt.
      const songResult = await generateSingleSong(songTags, lyrics, "", 1);
      console.log(`[NEON-SINGLE-PROMPT-GET] Song generated: ${songResult.duration}s`);

      // Step 4.5: Trim the generated song to exactly 30 seconds (0ms to 30000ms)
      const trimDuration = 30; // Always 30 seconds for cron job
      console.log(`[NEON-SINGLE-PROMPT-GET] Step 4.5: Trimming audio to exactly ${trimDuration} seconds (0ms to ${trimDuration * 1000}ms)...`);

      const startTime = 0; // Start at 0 seconds
      const endTime = trimDuration * 1000; // End at 30 seconds (in milliseconds)
      const adjustedEndTime = Math.max(startTime + 10, endTime - 10); // Subtract 10ms to prevent exceeding duration

      const { splitAudioByTime } = await import("./services/ffmpeg");
      const trimResult = await splitAudioByTime(songResult.audioUrl, startTime, adjustedEndTime);

      // Download the trimmed audio
      const trimmedResponse = await fetch(trimResult.download_url);
      const trimmedBuffer = Buffer.from(await trimmedResponse.arrayBuffer());

      // Upload trimmed audio to object storage
      const objectStorageService = new ObjectStorageService();
      const audioPath = `songs/${crypto.randomUUID()}.mp3`;
      const trimmedUrl = await objectStorageService.uploadAudioBuffer(trimmedBuffer, audioPath);

      // Get public URL
      const publicAudioUrl = trimmedUrl.startsWith('http')
        ? trimmedUrl
        : await objectStorageService.getSignedUrlForPath(`/objects/${audioPath}`, 86400);

      // Get duration of trimmed audio
      const { getAudioDurationFromFile } = await import("./services/ffmpeg");
      const tempFilePath = path.join(uploadDir, `trimmed-${crypto.randomUUID()}.mp3`);
      fs.writeFileSync(tempFilePath, trimmedBuffer);
      const trimmedDuration = await getAudioDurationFromFile(tempFilePath);
      fs.unlinkSync(tempFilePath); // Clean up temp file

      console.log(`[NEON-SINGLE-PROMPT-GET] Audio trimmed successfully: ${trimmedDuration}s`);

      // Update project with trimmed audio (always 30 seconds for cron job)
      await storage.updateProject(project.id, {
        audioUrl: publicAudioUrl,
        audioDuration: trimmedDuration,
        currentStep: 2
      });
      console.log(`[NEON-SINGLE-PROMPT-GET] Song generated and trimmed to ${trimmedDuration} seconds`);

      const actualSongDuration = trimmedDuration; // Use trimmed duration (30 seconds) for subsequent steps

      // Step 5: Generate character image with style support
      // Validate character description for inappropriate content
      validateCharacterGenerationPrompt(parsed.character);

      let characterImageUrl: string;

      if (style === "hyperrealistic") {
        console.log(`[NEON-SINGLE-PROMPT-GET] Step 5a: Generating realistic base image for "${parsed.character}" with aspectRatio: ${aspectRatio}...`);
        const realisticImageUrls = await generateCharacterImages(parsed.character, aspectRatio, "realistic");
        const realisticImageUrl = realisticImageUrls[0];
        console.log(`[NEON-SINGLE-PROMPT-GET] Realistic base image generated: ${realisticImageUrl}`);

        console.log(`[NEON-SINGLE-PROMPT-GET] Step 5b: Enhancing to hyper realistic...`);
        const enhancedImageUrl = await enhanceImageHyperReal(realisticImageUrl, parsed.character);

        const storedImage = await downloadAndStoreImage(enhancedImageUrl, "characters");
        characterImageUrl = storedImage.storedUrl;
        console.log(`[NEON-SINGLE-PROMPT-GET] Hyper realistic character image generated: ${characterImageUrl}`);
      } else {
        console.log(`[NEON-SINGLE-PROMPT-GET] Step 5: Generating character image for "${parsed.character}" with aspectRatio: ${aspectRatio}, style: ${style}...`);
        const characterImageUrls = await generateCharacterImages(parsed.character, aspectRatio, style);
        characterImageUrl = characterImageUrls[0];
        console.log(`[NEON-SINGLE-PROMPT-GET] Character image generated`);
      }

      await storage.updateProject(project.id, {
        characterImageUrl,
        currentStep: 3
      });

      const { numberOfSegments: numberOfScenes, segmentDurations } = calculateVideoSegments(actualSongDuration);
      console.log(`[NEON-SINGLE-PROMPT-GET] Dynamically calculated ${numberOfScenes} scenes for ${actualSongDuration}s video (segments: ${segmentDurations.join(', ')}s)`);

      // Step 6: Generate scene prompts
      console.log(`[NEON-SINGLE-PROMPT-GET] Step 6: Generating scene prompts...`);
      const scenePrompts = await generateScenePrompts(
        parsed.video_description,
        numberOfScenes
      );

      console.log(`[NEON-SINGLE-PROMPT-GET] Generated ${scenePrompts.length} scene prompts`);

      // Step 7: Generate scene images
      console.log(`[NEON-SINGLE-PROMPT-GET] Step 7: Generating scene images with aspectRatio: ${aspectRatio}...`);
      const sceneImages = await generateSceneImages(
        scenePrompts,
        characterImageUrl,
        aspectRatio
      );

      await storage.updateProject(project.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages,
        currentStep: 4
      });
      console.log(`[NEON-SINGLE-PROMPT-GET] Generated ${sceneImages.length} scene images`);

      // Step 8: Generate final video
      console.log(`[NEON-SINGLE-PROMPT-GET] Step 8: Generating final music video...`);

      await storage.updateProject(project.id, {
        currentStep: 5,
        isCompleted: false
      });

      // Trigger video generation asynchronously
      (async () => {
        try {
          const baseUrl = getBaseUrl(req);
          const videoGenResponse = await fetch(`${baseUrl}/api/projects/${project.id}/generate-video`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            }
          });

          if (videoGenResponse.ok) {
            console.log(`[NEON-SINGLE-PROMPT-GET] Video generation completed for project ${project.id}`);
          } else {
            const errorData = await videoGenResponse.json();
            console.error(`[NEON-SINGLE-PROMPT-GET] Video generation failed with status ${videoGenResponse.status}:`, errorData);
          }
        } catch (error) {
          console.error(`[NEON-SINGLE-PROMPT-GET] Video generation failed:`, error);
        }
      })();

      console.log(`[NEON-SINGLE-PROMPT-GET] All steps completed! Project ${project.id} is processing final video.`);

      res.json({
        success: true,
        projectId: project.id,
        message: "Music video generation started! The video is being created in the background.",
        statusUrl: `/api/neon-single-prompt/status/${project.id}`,
        details: {
          character: parsed.character,
          song_title: parsed.song_title,
          video_description: parsed.video_description,
          lyrics: lyrics.substring(0, 100) + "...",
          sceneCount: sceneImages.length
        }
      });

    } catch (error: any) {
      console.error(`[NEON-SINGLE-PROMPT-GET] Error:`, error);
      return res.status(500).json({ error: error.message || "Failed to process request" });
    }
  });

  // NeonSinglePrompt: Generate complete music video from a single prompt (POST - main endpoint)
  app.post("/api/neon-single-prompt", extractTokenFromUrl, authenticateToken, async (req, res) => {
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const { prompt, aspectRatio: requestedAspectRatio, style: requestedStyle } = req.body;
      const userId = req.user!.userId;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({
          error: "Please provide a prompt describing your music video"
        });
      }

      const validAspectRatios = ["16:9", "9:16"];
      const validStyles = ["3d", "cartoon", "realistic", "artistic", "radiant", "anime", "hyperrealistic"];

      const aspectRatio = validAspectRatios.includes(requestedAspectRatio) ? requestedAspectRatio : "16:9";

      // Auto-detect style from prompt if not explicitly provided
      let style: string;
      if (validStyles.includes(requestedStyle)) {
        style = requestedStyle;
      } else {
        // Check if prompt mentions "hyper realistic" or "hyperrealistic"
        const promptLower = prompt.toLowerCase();
        if (promptLower.includes("hyper realistic") || promptLower.includes("hyperrealistic") || promptLower.includes("hyper-realistic")) {
          style = "hyperrealistic";
          console.log(`[NEON-SINGLE-PROMPT] Auto-detected hyperrealistic style from prompt`);
        } else if (promptLower.includes("realistic")) {
          style = "realistic";
          console.log(`[NEON-SINGLE-PROMPT] Auto-detected realistic style from prompt`);
        } else if (promptLower.includes("anime")) {
          style = "anime";
          console.log(`[NEON-SINGLE-PROMPT] Auto-detected anime style from prompt`);
        } else if (promptLower.includes("cartoon")) {
          style = "cartoon";
          console.log(`[NEON-SINGLE-PROMPT] Auto-detected cartoon style from prompt`);
        } else {
          style = "3d"; // Default
        }
      }

      console.log(`[NEON-SINGLE-PROMPT] Starting video generation for user ${userId}`);
      console.log(`[NEON-SINGLE-PROMPT] Prompt: ${prompt}`);
      console.log(`[NEON-SINGLE-PROMPT] Aspect Ratio: ${aspectRatio}, Style: ${style}`);

      // Import OpenAI dynamically to ensure it's available
      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Step 1: Parse prompt with OpenAI to extract character, song_title, and video_description
      console.log(`[NEON-SINGLE-PROMPT] Step 1: Parsing prompt with OpenAI...`);

      const parseResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that extracts structured information from music video prompts. 
            Extract the following from the user's prompt:
            - character: A detailed description of the main character (appearance, style, personality) - REQUIRED
            - video_description: What the music video should be about (scenes, mood, story) - REQUIRED
            - song_title: The title or theme of the song - OPTIONAL (can be null if not specified)
            - song_description: A short description for MUSIC generation only (genre, mood, tempo, instruments, vocal style). 1-2 sentences on how the music should SOUND, not the video visuals. E.g. "Epic orchestral with brass and strings, grand crescendo, cinematic." Derive from the theme/mood if not explicit. - REQUIRED (infer if missing)
            
            Only mark character and video_description as missing if they are truly unclear or absent.
            Song title is optional. song_description must always be provided (infer from mood/theme if needed).
            Respond ONLY with valid JSON in this format:
            {
              "character": "description or null",
              "song_title": "title or null", 
              "video_description": "description or null",
              "song_description": "1-2 sentences for music generation API (genre, mood, instruments)",
              "missing": ["list of REQUIRED missing elements only"],
              "suggestion": "helpful suggestion if anything is missing"
            }`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(parseResponse.choices[0].message.content || "{}");
      if (!parsed.song_description || !parsed.song_description.trim()) {
        parsed.song_description = parsed.video_description || "";
      }
      console.log(`[NEON-SINGLE-PROMPT] Parsed prompt:`, parsed);

      // Filter out song_title from missing elements since it's optional
      const requiredMissing = parsed.missing?.filter((item: string) => item !== 'song_title') || [];

      // Check if we have all required elements (character and video_description only)
      if (requiredMissing.length > 0) {
        console.log(`[NEON-SINGLE-PROMPT] Missing required elements:`, requiredMissing);
        return res.status(400).json({
          error: "Incomplete prompt",
          missing: requiredMissing,
          suggestion: parsed.suggestion || "Please provide a character description and video description.",
          example: "Create a music video about a cute little cowboy hamster in the wild west."
        });
      }

      // Step 2: Create a new project
      console.log(`[NEON-SINGLE-PROMPT] Step 2: Creating project...`);
      const project = await storage.createProject({
        userId,
        title: parsed.song_title || parsed.video_description.substring(0, 50),
        description: parsed.video_description,
        aspectRatio: aspectRatio,
        currentStep: 1
      });
      console.log(`[NEON-SINGLE-PROMPT] Created project ${project.id}`);

      // Step 3: Generate lyrics and title
      const lyricsPrompt = parsed.song_title
        ? `${parsed.song_title}. ${parsed.video_description}`
        : parsed.video_description;
      console.log(`[NEON-SINGLE-PROMPT] Step 3: Generating lyrics and title with OpenAI...`);
      const { lyrics, title: aiGeneratedTitle } = await generateLyricsWithTitle(lyricsPrompt, 30);
      await storage.updateProject(project.id, {
        audioLyrics: lyrics,
        title: aiGeneratedTitle,
        audioDuration: 30,
        currentStep: 1
      });
      console.log(`[NEON-SINGLE-PROMPT] Generated lyrics (${lyrics.length} chars) and title: ${aiGeneratedTitle}`);

      // Step 4: Generate song with Minimax Music 02
      // Use song_description for the music prompt (genre, mood, instruments), not video_description
      // Generate 2 songs in parallel and select the one closest to the requested duration
      console.log(`[NEON-SINGLE-PROMPT] Step 4: Generating ~30-second song with Minimax Music 02 (2 candidates for best match)...`);
      const songDescriptionForMusic = parsed.song_description || parsed.video_description;
      const songTags = parsed.song_title
        ? `${parsed.song_title}. ${songDescriptionForMusic}`
        : songDescriptionForMusic;

      const songResult = await generateSongWithMinimax(songTags, lyrics, "");
      const actualSongDuration = songResult.duration;
      console.log(`[NEON-SINGLE-PROMPT] Song generated: ${actualSongDuration}s`);

      await storage.updateProject(project.id, {
        audioUrl: songResult.audioUrl,
        audioDuration: actualSongDuration,  // Store actual duration, not requested
        currentStep: 2
      });
      console.log(`[NEON-SINGLE-PROMPT] Song generated and uploaded (${actualSongDuration} seconds)`);

      // Step 5: Generate character image with style support
      // Validate character description for inappropriate content
      validateCharacterGenerationPrompt(parsed.character);

      let characterImageUrl: string;

      if (style === "hyperrealistic") {
        // Two-step process for hyper realistic: first generate realistic, then enhance
        console.log(`[NEON-SINGLE-PROMPT] Step 5a: Generating realistic base image for "${parsed.character}" with aspectRatio: ${aspectRatio}...`);
        const realisticImageUrls = await generateCharacterImages(parsed.character, aspectRatio, "realistic");
        const realisticImageUrl = realisticImageUrls[0];
        console.log(`[NEON-SINGLE-PROMPT] Realistic base image generated: ${realisticImageUrl}`);

        console.log(`[NEON-SINGLE-PROMPT] Step 5b: Enhancing to hyper realistic...`);
        const enhancedImageUrl = await enhanceImageHyperReal(realisticImageUrl, parsed.character);

        // Download and store the enhanced image
        const storedImage = await downloadAndStoreImage(enhancedImageUrl, "characters");
        characterImageUrl = storedImage.storedUrl;
        console.log(`[NEON-SINGLE-PROMPT] Hyper realistic character image generated: ${characterImageUrl}`);
      } else {
        console.log(`[NEON-SINGLE-PROMPT] Step 5: Generating character image for "${parsed.character}" with aspectRatio: ${aspectRatio}, style: ${style}...`);
        const characterImageUrls = await generateCharacterImages(parsed.character, aspectRatio, style);
        characterImageUrl = characterImageUrls[0];
        console.log(`[NEON-SINGLE-PROMPT] Character image generated`);
      }

      await storage.updateProject(project.id, {
        characterImageUrl,
        currentStep: 3
      });

      // Calculate number of scenes dynamically based on ACTUAL song duration
      // Video segments are 6 seconds, so we use calculateVideoSegments
      const { numberOfSegments: numberOfScenes, segmentDurations } = calculateVideoSegments(actualSongDuration);
      console.log(`[NEON-SINGLE-PROMPT] Dynamically calculated ${numberOfScenes} scenes for ${actualSongDuration}s video (segments: ${segmentDurations.join(', ')}s)`);

      // Step 6: Generate scene prompts
      console.log(`[NEON-SINGLE-PROMPT] Step 6: Generating scene prompts...`);
      const scenePrompts = await generateScenePrompts(
        parsed.video_description,
        numberOfScenes
      );

      console.log(`[NEON-SINGLE-PROMPT] Generated ${scenePrompts.length} scene prompts`);

      // Step 7: Generate scene images (using aspectRatio from earlier)
      console.log(`[NEON-SINGLE-PROMPT] Step 7: Generating scene images with aspectRatio: ${aspectRatio}...`);
      const sceneImages = await generateSceneImages(
        scenePrompts,
        characterImageUrl,
        aspectRatio
      );

      await storage.updateProject(project.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages,
        currentStep: 4
      });
      console.log(`[NEON-SINGLE-PROMPT] Generated ${sceneImages.length} scene images`);

      // Step 8: Generate final video
      console.log(`[NEON-SINGLE-PROMPT] Step 8: Generating final music video...`);

      // This will trigger the existing video generation pipeline
      // We'll return the project ID and let the client poll for completion
      await storage.updateProject(project.id, {
        currentStep: 5,
        isCompleted: false
      });

      // Trigger video generation asynchronously
      (async () => {
        try {
          // Call internal video generation logic
          const baseUrl = getBaseUrl(req);
          const videoGenResponse = await fetch(`${baseUrl}/api/projects/${project.id}/generate-video`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            }
          });

          if (videoGenResponse.ok) {
            console.log(`[NEON-SINGLE-PROMPT] Video generation completed for project ${project.id}`);
          } else {
            const errorData = await videoGenResponse.json();
            console.error(`[NEON-SINGLE-PROMPT] Video generation failed with status ${videoGenResponse.status}:`, errorData);
          }
        } catch (error) {
          console.error(`[NEON-SINGLE-PROMPT] Video generation failed:`, error);
        }
      })();

      console.log(`[NEON-SINGLE-PROMPT] ✅ All steps completed! Project ${project.id} is processing final video.`);

      res.json({
        success: true,
        projectId: project.id,
        message: "Music video generation started! The video is being created in the background.",
        details: {
          character: parsed.character,
          song_title: parsed.song_title,
          video_description: parsed.video_description,
          lyrics: lyrics.substring(0, 100) + "...",
          sceneCount: sceneImages.length
        }
      });

    } catch (error) {
      console.error("[NEON-SINGLE-PROMPT] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate music video"
      });
    }
  });

  // Custom single prompt endpoint with duration and subtitle support
  app.post("/api/neon-single-prompt-custom", extractTokenFromUrl, authenticateToken, async (req, res) => {
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const { prompt, aspectRatio: requestedAspectRatio, style: requestedStyle, duration: requestedDuration, addSubtitles: requestedAddSubtitles, subtitleStyle: requestedSubtitleStyle, fontFamily: requestedFontFamily, textPosition: requestedTextPosition } = req.body;
      const userId = req.user!.userId;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({
          error: "Please provide a prompt describing your music video"
        });
      }

      // Validate and set duration (15 seconds to 3 minutes = 180 seconds)
      const duration = typeof requestedDuration === 'number'
        ? Math.max(15, Math.min(180, Math.round(requestedDuration)))
        : 30; // Default to 30 seconds

      // Validate and set addSubtitles
      const addSubtitles = requestedAddSubtitles === true || requestedAddSubtitles === 'true';
      const subtitleStyle = isSubtitleStyle(requestedSubtitleStyle) ? requestedSubtitleStyle : defaultSubtitleStyle;
      const fontFamily = isGoogleFont(requestedFontFamily) ? requestedFontFamily : defaultGoogleFont;

      // Validate and set captionPosition (from textPosition)
      const validTextPositions = ["top", "center", "bottom"];
      const captionPosition = validTextPositions.includes(requestedTextPosition) ? requestedTextPosition : "bottom";

      const validAspectRatios = ["16:9", "9:16"];
      const validStyles = ["3d", "cartoon", "realistic", "artistic", "radiant", "anime", "hyperrealistic"];

      const aspectRatio = validAspectRatios.includes(requestedAspectRatio) ? requestedAspectRatio : "16:9";

      // Auto-detect style from prompt if not explicitly provided
      let style: string;
      if (validStyles.includes(requestedStyle)) {
        style = requestedStyle;
      } else {
        const promptLower = prompt.toLowerCase();
        if (promptLower.includes("hyper realistic") || promptLower.includes("hyperrealistic") || promptLower.includes("hyper-realistic")) {
          style = "hyperrealistic";
          console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Auto-detected hyperrealistic style from prompt`);
        } else if (promptLower.includes("realistic")) {
          style = "realistic";
          console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Auto-detected realistic style from prompt`);
        } else if (promptLower.includes("anime")) {
          style = "anime";
          console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Auto-detected anime style from prompt`);
        } else if (promptLower.includes("cartoon")) {
          style = "cartoon";
          console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Auto-detected cartoon style from prompt`);
        } else {
          style = "3d"; // Default
        }
      }

      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Starting video generation for user ${userId}`);
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Prompt: ${prompt}`);
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Aspect Ratio: ${aspectRatio}, Style: ${style}, Duration: ${duration}s, Subtitles: ${addSubtitles}`);

      // Import OpenAI dynamically
      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Step 1: Parse prompt with OpenAI
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Step 1: Parsing prompt with OpenAI...`);

      const parseResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant that extracts structured information from music video prompts. 
            Extract the following from the user's prompt:
            - character: A detailed description of the main character (appearance, style, personality) - REQUIRED
            - video_description: What the music video should be about (scenes, mood, story) - REQUIRED
            - song_title: The title or theme of the song - OPTIONAL (can be null if not specified)
            
            Only mark character and video_description as missing if they are truly unclear or absent.
            Song title is optional and should not be marked as missing.
            Respond ONLY with valid JSON in this format:
            {
              "character": "description or null",
              "song_title": "title or null", 
              "video_description": "description or null",
              "missing": ["list of REQUIRED missing elements only"],
              "suggestion": "helpful suggestion if anything is missing"
            }`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(parseResponse.choices[0].message.content || "{}");
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Parsed prompt:`, parsed);

      const requiredMissing = parsed.missing?.filter((item: string) => item !== 'song_title') || [];

      if (requiredMissing.length > 0) {
        console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Missing required elements:`, requiredMissing);
        return res.status(400).json({
          error: "Incomplete prompt",
          missing: requiredMissing,
          suggestion: parsed.suggestion || "Please provide a character description and video description.",
          example: "Create a music video about a cute little cowboy hamster in the wild west."
        });
      }

      // Step 2: Create a new project
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Step 2: Creating project...`);
      const project = await storage.createProject({
        userId,
        title: parsed.song_title || parsed.video_description.substring(0, 50),
        description: parsed.video_description,
        aspectRatio: aspectRatio,
        currentStep: 1,
        addSubtitles: addSubtitles,
        subtitleStyle: subtitleStyle,
        fontFamily: fontFamily,
        captionPosition: addSubtitles ? captionPosition : undefined,
        toolUsed: "single_prompt",
      } as any);
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Created project ${project.id}`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your project...",
        status: "completed",
        metadata: {}
      });

      // Step 3: Generate lyrics and title (required before parallel generation)
      const lyricsPrompt = parsed.song_title
        ? `${parsed.song_title}. ${parsed.video_description}`
        : parsed.video_description;
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Step 3: Generating lyrics and title with OpenAI...`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "lyrics_generation",
        message: "Writing song lyrics...",
        status: "progress",
        metadata: {}
      });

      // Generate lyrics for a longer duration to ensure we have enough content
      const { lyrics, title: aiGeneratedTitle } = await generateLyricsWithTitle(lyricsPrompt, Math.max(duration, 60));
      await storage.updateProject(project.id, {
        audioLyrics: lyrics,
        title: aiGeneratedTitle,
        currentStep: 1
      });
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Generated lyrics (${lyrics.length} chars) and title: ${aiGeneratedTitle}`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "lyrics_generation",
        message: "Lyrics generated successfully",
        status: "completed",
        metadata: {}
      });

      // Calculate number of scenes dynamically based on duration (needed for scene prompts)
      const { numberOfSegments: numberOfScenes, segmentDurations } = calculateVideoSegments(duration);
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Dynamically calculated ${numberOfScenes} scenes for ${duration}s video (segments: ${segmentDurations.join(', ')}s)`);

      // Step 4: Launch parallel generation - Song, Character Image, and Scene Prompts
      // Use song_description for the music prompt (genre, mood, instruments), not video_description
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Step 4: Launching parallel generation (song, character, scene prompts)...`);

      const songDescriptionForMusic = parsed.song_description || parsed.video_description;
      const songTags = parsed.song_title
        ? `${parsed.song_title}. ${songDescriptionForMusic}`
        : songDescriptionForMusic;

      // Start song generation
      await storage.addGenerationLog({
        projectId: project.id,
        step: "song_generation",
        message: "Creating your song...",
        status: "progress",
        metadata: {}
      });

      // Start character generation
      validateCharacterGenerationPrompt(parsed.character);
      await storage.addGenerationLog({
        projectId: project.id,
        step: "character_generation",
        message: "Creating your character...",
        status: "progress",
        metadata: {}
      });

      // Start scene planning
      await storage.addGenerationLog({
        projectId: project.id,
        step: "scene_planning",
        message: "Planning video scenes...",
        status: "progress",
        metadata: {}
      });

      // Launch all three in parallel
      const [songResult, characterImageResult, scenePromptsResult] = await Promise.all([
        // Song generation
        (async () => {
          try {
            console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Generating song...`);
            const result = await generateSingleSong(songTags, lyrics, "", 1);
            console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Song generated: ${result.duration}s`);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "song_generation",
              message: "Song created successfully",
              status: "completed",
              metadata: {}
            });
            return result;
          } catch (error) {
            console.error(`[NEON-SINGLE-PROMPT-CUSTOM] Song generation failed:`, error);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "song_generation",
              message: `Song generation failed: ${(error as Error).message}`,
              status: "error",
              metadata: { error: (error as Error).message },
            });
            throw error;
          }
        })(),

        // Character image generation
        (async () => {
          try {
            let characterImageUrl: string;

            if (style === "hyperrealistic") {
              console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Generating realistic base image for "${parsed.character}" with aspectRatio: ${aspectRatio}...`);
              const realisticImageUrls = await generateCharacterImages(parsed.character, aspectRatio, "realistic");
              const realisticImageUrl = realisticImageUrls[0];

              console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Enhancing to hyper realistic...`);
              const enhancedImageUrl = await enhanceImageHyperReal(realisticImageUrl, parsed.character);
              const storedImage = await downloadAndStoreImage(enhancedImageUrl, "characters");
              characterImageUrl = storedImage.storedUrl;
              console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Hyper realistic character image generated: ${characterImageUrl}`);
            } else {
              console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Generating character image for "${parsed.character}" with aspectRatio: ${aspectRatio}, style: ${style}...`);
              const characterImageUrls = await generateCharacterImages(parsed.character, aspectRatio, style);
              characterImageUrl = characterImageUrls[0];
              console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Character image generated`);
            }

            await storage.updateProject(project.id, {
              characterImageUrl,
              currentStep: 3
            });

            await storage.addGenerationLog({
              projectId: project.id,
              step: "character_generation",
              message: "Character created successfully",
              status: "completed",
              metadata: {}
            });

            return characterImageUrl;
          } catch (error) {
            console.error(`[NEON-SINGLE-PROMPT-CUSTOM] Character generation failed:`, error);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "character_generation",
              message: `Character generation failed: ${(error as Error).message}`,
              status: "error",
              metadata: { error: (error as Error).message },
            });
            throw error;
          }
        })(),

        // Scene prompts generation
        (async () => {
          try {
            console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Generating scene prompts...`);
            const prompts = await generateScenePrompts(
              parsed.video_description,
              numberOfScenes
            );
            console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Generated ${prompts.length} scene prompts`);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "scene_planning",
              message: "Scene planning completed",
              status: "completed",
              metadata: {}
            });

            return prompts;
          } catch (error) {
            console.error(`[NEON-SINGLE-PROMPT-CUSTOM] Scene prompts generation failed:`, error);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "scene_planning",
              message: `Scene planning failed: ${(error as Error).message}`,
              status: "error",
              metadata: { error: (error as Error).message },
            });
            throw error;
          }
        })()
      ]);

      const characterImageUrl = characterImageResult;
      const scenePrompts = scenePromptsResult;

      // Step 5: Generate scene images (needs character image URL)
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Step 5: Generating scene images with aspectRatio: ${aspectRatio}...`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "scene_generation",
        message: `Creating ${numberOfScenes} video scenes...`,
        status: "progress",
        metadata: { sceneCount: numberOfScenes }
      });

      const sceneImages = await generateSceneImages(
        scenePrompts,
        characterImageUrl,
        aspectRatio
      );

      await storage.updateProject(project.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages,
        currentStep: 4
      });
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Generated ${sceneImages.length} scene images`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "scene_generation",
        message: "Scenes created successfully",
        status: "completed",
        metadata: {}
      });

      // Step 6: Trim audio from 0 to specified duration
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Step 6b: Trimming audio from 0s to ${duration}s...`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "audio_trimming",
        message: "Preparing audio...",
        status: "progress",
        metadata: {}
      });
      const { splitAudioByTime } = await import("./services/ffmpeg");
      const trimResult = await splitAudioByTime(songResult.audioUrl, 0, duration * 1000); // Convert to milliseconds

      // Download the trimmed audio
      const trimmedResponse = await fetch(trimResult.download_url);
      const trimmedBuffer = Buffer.from(await trimmedResponse.arrayBuffer());

      // Upload trimmed audio to object storage
      const objectStorageService = new ObjectStorageService();
      const trimmedAudioPath = `songs/${crypto.randomUUID()}.mp3`;
      const uploadedUrl = await objectStorageService.uploadAudioBuffer(trimmedBuffer, trimmedAudioPath);

      // If ImageKit is configured, uploadedUrl is already the full ImageKit URL, so use it directly
      // Otherwise, get a signed URL from Google Cloud Storage
      const trimmedAudioUrl = uploadedUrl.startsWith('http')
        ? uploadedUrl
        : await objectStorageService.getSignedUrlForPath(uploadedUrl, 86400);

      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Audio trimmed and uploaded: ${trimmedAudioUrl}`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "audio_trimming",
        message: "Audio prepared successfully",
        status: "completed",
        metadata: {}
      });

      await storage.updateProject(project.id, {
        audioUrl: trimmedAudioUrl,
        audioDuration: duration,
        currentStep: 2,
        addSubtitles: !!addSubtitles
      } as any);
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Trimmed audio and subtitles saved (${duration} seconds)`);

      // Step 8: Generate final video (waits for all components: audio, scenes, subtitles)
      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Step 8: Generating final music video...`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "video_generation",
        message: "Assembling your final video...",
        status: "progress",
        metadata: {}
      });

      await storage.updateProject(project.id, {
        currentStep: 5,
        isCompleted: false
      });

      // Trigger video generation asynchronously
      (async () => {
        try {
          const baseUrl = getBaseUrl(req);
          const videoGenResponse = await fetch(`${baseUrl}/api/projects/${project.id}/generate-video`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            }
          });

          if (videoGenResponse.ok) {
            console.log(`[NEON-SINGLE-PROMPT-CUSTOM] Video generation completed for project ${project.id}`);
          } else {
            const errorData = await videoGenResponse.json();
            console.error(`[NEON-SINGLE-PROMPT-CUSTOM] Video generation failed with status ${videoGenResponse.status}:`, errorData);
          }
        } catch (error) {
          console.error(`[NEON-SINGLE-PROMPT-CUSTOM] Video generation failed:`, error);
        }
      })();

      console.log(`[NEON-SINGLE-PROMPT-CUSTOM] ✅ All steps completed! Project ${project.id} is processing final video.`);

      res.json({
        success: true,
        projectId: project.id,
        message: "Music video generation started! The video is being created in the background.",
        details: {
          character: parsed.character,
          song_title: parsed.song_title,
          video_description: parsed.video_description,
          lyrics: lyrics.substring(0, 100) + "...",
          sceneCount: sceneImages.length,
          duration: duration,
          subtitles: !!addSubtitles
        }
      });

    } catch (error) {
      console.error("[NEON-SINGLE-PROMPT-CUSTOM] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate music video"
      });
    }
  });

  // CORS preflight for simple mode endpoint
  app.options("/api/simple-mode", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  // Simple mode: prompt-first flow with optional uploaded song and optional reference image
  app.post("/api/simple-mode", extractTokenFromUrl, authenticateToken, async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const {
        prompt,
        aspectRatio: requestedAspectRatio,
        duration: requestedDuration,
        addSubtitles: requestedAddSubtitles,
        subtitleStyle: requestedSubtitleStyle,
        fontFamily: requestedFontFamily,
        textPosition: requestedTextPosition,
        audioUrl: providedAudioUrl,
        subtitleFileUrl: providedSubtitleFileUrl,
        referenceImageUrl: providedReferenceImageUrl,
      } = req.body;
      const userId = req.user!.userId;

      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({
          error: "Please provide a prompt describing your music video",
        });
      }

      const validAspectRatios = ["16:9", "9:16"];
      const aspectRatio = validAspectRatios.includes(requestedAspectRatio) ? requestedAspectRatio : "9:16";
      const duration = typeof requestedDuration === "number"
        ? Math.max(15, Math.min(180, Math.round(requestedDuration)))
        : 30;
      const addSubtitles = requestedAddSubtitles === true || requestedAddSubtitles === "true";
      const subtitleStyle = isSubtitleStyle(requestedSubtitleStyle) ? requestedSubtitleStyle : defaultSubtitleStyle;
      const fontFamily = isGoogleFont(requestedFontFamily) ? requestedFontFamily : defaultGoogleFont;
      const validTextPositions = ["top", "center", "bottom"];
      const captionPosition = validTextPositions.includes(requestedTextPosition) ? requestedTextPosition : "bottom";
      const hasUploadedSong = typeof providedAudioUrl === "string" && providedAudioUrl.trim().length > 0;
      const hasReferenceImage = typeof providedReferenceImageUrl === "string" && providedReferenceImageUrl.trim().length > 0;

      // Parse prompt for scene planning and optional song context.
      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const parseResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You extract structured details from music video prompts.
Return JSON with:
- character: main subject/person in the video, or null
- song_title: song title/theme if present, or null
- video_description: concise scene/story direction for generating visual scenes
Do not add markdown. Return JSON only.`,
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(parseResponse.choices[0].message.content || "{}");
      const videoDescription = (parsed.video_description || prompt).toString();
      const songTitle = parsed.song_title?.toString() || null;
      const characterDescription = parsed.character?.toString() || null;

      const project = await storage.createProject({
        userId,
        title: songTitle || videoDescription.substring(0, 50),
        description: videoDescription,
        aspectRatio,
        currentStep: 1,
        addSubtitles,
        subtitleStyle,
        fontFamily,
        captionPosition: addSubtitles ? captionPosition : undefined,
        includeWatermark: false, // Public API: watermark off by default
      } as any);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your project...",
        status: "completed",
        metadata: {},
      });

      res.json({
        success: true,
        projectId: project.id,
        message: "Simple mode generation started! Your video is being created in the background.",
      });

      (async () => {
        try {
          let finalAudioUrl: string;
          let finalSubtitleFileUrl: string | null = null;
          let lyricsForProject: string | null = null;

          if (hasUploadedSong) {
            finalAudioUrl = providedAudioUrl.trim();
            finalSubtitleFileUrl = (typeof providedSubtitleFileUrl === "string" && providedSubtitleFileUrl.trim().length > 0)
              ? providedSubtitleFileUrl.trim()
              : null;

            await storage.addGenerationLog({
              projectId: project.id,
              step: "song_generation",
              message: "Using uploaded song",
              status: "completed",
              metadata: {},
            });
            await storage.addGenerationLog({
              projectId: project.id,
              step: "audio_trimming",
              message: "Audio prepared successfully",
              status: "completed",
              metadata: {},
            });
          } else {
            await storage.addGenerationLog({
              projectId: project.id,
              step: "lyrics_generation",
              message: "Writing song lyrics...",
              status: "progress",
              metadata: {},
            });

            const lyricsPrompt = songTitle ? `${songTitle}. ${videoDescription}` : videoDescription;
            const { lyrics, title: aiTitle } = await generateLyricsWithTitle(lyricsPrompt, Math.max(duration, 60));
            lyricsForProject = lyrics;
            await storage.updateProject(project.id, {
              audioLyrics: lyrics,
              title: aiTitle,
            });
            await storage.addGenerationLog({
              projectId: project.id,
              step: "lyrics_generation",
              message: "Lyrics generated successfully",
              status: "completed",
              metadata: {},
            });

            await storage.addGenerationLog({
              projectId: project.id,
              step: "song_generation",
              message: "Creating your song...",
              status: "progress",
              metadata: {},
            });

            const songTags = songTitle ? `${songTitle}. ${videoDescription}` : videoDescription;
            const songResult = await generateSingleSong(songTags, lyrics, videoDescription, 1);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "song_generation",
              message: "Song created successfully",
              status: "completed",
              metadata: {},
            });

            await storage.addGenerationLog({
              projectId: project.id,
              step: "audio_trimming",
              message: "Preparing audio...",
              status: "progress",
              metadata: {},
            });

            const { splitAudioByTime } = await import("./services/ffmpeg");
            const trimResult = await splitAudioByTime(songResult.audioUrl, 0, duration * 1000);
            const trimmedResponse = await fetch(trimResult.download_url);
            const trimmedBuffer = Buffer.from(await trimmedResponse.arrayBuffer());

            const objectStorageService = new ObjectStorageService();
            const trimmedAudioPath = `songs/${crypto.randomUUID()}.mp3`;
            const uploadedUrl = await objectStorageService.uploadAudioBuffer(trimmedBuffer, trimmedAudioPath);
            finalAudioUrl = uploadedUrl.startsWith("http")
              ? uploadedUrl
              : await objectStorageService.getSignedUrlForPath(uploadedUrl, 86400);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "audio_trimming",
              message: "Audio prepared successfully",
              status: "completed",
              metadata: {},
            });
          }

          if (addSubtitles && finalSubtitleFileUrl) {
            await storage.addGenerationLog({
              projectId: project.id,
              step: "subtitle_generation",
              message: "Using subtitles from uploaded trim",
              status: "completed",
              metadata: { subtitleFileUrl: finalSubtitleFileUrl },
            });
          } else if (addSubtitles && lyricsForProject) {
            // For AI-generated songs we keep lyrics on project and let downstream caption flow use it.
            await storage.addGenerationLog({
              projectId: project.id,
              step: "subtitle_generation",
              message: "Captions prepared from generated lyrics",
              status: "completed",
              metadata: {},
            });
          }

          await storage.updateProject(project.id, {
            audioUrl: finalAudioUrl,
            audioDuration: duration,
            subtitleFileUrl: finalSubtitleFileUrl,
            addSubtitles,
            subtitleStyle,
            fontFamily,
            captionPosition: addSubtitles ? captionPosition : undefined,
            currentStep: 2,
          } as any);

          const { numberOfSegments: numberOfScenes } = calculateVideoSegments(duration);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "scene_planning",
            message: "Planning video scenes...",
            status: "progress",
            metadata: {},
          });

          const scenePrompts = await generateScenePrompts(videoDescription, numberOfScenes);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "scene_planning",
            message: "Scene planning completed",
            status: "completed",
            metadata: { sceneCount: scenePrompts.length },
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "scene_generation",
            message: `Creating ${numberOfScenes} video scenes...`,
            status: "progress",
            metadata: { sceneCount: numberOfScenes, hasReferenceImage },
          });

          const sceneImages = hasReferenceImage
            ? await generateSceneImages(scenePrompts, providedReferenceImageUrl.trim(), aspectRatio)
            : await generateSceneImagesFromText(scenePrompts, aspectRatio);

          await storage.updateProject(project.id, {
            characterDescription: characterDescription || undefined,
            characterImageUrl: hasReferenceImage ? providedReferenceImageUrl.trim() : undefined,
            scenePrompts,
            sceneImages,
            currentStep: 3,
          } as any);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "scene_generation",
            message: "Scenes created successfully",
            status: "completed",
            metadata: {},
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Assembling your final video...",
            status: "progress",
            metadata: {},
          });

          await storage.updateProject(project.id, {
            currentStep: 4,
            isCompleted: false,
          });

          const baseUrl = getBaseUrl(req);
          const videoGenResponse = await fetch(`${baseUrl}/api/projects/${project.id}/generate-video`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          if (!videoGenResponse.ok) {
            const errorData = await videoGenResponse.json().catch(() => ({}));
            throw new Error(errorData.error || "Final video generation failed");
          }
        } catch (error) {
          console.error("[SIMPLE-MODE] Error:", error);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: `Generation failed: ${(error as Error).message}`,
            status: "error",
            metadata: { error: (error as Error).message },
          });
        }
      })();
    } catch (error) {
      console.error("[SIMPLE-MODE] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate simple mode video",
      });
    }
  });

  // ─── ALL-PURPOSE / LONG FORMAT VIDEO ──────────────────────────────────
  app.options("/api/all-purpose", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post("/api/all-purpose", extractTokenFromUrl, authenticateToken, async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const {
        prompt,
        aspectRatio: requestedAspectRatio,
        duration: requestedDuration,
        videoModel: requestedVideoModel,
        resolution: requestedResolution,
        useAudio: requestedUseAudio,
        referenceImageUrls: requestedReferenceImageUrls,
        characterImageUrl: requestedCharacterImageUrl,
      } = req.body;
      const userId = req.user!.userId;

      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a prompt describing your video" });
      }

      const profanityCheck = checkProfanity(prompt.trim());
      if (!profanityCheck.isClean) {
        console.log("[ALL-PURPOSE] Blocked inappropriate prompt:", profanityCheck.detectedWords);
        return res.status(400).json({
          error: getCategoryMessage(profanityCheck.category || "unknown"),
          category: profanityCheck.category,
        });
      }

      const aspectRatio = isAllPurposeAspectRatio(String(requestedAspectRatio || ""))
        ? requestedAspectRatio
        : "9:16";
      const duration = typeof requestedDuration === "number"
        ? Math.max(5, Math.min(180, Math.round(requestedDuration / 5) * 5))
        : 20;

      const validModels = ["seedance-v1.5-pro", "wan-2.6", "kling-v2.6-pro"] as const;
      const videoModel = validModels.includes(requestedVideoModel) ? requestedVideoModel : "seedance-v1.5-pro";
      const resolution = requestedResolution === "1080p" ? "1080p" : "720p";
      const useAudio = requestedUseAudio === true;

      const referenceImageUrls: string[] = Array.isArray(requestedReferenceImageUrls)
        ? requestedReferenceImageUrls.filter((u: any) => typeof u === "string" && u.trim()).slice(0, 3)
        : [];
      const characterImageUrl = typeof requestedCharacterImageUrl === "string" && requestedCharacterImageUrl.trim()
        ? requestedCharacterImageUrl.trim()
        : null;
      const hasReferenceImages = referenceImageUrls.length > 0 || !!characterImageUrl;

      // Credit calculation
      const modelCosts: Record<string, number> = {
        "seedance-v1.5-pro": 1000,
        "wan-2.6": 4000,
        "kling-v2.6-pro": 4000,
      };
      const segments = Math.max(1, Math.ceil(duration / 10));
      const resolutionMultiplier = resolution === "1080p" ? 2 : 1;
      const totalCredits = segments * (modelCosts[videoModel] || 1000) * resolutionMultiplier;

      const canAfford = await storage.canUserAffordCredits(userId, totalCredits);
      if (!canAfford) {
        const remaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits",
          creditsRequired: totalCredits,
          creditsRemaining: remaining,
        });
      }

      const project = await storage.createProject({
        userId,
        title: prompt.substring(0, 60),
        description: prompt,
        aspectRatio,
        currentStep: 1,
        isInstrumental: true,
        includeWatermark: false,
      } as any);

      // Store all-purpose metadata on the project
      await storage.updateProject(project.id, {
        audioDuration: duration,
      } as any);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your video project...",
        status: "completed",
        metadata: { videoModel, resolution, useAudio, duration },
      });

      res.json({
        success: true,
        projectId: project.id,
        message: "Video generation started!",
      });

      // Background processing
      (async () => {
        try {
          const isShortVideo = duration <= 10;

          if (isShortVideo) {
            // ─── SHORT VIDEO PATH (<=10s): single clip, no OpenAI scene splitting ───
            await storage.addGenerationLog({
              projectId: project.id,
              step: "scene_generation",
              message: "Creating scene image...",
              status: "progress",
              metadata: {},
            });

            let sceneImageUrl: string;
            const allRefImages = [...referenceImageUrls];
            if (characterImageUrl) allRefImages.unshift(characterImageUrl);

            if (allRefImages.length > 0) {
              const images = await generateSceneImages([prompt], allRefImages, aspectRatio);
              sceneImageUrl = images[0];
            } else {
              const images = await generateAllPurposeWan27TextToImageMany([prompt], aspectRatio);
              sceneImageUrl = images[0];
            }

            await storage.updateProject(project.id, {
              scenePrompts: [prompt],
              sceneImages: [sceneImageUrl],
              characterImageUrl: characterImageUrl || undefined,
              currentStep: 3,
            } as any);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "scene_generation",
              message: "Scene image created",
              status: "completed",
              metadata: {},
            });

            // Generate video clip
            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_generation",
              message: "Generating video clip...",
              status: "progress",
              metadata: {},
            });

            const videoUrl = await generateAllPurposeVideoClip(
              sceneImageUrl, prompt, videoModel, resolution, useAudio, aspectRatio, duration,
            );

            // Save final video directly (no merge needed for single clip)
            const objectStorageService = new ObjectStorageService();
            const uploadResult = await objectStorageService.uploadVideoFromUrl(
              videoUrl,
              `neonvideo_allpurpose_${Date.now()}.mp4`,
            );

            await storage.updateProject(project.id, {
              finalVideoUrl: uploadResult.url,
              isCompleted: true,
              currentStep: 5,
            } as any);

            await storage.deductUserCredits(userId, totalCredits);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_generation",
              message: "Video generated successfully!",
              status: "completed",
              metadata: { creditsCharged: totalCredits },
            });
          } else {
            // ─── LONG VIDEO PATH (>10s): OpenAI scenes → images → pause for review ───
            await storage.addGenerationLog({
              projectId: project.id,
              step: "scene_planning",
              message: `Planning ${segments} video scenes...`,
              status: "progress",
              metadata: {},
            });

            const sceneData = await generateAllPurposeScenePrompts(prompt, segments, useAudio);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "scene_planning",
              message: `${sceneData.length} scenes planned`,
              status: "completed",
              metadata: { sceneCount: sceneData.length },
            });

            // Generate scene images
            await storage.addGenerationLog({
              projectId: project.id,
              step: "scene_generation",
              message: `Creating ${sceneData.length} scene images...`,
              status: "progress",
              metadata: {},
            });

            const imagePrompts = sceneData.map(s => s.image_prompt);
            const videoPrompts = sceneData.map(s => s.video_prompt);

            const allRefImages = [...referenceImageUrls];
            if (characterImageUrl) allRefImages.unshift(characterImageUrl);

            let sceneImages: string[];
            if (allRefImages.length > 0) {
              sceneImages = await generateSceneImages(imagePrompts, allRefImages, aspectRatio);
            } else {
              sceneImages = await generateAllPurposeWan27TextToImageMany(imagePrompts, aspectRatio);
            }

            await storage.updateProject(project.id, {
              scenePrompts: imagePrompts,
              sceneImages,
              characterImageUrl: characterImageUrl || undefined,
              currentStep: 3,
            } as any);

            // Store video prompts in project metadata via generation log
            await storage.addGenerationLog({
              projectId: project.id,
              step: "scene_generation",
              message: "Scene images created — review and continue",
              status: "completed",
              metadata: { sceneVideoPrompts: videoPrompts, videoModel, resolution, useAudio, totalCredits },
            });
          }
        } catch (error) {
          console.error("[ALL-PURPOSE] Background error:", error);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: `Generation failed: ${(error as Error).message}`,
            status: "error",
            metadata: { error: (error as Error).message },
          });
        }
      })();
    } catch (error) {
      console.error("[ALL-PURPOSE] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to start video generation",
      });
    }
  });

  // Generate video clips after scene review (long videos >10s)
  app.post("/api/all-purpose/:id/generate-clips", extractTokenFromUrl, authenticateToken, async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const projectId = req.params.id;
      const userId = req.user!.userId;
      const { sceneOrder: requestedSceneOrder, scenePrompts: bodyScenePrompts } = req.body;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const sceneImages: string[] = (project as any).sceneImages || [];
      let scenePrompts: string[] = (project as any).scenePrompts || [];

      // Persist image prompts edited on the review step (same order as scene slots)
      if (
        Array.isArray(bodyScenePrompts) &&
        bodyScenePrompts.length === sceneImages.length &&
        bodyScenePrompts.every((p: unknown) => typeof p === "string")
      ) {
        const profanityCheck = checkProfanity(bodyScenePrompts.join("\n"));
        if (!profanityCheck.isClean) {
          return res.status(400).json({
            error: getCategoryMessage(profanityCheck.category || "unknown"),
            category: profanityCheck.category,
          });
        }
        await storage.updateProject(projectId, { scenePrompts: bodyScenePrompts } as any);
        scenePrompts = bodyScenePrompts;
      }
      if (sceneImages.length === 0) {
        return res.status(400).json({ error: "No scene images available" });
      }

      // Retrieve video prompts and settings from the scene_generation completed log
      const logs = await storage.getGenerationLogs(projectId);
      const sceneGenLog = logs.find(
        (l: any) => l.step === "scene_generation" && l.status === "completed" && l.metadata?.sceneVideoPrompts,
      );
      const meta = (sceneGenLog?.metadata || {}) as any;
      const videoPrompts: string[] = meta.sceneVideoPrompts || scenePrompts;
      const videoModel = meta.videoModel || "seedance-v1.5-pro";
      const resolution = meta.resolution || "720p";
      const useAudio = meta.useAudio || false;
      const totalCredits = meta.totalCredits || 0;

      // Apply scene order
      const order: number[] = Array.isArray(requestedSceneOrder) && requestedSceneOrder.length === sceneImages.length
        ? requestedSceneOrder
        : sceneImages.map((_: string, i: number) => i);

      const orderedImages = order.map((i: number) => sceneImages[i]);
      const orderedVideoPrompts = order.map((i: number) => videoPrompts[i]);

      res.json({ success: true, message: "Video clip generation started" });

      // Background: generate clips + merge
      (async () => {
        try {
          const aspectRatio = (project as any).aspectRatio || "9:16";

          await storage.addGenerationLog({
            projectId,
            step: "video_generation",
            message: `Generating ${orderedImages.length} video clips...`,
            status: "progress",
            metadata: { clipCount: orderedImages.length },
          });

          await storage.updateProject(projectId, { currentStep: 4 } as any);

          // Generate all clips in parallel
          const clipPromises = orderedImages.map((imageUrl: string, index: number) => {
            const clipPrompt = orderedVideoPrompts[index] || scenePrompts[order[index]] || "cinematic scene";
            console.log(`[ALL-PURPOSE] Generating clip ${index + 1}/${orderedImages.length}: ${clipPrompt.substring(0, 60)}...`);
            return generateAllPurposeVideoClip(
              imageUrl, clipPrompt, videoModel, resolution, useAudio, aspectRatio, 10,
            );
          });

          const clipUrls = await Promise.all(clipPromises);
          console.log(`[ALL-PURPOSE] All ${clipUrls.length} clips generated`);

          await storage.addGenerationLog({
            projectId,
            step: "video_generation",
            message: "All video clips generated, assembling final video...",
            status: "progress",
            metadata: { step: "merging" },
          });

          // Get signed URLs for clips
          const objectStorageService = new ObjectStorageService();
          const signedClipUrls = await Promise.all(
            clipUrls.map(async (url: string) => {
              if (url.startsWith("/objects/")) {
                return objectStorageService.getSignedUrlForPath(url, 7200);
              }
              return url;
            }),
          );

          // Watermark
          const userWithPlan = await storage.getUserWithPlan(userId);
          const isPremiumUser = userWithPlan?.plan?.name === "Premium";
          const shouldIncludeWatermark = isPremiumUser ? ((project as any).includeWatermark !== false) : true;
          let watermarkUrl: string | undefined;
          if (shouldIncludeWatermark) {
            watermarkUrl = await getWatermarkUrl() || undefined;
          }

          // Outro
          const isPortrait = allPurposeUsePortraitOutro(aspectRatio);
          const outroVideoUrl = isPortrait
            ? "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_vertical.mp4"
            : "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_horizontal.mp4";
          const dimensions = allPurposeMergeVideoDimensions(aspectRatio);

          const finalVideo = await mergeVideos(
            signedClipUrls,
            undefined,
            undefined,
            watermarkUrl,
            outroVideoUrl,
            dimensions,
          );

          // Upload merged video
          let savedFinalVideoUrl: string;
          try {
            if (finalVideo.download_url.includes("/api/ffmpeg-local/download/")) {
              const { OUTPUT_FOLDER } = await import("./services/ffmpegLocal.js");
              const localFilePath = path.join(OUTPUT_FOLDER, finalVideo.filename);
              const videoBuffer = fs.readFileSync(localFilePath);
              const uploadResult = await objectStorageService.uploadVideoBuffer(
                videoBuffer,
                `neonvideo_allpurpose_${Date.now()}.mp4`,
              );
              savedFinalVideoUrl = uploadResult.url;
            } else {
              const uploadResult = await objectStorageService.uploadVideoFromUrl(
                finalVideo.download_url,
                `neonvideo_allpurpose_${Date.now()}.mp4`,
              );
              savedFinalVideoUrl = uploadResult.url;
            }
          } catch (storageError) {
            console.warn("[ALL-PURPOSE] Storage upload failed, using temp URL:", storageError);
            savedFinalVideoUrl = finalVideo.download_url;
          }

          await storage.updateProject(projectId, {
            finalVideoUrl: savedFinalVideoUrl,
            isCompleted: true,
            currentStep: 5,
          } as any);

          await storage.deductUserCredits(userId, totalCredits);

          await storage.addGenerationLog({
            projectId,
            step: "video_generation",
            message: "Video generated successfully!",
            status: "completed",
            metadata: { creditsCharged: totalCredits },
          });
        } catch (error) {
          console.error("[ALL-PURPOSE] Clip generation error:", error);
          await storage.addGenerationLog({
            projectId,
            step: "video_generation",
            message: `Generation failed: ${(error as Error).message}`,
            status: "error",
            metadata: { error: (error as Error).message },
          });
        }
      })();
    } catch (error) {
      console.error("[ALL-PURPOSE] generate-clips error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate clips",
      });
    }
  });

  // ─── SCENE GUIDED ─────────────────────────────────────────────────────
  // Scene-by-scene interactive video builder:
  //   1) /api/scene-guided/generate-image  → nano-banana-2 edit/text-to-image
  //   2) /api/scene-guided/generate-video  → kling-v2.6-pro image-to-video (+ optional end_image),
  //                                           then extracts the last frame for the next scene
  //   3) /api/scene-guided/finalize        → merges all clips (optional watermark + outro)

  const SCENE_GUIDED_ASPECT_RATIOS = ["9:16", "16:9"] as const;
  type SceneGuidedAspectRatio = (typeof SCENE_GUIDED_ASPECT_RATIOS)[number];

  const isSceneGuidedAspectRatio = (v: unknown): v is SceneGuidedAspectRatio =>
    typeof v === "string" && (SCENE_GUIDED_ASPECT_RATIOS as readonly string[]).includes(v);

  const sceneGuidedCreditsForDuration = (duration: number): number => {
    // Kling v2.6 Pro is 4000 credits per 10s.
    const normalized = duration === 10 ? 10 : 5;
    return (normalized / 10) * 4000;
  };

  /** Build a tiny PCM WAV with silence for the requested duration. */
  const createSilentWavBuffer = (durationSeconds: number, sampleRate: number = 16000): Buffer => {
    const safeDuration = Math.max(1, Math.ceil(durationSeconds));
    const channels = 1;
    const bitsPerSample = 16;
    const blockAlign = channels * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;
    const samples = safeDuration * sampleRate;
    const dataSize = samples * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize, 0);

    // RIFF header
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    // fmt chunk
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16); // PCM chunk size
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    // data chunk
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    return buffer;
  };

  app.options("/api/scene-guided/generate-image", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post(
    "/api/scene-guided/generate-image",
    extractTokenFromUrl,
    authenticateToken,
    async (req, res) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

      try {
        const {
          prompt,
          aspectRatio: requestedAspectRatio,
          attachedImageUrl: requestedAttachedImageUrl,
          referenceImageUrl: requestedReferenceImageUrl,
        } = req.body as {
          prompt?: string;
          aspectRatio?: string;
          attachedImageUrl?: string;
          referenceImageUrl?: string;
        };

        if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
          return res
            .status(400)
            .json({ error: "Please provide a prompt describing the scene image" });
        }

        const profanityCheck = checkProfanity(prompt.trim());
        if (!profanityCheck.isClean) {
          return res.status(400).json({
            error: getCategoryMessage(profanityCheck.category || "unknown"),
            category: profanityCheck.category,
          });
        }

        const aspectRatio: SceneGuidedAspectRatio = isSceneGuidedAspectRatio(requestedAspectRatio)
          ? requestedAspectRatio
          : "9:16";

        const attachedImageUrl =
          typeof requestedAttachedImageUrl === "string" && requestedAttachedImageUrl.trim()
            ? requestedAttachedImageUrl.trim()
            : null;
        const referenceImageUrl =
          typeof requestedReferenceImageUrl === "string" && requestedReferenceImageUrl.trim()
            ? requestedReferenceImageUrl.trim()
            : null;

        // nano-banana-2/edit requires at least one image; if none is provided, use text-to-image.
        const images: string[] = [];
        if (referenceImageUrl) images.push(referenceImageUrl);
        if (attachedImageUrl) images.push(attachedImageUrl);

        let imageUrl: string;
        if (images.length > 0) {
          imageUrl = await editImageNanoBanana2(prompt.trim(), aspectRatio, images);
        } else {
          imageUrl = await generateImageFromText(prompt.trim(), aspectRatio);
        }

        return res.json({ imageUrl });
      } catch (error) {
        console.error("[SCENE-GUIDED] generate-image error:", error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to generate image",
        });
      }
    },
  );

  app.options("/api/scene-guided/generate-video", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post(
    "/api/scene-guided/generate-video",
    extractTokenFromUrl,
    authenticateToken,
    async (req, res) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

      try {
        const userId = req.user!.userId;
        const {
          startImageUrl: requestedStartImageUrl,
          endImageUrl: requestedEndImageUrl,
          prompt: requestedPrompt,
          duration: requestedDuration,
        } = req.body as {
          startImageUrl?: string;
          endImageUrl?: string;
          prompt?: string;
          duration?: number;
        };

        const startImageUrl =
          typeof requestedStartImageUrl === "string" && requestedStartImageUrl.trim()
            ? requestedStartImageUrl.trim()
            : null;
        if (!startImageUrl) {
          return res.status(400).json({ error: "startImageUrl is required" });
        }

        const prompt = typeof requestedPrompt === "string" ? requestedPrompt.trim() : "";
        if (!prompt) {
          return res.status(400).json({ error: "Please provide a video prompt" });
        }

        const profanityCheck = checkProfanity(prompt);
        if (!profanityCheck.isClean) {
          return res.status(400).json({
            error: getCategoryMessage(profanityCheck.category || "unknown"),
            category: profanityCheck.category,
          });
        }

        const duration: 5 | 10 = requestedDuration === 10 ? 10 : 5;
        const endImageUrl =
          typeof requestedEndImageUrl === "string" && requestedEndImageUrl.trim()
            ? requestedEndImageUrl.trim()
            : undefined;

        const creditCost = sceneGuidedCreditsForDuration(duration);
        const canAfford = await storage.canUserAffordCredits(userId, creditCost);
        if (!canAfford) {
          const remaining = await storage.getUserCreditsRemaining(userId);
          return res.status(402).json({
            error: "Insufficient credits",
            creditsRequired: creditCost,
            creditsRemaining: remaining,
          });
        }

        const videoUrl = await generateSceneGuidedVideoClip({
          imageUrl: startImageUrl,
          endImageUrl,
          prompt,
          duration,
        });

        let lastFrameUrl: string | null = null;
        try {
          const frame = await getLastFrameImage(videoUrl);
          lastFrameUrl = frame.image_url;
        } catch (frameError) {
          console.warn(
            "[SCENE-GUIDED] Failed to extract last frame (continuing):",
            (frameError as Error).message,
          );
        }

        const deducted = await storage.deductUserCredits(userId, creditCost);
        if (!deducted) {
          console.warn(
            "[SCENE-GUIDED] Failed to deduct credits after successful generation (user may have spent concurrently)",
          );
        }

        const creditsRemaining = await storage.getUserCreditsRemaining(userId);

        return res.json({
          videoUrl,
          lastFrameUrl,
          creditsCharged: creditCost,
          creditsRemaining,
        });
      } catch (error) {
        console.error("[SCENE-GUIDED] generate-video error:", error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to generate video",
        });
      }
    },
  );

  app.options("/api/scene-guided/finalize", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post(
    "/api/scene-guided/finalize",
    extractTokenFromUrl,
    authenticateToken,
    async (req, res) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

      try {
        const userId = req.user!.userId;
        const {
          title: requestedTitle,
          videoUrls: requestedVideoUrls,
          aspectRatio: requestedAspectRatio,
          includeWatermark: requestedIncludeWatermark,
          sceneDuration: requestedSceneDuration,
          scenePrompts: requestedScenePrompts,
        } = req.body as {
          title?: string;
          videoUrls?: unknown;
          aspectRatio?: string;
          includeWatermark?: boolean;
          sceneDuration?: number;
          scenePrompts?: unknown;
        };

        const videoUrls: string[] = Array.isArray(requestedVideoUrls)
          ? requestedVideoUrls
              .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
              .map((u) => u.trim())
          : [];
        if (videoUrls.length === 0) {
          return res.status(400).json({ error: "No scene videos to merge" });
        }

        const aspectRatio: SceneGuidedAspectRatio = isSceneGuidedAspectRatio(requestedAspectRatio)
          ? requestedAspectRatio
          : "9:16";
        const sceneDuration: 5 | 10 = requestedSceneDuration === 10 ? 10 : 5;
        const includeWatermark = requestedIncludeWatermark !== false;
        const scenePrompts: string[] = Array.isArray(requestedScenePrompts)
          ? requestedScenePrompts.map((p) => (typeof p === "string" ? p : ""))
          : [];

        const rawTitle =
          typeof requestedTitle === "string" && requestedTitle.trim()
            ? requestedTitle.trim()
            : "Scene Guided Video";
        const title = rawTitle.substring(0, 120);

        // Create project record first (appears in user's library once completed).
        const project = await storage.createProject({
          userId,
          title,
          description: scenePrompts.filter(Boolean).join(" | ") || title,
          aspectRatio,
          currentStep: 1,
          isInstrumental: true,
          includeWatermark,
          projectType: "music_video",
          toolUsed: "scene_guided",
          scenePrompts: scenePrompts as any,
          videoSegments: videoUrls as any,
          audioDuration: videoUrls.length * sceneDuration,
        } as any);

        await storage.addGenerationLog({
          projectId: project.id,
          step: "project_creation",
          message: "Merging scene videos...",
          status: "progress",
          metadata: { sceneCount: videoUrls.length, sceneDuration, aspectRatio },
        });

        res.json({
          success: true,
          projectId: project.id,
          message: "Final video generation started",
        });

        // Background: merge + watermark + outro, persist final video.
        (async () => {
          try {
            const userWithPlan = await storage.getUserWithPlan(userId);
            const isPremiumUser = userWithPlan?.plan?.name === "Premium";
            const shouldIncludeWatermark = isPremiumUser ? includeWatermark : true;

            let watermarkUrl: string | undefined;
            if (shouldIncludeWatermark) {
              watermarkUrl = (await getWatermarkUrl()) || undefined;
            }

            const isPortrait = allPurposeUsePortraitOutro(aspectRatio);
            const outroVideoUrl = isPortrait
              ? "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_vertical.mp4"
              : "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_horizontal.mp4";
            const dimensions = allPurposeMergeVideoDimensions(aspectRatio);

            const objectStorageService = new ObjectStorageService();

            // Sign object-storage URLs if any were passed in.
            const signedVideoUrls = await Promise.all(
              videoUrls.map(async (url) => {
                if (url.startsWith("/objects/")) {
                  return objectStorageService.getSignedUrlForPath(url, 7200);
                }
                return url;
              }),
            );

            // Re-host each clip on Bunny (public CDN) so ffmpegapi can download them.
            // WaveSpeed / signed app URLs are often not reachable from ffmpegapi or fail in local dev.
            let mergeInputUrls = signedVideoUrls;
            if (isBunnyConfigured("scenes")) {
              mergeInputUrls = await Promise.all(
                signedVideoUrls.map(async (url, i) => {
                  if (isBunnyUrl(url)) {
                    return url;
                  }
                  try {
                    const clipResponse = await fetch(url);
                    if (!clipResponse.ok) {
                      console.warn(
                        `[SCENE-GUIDED] Could not fetch clip ${i + 1} for Bunny upload (${clipResponse.status}), using original URL`,
                      );
                      return url;
                    }
                    const buffer = Buffer.from(await clipResponse.arrayBuffer());
                    const fileName = `scene-guided-${project.id}-clip-${i + 1}-${Date.now()}.mp4`;
                    const { url: bunnyUrl } = await uploadToBunnyStorage("scenes", fileName, buffer);
                    console.log(
                      `[SCENE-GUIDED] Re-hosted clip ${i + 1}/${signedVideoUrls.length} on Bunny`,
                    );
                    return bunnyUrl;
                  } catch (bunnyErr) {
                    console.warn(
                      `[SCENE-GUIDED] Bunny upload failed for clip ${i + 1}, using original URL:`,
                      bunnyErr,
                    );
                    return url;
                  }
                }),
              );
            } else {
              console.warn(
                "[SCENE-GUIDED] Bunny storage not configured; merge uses original clip URLs (may fail for remote ffmpeg if URLs are not public).",
              );
            }

            // Scene-guided clips are usually silent, but neonvideo outro merge expects
            // an audio stream on the merged main track. Build/upload a silent WAV to
            // align this flow with other styles that provide audio_url.
            let silentAudioUrl: string | undefined;
            try {
              const totalDurationSeconds = Math.max(1, Math.ceil(videoUrls.length * sceneDuration));
              const silentAudioBuffer = createSilentWavBuffer(totalDurationSeconds + 1);
              const uploadedSilentAudio = await objectStorageService.uploadAudioBuffer(
                silentAudioBuffer,
                `scene-guided/silent_${project.id}_${Date.now()}.wav`,
              );
              silentAudioUrl = uploadedSilentAudio.startsWith("/objects/")
                ? await objectStorageService.getSignedUrlForPath(uploadedSilentAudio, 7200)
                : uploadedSilentAudio;
            } catch (silentAudioError) {
              console.warn(
                "[SCENE-GUIDED] Failed to provision silent audio track; merge will continue without audio_url:",
                silentAudioError,
              );
            }

            const finalVideo = await mergeVideos(
              mergeInputUrls,
              silentAudioUrl,
              undefined,
              watermarkUrl,
              outroVideoUrl,
              dimensions,
            );

            let savedFinalVideoUrl: string;
            try {
              if (finalVideo.download_url.includes("/api/ffmpeg-local/download/")) {
                const { OUTPUT_FOLDER } = await import("./services/ffmpegLocal.js");
                const localFilePath = path.join(OUTPUT_FOLDER, finalVideo.filename);
                const videoBuffer = fs.readFileSync(localFilePath);
                const uploadResult = await objectStorageService.uploadVideoBuffer(
                  videoBuffer,
                  `neonvideo_sceneguided_${Date.now()}.mp4`,
                );
                savedFinalVideoUrl = uploadResult.url;
              } else {
                const uploadResult = await objectStorageService.uploadVideoFromUrl(
                  finalVideo.download_url,
                  `neonvideo_sceneguided_${Date.now()}.mp4`,
                );
                savedFinalVideoUrl = uploadResult.url;
              }
            } catch (storageError) {
              console.warn(
                "[SCENE-GUIDED] Storage upload failed, using temp URL:",
                storageError,
              );
              savedFinalVideoUrl = finalVideo.download_url;
            }

            await storage.updateProject(project.id, {
              finalVideoUrl: savedFinalVideoUrl,
              isCompleted: true,
              currentStep: 5,
            } as any);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_generation",
              message: "Final video ready!",
              status: "completed",
              metadata: { finalVideoUrl: savedFinalVideoUrl },
            });
          } catch (error) {
            console.error("[SCENE-GUIDED] finalize merge error:", error);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_generation",
              message: `Final merge failed: ${(error as Error).message}`,
              status: "error",
              metadata: { error: (error as Error).message },
            });
          }
        })();
      } catch (error) {
        console.error("[SCENE-GUIDED] finalize error:", error);
        return res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to finalize video",
        });
      }
    },
  );

  // ─── VIDEO SHORTS ─────────────────────────────────────────────────────
  app.options("/api/video-shorts", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post("/api/video-shorts", extractTokenFromUrl, authenticateToken, async (req, res) => {
    console.log("[VIDEO-SHORTS] Route handler invoked");
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const {
        prompt,
        aspectRatio: requestedAspectRatio,
        audioUrl: providedAudioUrl,
        addSubtitles: requestedAddSubtitles,
        subtitleStyle: requestedSubtitleStyle,
        textPosition: requestedTextPosition,
        fontFamily: requestedFontFamily,
      } = req.body;
      const userId = req.user!.userId;

      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({
          error: "Please provide a prompt describing your video short",
        });
      }

      const hasUploadedSong =
        typeof providedAudioUrl === "string" && providedAudioUrl.trim().length > 0;
      if (!hasUploadedSong) {
        return res.status(400).json({
          error: "A song is required. Please upload and attach a song, then select 12 seconds.",
        });
      }

      const validAspectRatios = ["16:9", "9:16"];
      const aspectRatio = validAspectRatios.includes(requestedAspectRatio)
        ? requestedAspectRatio
        : "9:16";
      const addSubtitles = requestedAddSubtitles === true || requestedAddSubtitles === "true";
      const subtitleStyle = isSubtitleStyle(requestedSubtitleStyle) ? requestedSubtitleStyle : defaultSubtitleStyle;
      const fontFamily = isGoogleFont(requestedFontFamily) ? requestedFontFamily : defaultGoogleFont;
      const validTextPositions = ["top", "center", "bottom"];
      const captionPosition = validTextPositions.includes(requestedTextPosition) ? requestedTextPosition : "bottom";

      const SHORTS_CREDITS = 1000;
      const canAfford = await storage.canUserAffordCredits(userId, SHORTS_CREDITS);
      if (!canAfford) {
        const remaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Video Shorts generation",
          creditsRequired: SHORTS_CREDITS,
          creditsRemaining: remaining,
        });
      }

      const project = await storage.createProject({
        userId,
        title: prompt.substring(0, 60),
        description: prompt,
        aspectRatio,
        currentStep: 1,
        addSubtitles,
        subtitleStyle,
        fontFamily,
        captionPosition: addSubtitles ? captionPosition : undefined,
        isInstrumental: true,
      } as any);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your Video Short...",
        status: "completed",
        metadata: {},
      });

      res.json({
        success: true,
        projectId: project.id,
        message: "Video Shorts generation started!",
      });

      // Background pipeline
      (async () => {
        console.log(`[VIDEO-SHORTS] Background pipeline started for project ${project.id}`);
        try {
          // Step 1: Text-to-Image
          await storage.addGenerationLog({
            projectId: project.id,
            step: "image_generation",
            message: "Generating image from prompt...",
            status: "progress",
            metadata: {},
          });

          const imageUrl = await generateImageFromText(prompt.trim(), aspectRatio);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "image_generation",
            message: "Image generated successfully",
            status: "completed",
            metadata: { imageUrl },
          });

          await storage.updateProject(project.id, {
            characterImageUrl: imageUrl,
            currentStep: 2,
          } as any);

          // Step 2: Image-to-Video
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Creating 12-second video...",
            status: "progress",
            metadata: {},
          });

          const videoUrl = await generateVideoFromImage(imageUrl, prompt.trim(), aspectRatio, 12);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Video created successfully",
            status: "completed",
            metadata: { videoUrl },
          });

          await storage.updateProject(project.id, { currentStep: 3 } as any);

          // Persist WaveSpeed video to Bunny so merge step has a stable, downloadable URL
          let videoUrlForMerge = videoUrl;
          if (isBunnyConfigured("scenes") && !isBunnyUrl(videoUrl)) {
            console.log("[VIDEO-SHORTS] Persisting WaveSpeed video to Bunny before merge...");
            try {
              const videoResp = await fetch(videoUrl);
              if (!videoResp.ok) throw new Error(`Failed to fetch WaveSpeed video: ${videoResp.status}`);
              const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
              const { url: bunnyVideoUrl } = await uploadToBunnyStorage(
                "scenes",
                `short_${project.id}_${Date.now()}.mp4`,
                videoBuffer,
              );
              videoUrlForMerge = bunnyVideoUrl;
              console.log("[VIDEO-SHORTS] Video persisted to Bunny:", bunnyVideoUrl.substring(0, 60) + "...");
            } catch (persistErr) {
              console.error("[VIDEO-SHORTS] Failed to persist video to Bunny, using WaveSpeed URL:", persistErr);
            }
          }

          // Step 3: Merge audio (if provided) and upload
          let savedFinalVideoUrl: string;
          const objectStorageService = new ObjectStorageService();

          if (hasUploadedSong) {
            await storage.addGenerationLog({
              projectId: project.id,
              step: "audio_merge",
              message: "Merging audio with video...",
              status: "progress",
              metadata: {},
            });

            const dimensions =
              aspectRatio === "9:16"
                ? "1080x1920"
                : aspectRatio === "3:4"
                  ? "1080x1440"
                  : "1920x1080";

            // Use remote Neonvideo merge API (same as main pipeline) so merge is reliable
            const isPortrait = aspectRatio === "3:4" || aspectRatio === "9:16";
            const outroVideoUrl = isPortrait
              ? "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_vertical.mp4"
              : "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_horizontal.mp4";

            console.log("[VIDEO-SHORTS] Calling merge API with 1 video + audio + outro");
            const finalVideo = await mergeVideos(
              [videoUrlForMerge],
              providedAudioUrl.trim(),
              undefined,
              undefined,
              outroVideoUrl,
              dimensions,
            );

            await storage.addGenerationLog({
              projectId: project.id,
              step: "audio_merge",
              message: "Audio merged successfully",
              status: "completed",
              metadata: {},
            });

            // Upload merged video to Bunny (merge API returns a download URL)
            if (finalVideo.download_url.includes("/api/ffmpeg-local/download/")) {
              const { OUTPUT_FOLDER } = await import("./services/ffmpegLocal.js");
              const localFilePath = path.join(OUTPUT_FOLDER, finalVideo.filename);
              const videoBuffer = fs.readFileSync(localFilePath);
              const uploadResult = await objectStorageService.uploadVideoBuffer(
                videoBuffer,
                `neonvideo_short_${Date.now()}.mp4`,
              );
              savedFinalVideoUrl = uploadResult.url;
            } else {
              const uploadResult = await objectStorageService.uploadVideoFromUrl(
                finalVideo.download_url,
                `neonvideo_short_${Date.now()}.mp4`,
              );
              savedFinalVideoUrl = uploadResult.url;
            }
          } else {
            // No audio — persist the raw video to Bunny
            await storage.addGenerationLog({
              projectId: project.id,
              step: "upload",
              message: "Saving video...",
              status: "progress",
              metadata: {},
            });

            const uploadResult = await objectStorageService.uploadVideoFromUrl(
              videoUrl,
              `neonvideo_short_${Date.now()}.mp4`,
            );
            savedFinalVideoUrl = uploadResult.url;
          }

          // Add TikTok-style captions if user enabled captions
          if (addSubtitles && savedFinalVideoUrl) {
            try {
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_generation",
                message: `Adding TikTok-style captions (${subtitleStyle})`,
                status: "progress",
                metadata: { captionStyle: subtitleStyle },
              });
              const { addTikTokCaptions } = await import("./services/ffmpegCaptions");
              const captionResult = await addTikTokCaptions({
                videoUrl: savedFinalVideoUrl,
                subtitleStyle,
                aspectRatio,
                position: captionPosition,
              });
              const captionedUploadResult = await objectStorageService.uploadVideoFromUrl(
                captionResult.download_url,
                `neonvideo_short_${Date.now()}_captioned.mp4`,
              );
              savedFinalVideoUrl = captionedUploadResult.url;
              console.log("[VIDEO-SHORTS] Captioned video saved to storage:", savedFinalVideoUrl);
            } catch (captionError) {
              console.warn("[VIDEO-SHORTS] ffmpegapi caption rendering failed, proceeding without captions:", captionError);
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_generation",
                message: `Caption rendering failed, using uncaptioned video: ${(captionError as Error).message}`,
                status: "warning",
                metadata: { error: (captionError as Error).message },
              });
            }
          }

          await storage.addGenerationLog({
            projectId: project.id,
            step: "upload",
            message: "Video saved successfully",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl },
          });

          await storage.updateProject(project.id, {
            finalVideoUrl: savedFinalVideoUrl,
            isCompleted: true,
            currentStep: 4,
            audioDuration: 12,
            generationStatus: "completed" as any,
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Video Short completed!",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl },
          });

          // Deduct credits
          const creditDeducted = await storage.deductUserCredits(userId, SHORTS_CREDITS);
          if (!creditDeducted) {
            console.error("[VIDEO-SHORTS] Failed to deduct credits, but video was generated");
          } else {
            console.log(`[VIDEO-SHORTS] Deducted ${SHORTS_CREDITS} credits from user ${userId}`);
          }

          // Create Mux asset (non-blocking)
          try {
            await createMuxAssetForVideo(project.id, savedFinalVideoUrl);
          } catch (muxError) {
            console.error("[VIDEO-SHORTS] Failed to create Mux asset:", muxError);
          }
        } catch (error) {
          const errMsg = (error as Error).message;
          console.error("[VIDEO-SHORTS] Error:", error);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "audio_merge",
            message: `Merge failed: ${errMsg}`,
            status: "error",
            metadata: { error: errMsg },
          });
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: `Generation failed: ${errMsg}`,
            status: "error",
            metadata: { error: errMsg },
          });
        }
      })();
    } catch (error) {
      console.error("[VIDEO-SHORTS] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate video short",
      });
    }
  });

  // ─── MOTION CONTROL ──────────────────────────────────────────────────

  // Upload a video file for motion control (stores to Bunny, returns URL)
  app.post("/api/motion-control/upload-video", authenticateToken, motionControlVideoUpload.single("video"), async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No video file provided." });
      }

      const fileName = `mc_${Date.now()}_${(req.file.originalname || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await uploadToBunnyStorage("scenes", fileName, req.file.buffer);
      console.log(`[MOTION-CONTROL] Uploaded video to Bunny: ${url.substring(0, 60)}...`);

      res.json({ success: true, videoUrl: url });
    } catch (error) {
      console.error("[MOTION-CONTROL] Video upload error:", error);
      if ((error as any)?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Video file exceeds 250MB limit. Please use a video URL instead." });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upload video",
      });
    }
  });

  app.post("/api/tools/youtube-to-mp4", authenticateToken, async (req, res) => {
    try {
      const { youtubeUrl } = req.body;
      if (!youtubeUrl || typeof youtubeUrl !== "string") {
        return res.status(400).json({ error: "Please provide a valid YouTube URL" });
      }
      const normalizedYoutubeUrl = normalizeYoutubeUrl(youtubeUrl);
      const videoId = extractYoutubeVideoId(normalizedYoutubeUrl);
      if (!videoId) {
        return res.status(400).json({ error: "Could not extract a valid YouTube video id from the URL" });
      }

      const rawCache = await storage.getSetting(YOUTUBE_TO_MP4_CACHE_KEY);
      const cache = sanitizeYoutubeToMp4Cache(rawCache);
      const cachedEntry = cache[videoId];
      if (cachedEntry?.downloadUrl) {
        const cachedUrlIsUsable = await isUsableVideoUrl(cachedEntry.downloadUrl);
        if (cachedUrlIsUsable) {
          const now = new Date().toISOString();
          cache[videoId] = {
            ...cachedEntry,
            youtubeUrl: normalizedYoutubeUrl,
            lastUsedAt: now,
          };
          await storage.setSetting(YOUTUBE_TO_MP4_CACHE_KEY, JSON.stringify(trimYoutubeToMp4Cache(cache)), false);
          console.log(`[YOUTUBE-TO-MP4] Cache hit for video id: ${videoId}`);
          return res.json({
            success: true,
            download_url: cachedEntry.downloadUrl,
            title: cachedEntry.title,
            thumbnail_url: cachedEntry.thumbnailUrl,
            cached: true,
          });
        }

        console.log(`[YOUTUBE-TO-MP4] Cache entry expired for video id: ${videoId}, refreshing conversion`);
        delete cache[videoId];
      }

      console.log(`[YOUTUBE-TO-MP4] Converting via RapidAPI: ${normalizedYoutubeUrl}`);
      const result = await youtubeToMp4(normalizedYoutubeUrl);
      const now = new Date().toISOString();
      cache[videoId] = {
        youtubeUrl: normalizedYoutubeUrl,
        videoId,
        downloadUrl: result.download_url,
        title: result.title,
        thumbnailUrl: result.thumbnail_url,
        createdAt: now,
        lastUsedAt: now,
      };
      await storage.setSetting(YOUTUBE_TO_MP4_CACHE_KEY, JSON.stringify(trimYoutubeToMp4Cache(cache)), false);

      res.json({
        success: true,
        download_url: result.download_url,
        title: result.title,
        thumbnail_url: result.thumbnail_url,
        cached: false,
      });
    } catch (error) {
      console.error("[YOUTUBE-TO-MP4] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to convert YouTube to MP4",
      });
    }
  });

  app.options("/api/motion-control", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post("/api/motion-control", extractTokenFromUrl, authenticateToken, async (req, res) => {
    console.log("[MOTION-CONTROL] Route handler invoked");
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const {
        videoUrl,
        imageUrl,
        prompt,
        startTime,
        endTime,
        includeWatermark: includeWatermarkBody,
        motionControlModel: motionControlModelRaw,
      } = req.body;
      const userId = req.user!.userId;

      const motionControlModel: MotionControlKlingTier =
        motionControlModelRaw === "pro" ? "pro" : "standard";

      const userWithPlan = await storage.getUserWithPlan(userId);
      const isPremiumUser = userWithPlan?.plan?.name === "Premium";
      const includeWatermarkForProject = !isPremiumUser ? true : includeWatermarkBody !== false;

      if (!videoUrl || typeof videoUrl !== "string" || videoUrl.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a direct .mp4 video URL" });
      }
      if (!imageUrl || typeof imageUrl !== "string" || imageUrl.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a reference image" });
      }
      if (typeof startTime !== "number" || typeof endTime !== "number" || endTime <= startTime) {
        return res.status(400).json({ error: "Invalid start/end time range" });
      }
      if (endTime - startTime > 26.5) {
        return res.status(400).json({ error: "Selected range cannot exceed 26 seconds" });
      }

      const CREDITS_PER_7S = 2000;
      const trimDuration = endTime - startTime;
      const baseMotionCredits = Math.ceil(trimDuration / 7) * CREDITS_PER_7S;
      const MOTION_CONTROL_CREDITS =
        motionControlModel === "pro" ? baseMotionCredits * 2 : baseMotionCredits;
      console.log(
        `[MOTION-CONTROL] Model: ${motionControlModel}, trim: ${trimDuration.toFixed(1)}s → ${MOTION_CONTROL_CREDITS} credits`,
      );
      const canAfford = await storage.canUserAffordCredits(userId, MOTION_CONTROL_CREDITS);
      if (!canAfford) {
        const remaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Motion Control generation",
          creditsRequired: MOTION_CONTROL_CREDITS,
          creditsRemaining: remaining,
        });
      }

      const project = await storage.createProject({
        userId,
        title: (prompt || "Motion Control Video").substring(0, 60),
        description: prompt || "Motion Control Video",
        aspectRatio: "9:16",
        currentStep: 1,
        isInstrumental: true,
        includeWatermark: includeWatermarkForProject,
        toolUsed: "motion_control",
      } as any);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your Motion Control video...",
        status: "completed",
        metadata: {},
      });

      res.json({
        success: true,
        projectId: project.id,
        message: "Motion Control video generation started!",
      });

      // Background pipeline
      (async () => {
        console.log(`[MOTION-CONTROL] Background pipeline started for project ${project.id}`);
        try {
          const mp4Url = videoUrl.trim();
          let effectiveInputVideoAspect: "landscape" | "portrait" | "square" | "unknown" = "unknown";

          // Step 1: Trim video
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_trim",
            message: "Trimming video to selected range...",
            status: "progress",
            metadata: {},
          });

          await storage.updateProject(project.id, { currentStep: 2 } as any);

          const trimResult = await trimVideo(mp4Url, startTime, endTime);
          effectiveInputVideoAspect = await getVideoAspectFromUrl(trimResult.download_url);
          console.log(
            `[MOTION-CONTROL] Server-side detected input video aspect: ${effectiveInputVideoAspect}`,
          );

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_trim",
            message: "Video trimmed successfully",
            status: "completed",
            metadata: { trimmedUrl: trimResult.download_url },
          });

          // Step 3: Generate motion control video via Kling v2.6
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message:
              motionControlModel === "pro"
                ? "Generating motion control video (Kling Pro) — this often takes 30–60+ minutes..."
                : "Generating motion control video with AI — this often takes 30–60+ minutes...",
            status: "progress",
            metadata: { motionControlModel },
          });

          await storage.updateProject(project.id, { currentStep: 3 } as any);

          const generationStartTime = Date.now();
          const progressTimer = setInterval(async () => {
            const elapsedMin = Math.round((Date.now() - generationStartTime) / 60000);
            try {
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_generation",
                message: `AI is generating your video... (${elapsedMin} min elapsed)`,
                status: "progress",
                metadata: {},
              });
            } catch {}
          }, 60000);

          let resultVideoUrl: string;
          try {
            resultVideoUrl = await generateMotionControlVideo(
              trimResult.download_url,
              imageUrl.trim(),
              prompt?.trim(),
              motionControlModel,
            );
          } finally {
            clearInterval(progressTimer);
          }

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Motion control video generated successfully",
            status: "completed",
            metadata: { videoUrl: resultVideoUrl },
          });

          // Post-process: optional watermark; TikTok portrait conversion for landscape/unknown input. No outro — final length matches the AI result (which follows the trim).
          const mergeDimensions = "1080x1920";
          const shouldConvertToTiktokPortrait =
            effectiveInputVideoAspect === "landscape" || effectiveInputVideoAspect === "unknown";
          let mergeSourceUrl = resultVideoUrl;

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_postprocess",
            message: shouldConvertToTiktokPortrait
              ? "Converting to TikTok portrait framing..."
              : includeWatermarkForProject
                ? "Adding watermark..."
                : "Finalizing video...",
            status: "progress",
            metadata: {},
          });

          try {
            let watermarkUrl: string | undefined;
            if (includeWatermarkForProject) {
              watermarkUrl = (await getWatermarkUrl()) || undefined;
            }
            if (shouldConvertToTiktokPortrait) {
              const tiktokResult = await convertToTiktokPortrait(
                resultVideoUrl,
                watermarkUrl,
                undefined,
              );
              mergeSourceUrl = tiktokResult.download_url;
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_postprocess",
                message: "TikTok portrait conversion complete",
                status: "progress",
                metadata: { tiktokPortraitUrl: mergeSourceUrl },
              });
            } else if (includeWatermarkForProject) {
              const mergeResult = await mergeVideos(
                [resultVideoUrl],
                undefined,
                undefined,
                watermarkUrl,
                undefined,
                mergeDimensions,
              );
              mergeSourceUrl = mergeResult.download_url;
            } else {
              mergeSourceUrl = resultVideoUrl;
            }
            console.log("[MOTION-CONTROL] Post-process complete:", mergeSourceUrl.substring(0, 80) + "...");
            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_postprocess",
              message: shouldConvertToTiktokPortrait
                ? includeWatermarkForProject
                  ? "TikTok portrait conversion and watermark applied"
                  : "TikTok portrait conversion applied"
                : includeWatermarkForProject
                  ? "Watermark applied"
                  : "No post-process (trim length preserved)",
              status: "completed",
              metadata: { mergedUrl: mergeSourceUrl },
            });
          } catch (mergeErr) {
            console.error("[MOTION-CONTROL] Post-process merge failed, using raw AI output:", mergeErr);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_postprocess",
              message: `Post-process skipped: ${(mergeErr as Error).message}`,
              status: "completed",
              metadata: { usedRawOutput: true },
            });
          }

          // Step: Upload to Bunny storage
          let savedFinalVideoUrl = mergeSourceUrl;
          const objectStorageService = new ObjectStorageService();

          if (isBunnyConfigured("scenes")) {
            console.log("[MOTION-CONTROL] Persisting to Bunny...");
            try {
              const videoResp = await fetch(mergeSourceUrl);
              if (!videoResp.ok) throw new Error(`Failed to fetch result video: ${videoResp.status}`);
              const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
              const { url: bunnyVideoUrl } = await uploadToBunnyStorage(
                "scenes",
                `motion_${project.id}_${Date.now()}.mp4`,
                videoBuffer,
              );
              savedFinalVideoUrl = bunnyVideoUrl;
              console.log("[MOTION-CONTROL] Video persisted to Bunny:", bunnyVideoUrl.substring(0, 60) + "...");
            } catch (persistErr) {
              console.error("[MOTION-CONTROL] Failed to persist to Bunny, using original URL:", persistErr);
            }
          }

          await storage.addGenerationLog({
            projectId: project.id,
            step: "upload",
            message: "Video saved successfully",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl },
          });

          await storage.updateProject(project.id, {
            finalVideoUrl: savedFinalVideoUrl,
            isCompleted: true,
            currentStep: 4,
            generationStatus: "completed" as any,
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Motion Control video completed!",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl },
          });

          const creditDeducted = await storage.deductUserCredits(userId, MOTION_CONTROL_CREDITS);
          if (!creditDeducted) {
            console.error("[MOTION-CONTROL] Failed to deduct credits, but video was generated");
          } else {
            console.log(`[MOTION-CONTROL] Deducted ${MOTION_CONTROL_CREDITS} credits from user ${userId}`);
          }

          try {
            await createMuxAssetForVideo(project.id, savedFinalVideoUrl);
          } catch (muxError) {
            console.error("[MOTION-CONTROL] Failed to create Mux asset:", muxError);
          }
        } catch (error) {
          const errMsg = (error as Error).message;
          console.error("[MOTION-CONTROL] Error:", error);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: `Generation failed: ${errMsg}`,
            status: "error",
            metadata: { error: errMsg },
          });
          await storage.updateProject(project.id, {
            generationStatus: "failed" as any,
          });
        }
      })();
    } catch (error) {
      console.error("[MOTION-CONTROL] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate motion control video",
      });
    }
  });

  // ─── PIXVERSE SWAP ─────────────────────────────────────────────────────

  app.post("/api/swap/upload-video", authenticateToken, motionControlVideoUpload.single("video"), async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: "No video file provided." });
      }

      const fileName = `swap_${Date.now()}_${(req.file.originalname || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await uploadToBunnyStorage("scenes", fileName, req.file.buffer);
      console.log(`[SWAP] Uploaded video to Bunny: ${url.substring(0, 60)}...`);

      res.json({ success: true, videoUrl: url });
    } catch (error) {
      console.error("[SWAP] Video upload error:", error);
      if ((error as any)?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "Video file exceeds 250MB limit. Please use a video URL instead." });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upload video",
      });
    }
  });

  app.options("/api/swap", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post("/api/swap", extractTokenFromUrl, authenticateToken, async (req, res) => {
    console.log("[SWAP] Route handler invoked");
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    const SWAP_MODES: PixverseSwapMode[] = ["person", "object", "background"];

    try {
      const {
        videoUrl,
        imageUrl,
        prompt,
        startTime,
        endTime,
        includeWatermark: includeWatermarkBody,
        mode: modeRaw,
      } = req.body;
      const userId = req.user!.userId;

      const userWithPlan = await storage.getUserWithPlan(userId);
      const isPremiumUser = userWithPlan?.plan?.name === "Premium";
      const includeWatermarkForProject = !isPremiumUser ? true : includeWatermarkBody !== false;

      const mode =
        typeof modeRaw === "string" && SWAP_MODES.includes(modeRaw as PixverseSwapMode)
          ? (modeRaw as PixverseSwapMode)
          : null;
      if (!mode) {
        return res.status(400).json({ error: "Invalid mode. Use person, object, or background." });
      }

      if (!videoUrl || typeof videoUrl !== "string" || videoUrl.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a direct .mp4 video URL" });
      }
      if (!imageUrl || typeof imageUrl !== "string" || imageUrl.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a reference image" });
      }
      if (typeof startTime !== "number" || typeof endTime !== "number" || endTime <= startTime) {
        return res.status(400).json({ error: "Invalid start/end time range" });
      }
      if (endTime - startTime > 26.5) {
        return res.status(400).json({ error: "Selected range cannot exceed 26 seconds" });
      }

      const CREDITS_PER_7S = 2000;
      const trimDuration = endTime - startTime;
      const SWAP_CREDITS = Math.ceil(trimDuration / 7) * CREDITS_PER_7S;
      console.log(`[SWAP] Trim duration: ${trimDuration.toFixed(1)}s → ${SWAP_CREDITS} credits`);
      const canAfford = await storage.canUserAffordCredits(userId, SWAP_CREDITS);
      if (!canAfford) {
        const remaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Swap generation",
          creditsRequired: SWAP_CREDITS,
          creditsRemaining: remaining,
        });
      }

      const project = await storage.createProject({
        userId,
        title: (prompt || "Swap Video").substring(0, 60),
        description: prompt || "Swap Video",
        aspectRatio: "9:16",
        currentStep: 1,
        isInstrumental: true,
        includeWatermark: includeWatermarkForProject,
        toolUsed: "swap",
      } as any);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your Swap video...",
        status: "completed",
        metadata: {},
      });

      res.json({
        success: true,
        projectId: project.id,
        message: "Swap video generation started!",
      });

      (async () => {
        console.log(`[SWAP] Background pipeline started for project ${project.id}`);
        try {
          const mp4Url = videoUrl.trim();
          let effectiveInputVideoAspect: "landscape" | "portrait" | "square" | "unknown" = "unknown";

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_trim",
            message: "Trimming video to selected range...",
            status: "progress",
            metadata: {},
          });

          await storage.updateProject(project.id, { currentStep: 2 } as any);

          const trimResult = await trimVideo(mp4Url, startTime, endTime);
          effectiveInputVideoAspect = await getVideoAspectFromUrl(trimResult.download_url);
          console.log(`[SWAP] Server-side detected input video aspect: ${effectiveInputVideoAspect}`);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_trim",
            message: "Video trimmed successfully",
            status: "completed",
            metadata: { trimmedUrl: trimResult.download_url },
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Generating swap video with AI — this can take up to 30 minutes...",
            status: "progress",
            metadata: {},
          });

          await storage.updateProject(project.id, { currentStep: 3 } as any);

          const generationStartTime = Date.now();
          const progressTimer = setInterval(async () => {
            const elapsedMin = Math.round((Date.now() - generationStartTime) / 60000);
            try {
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_generation",
                message: `AI is generating your video... (${elapsedMin} min elapsed)`,
                status: "progress",
                metadata: {},
              });
            } catch {}
          }, 60000);

          let resultVideoUrl: string;
          try {
            resultVideoUrl = await generatePixverseSwapVideo(trimResult.download_url, imageUrl.trim(), mode);
          } finally {
            clearInterval(progressTimer);
          }

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Swap video generated successfully",
            status: "completed",
            metadata: { videoUrl: resultVideoUrl },
          });

          const outroVideoUrl = "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_vertical.mp4";
          const mergeDimensions = "1080x1920";
          const shouldConvertToTiktokPortrait =
            effectiveInputVideoAspect === "landscape" || effectiveInputVideoAspect === "unknown";
          let mergeSourceUrl = resultVideoUrl;

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_postprocess",
            message: shouldConvertToTiktokPortrait
              ? "Converting to TikTok portrait framing..."
              : includeWatermarkForProject
                ? "Adding watermark and outro..."
                : "Adding outro...",
            status: "progress",
            metadata: {},
          });

          try {
            let watermarkUrl: string | undefined;
            if (includeWatermarkForProject) {
              watermarkUrl = (await getWatermarkUrl()) || undefined;
            }
            if (shouldConvertToTiktokPortrait) {
              const tiktokResult = await convertToTiktokPortrait(
                resultVideoUrl,
                watermarkUrl,
                outroVideoUrl,
              );
              mergeSourceUrl = tiktokResult.download_url;
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_postprocess",
                message: "TikTok portrait conversion complete",
                status: "progress",
                metadata: { tiktokPortraitUrl: mergeSourceUrl },
              });
            } else {
              const mergeResult = await mergeVideos(
                [resultVideoUrl],
                undefined,
                undefined,
                watermarkUrl,
                outroVideoUrl,
                mergeDimensions,
              );
              mergeSourceUrl = mergeResult.download_url;
            }
            console.log("[SWAP] Post-process merge complete:", mergeSourceUrl.substring(0, 80) + "...");
            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_postprocess",
              message: shouldConvertToTiktokPortrait
                ? includeWatermarkForProject
                  ? "TikTok portrait conversion, watermark, and outro applied"
                  : "TikTok portrait conversion and outro applied"
                : includeWatermarkForProject
                  ? "Watermark and outro applied"
                  : "Outro applied",
              status: "completed",
              metadata: { mergedUrl: mergeSourceUrl },
            });
          } catch (mergeErr) {
            console.error("[SWAP] Post-process merge failed, using raw AI output:", mergeErr);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_postprocess",
              message: `Post-process skipped: ${(mergeErr as Error).message}`,
              status: "completed",
              metadata: { usedRawOutput: true },
            });
          }

          let savedFinalVideoUrl = mergeSourceUrl;

          if (isBunnyConfigured("scenes")) {
            console.log("[SWAP] Persisting to Bunny...");
            try {
              const videoResp = await fetch(mergeSourceUrl);
              if (!videoResp.ok) throw new Error(`Failed to fetch result video: ${videoResp.status}`);
              const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
              const { url: bunnyVideoUrl } = await uploadToBunnyStorage(
                "scenes",
                `swap_${project.id}_${Date.now()}.mp4`,
                videoBuffer,
              );
              savedFinalVideoUrl = bunnyVideoUrl;
              console.log("[SWAP] Video persisted to Bunny:", bunnyVideoUrl.substring(0, 60) + "...");
            } catch (persistErr) {
              console.error("[SWAP] Failed to persist to Bunny, using original URL:", persistErr);
            }
          }

          await storage.addGenerationLog({
            projectId: project.id,
            step: "upload",
            message: "Video saved successfully",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl },
          });

          await storage.updateProject(project.id, {
            finalVideoUrl: savedFinalVideoUrl,
            isCompleted: true,
            currentStep: 4,
            generationStatus: "completed" as any,
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Swap video completed!",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl },
          });

          const creditDeducted = await storage.deductUserCredits(userId, SWAP_CREDITS);
          if (!creditDeducted) {
            console.error("[SWAP] Failed to deduct credits, but video was generated");
          } else {
            console.log(`[SWAP] Deducted ${SWAP_CREDITS} credits from user ${userId}`);
          }

          try {
            await createMuxAssetForVideo(project.id, savedFinalVideoUrl);
          } catch (muxError) {
            console.error("[SWAP] Failed to create Mux asset:", muxError);
          }
        } catch (error) {
          const errMsg = (error as Error).message;
          console.error("[SWAP] Error:", error);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: `Generation failed: ${errMsg}`,
            status: "error",
            metadata: { error: errMsg },
          });
          await storage.updateProject(project.id, {
            generationStatus: "failed" as any,
          });
        }
      })();
    } catch (error) {
      console.error("[SWAP] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate swap video",
      });
    }
  });

  // ─── REIMAGINE (Lucy Restyle) ─────────────────────────────────────────

  app.post("/api/reimagine", extractTokenFromUrl, authenticateToken, async (req, res) => {
    console.log("[REIMAGINE] Route handler invoked");
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const {
        videoUrl,
        prompt,
        startTime,
        endTime,
        aspectRatio: aspectRatioRaw,
        inputVideoAspect: inputVideoAspectRaw,
        includeWatermark: includeWatermarkBody,
      } = req.body;
      const userId = req.user!.userId;

      const userWithPlan = await storage.getUserWithPlan(userId);
      const isPremiumUser = userWithPlan?.plan?.name === "Premium";
      const includeWatermarkForProject = !isPremiumUser ? true : includeWatermarkBody !== false;

      if (!videoUrl || typeof videoUrl !== "string" || videoUrl.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a direct .mp4 video URL" });
      }
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a style prompt" });
      }
      if (typeof startTime !== "number" || typeof endTime !== "number" || endTime <= startTime) {
        return res.status(400).json({ error: "Invalid start/end time range" });
      }
      if (endTime - startTime > 120.5) {
        return res.status(400).json({ error: "Selected range cannot exceed 120 seconds" });
      }

      const allowedAspectRatios = new Set(["9:16", "16:9", "1:1"]);
      const outputAspectRatio =
        typeof aspectRatioRaw === "string" && allowedAspectRatios.has(aspectRatioRaw)
          ? aspectRatioRaw
          : "9:16";
      const inputVideoAspect =
        inputVideoAspectRaw === "landscape" ||
        inputVideoAspectRaw === "portrait" ||
        inputVideoAspectRaw === "square"
          ? inputVideoAspectRaw
          : "unknown";

      const CREDITS_PER_15S = 1000;
      const trimDuration = endTime - startTime;
      const REIMAGINE_CREDITS = Math.ceil(trimDuration / 15) * CREDITS_PER_15S;
      console.log(`[REIMAGINE] Trim duration: ${trimDuration.toFixed(1)}s → ${REIMAGINE_CREDITS} credits`);
      const canAfford = await storage.canUserAffordCredits(userId, REIMAGINE_CREDITS);
      if (!canAfford) {
        const remaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Reimagine generation",
          creditsRequired: REIMAGINE_CREDITS,
          creditsRemaining: remaining,
        });
      }

      const project = await storage.createProject({
        userId,
        title: (prompt || "Reimagine Video").substring(0, 60),
        description: prompt || "Reimagine Video",
        aspectRatio: outputAspectRatio,
        currentStep: 1,
        isInstrumental: true,
        includeWatermark: includeWatermarkForProject,
        toolUsed: "reimagine",
      } as any);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your Reimagine video...",
        status: "completed",
        metadata: { aspectRatio: outputAspectRatio, inputVideoAspect },
      });

      res.json({
        success: true,
        projectId: project.id,
        message: "Reimagine video generation started!",
      });

      (async () => {
        console.log(`[REIMAGINE] Background pipeline started for project ${project.id}`);
        try {
          const mp4Url = videoUrl.trim();
          let effectiveInputVideoAspect = inputVideoAspect;

          // Step 1: Trim video
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_trim",
            message: "Trimming video to selected range...",
            status: "progress",
            metadata: {},
          });

          await storage.updateProject(project.id, { currentStep: 2 } as any);

          const trimResult = await trimVideo(mp4Url, startTime, endTime);
          if (effectiveInputVideoAspect === "unknown") {
            effectiveInputVideoAspect = await getVideoAspectFromUrl(trimResult.download_url);
            console.log(`[REIMAGINE] Server-side detected input video aspect: ${effectiveInputVideoAspect}`);
          }

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_trim",
            message: "Video trimmed successfully",
            status: "completed",
            metadata: { trimmedUrl: trimResult.download_url },
          });

          // Step 2: Extract audio from trimmed video
          await storage.addGenerationLog({
            projectId: project.id,
            step: "audio_extraction",
            message: "Extracting audio from video...",
            status: "progress",
            metadata: {},
          });

          const audioResult = await extractAudioMp3(trimResult.download_url);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "audio_extraction",
            message: "Audio extracted successfully",
            status: "completed",
            metadata: { audioUrl: audioResult.download_url },
          });

          // Step 3: Generate restyled video via Lucy
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Generating restyled video with AI — this can take several minutes...",
            status: "progress",
            metadata: {},
          });

          await storage.updateProject(project.id, { currentStep: 3 } as any);

          const generationStartTime = Date.now();
          const progressTimer = setInterval(async () => {
            const elapsedMin = Math.round((Date.now() - generationStartTime) / 60000);
            try {
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_generation",
                message: `AI is generating your video... (${elapsedMin} min elapsed)`,
                status: "progress",
                metadata: {},
              });
            } catch {}
          }, 60000);

          let resultVideoUrl: string;
          try {
            resultVideoUrl = await generateLucyRestyleVideo(prompt.trim(), trimResult.download_url);
          } finally {
            clearInterval(progressTimer);
          }

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Restyled video generated successfully",
            status: "completed",
            metadata: { videoUrl: resultVideoUrl },
          });

          // Step 4: Merge restyled video + extracted audio + outro + watermark
          const shouldConvertToTiktokPortrait =
            outputAspectRatio === "9:16" &&
            (effectiveInputVideoAspect === "landscape" || effectiveInputVideoAspect === "unknown");
          // Outro orientation: use vertical when the final output will be portrait (either directly or via TikTok conversion).
          // Use horizontal only when input is landscape AND no portrait conversion is happening.
          const outroVideoUrl = (!shouldConvertToTiktokPortrait && effectiveInputVideoAspect === "landscape")
            ? "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_horizontal.mp4"
            : "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_vertical.mp4";
          console.log(`[REIMAGINE] outroVideoUrl: ${outroVideoUrl}`);
          const mergeDimensions: string | undefined = undefined;
          let mergeSourceUrl = resultVideoUrl;

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_postprocess",
            message: shouldConvertToTiktokPortrait
              ? "Merging audio and outro before TikTok portrait conversion..."
              : includeWatermarkForProject
                ? "Merging audio, adding watermark and outro..."
                : "Merging audio and adding outro...",
            status: "progress",
            metadata: {},
          });

          try {
            let watermarkUrl: string | undefined;
            if (includeWatermarkForProject) {
              watermarkUrl = (await getWatermarkUrl()) || undefined;
            }
            const watermarkForMerge = shouldConvertToTiktokPortrait ? undefined : watermarkUrl;
            // Keep merge behavior explicit: send main + outro as two video URLs.
            // This mirrors the music-video flow expectation and avoids relying on helper remapping.
            const mergeVideoUrls = shouldConvertToTiktokPortrait
              ? [resultVideoUrl]
              : [resultVideoUrl, outroVideoUrl];
            const mergeResult = await mergeVideos(
              mergeVideoUrls,
              audioResult.download_url,
              undefined,
              watermarkForMerge,
              undefined,
              mergeDimensions,
            );
            mergeSourceUrl = mergeResult.download_url;

            // If user wants portrait output but source is landscape, run TikTok portrait conversion after merge.
            if (shouldConvertToTiktokPortrait) {
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_postprocess",
                message: "Converting merged video to TikTok portrait framing...",
                status: "progress",
                metadata: {},
              });
              const tiktokResult = await convertToTiktokPortrait(
                mergeSourceUrl,
                watermarkUrl,
                outroVideoUrl,
              );
              mergeSourceUrl = tiktokResult.download_url;
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_postprocess",
                message: "TikTok portrait conversion complete",
                status: "progress",
                metadata: { tiktokPortraitUrl: mergeSourceUrl },
              });
            }

            console.log("[REIMAGINE] Post-process merge complete:", mergeSourceUrl.substring(0, 80) + "...");
            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_postprocess",
              message: includeWatermarkForProject
                ? "Audio merged, watermark and outro applied"
                : "Audio merged and outro applied",
              status: "completed",
              metadata: { mergedUrl: mergeSourceUrl },
            });
          } catch (mergeErr) {
            console.error("[REIMAGINE] Post-process merge failed, using raw AI output:", mergeErr);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "video_postprocess",
              message: `Post-process skipped: ${(mergeErr as Error).message}`,
              status: "completed",
              metadata: { usedRawOutput: true },
            });
          }

          // Step 5: Persist and finalize
          let savedFinalVideoUrl = mergeSourceUrl;

          if (isBunnyConfigured("scenes")) {
            console.log("[REIMAGINE] Persisting to Bunny...");
            try {
              const videoResp = await fetch(mergeSourceUrl);
              if (!videoResp.ok) throw new Error(`Failed to fetch result video: ${videoResp.status}`);
              const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
              const { url: bunnyVideoUrl } = await uploadToBunnyStorage(
                "scenes",
                `reimagine_${project.id}_${Date.now()}.mp4`,
                videoBuffer,
              );
              savedFinalVideoUrl = bunnyVideoUrl;
              console.log("[REIMAGINE] Video persisted to Bunny:", bunnyVideoUrl.substring(0, 60) + "...");
            } catch (persistErr) {
              console.error("[REIMAGINE] Failed to persist to Bunny, using original URL:", persistErr);
            }
          }

          await storage.addGenerationLog({
            projectId: project.id,
            step: "upload",
            message: "Video saved successfully",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl },
          });

          await storage.updateProject(project.id, {
            finalVideoUrl: savedFinalVideoUrl,
            isCompleted: true,
            currentStep: 4,
            generationStatus: "completed" as any,
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Reimagine video completed!",
            status: "completed",
            metadata: { finalVideoUrl: savedFinalVideoUrl },
          });

          const creditDeducted = await storage.deductUserCredits(userId, REIMAGINE_CREDITS);
          if (!creditDeducted) {
            console.error("[REIMAGINE] Failed to deduct credits, but video was generated");
          } else {
            console.log(`[REIMAGINE] Deducted ${REIMAGINE_CREDITS} credits from user ${userId}`);
          }

          try {
            await createMuxAssetForVideo(project.id, savedFinalVideoUrl);
          } catch (muxError) {
            console.error("[REIMAGINE] Failed to create Mux asset:", muxError);
          }
        } catch (error) {
          const errMsg = (error as Error).message;
          console.error("[REIMAGINE] Error:", error);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: `Generation failed: ${errMsg}`,
            status: "error",
            metadata: { error: errMsg },
          });
          await storage.updateProject(project.id, {
            generationStatus: "failed" as any,
          });
        }
      })();
    } catch (error) {
      console.error("[REIMAGINE] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate reimagine video",
      });
    }
  });

  // ─── LOOP VIDEO (Seamless Loop) ───────────────────────────────────────
  const LOOP_VIDEO_CREDITS = 2000;

  /** Shared pipeline: image → 12s video → frames → transition → merge → loop to audio. Caller creates project and passes projectId. */
  async function processLoopVideo(
    userId: string,
    projectId: string,
    prompt: string,
    audioUrl: string,
    aspectRatio: string,
    deductCredits: boolean
  ): Promise<{ success: true; finalVideoUrl: string } | { success: false; error: string }> {
    const objectStorageService = new ObjectStorageService();
    try {
      await storage.addGenerationLog({
        projectId,
        step: "image_generation",
        message: "Generating image from prompt...",
        status: "progress",
        metadata: {},
      });

      const imageUrl = await generateImageFromText(prompt.trim(), aspectRatio);

      await storage.addGenerationLog({
        projectId,
        step: "image_generation",
        message: "Image generated successfully",
        status: "completed",
        metadata: { imageUrl },
      });

      await storage.updateProject(projectId, { characterImageUrl: imageUrl, currentStep: 2 } as any);

      await storage.addGenerationLog({
        projectId,
        step: "original_video",
        message: "Creating original 12-second video...",
        status: "progress",
        metadata: {},
      });

      const originalVideoUrl = await generateVideoFromImageLoop(imageUrl, prompt.trim(), aspectRatio, 12);

      await storage.addGenerationLog({
        projectId,
        step: "original_video",
        message: "Original video created",
        status: "completed",
        metadata: { videoUrl: originalVideoUrl },
      });

      let videoUrlForFrames = originalVideoUrl;
      if (isBunnyConfigured("scenes") && !isBunnyUrl(originalVideoUrl)) {
        try {
          const videoResp = await fetch(originalVideoUrl);
          if (!videoResp.ok) throw new Error(`Failed to fetch: ${videoResp.status}`);
          const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
          const { url: bunnyUrl } = await uploadToBunnyStorage("scenes", `loop_orig_${projectId}_${Date.now()}.mp4`, videoBuffer);
          videoUrlForFrames = bunnyUrl;
        } catch (e) {
          console.warn("[LOOP-VIDEO] Persist original to Bunny failed, using WaveSpeed URL:", e);
        }
      }

      await storage.addGenerationLog({
        projectId,
        step: "frame_extraction",
        message: "Extracting first and last frames...",
        status: "progress",
        metadata: {},
      });

      const lastFrameResult = await getLastFrameImage(videoUrlForFrames);
      const firstFrameResult = await getFirstFrameImage(videoUrlForFrames);
      const lastFrameImageUrl = lastFrameResult.image_url || lastFrameResult.download_url!;
      const firstFrameImageUrl = firstFrameResult.image_url || firstFrameResult.download_url!;

      await storage.addGenerationLog({
        projectId,
        step: "frame_extraction",
        message: "Frames extracted",
        status: "completed",
        metadata: {},
      });

      await storage.addGenerationLog({
        projectId,
        step: "transition_video",
        message: "Creating transition video (last → first frame)...",
        status: "progress",
        metadata: {},
      });

      const secondVideoUrl = await generateVideoFromImageTransition(
        lastFrameImageUrl,
        firstFrameImageUrl,
        "a slow smooth transition between images",
        aspectRatio,
        12,
      );

      await storage.addGenerationLog({
        projectId,
        step: "transition_video",
        message: "Transition video created",
        status: "completed",
        metadata: { videoUrl: secondVideoUrl },
      });

      let secondVideoUrlForMerge = secondVideoUrl;
      if (isBunnyConfigured("scenes") && !isBunnyUrl(secondVideoUrl)) {
        try {
          const videoResp = await fetch(secondVideoUrl);
          if (!videoResp.ok) throw new Error(`Failed to fetch: ${videoResp.status}`);
          const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
          const { url: bunnyUrl } = await uploadToBunnyStorage("scenes", `loop_second_${projectId}_${Date.now()}.mp4`, videoBuffer);
          secondVideoUrlForMerge = bunnyUrl;
        } catch (e) {
          console.warn("[LOOP-VIDEO] Persist second video to Bunny failed:", e);
        }
      }

      await storage.addGenerationLog({
        projectId,
        step: "merge",
        message: "Merging original + transition clip...",
        status: "progress",
        metadata: {},
      });

      const dimensions = aspectRatio === "9:16" ? "1080x1920" : aspectRatio === "3:4" ? "1080x1440" : "1920x1080";
      const mergedVideo = await mergeVideos(
        [videoUrlForFrames, secondVideoUrlForMerge],
        undefined,
        undefined,
        undefined,
        undefined,
        dimensions,
      );

      await storage.addGenerationLog({
        projectId,
        step: "merge",
        message: "Merge complete",
        status: "completed",
        metadata: {},
      });

      const mergedVideoUrl = mergedVideo.download_url;

      await storage.addGenerationLog({
        projectId,
        step: "video_loop",
        message: "Looping video to match audio length...",
        status: "progress",
        metadata: {},
      });

      const loopResult = await videoLoop(mergedVideoUrl, audioUrl.trim(), undefined);

      await storage.addGenerationLog({
        projectId,
        step: "video_loop",
        message: `Loop complete (${loopResult.loops ?? "?"} loops)`,
        status: "completed",
        metadata: { loops: loopResult.loops },
      });

      let savedFinalVideoUrl: string;
      const finalDownloadUrl = loopResult.download_url;
      if (finalDownloadUrl.includes("/api/ffmpeg-local/download/")) {
        const { OUTPUT_FOLDER } = await import("./services/ffmpegLocal.js");
        const localFilePath = path.join(OUTPUT_FOLDER, loopResult.filename);
        const videoBuffer = fs.readFileSync(localFilePath);
        const uploadResult = await objectStorageService.uploadVideoBuffer(
          videoBuffer,
          `loop_video_${Date.now()}.mp4`,
        );
        savedFinalVideoUrl = uploadResult.url;
      } else {
        const uploadResult = await objectStorageService.uploadVideoFromUrl(
          finalDownloadUrl,
          `loop_video_${Date.now()}.mp4`,
        );
        savedFinalVideoUrl = uploadResult.url;
      }

      await storage.addGenerationLog({
        projectId,
        step: "upload",
        message: "Video saved successfully",
        status: "completed",
        metadata: { finalVideoUrl: savedFinalVideoUrl },
      });

      await storage.updateProject(projectId, {
        finalVideoUrl: savedFinalVideoUrl,
        isCompleted: true,
        currentStep: 5,
        generationStatus: "completed" as any,
      } as any);

      if (deductCredits) {
        await storage.deductUserCredits(userId, LOOP_VIDEO_CREDITS);
      }

      try {
        await createMuxAssetForVideo(projectId, savedFinalVideoUrl);
      } catch (muxError) {
        console.error("[LOOP-VIDEO] Mux asset failed:", muxError);
      }

      return { success: true, finalVideoUrl: savedFinalVideoUrl };
    } catch (error) {
      const errMsg = (error as Error).message;
      console.error("[LOOP-VIDEO] Error:", error);
      await storage.addGenerationLog({
        projectId,
        step: "video_generation",
        message: `Generation failed: ${errMsg}`,
        status: "error",
        metadata: { error: errMsg },
      });
      return { success: false, error: errMsg };
    }
  }

  app.options("/api/loop-video", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.post("/api/loop-video", extractTokenFromUrl, authenticateToken, async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const { prompt, audioUrl: providedAudioUrl, aspectRatio: requestedAspectRatio } = req.body;
      const userId = req.user!.userId;

      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        return res.status(400).json({ error: "Please provide a prompt describing what your song is about." });
      }

      const hasAudio = typeof providedAudioUrl === "string" && providedAudioUrl.trim().length > 0;
      if (!hasAudio) {
        return res.status(400).json({ error: "Audio is required. Please provide an audio URL or upload audio." });
      }

      const validAspectRatios = ["3:4", "9:16", "16:9"];
      const aspectRatio = validAspectRatios.includes(requestedAspectRatio) ? requestedAspectRatio : "3:4";

      const canAfford = await storage.canUserAffordCredits(userId, LOOP_VIDEO_CREDITS);
      if (!canAfford) {
        const remaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Loop Video generation",
          creditsRequired: LOOP_VIDEO_CREDITS,
          creditsRemaining: remaining,
        });
      }

      const project = await storage.createProject({
        userId,
        title: `Loop: ${prompt.substring(0, 50)}`,
        description: prompt,
        aspectRatio,
        currentStep: 1,
        addSubtitles: false,
        isInstrumental: true,
        toolUsed: "loop_video",
      } as any);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your Loop Video...",
        status: "completed",
        metadata: {},
      });

      res.json({
        success: true,
        projectId: project.id,
        message: "Loop Video generation started!",
      });

      (async () => {
        const result = await processLoopVideo(userId, project.id, prompt.trim(), providedAudioUrl.trim(), aspectRatio, true);
        if (!result.success) {
          console.error("[LOOP-VIDEO] processLoopVideo failed:", result.error);
        }
      })();
    } catch (error) {
      console.error("[LOOP-VIDEO] Route error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to start loop video generation",
      });
    }
  });

  // ─── AUTO-GENERATE LOOP VIDEO (private, cron-friendly) ─────────────────
  app.options("/api/auto-generate-loop-video", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.get("/api/auto-generate-loop-video", extractTokenFromUrl, authenticateToken, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    const notificationEmail = process.env.CONTACT_EMAIL || "info@neonvideo.ai";
    const baseUrl = process.env.FRONTEND_URL || "https://neonvideo.ai";

    try {
      const userId = req.user!.userId;
      const { aspectRatio: requestedAspectRatio, songDuration: requestedSongDuration, style: requestedStyle, musicProvider: requestedMusicProvider } = req.query;

      const selectedTheme = resolveLoopVideoTheme(requestedStyle as string | undefined);

      const validAspectRatios = ["3:4", "9:16", "16:9"];
      const aspectRatio = validAspectRatios.includes(requestedAspectRatio as string) ? (requestedAspectRatio as string) : "3:4";
      const songDuration = typeof requestedSongDuration !== "undefined"
        ? Math.max(30, Math.min(180, parseInt(String(requestedSongDuration), 10) || 120))
        : 120;
      const musicProvider = (requestedMusicProvider as string)?.toLowerCase() === "elevenlabs" ? "elevenlabs" : "minimax";

      const canAfford = await storage.canUserAffordCredits(userId, LOOP_VIDEO_CREDITS);
      if (!canAfford) {
        const remaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Auto-Generate Loop Video",
          creditsRequired: LOOP_VIDEO_CREDITS,
          creditsRemaining: remaining,
        });
      }

      const project = await storage.createProject({
        userId,
        title: "Auto-Generated Loop Video",
        description: "",
        aspectRatio,
        currentStep: 1,
        addSubtitles: false,
        isInstrumental: true,
        toolUsed: "loop_video",
      } as any);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up Auto-Generate Loop Video...",
        status: "completed",
        metadata: {},
      });

      const timestamp = new Date().toISOString();
      res.json({
        success: true,
        projectId: project.id,
        message: "Auto-generated loop video is being processed. You will receive an email at " + notificationEmail + " when it's ready.",
        timestamp,
        statusUrl: `/api/neon-single-prompt/status/${project.id}`,
        projectUrl: `${baseUrl}/v/${project.id}`,
        style: selectedTheme.id,
        styleName: selectedTheme.name,
        musicProvider,
      });

      (async () => {
        let projectId = project.id;
        const theme = selectedTheme;
        try {
          console.log("[AUTO-GENERATE-LOOP] Theme:", theme.id, "| Music provider:", musicProvider);

          // Step 1: Song and video description (OpenAI)
          console.log("[AUTO-GENERATE-LOOP] Step 1: Generating song and video description...");
          const descResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a creative music director. Generate a vivid, specific "what is your song about" song description and a matching short video description. The song description should be emotionally specific — mention a character, a conflict, or a feeling (not generic). Topics must relate to: ${theme.topics}. Keep each 1-2 sentences. Respond ONLY with valid JSON: { "song_description": "...", "video_description": "..." }`,
              },
              { role: "user", content: `Generate a unique, emotionally compelling song concept and video description (${theme.name} theme). Be specific and creative — avoid generic phrases like "a song about the future" or "a love story". Give it a narrative angle.` },
            ],
            response_format: { type: "json_object" },
            max_tokens: 250,
          });
          const descContent = descResponse.choices[0]?.message?.content || "{}";
          const descriptions = JSON.parse(descContent) as { song_description?: string; video_description?: string };
          const songDescription = (descriptions.song_description || "cyberpunk love").trim();
          const videoDescription = (descriptions.video_description || "neon city at night").trim();
          console.log("[AUTO-GENERATE-LOOP] Song description:", songDescription, "| Video:", videoDescription);

          // Step 2a: Lyrics (OpenAI)
          console.log("[AUTO-GENERATE-LOOP] Step 2a: Generating lyrics...");
          const { lyrics, title: lyricsTitle } = await generateLyricsWithTitle(songDescription, songDuration);
          console.log("[AUTO-GENERATE-LOOP] Lyrics generated, title:", lyricsTitle);

          // Step 2b: Song prompt for Minimax (theme-specific music style with varied production tags)
          console.log("[AUTO-GENERATE-LOOP] Step 2b: Generating song prompt for Minimax...");
          const vocalTypes = ["male singer", "female singer", "male rapper", "female vocalist", "deep male voice", "ethereal female voice", "raspy male vocal", "powerful female belting"];
          const randomVocal = vocalTypes[Math.floor(Math.random() * vocalTypes.length)];
          const energyLevels = ["high energy", "moody and atmospheric", "aggressive", "dreamy", "intense build-up", "laid-back groove"];
          const randomEnergy = energyLevels[Math.floor(Math.random() * energyLevels.length)];
          const songPromptResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You write detailed music production prompts for an AI music generation API. Include genre, instruments, vocal style, energy, and tempo. Style reference: ${theme.musicGuide} Write a single comma-separated tag list (no sentences, no JSON). Example format: "hip-hop, male rapper, heavy 808 bass, trap hi-hats, dark synth pads, aggressive, 140 BPM"`,
              },
              { role: "user", content: `Write music production tags for a song about: ${songDescription}. Must include: ${randomVocal}, ${randomEnergy}. Theme: ${theme.name}.` },
            ],
            max_tokens: 200,
          });
          const songPrompt = (songPromptResponse.choices[0]?.message?.content || `${theme.name}, ${randomVocal}, ${randomEnergy}, drums, synth`).trim();
          console.log("[AUTO-GENERATE-LOOP] Song prompt:", songPrompt);

          // Step 3: Generate song (Minimax or ElevenLabs)
          let audioUrl: string;
          let songResultDuration: number;
          if (musicProvider === "elevenlabs") {
            console.log("[AUTO-GENERATE-LOOP] Step 3: Generating song with ElevenLabs...");
            const elResult = await generateSongWithElevenLabs(songPrompt, lyrics, songDuration * 1000);
            audioUrl = elResult.audioUrl;
            songResultDuration = elResult.duration;
          } else {
            console.log("[AUTO-GENERATE-LOOP] Step 3: Generating song with Minimax...");
            const mmResult = await generateSingleSong(songPrompt, lyrics, "", 1);
            audioUrl = mmResult.audioUrl;
            songResultDuration = mmResult.duration;
          }
          console.log("[AUTO-GENERATE-LOOP] Song generated, duration:", songResultDuration);

          // Step 4: Video prompt for 12s loop (OpenAI) — vary visual style: realistic, cartoon, or anime
          const videoStyles = ["hyper realistic", "cartoon", "anime"] as const;
          const videoStyle = videoStyles[Math.floor(Math.random() * videoStyles.length)];
          console.log("[AUTO-GENERATE-LOOP] Step 4: Generating 12s video prompt (style:", videoStyle, ")...");
          const videoPromptResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You write a single, detailed prompt for a 12-second video. Visual world and mood: ${theme.visualGuide}. Include: detailed character and place, subtle movement only (no jumping or running), slow or no camera movement. One paragraph. Visual style for this video must be: ${videoStyle}. Describe the scene so it will be rendered in that style (e.g. hyper realistic = photorealistic; cartoon = illustrated/cartoon look; anime = anime/cel-shaded). Rich colors. Do not mention "uploaded image" or audio—this is for text-to-image then image-to-video. Output only the prompt text, no JSON.`,
              },
              { role: "user", content: `Write a 12-second video prompt for: ${videoDescription}. ${theme.name} aesthetic, detailed character and scene, subtle movement, slow or no camera. Visual style: ${videoStyle}.` },
            ],
            max_tokens: 300,
          });
          const videoPrompt = (videoPromptResponse.choices[0]?.message?.content || videoDescription).trim();
          console.log("[AUTO-GENERATE-LOOP] Video prompt:", videoPrompt.substring(0, 120) + "...");

          await storage.updateProject(projectId, {
            title: `Loop: ${videoPrompt.substring(0, 50)}`,
            description: videoPrompt,
          } as any);

          // Step 5: Loop video pipeline
          console.log("[AUTO-GENERATE-LOOP] Step 5: Running loop video pipeline...");
          const loopResult = await processLoopVideo(userId, projectId, videoPrompt, audioUrl, aspectRatio, true);

          if (loopResult.success) {
            console.log("[AUTO-GENERATE-LOOP] Completed. Sending success email to", notificationEmail);
            await emailService.sendEmail({
              to: notificationEmail,
              subject: "Auto-generated loop video is ready",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>Auto-Generated Loop Video Ready</h2>
                  <p>The auto-generated loop video has been completed successfully.</p>
                  <p><a href="${baseUrl}/v/${projectId}">View project</a></p>
                  <p style="color:#666; font-size: 12px;">Project ID: ${projectId}</p>
                </div>
              `,
            });
          } else {
            console.error("[AUTO-GENERATE-LOOP] Pipeline failed:", loopResult.error);
            await emailService.sendEmail({
              to: notificationEmail,
              subject: "Auto-generated loop video failed",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>Auto-Generated Loop Video Failed</h2>
                  <p>Error: ${loopResult.error}</p>
                  <p>Project ID: ${projectId}</p>
                  <p><a href="${baseUrl}/v/${projectId}">View project</a></p>
                </div>
              `,
            });
          }
        } catch (error) {
          const errMsg = (error as Error).message;
          console.error("[AUTO-GENERATE-LOOP] Error:", error);
          await emailService.sendEmail({
            to: notificationEmail,
            subject: "Auto-generated loop video failed",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Auto-Generated Loop Video Failed</h2>
                <p>Error: ${errMsg}</p>
                <p>Project ID: ${projectId}</p>
                <p><a href="${baseUrl}/v/${projectId}">View project</a></p>
              </div>
            `,
          });
        }
      })();
    } catch (error: any) {
      console.error("[AUTO-GENERATE-LOOP] Route error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to start auto-generate loop video",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // CORS preflight for instrumental endpoint
  app.options("/api/instrumental", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  // Instrumental: Generate instrumental music video with optional text overlay
  app.post("/api/instrumental", extractTokenFromUrl, authenticateToken, async (req, res) => {
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const {
        description,
        tags,
        aspectRatio: requestedAspectRatio,
        duration: requestedDuration,
        textOverlay,
        textPosition,
        addSubtitles: requestedAddSubtitles,
        subtitleStyle: requestedSubtitleStyle,
        fontFamily: requestedFontFamily,
        audioUrl: providedAudioUrl,
        projectId: providedProjectId,
        subtitleFileUrl: providedSubtitleFileUrl,
        isLyricVideo: requestedIsLyricVideo
      } = req.body;
      const userId = req.user!.userId;

      // If audioUrl and projectId are provided, this is an uploaded song - skip validation
      const isUploadedSong = providedAudioUrl && providedProjectId;

      if (!isUploadedSong) {
        if (!description || typeof description !== 'string' || description.trim().length === 0) {
          return res.status(400).json({
            error: "Please provide a description for your song"
          });
        }

        if (!tags || typeof tags !== 'string' || tags.trim().length === 0) {
          return res.status(400).json({
            error: "Please provide musical tags for your song"
          });
        }
      }

      // Validate and set duration (15 seconds to 3 minutes = 180 seconds)
      const duration = typeof requestedDuration === 'number'
        ? Math.max(15, Math.min(180, Math.round(requestedDuration)))
        : 30; // Default to 30 seconds

      // Text overlay = lyric lines burned into video. Captions = TikTok-style word captions (ffmpegapi).
      // Only add TikTok captions when the user explicitly enabled the captions toggle.
      const normalizedTextOverlay = typeof textOverlay === "string" ? textOverlay.trim() : "";
      const hasTextOverlay = normalizedTextOverlay.length > 0;
      const addSubtitlesRequested = requestedAddSubtitles === true || requestedAddSubtitles === 'true';
      const addSubtitles = addSubtitlesRequested;
      const subtitleStyle = isSubtitleStyle(requestedSubtitleStyle) ? requestedSubtitleStyle : defaultSubtitleStyle;
      const fontFamily = isGoogleFont(requestedFontFamily) ? requestedFontFamily : defaultGoogleFont;

      const validAspectRatios = ["16:9", "9:16"];
      const aspectRatio = validAspectRatios.includes(requestedAspectRatio) ? requestedAspectRatio : "9:16";

      const validTextPositions = ["top", "center", "bottom"];
      const overlayPosition = validTextPositions.includes(textPosition) ? textPosition : "bottom";

      console.log(`[INSTRUMENTAL] Starting video generation for user ${userId}`);
      if (!isUploadedSong) {
        console.log(`[INSTRUMENTAL] Description: ${description}`);
        console.log(`[INSTRUMENTAL] Tags: ${tags}`);
      } else {
        console.log(`[INSTRUMENTAL] Using uploaded audio: ${providedAudioUrl}`);
      }
      console.log(`[INSTRUMENTAL] Aspect Ratio: ${aspectRatio}, Duration: ${duration}s`);
      console.log(`[INSTRUMENTAL] Text Overlay: ${hasTextOverlay ? 'Yes' : 'No'}, Position: ${overlayPosition}`);
      console.log(`[INSTRUMENTAL] Captions toggle: ${addSubtitlesRequested} (text overlay only; add-tiktok-captions not used)`);

      // Step 1: Get or create project
      let project;
      if (isUploadedSong && providedProjectId) {
        // Use existing project
        console.log(`[INSTRUMENTAL] Step 1: Using existing project ${providedProjectId}...`);
        project = await storage.getProject(providedProjectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ error: "Project not found" });
        }
        // Force instrumental mode even when reusing an existing project.
        // This guarantees downstream video generation uses regular scene video
        // (seedance) and never lipsync (ltx-lipsync).
        await storage.updateProject(project.id, {
          subtitleStyle: subtitleStyle,
          fontFamily: fontFamily,
          addSubtitles: addSubtitles,
          isInstrumental: true,
          aspectRatio: aspectRatio,
        } as any);
      } else {
        // Create a new project
        console.log(`[INSTRUMENTAL] Step 1: Creating project...`);
        project = await storage.createProject({
          userId,
          title: (description || "Instrumental Video").substring(0, 50),
          description: description || "Instrumental video with uploaded song",
          aspectRatio: aspectRatio,
          currentStep: 1,
          addSubtitles: addSubtitles,
          subtitleStyle: subtitleStyle,
          fontFamily: fontFamily,
          isInstrumental: true // Mark as instrumental project
        } as any);
        console.log(`[INSTRUMENTAL] Created project ${project.id}`);
      }

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up your project...",
        status: "completed",
        metadata: {}
      });

      // Return immediately so frontend can start polling
      res.json({
        success: true,
        projectId: project.id,
        message: "Instrumental video generation started! The video is being created in the background."
      });

      // Continue processing asynchronously so frontend can see progress in real-time
      (async () => {
        try {
          let trimmedAudioUrl: string;

          if (isUploadedSong && providedAudioUrl) {
            // Use the provided uploaded/trimmed audio
            console.log(`[INSTRUMENTAL] Step 2: Using uploaded audio (skipping song generation)...`);
            trimmedAudioUrl = providedAudioUrl;

            await storage.addGenerationLog({
              projectId: project.id,
              step: "song_generation",
              message: "Using uploaded song",
              status: "completed",
              metadata: {}
            });

            await storage.addGenerationLog({
              projectId: project.id,
              step: "audio_trimming",
              message: "Audio prepared successfully",
              status: "completed",
              metadata: {}
            });
          } else {
            // Step 2: Generate instrumental song
            console.log(`[INSTRUMENTAL] Step 2: Generating instrumental song...`);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "song_generation",
              message: "Creating your instrumental song...",
              status: "progress",
              metadata: {}
            });

            // Generate a longer song to ensure we have enough audio to trim from
            const songGenerationDuration = Math.max(duration + 30, 60);
            const songResult = await generateInstrumentalSong(description, tags, songGenerationDuration);
            const actualSongDuration = songResult.duration;
            console.log(`[INSTRUMENTAL] Song generated: ${actualSongDuration}s (requested: ${songGenerationDuration}s)`);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "song_generation",
              message: "Instrumental song created successfully",
              status: "completed",
              metadata: {}
            });

            // Step 3: Trim audio from 0 to specified duration
            console.log(`[INSTRUMENTAL] Step 3: Trimming audio from 0s to ${duration}s...`);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "audio_trimming",
              message: "Preparing audio...",
              status: "progress",
              metadata: {}
            });
            const { splitAudioByTime } = await import("./services/ffmpeg");
            const trimResult = await splitAudioByTime(songResult.audioUrl, 0, duration * 1000); // Convert to milliseconds

            // Download the trimmed audio
            const trimmedResponse = await fetch(trimResult.download_url);
            const trimmedBuffer = Buffer.from(await trimmedResponse.arrayBuffer());

            // Upload trimmed audio to object storage
            const objectStorageService = new ObjectStorageService();
            const trimmedAudioPath = `songs/${crypto.randomUUID()}.mp3`;
            const uploadedUrl = await objectStorageService.uploadAudioBuffer(trimmedBuffer, trimmedAudioPath);

            trimmedAudioUrl = uploadedUrl.startsWith('http')
              ? uploadedUrl
              : await objectStorageService.getSignedUrlForPath(uploadedUrl, 86400);

            console.log(`[INSTRUMENTAL] Audio trimmed and uploaded: ${trimmedAudioUrl}`);

            await storage.addGenerationLog({
              projectId: project.id,
              step: "audio_trimming",
              message: "Audio prepared successfully",
              status: "completed",
              metadata: {}
            });
          }

          // Step 4: Generate subtitles if requested (optional, since no lyrics)
          let subtitleFileUrl = null;

          // For instrumental videos, always use text overlay for captions (never use forced alignment from uploaded songs)
          // If subtitleFileUrl is provided (from uploaded/trimmed audio), ignore it for instrumental projects
          // and use text overlay instead
          if (isUploadedSong && providedSubtitleFileUrl && addSubtitles && !hasTextOverlay) {
            // Only use provided subtitle file if there's no text overlay (shouldn't happen for instrumental, but safety check)
            subtitleFileUrl = providedSubtitleFileUrl;
            console.log(`[INSTRUMENTAL] Using provided subtitle file from trimmed audio: ${subtitleFileUrl}`);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "subtitle_generation",
              message: "Using subtitles from trimmed audio",
              status: "completed",
              metadata: { subtitleFileUrl }
            });
          } else if (addSubtitles && hasTextOverlay) {
            // Generate subtitles from text overlay (for AI generated songs)
            try {
              console.log(`[INSTRUMENTAL] Step 4: Generating subtitles from text overlay...`);
              await storage.addGenerationLog({
                projectId: project.id,
                step: "subtitle_generation",
                message: "Creating captions...",
                status: "progress",
                metadata: {}
              });

              // Create simple ASS subtitle file from text overlay
              const lines = normalizedTextOverlay.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
              let assContent = "[Script Info]\nTitle: Instrumental Video\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";

              lines.forEach((line, index) => {
                const startTime = index * 5;
                const endTime = (index + 1) * 5;
                const startTimeStr = formatAssTime(startTime);
                const endTimeStr = formatAssTime(endTime);
                assContent += `Dialogue: 0,${startTimeStr},${endTimeStr},Default,,0,0,0,,${line}\n`;
              });

              function formatAssTime(seconds: number): string {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                const centiseconds = Math.floor((seconds % 1) * 100);
                return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
              }

              // Use a stable project-based identifier for subtitle storage in instrumental flows.
              const songId = project.id;
              subtitleFileUrl = await storeSubtitleFile(assContent, songId);

              console.log(`[INSTRUMENTAL] Subtitles generated: ${subtitleFileUrl}`);

              await storage.addGenerationLog({
                projectId: project.id,
                step: "subtitle_generation",
                message: "Captions created successfully",
                status: "completed",
                metadata: { subtitleFileUrl, lineCount: lines.length }
              });
            } catch (subtitleError) {
              console.error(`[INSTRUMENTAL] Failed to generate subtitles:`, subtitleError);
              await storage.addGenerationLog({
                projectId: project.id,
                step: "subtitle_generation",
                message: `Subtitle generation failed: ${(subtitleError as Error).message}`,
                status: "warning",
                metadata: { error: (subtitleError as Error).message },
              });
            }
          }

          await storage.updateProject(project.id, {
            audioUrl: trimmedAudioUrl,
            audioDuration: duration,
            currentStep: 2,
            subtitleFileUrl: subtitleFileUrl,
            addSubtitles: addSubtitles, // User's captions toggle; ffmpegapi adds captions at video end
            subtitleStyle: subtitleStyle,
            fontFamily: fontFamily,
            captionPosition: addSubtitles ? overlayPosition : undefined
          } as any);
          console.log(`[INSTRUMENTAL] Trimmed audio and subtitles saved (${duration} seconds)`);

          // Step 5: Generate scene prompts (skip character generation)
          const { numberOfSegments: numberOfScenes, segmentDurations } = calculateVideoSegments(duration);
          console.log(`[INSTRUMENTAL] Dynamically calculated ${numberOfScenes} scenes for ${duration}s video (segments: ${segmentDurations.join(', ')}s)`);

          const isLyricVideo = requestedIsLyricVideo === true || requestedIsLyricVideo === 'true';

          console.log(`[INSTRUMENTAL] Step 5: Generating scene prompts... (isLyricVideo: ${isLyricVideo})`);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "scene_planning",
            message: "Planning video scenes...",
            status: "progress",
            metadata: {}
          });

          const scenePrompts = isLyricVideo
            ? await generateLyricVideoScenePrompts(description, numberOfScenes)
            : await generateInstrumentalScenePrompts(description, numberOfScenes);

          console.log(`[INSTRUMENTAL] Generated ${scenePrompts.length} ${isLyricVideo ? 'lyric video' : 'instrumental'} scene prompts`);

          // Step 6: Generate scene images using text-to-image (no character image needed)
          console.log(`[INSTRUMENTAL] Step 6: Generating scene images with aspectRatio: ${aspectRatio}...`);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "scene_generation",
            message: `Creating ${numberOfScenes} video scenes...`,
            status: "progress",
            metadata: { sceneCount: numberOfScenes }
          });

          // Generate scene images directly from text prompts using seedream-v4/sequential
          const sceneImages = await generateSceneImagesFromText(
            scenePrompts,
            aspectRatio
          );

          await storage.updateProject(project.id, {
            scenePrompts: scenePrompts,
            sceneImages: sceneImages,
            currentStep: 3
          });
          console.log(`[INSTRUMENTAL] Generated ${sceneImages.length} scene images`);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "scene_generation",
            message: "Scenes created successfully",
            status: "completed",
            metadata: {}
          });

          // Step 7: Generate final video
          console.log(`[INSTRUMENTAL] Step 7: Generating final music video...`);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "video_generation",
            message: "Assembling your final video...",
            status: "progress",
            metadata: {}
          });

          await storage.updateProject(project.id, {
            currentStep: 4,
            isCompleted: false
          });

          // Store text overlay in project if provided
          if (hasTextOverlay) {
            await storage.updateProject(project.id, {
              textOverlay: normalizedTextOverlay
            } as any);
          }

          // Trigger video generation asynchronously
          (async () => {
            try {
              // First generate the base video
              const baseUrl = getBaseUrl(req);
              const videoGenResponse = await fetch(`${baseUrl}/api/projects/${project.id}/generate-video`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                }
              });

              if (videoGenResponse.ok) {
                // Wait for video to be generated and get finalVideoUrl from project
                // Poll the project until finalVideoUrl is available
                let finalVideoUrl: string | null = null;
                let attempts = 0;
                const maxAttempts = 60; // Wait up to 5 minutes (60 * 5 seconds)

                while (attempts < maxAttempts && !finalVideoUrl) {
                  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                  const updatedProject = await storage.getProject(project.id);
                  if (updatedProject?.finalVideoUrl) {
                    finalVideoUrl = updatedProject.finalVideoUrl;
                    break;
                  }
                  attempts++;
                }

                // Check one more time after polling ends (handles race condition where video completes right after timeout)
                if (!finalVideoUrl) {
                  const finalCheckProject = await storage.getProject(project.id);
                  if (finalCheckProject?.finalVideoUrl) {
                    finalVideoUrl = finalCheckProject.finalVideoUrl;
                    console.log(`[INSTRUMENTAL] Found finalVideoUrl after polling ended: ${finalVideoUrl}`);
                  }
                }

                // Add text overlay via ffmpegapi (add-text-overlay-captions only; do not call add-tiktok-captions)
                if (hasTextOverlay && finalVideoUrl) {
                  console.log(`[INSTRUMENTAL] Adding text overlay at position: ${overlayPosition}`);

                  await storage.addGenerationLog({
                    projectId: project.id,
                    step: "video_generation",
                    message: `Adding text overlay (${overlayPosition})...`,
                    status: "progress",
                    metadata: {}
                  });

                  try {
                    const projectSubtitleStyle = (project as any).subtitleStyle || "yellow-bg";
                    // Pass Bunny/public URL directly to ffmpegapi
                    console.log(`[INSTRUMENTAL] Passing video URL to ffmpegapi overlay: ${finalVideoUrl}`);
                    const { addTextOverlayCaptions } = await import("./services/ffmpegCaptions");
                    const overlayResult = await addTextOverlayCaptions({
                      videoUrl: finalVideoUrl,
                      text: normalizedTextOverlay,
                      subtitleStyle: projectSubtitleStyle,
                      position: overlayPosition,
                    });

                    const objectStorageService = new ObjectStorageService();
                    const overlayUploadResult = await objectStorageService.uploadVideoFromUrl(
                      overlayResult.download_url,
                      `videos/${crypto.randomUUID()}_overlay.mp4`,
                    );
                    finalVideoUrl = overlayUploadResult.url.startsWith('http')
                      ? overlayUploadResult.url
                      : await objectStorageService.getSignedUrlForPath(overlayUploadResult.url, 86400 * 7);
                    console.log(`[INSTRUMENTAL] Text overlay video saved: ${finalVideoUrl}`);

                    // Instrumental page uses only add-text-overlay-captions; do NOT call add-tiktok-captions.

                    // Update project with final video URL
                    await storage.updateProject(project.id, {
                      finalVideoUrl: finalVideoUrl,
                      isCompleted: true,
                      currentStep: 5,
                    });

                    await storage.addGenerationLog({
                      projectId: project.id,
                      step: "video_generation",
                      message: "Video with text overlay completed successfully",
                      status: "completed",
                      metadata: {}
                    });
                  } catch (textOverlayError) {
                    console.error(`[INSTRUMENTAL] Text overlay rendering failed:`, textOverlayError);
                    await storage.addGenerationLog({
                      projectId: project.id,
                      step: "video_generation",
                      message: `Text overlay rendering failed, using base video: ${(textOverlayError as Error).message}`,
                      status: "warning",
                      metadata: { error: (textOverlayError as Error).message },
                    });
                  }
                } else if (finalVideoUrl) {
                  await storage.updateProject(project.id, {
                    isCompleted: true,
                    currentStep: 5
                  });
                  console.log(`[INSTRUMENTAL] Marked project ${project.id} as completed (no text overlay)`);
                } else {
                  // Polling timed out - check if video generation endpoint already completed it
                  const timeoutCheckProject = await storage.getProject(project.id);
                  if (timeoutCheckProject?.finalVideoUrl && timeoutCheckProject?.isCompleted) {
                    console.log(`[INSTRUMENTAL] Project ${project.id} was already marked as completed by video generation endpoint`);
                  } else {
                    console.warn(`[INSTRUMENTAL] Polling timed out for project ${project.id} - video may still be generating. finalVideoUrl: ${timeoutCheckProject?.finalVideoUrl || 'null'}, isCompleted: ${timeoutCheckProject?.isCompleted || false}`);
                    await storage.addGenerationLog({
                      projectId: project.id,
                      step: "video_generation",
                      message: "Video generation is taking longer than expected. It will appear in My Videos once complete.",
                      status: "progress",
                      metadata: { pollingTimeout: true, maxAttempts }
                    });
                  }
                }

                console.log(`[INSTRUMENTAL] Video generation completed for project ${project.id}`);
              } else {
                const errorData = await videoGenResponse.json();
                console.error(`[INSTRUMENTAL] Video generation failed with status ${videoGenResponse.status}:`, errorData);
                await storage.addGenerationLog({
                  projectId: project.id,
                  step: "video_generation",
                  message: `Video generation failed: ${errorData.error || errorData.message || 'Unknown error'}`,
                  status: "error",
                  metadata: { error: errorData.error || errorData.message }
                });
              }
            } catch (error) {
              console.error(`[INSTRUMENTAL] Video generation failed:`, error);
              await storage.addGenerationLog({
                projectId: project.id,
                step: "video_generation",
                message: `Video generation error: ${(error as Error).message}`,
                status: "error",
                metadata: { error: (error as Error).message }
              });
            }
          })();

          console.log(`[INSTRUMENTAL] ✅ All steps completed! Project ${project.id} is processing final video.`);
        } catch (asyncError) {
          console.error(`[INSTRUMENTAL] Async processing error:`, asyncError);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "error",
            message: `Error during video generation: ${(asyncError as Error).message}`,
            status: "error",
            metadata: { error: (asyncError as Error).message }
          });
        }
      })();

    } catch (error) {
      console.error("[INSTRUMENTAL] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to generate instrumental video"
      });
    }
  });

  // CORS preflight for status endpoint
  app.options("/api/neon-single-prompt/status/:projectId", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  // Get video generation status - for async polling
  app.get("/api/neon-single-prompt/status/:projectId", extractTokenFromUrl, authenticateToken, async (req, res) => {
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const { projectId } = req.params;

      if (!projectId) {
        return res.status(400).json({
          error: "Project ID is required"
        });
      }

      const project = await storage.getProject(projectId);

      if (!project) {
        return res.status(404).json({
          error: "Project not found"
        });
      }

      // Determine the current status
      let status = 'processing';
      let progress = 0;

      if (project.isCompleted && project.finalVideoUrl) {
        status = 'completed';
        progress = 100;
      } else if (project.generationStatus === 'failed') {
        status = 'failed';
        progress = 0;
      } else {
        // Calculate progress based on currentStep (5 total steps)
        progress = Math.round((project.currentStep / 5) * 100);
      }

      // Build the response
      const response: any = {
        projectId: project.id,
        status,
        progress,
        currentStep: project.currentStep,
        title: project.title,
        description: project.description
      };

      // Include video URL if completed
      if (status === 'completed' && project.finalVideoUrl) {
        // Convert relative URL to absolute URL
        let videoUrl = project.finalVideoUrl;

        // If it's a relative path, convert to full URL
        if (videoUrl.startsWith('/')) {
          const baseUrl = process.env.FRONTEND_URL || 'https://neonvideo.ai';
          videoUrl = `${baseUrl}${videoUrl}`;
        }

        response.finalVideoUrl = videoUrl;

        // Include Mux streaming URL if available
        if (project.muxPlaybackId) {
          response.streamingUrl = `https://stream.mux.com/${project.muxPlaybackId}.m3u8`;
          response.muxPlaybackId = project.muxPlaybackId;
          response.muxAssetStatus = project.muxAssetStatus;
        }

        // Include Bunny Storage URL if the final video is on Bunny
        if (project.finalVideoUrl && isBunnyUrl(project.finalVideoUrl)) {
          response.bunnyStorageUrl = project.finalVideoUrl;
        }
      }

      // Include queue position if queued
      if (status === 'processing') {
        const queuePosition = await videoQueueService.getQueuePosition(projectId);
        if (queuePosition !== null && queuePosition > 0) {
          response.queuePosition = queuePosition;
          response.message = `Video is queued for processing. Position in queue: ${queuePosition}`;
        } else {
          response.message = 'Video is being generated...';
        }
      }

      // Include error message if failed
      if (status === 'failed') {
        response.message = 'Video generation failed. Please try again.';
      }

      res.json(response);

    } catch (error) {
      console.error("[NEON-STATUS] Error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get project status"
      });
    }
  });

  // ==========================================
  // STORY VIDEO ENDPOINTS
  // ==========================================

  /** Inworld TTS voice list + preview URLs (`public/voices/{id}.mp3`). Public for the create UI. */
  app.get("/api/story-voices", (_req, res) => {
    try {
      res.json({ voices: listStoryVoiceOptions() });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/story-video/generate-script", authenticateToken, async (req: any, res) => {
    try {
      const { storyPrompt, duration, narrator, narratorVoice, characters, aspectRatio } = req.body;

      if (!storyPrompt || typeof storyPrompt !== "string") {
        return res.status(400).json({ error: "storyPrompt is required" });
      }
      const durationSec = Math.max(30, Math.min(300, Number(duration) || 60));

      const userId = req.user.userId;
      console.log(`[Story Video] Generating script for user ${userId}: "${storyPrompt}" (${durationSec}s)`);

      const charArray = Array.isArray(characters) ? characters.slice(0, 3) : [];

      const script = await generateStoryScript(
        storyPrompt,
        durationSec,
        !!narrator,
        narratorVoice || null,
        charArray.map((c: any) => ({ name: c.name || "Character", voiceId: c.voiceId || null })),
      );

      const project = await storage.createProject({
        userId,
        title: storyPrompt.substring(0, 80),
        description: storyPrompt,
        projectType: "story_video",
        toolUsed: "ai_stories",
        storyPrompt,
        storyDuration: durationSec,
        storyNarrator: !!narrator,
        storyNarratorVoice: narratorVoice || null,
        storyCharacters: charArray.map((c: any) => ({
          name: c.name || "Character",
          imageUrl: c.imageUrl || "",
          voiceId: c.voiceId || null,
          prompt: c.prompt || "",
        })),
        storyScript: script,
        storyScenePrompts: script.map((s) => s.scene_description),
        aspectRatio: aspectRatio === "16:9" ? "16:9" : "3:4",
        currentStep: 2,
      });

      await storage.addGenerationLog({
        projectId: project.id,
        step: "story_script",
        message: `Story script generated with ${script.length} scenes`,
        status: "completed",
        metadata: { sceneCount: script.length },
      });

      console.log(`[Story Video] Project ${project.id} created with ${script.length} scenes`);
      res.json({ projectId: project.id, script });
    } catch (error) {
      console.error("[Story Video] Script generation error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/story-video/:id/update-script", authenticateToken, async (req: any, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || project.userId !== req.user.userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { script } = req.body;
      if (!Array.isArray(script)) {
        return res.status(400).json({ error: "script must be an array" });
      }

      await storage.updateProject(project.id, {
        storyScript: script,
        storyScenePrompts: script.map((s: any) => s.scene_description),
      });

      console.log(`[Story Video] Script updated for project ${project.id}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[Story Video] Script update error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Generates scene images only (no credits, no TTS). Used after script creation so the
   * review step can show thumbnails. Does not set generationStatus to avoid blocking generate-assets.
   */
  app.post("/api/story-video/:id/generate-scene-images", authenticateToken, async (req: any, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || project.userId !== req.user.userId) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (!project.storyScript || !Array.isArray(project.storyScript)) {
        return res.status(400).json({ error: "No story script found" });
      }
      if (project.generationStatus === "generating") {
        return res.status(409).json({ error: "Full story generation is already in progress" });
      }

      const storyScript = project.storyScript as {
        id: number;
        character: string;
        audio: string;
        scene_description: string;
      }[];
      const storyCharacters = (project.storyCharacters || []) as {
        name: string;
        imageUrl: string;
        voiceId: string | null;
        prompt: string;
      }[];

      res.json({ status: "started", projectId: project.id });

      (async () => {
        try {
          const sceneDescriptions = storyScript.map((s) => s.scene_description);
          const refUrls = collectStoryCharacterReferenceImageUrls(storyCharacters);

          console.log(`[Story Video] Preview: generating ${sceneDescriptions.length} scene images for ${project.id} (${refUrls.length} character ref image(s))`);

          let sceneImages: string[];
          if (refUrls.length > 0) {
            sceneImages = await generateSceneImages(
              sceneDescriptions,
              refUrls,
              project.aspectRatio || "16:9",
            );
          } else {
            sceneImages = await generateSceneImagesFromText(
              sceneDescriptions,
              project.aspectRatio || "16:9",
            );
          }

          await storage.updateProject(project.id, {
            storySceneImages: sceneImages,
            storyScenePrompts: sceneDescriptions,
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_preview_images",
            message: `Generated ${sceneImages.length} scene preview images`,
            status: "completed",
            metadata: { sceneCount: sceneImages.length },
          });

          console.log(`[Story Video] Preview images complete for ${project.id}`);
        } catch (error) {
          console.error("[Story Video] Preview scene images error:", error);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_preview_images",
            message: `Preview images failed: ${(error as Error).message}`,
            status: "error",
          });
        }
      })();
    } catch (error) {
      console.error("[Story Video] Generate scene images error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/story-video/:id/generate-assets", authenticateToken, async (req: any, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || project.userId !== req.user.userId) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (!project.storyScript || !Array.isArray(project.storyScript)) {
        return res.status(400).json({ error: "No story script found" });
      }

      if (project.generationStatus === "generating") {
        return res.status(409).json({ error: "Assets are already being generated" });
      }

      const durationSec = Math.max(
        STORY_DURATION_MIN,
        Math.min(STORY_DURATION_MAX, Number(project.storyDuration) || 60),
      );
      const storyVideoCredits = getStoryVideoGenerationCredits(durationSec);

      const canAfford = await storage.canUserAffordCredits(project.userId, storyVideoCredits);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(project.userId);
        return res.status(402).json({
          error: `Insufficient credits. This story video (${durationSec}s) costs ${storyVideoCredits} credits (${STORY_VIDEO_CREDITS_PER_30_SECONDS} per 30 seconds).`,
          creditsRequired: storyVideoCredits,
          creditsRemaining,
          storyDuration: durationSec,
        });
      }

      const deducted = await storage.deductUserCredits(project.userId, storyVideoCredits);
      if (!deducted) {
        const creditsRemaining = await storage.getUserCreditsRemaining(project.userId);
        return res.status(402).json({
          error: `Insufficient credits. This story video (${durationSec}s) costs ${storyVideoCredits} credits.`,
          creditsRequired: storyVideoCredits,
          creditsRemaining,
          storyDuration: durationSec,
        });
      }

      console.log(
        `[Story Video] Charged ${storyVideoCredits} credits for project ${project.id} (${durationSec}s target)`,
      );

      await storage.updateProject(project.id, {
        generationStatus: "generating",
        generationStartedAt: new Date(),
      });

      res.json({
        status: "generating",
        projectId: project.id,
        creditsCharged: storyVideoCredits,
        storyDuration: durationSec,
      });

      const storyScript = project.storyScript as {
        id: number;
        character: string;
        audio: string;
        scene_description: string;
        multi_talk?: boolean;
        character_left?: string;
        character_right?: string;
        audio_left?: string;
        audio_right?: string;
        multi_talk_order?: "left_right" | "right_left" | "meanwhile";
      }[];
      const storyCharacters = (project.storyCharacters || []) as { name: string; imageUrl: string; voiceId: string | null; prompt: string }[];

      (async () => {
        try {
          // --- AUDIO GENERATION ---
          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_audio",
            message: "Creating character voices...",
            status: "started",
          });
          console.log(`[Story Video] Generating audio for ${storyScript.length} scenes`);

          const voiceMap: Record<string, string> = {};
          if (project.storyNarrator && project.storyNarratorVoice) {
            voiceMap["narrator"] = project.storyNarratorVoice;
          }
          let defaultPoolIdx = 0;
          for (const char of storyCharacters) {
            const key = (char.name || "").trim().toLowerCase();
            if (!key) continue;
            if (char.voiceId) {
              voiceMap[key] = char.voiceId;
            } else {
              voiceMap[key] = STORY_DEFAULT_CHARACTER_VOICE_POOL[defaultPoolIdx % STORY_DEFAULT_CHARACTER_VOICE_POOL.length];
              defaultPoolIdx++;
            }
          }

          const storeAudioOnBunny = async (remoteUrl: string, fileLabel: string): Promise<string> => {
            if (!isBunnyConfigured()) return remoteUrl;
            const maxAttempts = 3;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                const audioResponse = await fetch(remoteUrl);
                if (!audioResponse.ok) return remoteUrl;
                const buffer = Buffer.from(await audioResponse.arrayBuffer());
                const fileName = `story-${project.id}-${fileLabel}-${Date.now()}.mp3`;
                const bunnyResult = await uploadAudio(fileName, buffer);
                return bunnyResult.url;
              } catch (e) {
                const retryable =
                  attempt < maxAttempts &&
                  (String((e as Error)?.cause ?? (e as Error)?.message ?? e).includes("ECONNRESET") ||
                    String((e as Error)?.message ?? e).includes("fetch failed") ||
                    String((e as Error)?.message ?? e).includes("ETIMEDOUT"));
                if (retryable) {
                  await new Promise((r) => setTimeout(r, 800 * attempt));
                  continue;
                }
                console.warn(
                  `[Story Video] Bunny upload failed (${fileLabel})${attempt > 1 ? ` after ${attempt} attempts` : ""}, using original URL`,
                  e,
                );
                return remoteUrl;
              }
            }
            return remoteUrl;
          };

          const audioPromises = storyScript.map(async (scene, index) => {
            try {
              if (
                scene.multi_talk &&
                (scene.audio_left || "").trim() &&
                (scene.audio_right || "").trim()
              ) {
                const vL = voiceMap[(scene.character_left || "").trim().toLowerCase()] || STORY_DEFAULT_NARRATOR_VOICE;
                const vR = voiceMap[(scene.character_right || "").trim().toLowerCase()] || STORY_DEFAULT_NARRATOR_VOICE;
                console.log(
                  `[Story Video] Scene ${scene.id}: multi_talk voices L="${vL}" (${scene.character_left}) R="${vR}" (${scene.character_right})`,
                );
                const leftRaw = await generateStoryAudio((scene.audio_left || "").trim(), vL);
                const rightRaw = await generateStoryAudio((scene.audio_right || "").trim(), vR);
                const leftStored = await storeAudioOnBunny(leftRaw, `scene-${index + 1}-L`);
                const rightStored = await storeAudioOnBunny(rightRaw, `scene-${index + 1}-R`);
                console.log(`[Story Video] Scene ${scene.id} dual audio ready`);
                return { index, url: leftStored, urlRight: rightStored };
              }

              const voiceId = voiceMap[(scene.character || "").trim().toLowerCase()] || STORY_DEFAULT_NARRATOR_VOICE;
              const line = typeof scene.audio === "string" ? scene.audio : "";
              console.log(`[Story Video] Scene ${scene.id}: voice="${voiceId}" for "${scene.character}"`);
              const audioUrl = await generateStoryAudio(line, voiceId);
              const storedUrl = await storeAudioOnBunny(audioUrl, `scene-${index + 1}`);
              console.log(`[Story Video] Scene ${scene.id} audio stored: ${storedUrl}`);
              return { index, url: storedUrl, urlRight: "" };
            } catch (err) {
              console.error(`[Story Video] Audio gen failed for scene ${scene.id}:`, err);
              return { index, url: null, urlRight: null };
            }
          });

          const audioResults = await Promise.all(audioPromises);
          const audioUrls: string[] = new Array(storyScript.length).fill("");
          const audioUrlsRight: string[] = new Array(storyScript.length).fill("");
          for (const r of audioResults) {
            if (r.url) audioUrls[r.index] = r.url;
            if (r.urlRight) audioUrlsRight[r.index] = r.urlRight;
          }

          await storage.updateProject(project.id, { storyAudioUrls: audioUrls, storyAudioUrlsRight: audioUrlsRight });
          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_audio",
            message: `Generated ${audioUrls.filter(Boolean).length}/${storyScript.length} audio files`,
            status: "completed",
          });

          // --- IMAGE GENERATION ---
          const sceneDescriptions = storyScript.map((s) => s.scene_description);
          const existingImages = (project.storySceneImages || []) as string[];
          const existingPrompts = (project.storyScenePrompts || []) as string[];
          const promptsMatch =
            existingPrompts.length === sceneDescriptions.length &&
            existingPrompts.every((p, i) => p === sceneDescriptions[i]);
          const imagesReusable =
            promptsMatch &&
            existingImages.length === storyScript.length &&
            existingImages.every((url) => typeof url === "string" && url.length > 0);

          let sceneImages: string[];

          if (imagesReusable) {
            sceneImages = existingImages;
            await storage.addGenerationLog({
              projectId: project.id,
              step: "story_images",
              message: "Reusing scene art from script review",
              status: "completed",
            });
            console.log(`[Story Video] Reusing ${sceneImages.length} existing scene images for ${project.id}`);
          } else {
            await storage.addGenerationLog({
              projectId: project.id,
              step: "story_images",
              message: "Painting the scenes...",
              status: "started",
            });
            console.log(`[Story Video] Generating ${storyScript.length} scene images`);

            const refUrls = collectStoryCharacterReferenceImageUrls(storyCharacters);

            if (refUrls.length > 0) {
              sceneImages = await generateSceneImages(
                sceneDescriptions,
                refUrls,
                project.aspectRatio || "16:9",
              );
            } else {
              sceneImages = await generateSceneImagesFromText(
                sceneDescriptions,
                project.aspectRatio || "16:9",
              );
            }

            await storage.addGenerationLog({
              projectId: project.id,
              step: "story_images",
              message: `Generated ${sceneImages.length} scene images`,
              status: "completed",
            });
          }

          await storage.updateProject(project.id, {
            storySceneImages: sceneImages,
            currentStep: 3,
            generationStatus: "completed",
          });

          console.log(`[Story Video] Assets complete: ${audioUrls.filter(Boolean).length} audio, ${sceneImages.length} images`);
        } catch (error) {
          console.error("[Story Video] Asset generation error:", error);
          await storage.updateProject(project.id, { generationStatus: "failed" });
          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_assets_error",
            message: `Asset generation failed: ${(error as Error).message}`,
            status: "error",
          });
        }
      })();
    } catch (error) {
      console.error("[Story Video] Generate assets error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/story-video/:id/regenerate-scene/:sceneIndex", authenticateToken, async (req: any, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || project.userId !== req.user.userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const sceneIndex = parseInt(req.params.sceneIndex, 10);
      const sceneImages = (project.storySceneImages || []) as string[];
      const scenePrompts = (project.storyScenePrompts || []) as string[];

      if (sceneIndex < 0 || sceneIndex >= scenePrompts.length) {
        return res.status(400).json({ error: "Invalid scene index" });
      }

      const prompt = req.body.prompt || scenePrompts[sceneIndex];

      console.log(`[Story Video] Regenerating scene ${sceneIndex + 1} for project ${project.id}`);

      await storage.addGenerationLog({
        projectId: project.id,
        step: "story_regenerate_scene",
        message: `Regenerating scene ${sceneIndex + 1}...`,
        status: "started",
      });

      const storyCharacters = (project.storyCharacters || []) as { name: string; imageUrl: string; voiceId: string | null; prompt: string }[];
      const refUrls = collectStoryCharacterReferenceImageUrls(storyCharacters);

      let newImageUrl: string;
      if (refUrls.length > 0) {
        newImageUrl = await generateSingleSceneImage(prompt, refUrls, project.aspectRatio || "16:9");
      } else {
        const images = await generateSceneImagesFromText([prompt], project.aspectRatio || "16:9");
        newImageUrl = images[0];
      }

      sceneImages[sceneIndex] = newImageUrl;
      scenePrompts[sceneIndex] = prompt;

      await storage.updateProject(project.id, {
        storySceneImages: sceneImages,
        storyScenePrompts: scenePrompts,
      });

      await storage.addGenerationLog({
        projectId: project.id,
        step: "story_regenerate_scene",
        message: `Scene ${sceneIndex + 1} regenerated`,
        status: "completed",
      });

      console.log(`[Story Video] Scene ${sceneIndex + 1} regenerated: ${newImageUrl}`);
      res.json({ imageUrl: newImageUrl });
    } catch (error) {
      console.error("[Story Video] Scene regeneration error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** Upload a custom image for one story scene (same crop pipeline as music-video scene upload). */
  app.post(
    "/api/story-video/:id/upload-scene-image",
    authenticateToken,
    sceneImageUpload.single("image"),
    async (req: any, res) => {
      try {
        const sceneIndex = parseInt(req.body.sceneIndex, 10);
        if (isNaN(sceneIndex)) {
          return res.status(400).json({ error: "Scene index is required" });
        }
        if (!req.file) {
          return res.status(400).json({ error: "Image file is required" });
        }

        const project = await storage.getProject(req.params.id);
        if (!project || project.userId !== req.user.userId) {
          return res.status(404).json({ error: "Project not found" });
        }

        const storyScript = (project.storyScript || []) as unknown[];
        const storySceneImages = [...((project.storySceneImages || []) as string[])];
        while (storySceneImages.length < storyScript.length) {
          storySceneImages.push("");
        }

        if (sceneIndex < 0 || sceneIndex >= storyScript.length) {
          return res.status(400).json({ error: "Invalid scene index" });
        }

        const aspectRatioStr = project.aspectRatio || "16:9";
        const originalImage = sharp(req.file.buffer);
        const metadata = await originalImage.metadata();
        if (!metadata.width || !metadata.height) {
          return res.status(400).json({ error: "Could not read image dimensions" });
        }

        const [widthPart, heightPart] = aspectRatioStr.split(":").map(Number);
        const targetRatio = widthPart / heightPart;
        const currentRatio = metadata.width / metadata.height;
        const isVertical = targetRatio < 1;
        const targetWidth = isVertical ? 720 : 1280;
        const targetHeight = isVertical ? 960 : 720;

        let cropWidth: number;
        let cropHeight: number;
        let cropLeft: number;
        let cropTop: number;

        if (currentRatio > targetRatio) {
          cropHeight = metadata.height;
          cropWidth = Math.round(metadata.height * targetRatio);
          cropLeft = Math.round((metadata.width - cropWidth) / 2);
          cropTop = 0;
        } else {
          cropWidth = metadata.width;
          cropHeight = Math.round(metadata.width / targetRatio);
          cropLeft = 0;
          cropTop = Math.round((metadata.height - cropHeight) / 2);
        }

        const processedImageBuffer = await sharp(req.file.buffer)
          .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
          .resize(targetWidth, targetHeight, { fit: "fill", withoutEnlargement: false })
          .jpeg({ quality: 90 })
          .toBuffer();

        const { randomUUID } = await import("crypto");
        const filename = `${randomUUID()}.jpg`;
        let storedUrl: string;

        if (isBunnyConfigured("imageScenes")) {
          const bunnyResult = await uploadSceneImage(filename, processedImageBuffer);
          storedUrl = bunnyResult.url;
        } else {
          const imagePath = `scenes/${filename}`;
          const objectStorageService = new ObjectStorageService();
          const privateObjectDir = objectStorageService.getPrivateObjectDir();
          const fullPath = `${privateObjectDir}/${imagePath}`;
          const pathParts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
          const bucketName = pathParts[0];
          const objectName = pathParts.slice(1).join("/");
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          await file.save(processedImageBuffer, {
            metadata: {
              contentType: "image/jpeg",
              metadata: {
                category: "scenes",
                uploadedAt: new Date().toISOString(),
                projectId: req.params.id,
                sceneIndex: sceneIndex.toString(),
                isUserUpload: "true",
              },
            },
          });
          storedUrl = `/objects/${imagePath}`;
        }

        storySceneImages[sceneIndex] = storedUrl;
        await storage.updateProject(project.id, { storySceneImages });

        await storage.addGenerationLog({
          projectId: project.id,
          step: "story_scene_upload",
          message: `Story scene ${sceneIndex + 1} image uploaded`,
          status: "completed",
          metadata: { sceneIndex, imageUrl: storedUrl },
        });

        res.json({ imageUrl: storedUrl, sceneIndex });
      } catch (error) {
        console.error("[Story Video] Scene upload error:", error);
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  /** Persist a scene image URL (e.g. camera-angle API result) on the story project. */
  app.patch("/api/story-video/:id/scene-image", authenticateToken, async (req: any, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || project.userId !== req.user.userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const sceneIndex = parseInt(req.body.sceneIndex, 10);
      const imageUrl = typeof req.body.imageUrl === "string" ? req.body.imageUrl.trim() : "";
      if (isNaN(sceneIndex) || !imageUrl) {
        return res.status(400).json({ error: "sceneIndex and imageUrl are required" });
      }

      const storyScript = (project.storyScript || []) as unknown[];
      const storySceneImages = [...((project.storySceneImages || []) as string[])];
      while (storySceneImages.length < storyScript.length) {
        storySceneImages.push("");
      }
      if (sceneIndex < 0 || sceneIndex >= storyScript.length) {
        return res.status(400).json({ error: "Invalid scene index" });
      }

      storySceneImages[sceneIndex] = imageUrl;
      await storage.updateProject(project.id, { storySceneImages });

      res.json({ imageUrl, sceneIndex });
    } catch (error) {
      console.error("[Story Video] Patch scene image error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/story-video/:id/generate-video", authenticateToken, async (req: any, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || project.userId !== req.user.userId) {
        return res.status(404).json({ error: "Project not found" });
      }

      const sceneImages = (project.storySceneImages || []) as string[];
      const audioUrls = (project.storyAudioUrls || []) as string[];
      const audioUrlsRight = (project.storyAudioUrlsRight || []) as string[];
      const scriptPre = (project.storyScript || []) as {
        character: string;
        multi_talk?: boolean;
        audio_left?: string;
        audio_right?: string;
      }[];

      let audioAssetsIncomplete = sceneImages.length === 0;
      if (!audioAssetsIncomplete) {
        for (let i = 0; i < scriptPre.length; i++) {
          const s = scriptPre[i];
          if (!audioUrls[i]) {
            audioAssetsIncomplete = true;
            break;
          }
          if (s?.multi_talk && (s.audio_left || "").trim() && (s.audio_right || "").trim()) {
            if (!(audioUrlsRight[i] || "").trim()) {
              audioAssetsIncomplete = true;
              break;
            }
          }
        }
      }
      if (audioAssetsIncomplete) {
        return res.status(400).json({ error: "Assets not yet generated" });
      }

      if (project.generationStatus === "generating") {
        return res.status(409).json({ error: "Video is already being generated" });
      }

      const generationId = nanoid();
      await storage.updateProject(project.id, {
        generationId,
        generationStatus: "generating",
        generationStartedAt: new Date(),
        generationTimeoutAt: new Date(Date.now() + 30 * 60 * 1000),
        currentStep: 4,
      });

      res.json({ status: "generating", generationId, projectId: project.id });

      (async () => {
        try {
          const storyScript = (project.storyScript || []) as {
            id: number;
            character: string;
            audio: string;
            scene_description: string;
            multi_talk?: boolean;
            character_left?: string;
            character_right?: string;
            audio_left?: string;
            audio_right?: string;
            multi_talk_order?: "left_right" | "right_left" | "meanwhile";
          }[];
          const aspectRatio = project.aspectRatio || "16:9";
          const audioUrlsRightSeg = (project.storyAudioUrlsRight || []) as string[];
          // Match music-video merge dimensions so neonvideo_merge + outro scale consistently
          const dimensions =
            aspectRatio === "9:16"
              ? "1080x1920"
              : aspectRatio === "3:4"
                ? "1080x1440"
                : "1920x1080";

          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_video_start",
            message: "Bringing scenes to life...",
            status: "started",
          });

          console.log(`[Story Video] Generating ${sceneImages.length} video segments in parallel`);

          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_video_segment",
            message: `Generating all ${sceneImages.length} video scenes in parallel...`,
            status: "progress",
            metadata: { total: sceneImages.length },
          });

          const videoSegmentPromises = sceneImages.map(async (sceneImage, i) => {
            const sceneAudio = audioUrls[i];
            const sceneAudioRight = (audioUrlsRightSeg[i] || "").trim();
            const scenePrompt = (project.storyScenePrompts as string[])?.[i] || "animated scene";
            const isNarrator = storyScript[i]?.character === "Narrator";
            const sc = storyScript[i];
            const useInfinitetalkMulti =
              !isNarrator &&
              !!sc?.multi_talk &&
              (sc.audio_left || "").trim() &&
              (sc.audio_right || "").trim() &&
              !!sceneAudio &&
              !!sceneAudioRight;
            const multiOrder =
              sc?.multi_talk_order === "right_left" || sc?.multi_talk_order === "meanwhile"
                ? sc.multi_talk_order
                : "left_right";

            const modelLabel = isNarrator
              ? "seedance"
              : useInfinitetalkMulti
                ? "infinitetalk/multi"
                : "infinitetalk";
            console.log(
              `[Story Video] Scene ${i + 1}/${sceneImages.length} — character: "${storyScript[i]?.character}", model: ${modelLabel}`,
            );

            try {
              let clipUrl: string;

              if (isNarrator) {
                console.log(`[Story Video] Scene ${i + 1}: seedance (narrator) — generating silent video`);
                const silentVideoUrl = await generateVideoSegment(
                  "",
                  sceneImage,
                  scenePrompt,
                  "seedance",
                  9,
                  (project.videoQuality as "quick" | "medium" | "premium") || "quick",
                  aspectRatio,
                );
                console.log(`[Story Video] Scene ${i + 1}: silent video ready, adding narrator audio via ffmpegapi`);

                if (sceneAudio) {
                  const mergeResult = await mergeVideos(
                    [silentVideoUrl],
                    sceneAudio,
                    undefined,
                    undefined,
                    undefined,
                    dimensions,
                  );
                  clipUrl = mergeResult.download_url;
                  console.log(`[Story Video] Scene ${i + 1}: audio merged via ffmpegapi`);
                } else {
                  clipUrl = silentVideoUrl;
                  console.warn(`[Story Video] Scene ${i + 1}: no audio available, using silent video`);
                }
              } else if (useInfinitetalkMulti) {
                console.log(
                  `[Story Video] Scene ${i + 1}: infinitetalk/multi order=${multiOrder} (dual character lipsync)`,
                );
                clipUrl = await generateInfinitetalkMultiVideoSegment(
                  sceneImage,
                  sceneAudio,
                  sceneAudioRight,
                  multiOrder,
                  scenePrompt,
                  "480p",
                );
                console.log(`[Story Video] Scene ${i + 1}: infinitetalk/multi video ready`);
              } else {
                console.log(`[Story Video] Scene ${i + 1}: infinitetalk-fast (single character lipsync)`);
                clipUrl = await generateVideoSegment(
                  sceneAudio || "",
                  sceneImage,
                  scenePrompt,
                  "infinitetalk",
                  5,
                  (project.videoQuality as "quick" | "medium" | "premium") || "quick",
                  aspectRatio,
                );
                console.log(`[Story Video] Scene ${i + 1}: lipsync video ready`);
              }

              let storedClipUrl = clipUrl;
              if (isBunnyConfigured()) {
                try {
                  const clipResponse = await fetch(clipUrl);
                  if (clipResponse.ok) {
                    const buffer = Buffer.from(await clipResponse.arrayBuffer());
                    const fileName = `story-${project.id}-seg-${i + 1}-${Date.now()}.mp4`;
                    const bunnyResult = await uploadToBunnyStorage("scenes", fileName, buffer);
                    storedClipUrl = bunnyResult.url;
                    console.log(`[Story Video] Scene ${i + 1}: uploaded to Bunny`);
                  }
                } catch (bunnyErr) {
                  console.warn(`[Story Video] Bunny upload failed for segment ${i + 1}`, bunnyErr);
                }
              }

              console.log(`[Story Video] Scene ${i + 1} complete: ${storedClipUrl}`);
              return { index: i, url: storedClipUrl };
            } catch (segErr) {
              console.error(`[Story Video] Scene ${i + 1} failed:`, segErr);
              throw new Error(`Scene ${i + 1} video generation failed: ${(segErr as Error).message}`);
            }
          });

          const results = await Promise.all(videoSegmentPromises);
          const videoSegmentUrls = results
            .sort((a, b) => a.index - b.index)
            .map((r) => r.url);

          await storage.updateProject(project.id, { videoSegments: videoSegmentUrls });
          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_video_segments",
            message: `All ${videoSegmentUrls.length} video segments generated`,
            status: "completed",
          });

          // Merge all clips into final video (each clip already has its own audio).
          // Same neonvideo_merge path as music videos: outro + optional watermark.
          console.log(`[Story Video] Merging ${videoSegmentUrls.length} video segments (+ outro)`);
          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_video_merge",
            message: "Assembling the final video (with outro)...",
            status: "started",
          });

          const isPortrait = aspectRatio === "3:4" || aspectRatio === "9:16";
          const outroVideoUrl = isPortrait
            ? "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_vertical.mp4"
            : "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_horizontal.mp4";

          const userWithPlan = await storage.getUserWithPlan(project.userId);
          const isPremiumUser = userWithPlan?.plan?.name === "Premium";
          const shouldIncludeWatermark = isPremiumUser ? (project.includeWatermark !== false) : true;

          let storyWatermarkUrl: string | undefined;
          if (shouldIncludeWatermark) {
            storyWatermarkUrl = (await getWatermarkUrl()) || undefined;
          }

          const mergeResult = await mergeVideos(
            videoSegmentUrls,
            undefined,
            undefined,
            storyWatermarkUrl,
            outroVideoUrl,
            dimensions,
          );

          // Upload merged video to Bunny
          let finalVideoUrl = mergeResult.download_url;
          if (isBunnyConfigured() && finalVideoUrl) {
            try {
              await storage.addGenerationLog({
                projectId: project.id,
                step: "story_video_upload",
                message: "Uploading to cloud...",
                status: "started",
              });

              const mergedResponse = await fetch(finalVideoUrl);
              if (mergedResponse.ok) {
                const buffer = Buffer.from(await mergedResponse.arrayBuffer());
                const fileName = `story-${project.id}-final-${Date.now()}.mp4`;
                const bunnyResult = await uploadToBunnyStorage("final", fileName, buffer);
                finalVideoUrl = bunnyResult.url;
                console.log(`[Story Video] Final video on Bunny: ${finalVideoUrl}`);
              }
            } catch (uploadErr) {
              console.warn("[Story Video] Bunny upload for final video failed, using merge URL", uploadErr);
            }
          }

          // Phrase-style captions (few words / line) via same Remotion endpoint as music videos
          try {
            await storage.addGenerationLog({
              projectId: project.id,
              step: "story_video_captions",
              message: "Adding captions…",
              status: "started",
            });

            const { addTikTokCaptions } = await import("./services/ffmpegCaptions");
            const storyAspect = project.aspectRatio || "16:9";
            let storyCaptionStyle = (project as { subtitleStyle?: string }).subtitleStyle || "yellow-bg";
            if (storyCaptionStyle === "classic") {
              storyCaptionStyle = "yellow-bg";
            }
            const captionResult = await addTikTokCaptions({
              videoUrl: finalVideoUrl,
              subtitleStyle: storyCaptionStyle,
              language: "auto",
              aspectRatio: storyAspect,
              position: (project as { captionPosition?: string }).captionPosition || "bottom",
              maxCharsPerLine: 50,
              maxLines: 1,
            });

            if (isBunnyConfigured()) {
              const capResponse = await fetch(captionResult.download_url);
              if (capResponse.ok) {
                const capBuffer = Buffer.from(await capResponse.arrayBuffer());
                const capFileName = `story-${project.id}-final-captioned-${Date.now()}.mp4`;
                const capBunny = await uploadToBunnyStorage("final", capFileName, capBuffer);
                finalVideoUrl = capBunny.url;
                console.log(`[Story Video] Captioned final on Bunny: ${finalVideoUrl}`);
              } else {
                console.warn("[Story Video] Could not download captioned video for Bunny upload, using caption API URL");
                finalVideoUrl = captionResult.download_url;
              }
            } else {
              finalVideoUrl = captionResult.download_url;
            }

            await storage.addGenerationLog({
              projectId: project.id,
              step: "story_video_captions",
              message: "Captions added",
              status: "completed",
            });
          } catch (capErr) {
            console.warn("[Story Video] Caption step failed, keeping uncaptioned final:", capErr);
            await storage.addGenerationLog({
              projectId: project.id,
              step: "story_video_captions",
              message: `Captions skipped: ${(capErr as Error).message}`,
              status: "warning",
            });
          }

          await storage.updateProject(project.id, {
            finalVideoUrl,
            isCompleted: true,
            currentStep: 5,
            generationStatus: "completed",
          });

          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_video_complete",
            message: "Story video is ready!",
            status: "completed",
            metadata: { finalVideoUrl },
          });

          try {
            await createMuxAssetForVideo(project.id, finalVideoUrl);
            console.log(`[Story Video] MUX asset creation initiated for project ${project.id}`);
          } catch (muxErr) {
            console.warn("[Story Video] MUX asset creation failed:", muxErr);
          }

          console.log(`[Story Video] Generation complete for project ${project.id}`);
        } catch (error) {
          console.error("[Story Video] Video generation error:", error);
          await storage.updateProject(project.id, { generationStatus: "failed" });
          await storage.addGenerationLog({
            projectId: project.id,
            step: "story_video_error",
            message: `Video generation failed: ${(error as Error).message}`,
            status: "error",
          });
        }
      })();
    } catch (error) {
      console.error("[Story Video] Generate video error:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ─── AUTO-GENERATE STORY VIDEO (private, cron-friendly) ──────────────
  app.options("/api/auto-generate-story-video", (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  app.options("/api/auto-generate-story-video/debug/:projectId", (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  /** Cron/internal: inspect generation logs + project state for an auto story (or any) project. */
  app.get(
    "/api/auto-generate-story-video/debug/:projectId",
    extractTokenFromUrl,
    authenticateToken,
    async (req: any, res) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      try {
        const userId = req.user!.userId;
        const projectId = req.params.projectId;
        const project = await storage.getProject(projectId);
        if (!project || project.userId !== userId) {
          return res.status(404).json({ error: "Project not found" });
        }
        const logs = await storage.getGenerationLogs(projectId);
        const storyScript = project.storyScript as unknown[] | null;
        const storyAudio = (project.storyAudioUrls || []) as string[];
        const storyImages = (project.storySceneImages || []) as string[];
        const segments = (project.videoSegments || []) as string[];
        res.json({
          projectId: project.id,
          projectType: project.projectType,
          title: project.title,
          description: project.description,
          generationStatus: project.generationStatus,
          currentStep: project.currentStep,
          isCompleted: project.isCompleted,
          finalVideoUrl: project.finalVideoUrl,
          storyDuration: project.storyDuration,
          aspectRatio: project.aspectRatio,
          videoQuality: project.videoQuality,
          storyNarrator: project.storyNarrator,
          storyNarratorVoice: project.storyNarratorVoice,
          storyScriptSceneCount: Array.isArray(storyScript) ? storyScript.length : 0,
          storyCharactersCount: Array.isArray(project.storyCharacters) ? project.storyCharacters.length : 0,
          storyAudioFilledCount: storyAudio.filter(Boolean).length,
          storySceneImagesFilledCount: storyImages.filter(Boolean).length,
          videoSegmentsCount: segments.filter(Boolean).length,
          resendEmailConfigured: !!process.env.RESEND_API_KEY?.trim(),
          notificationRecipient: process.env.CONTACT_EMAIL || "info@neonvideo.ai",
          logs: logs.map((l) => ({
            id: l.id,
            step: l.step,
            message: l.message,
            status: l.status,
            createdAt: l.createdAt,
            metadata: l.metadata,
          })),
        });
      } catch (error) {
        console.error("[AUTO-STORY] Debug route error:", error);
        res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load debug info" });
      }
    },
  );

  async function processAutoGenerateStoryVideo(
    userId: string,
    projectId: string,
    targetDuration: number,
    includeCaptions: boolean,
    videoQuality: string,
  ) {
    const notificationEmail = process.env.CONTACT_EMAIL || "info@neonvideo.ai";
    const baseUrl = process.env.FRONTEND_URL || "https://neonvideo.ai";
    const LOG_TAG = "[AUTO-STORY]";
    let currentStep = "initialization";

    /** Resend returns false (no throw) when RESEND_API_KEY is missing or API errors — log and persist so ops can see it in debug. */
    const sendStoryNotificationEmail = async (kind: "success" | "failure", subject: string, html: string) => {
      try {
        const sent = await emailService.sendEmail({ to: notificationEmail, subject, html });
        if (!sent) {
          const hint =
            "Email was not sent: set RESEND_API_KEY (and verify EMAIL_FROM domain in Resend). Check server logs for Resend errors.";
          console.error(`${LOG_TAG} ${hint} (kind=${kind}, project=${projectId})`);
          await storage.addGenerationLog({
            projectId,
            step: "auto_story_email",
            message: hint,
            status: "warning",
            metadata: { kind, recipient: notificationEmail },
          });
        }
        return sent;
      } catch (emailErr) {
        console.error(`${LOG_TAG} sendEmail threw:`, emailErr);
        await storage.addGenerationLog({
          projectId,
          step: "auto_story_email",
          message: `Email send threw: ${(emailErr as Error).message}`,
          status: "error",
          metadata: { kind },
        });
        return false;
      }
    };

    const sendFailureEmail = async (step: string, message: string) => {
      await sendStoryNotificationEmail(
        "failure",
        `Auto-generated story video failed (${step})`,
        `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Auto-Generated Story Video Failed</h2>
              <p><strong>Failed step:</strong> ${step}</p>
              <p><strong>Error:</strong> ${message}</p>
              <p>Project ID: ${projectId}</p>
              <p><a href="${baseUrl}/v/${projectId}">View project</a></p>
            </div>
          `,
      );
    };

    try {
      await storage.updateProject(projectId, {
        generationStatus: "generating",
        generationStartedAt: new Date(),
      });

      const OpenAI = (await import("openai")).default;
      const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const sceneCount = Math.floor(targetDuration / 5);
      const aspectRatio = "9:16";

      // ── Step 1: Generate story script via OpenAI ──
      currentStep = "script_generation";
      console.log(`${LOG_TAG} Step 1: Generating story script (${sceneCount} scenes, ${targetDuration}s)`);
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_script",
        message: "Writing the story...",
        status: "started",
      });

      const scriptResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a professional story writer for short animated videos. Generate a complete story with characters and scenes.

OUTPUT FORMAT: Respond ONLY with valid JSON matching this schema:
{
  "title": "Story title (max 60 chars)",
  "theme": "fantasy" | "medieval" | "kids_tale" | "futuristic",
  "narrator_voice": "Theodore" | "Alex" | "Ashley" | "Timothy" | "Ronald" | "Olivia" | "Hana" | "Jing",
  "art_style": "realistic" | "3d" | "cartoon",
  "characters": [
    {
      "name": "CharacterName (single word or two words, no spaces in JSON keys)",
      "gender": "male" | "female",
      "age": "child" | "teen" | "adult" | "elderly",
      "description": "Detailed visual description of the character's appearance, clothing, and distinctive features for image generation"
    }
  ],
  "scenes": [
    {
      "id": 1,
      "character": "Narrator" or "CharacterName",
      "audio": "The spoken dialogue or narration for this 5-second scene (12-18 words)",
      "scene_description": "Vivid visual description of what should be shown (camera angle, setting, character actions)"
    }
  ]
}

RULES:
- Generate EXACTLY 1 or 2 characters (never more). All stories need 1 or 2 characters.
- Always include a Narrator who sets up scenes and provides transitions.
- Generate EXACTLY ${sceneCount} scenes (video is ${targetDuration}s, each scene is 5s).
- Each scene's "audio" must be 12-18 words (fits in 5 seconds of speech). Never fewer than 8 words or more than 20.
- Distribute dialogue among narrator and characters naturally. Each character speaks at least once.
- Scene descriptions must be vivid and specific, describing camera angles, settings, and character actions.
- Name characters in scene_description when they are visible.
- Pick the theme randomly from: fantasy, medieval, kids_tale, futuristic.
- Pick narrator_voice based on the story mood from this list:
  Theodore (old man, great for fantasy/medieval), Alex (energetic male, great for action/futuristic), Ashley (serene female, great for kids tales/gentle stories),
  Timothy (young serene male, 18-30), Ronald (older male, 40-60), Olivia (young female, sensual and serene, 18-30),
  Hana (young 7-10 year old girl), Jing (cute, childish voice male/female, 2-8 years old).
- Pick art_style based on theme: "realistic" for medieval/futuristic, "3d" for fantasy, "cartoon" for kids tales. You may vary this creatively.
- Character descriptions should be detailed enough for AI image generation (appearance, clothing, hair, notable features).
- For two-character scenes where BOTH characters speak, you may use multi_talk. Add these fields to the scene:
  "multi_talk": true, "character_left": "Name1", "character_right": "Name2", "audio_left": "dialogue for left character", "audio_right": "dialogue for right character", "multi_talk_order": "left_right" | "right_left" | "meanwhile"
  When multi_talk is true, the "character" field should be the primary speaker and "audio" can be empty.
- Keep multi_talk scenes to at most 2-3 per story. Most scenes should be single-speaker.`,
          },
          {
            role: "user",
            content: "Generate a unique and captivating short story for an animated video. Be creative with the characters and plot!",
          },
        ],
        response_format: { type: "json_object" },
        temperature: 1.1,
        max_tokens: 2000,
      });

      const storyData = JSON.parse(scriptResponse.choices[0].message.content || "{}");
      console.log(`${LOG_TAG} Story generated: "${storyData.title}" (${storyData.theme}), ${storyData.characters?.length} characters, ${storyData.scenes?.length} scenes`);

      if (!storyData.scenes || !Array.isArray(storyData.scenes) || storyData.scenes.length === 0) {
        throw new Error("OpenAI returned no scenes");
      }
      if (!storyData.characters || !Array.isArray(storyData.characters) || storyData.characters.length === 0) {
        throw new Error("OpenAI returned no characters");
      }

      const storyTitle = storyData.title || "Auto-Generated Story";
      const narratorVoice = storyData.narrator_voice || "Alex";
      const artStyle: string = storyData.art_style || "3d";
      const storyScript = storyData.scenes as {
        id: number;
        character: string;
        audio: string;
        scene_description: string;
        multi_talk?: boolean;
        character_left?: string;
        character_right?: string;
        audio_left?: string;
        audio_right?: string;
        multi_talk_order?: "left_right" | "right_left" | "meanwhile";
      }[];

      await storage.updateProject(projectId, {
        title: storyTitle.substring(0, 80),
        description: storyData.title,
        storyPrompt: `Auto-generated ${storyData.theme} story: ${storyTitle}`,
        storyDuration: targetDuration,
        storyNarrator: true,
        storyNarratorVoice: narratorVoice,
        storyScript,
        storyScenePrompts: storyScript.map((s) => s.scene_description),
        currentStep: 2,
      });

      await storage.addGenerationLog({
        projectId,
        step: "auto_story_script",
        message: `Script generated: "${storyTitle}" with ${storyScript.length} scenes`,
        status: "completed",
        metadata: { title: storyTitle, theme: storyData.theme, sceneCount: storyScript.length },
      });

      // ── Step 2: Generate character images ──
      currentStep = "character_generation";
      console.log(`${LOG_TAG} Step 2: Generating ${storyData.characters.length} character images (style: ${artStyle})`);
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_characters",
        message: "Creating characters...",
        status: "started",
      });

      const storyCharacters: { name: string; imageUrl: string; voiceId: string | null; prompt: string }[] = [];

      for (const char of storyData.characters.slice(0, 2)) {
        const charPrompt = `front shot of a ${char.description}`;
        console.log(`${LOG_TAG} Generating character "${char.name}" with style "${artStyle}": ${charPrompt.substring(0, 100)}...`);
        const imageUrls = await generateCharacterImages(charPrompt, aspectRatio, artStyle);
        const imageUrl = imageUrls[0] || "";
        if (!imageUrl) {
          throw new Error(`Character "${char.name}" image generation returned empty URL`);
        }
        storyCharacters.push({
          name: char.name,
          imageUrl,
          voiceId: null,
          prompt: charPrompt,
        });
        console.log(`${LOG_TAG} Character "${char.name}" image generated: ${imageUrl.substring(0, 80)}...`);
      }

      await storage.addGenerationLog({
        projectId,
        step: "auto_story_characters",
        message: `Generated ${storyCharacters.filter((c) => c.imageUrl).length}/${storyCharacters.length} character images`,
        status: "completed",
      });

      // ── Step 3: Assign voices to characters via OpenAI ──
      currentStep = "voice_assignment";
      console.log(`${LOG_TAG} Step 3: Assigning voices to characters`);

      const voiceAssignmentResponse = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You assign voices to story characters. Given character info, pick the best voice ID for each.

Available MALE voices:
- "Alex": Energetic younger male adult
- "Craig": Older male adult, calm
- "Theodore": Old man, wise
- "Hades": Deep menacing voice, great for villains
- "Timothy": Young, serene male (18-30 years)
- "Ronald": Older male (40-60 years)
- "Blake": Evil genius male voice (30-60 years)
- "Dominus": Evil cyborg

Available FEMALE/KIDS voices:
- "Ashley": Serene adult female
- "Elizabeth": Younger adult female
- "Julia": Female teenager
- "Pixie": High-pitched, great for small creatures or fairies
- "Olivia": Young female, sensual and serene voice (18-30 years)
- "Hana": Young girl voice (7-10 years old)
- "Jing": Cute, childish voice male/female (2-8 years old)

Respond ONLY with valid JSON: { "assignments": { "CharacterName": "VoiceId", ... } }
Pick voices that best match each character's personality, age, and gender.`,
          },
          {
            role: "user",
            content: `Assign voices to these characters:\n${storyData.characters.map((c: any) => `- ${c.name}: ${c.gender}, ${c.age}, ${c.description}`).join("\n")}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const voiceAssignments = JSON.parse(voiceAssignmentResponse.choices[0].message.content || "{}");
      const assignments: Record<string, string> = voiceAssignments.assignments || {};
      console.log(`${LOG_TAG} Voice assignments:`, assignments);

      const voiceMap: Record<string, string> = {};
      voiceMap["narrator"] = narratorVoice;

      for (const char of storyCharacters) {
        const key = (char.name || "").trim().toLowerCase();
        if (!key) continue;
        const assignedVoice = assignments[char.name] || assignments[key];
        if (assignedVoice) {
          voiceMap[key] = assignedVoice;
          char.voiceId = assignedVoice;
        } else {
          voiceMap[key] = STORY_DEFAULT_CHARACTER_VOICE_POOL[storyCharacters.indexOf(char) % STORY_DEFAULT_CHARACTER_VOICE_POOL.length];
          char.voiceId = voiceMap[key];
        }
      }

      await storage.updateProject(projectId, { storyCharacters });
      console.log(`${LOG_TAG} Voice map:`, voiceMap);

      // ── Step 4: Generate TTS audio for all scenes ──
      currentStep = "audio_generation";
      console.log(`${LOG_TAG} Step 4: Generating audio for ${storyScript.length} scenes`);
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_audio",
        message: "Creating character voices...",
        status: "started",
      });

      const storeAudioOnBunny = async (remoteUrl: string, fileLabel: string): Promise<string> => {
        if (!isBunnyConfigured()) return remoteUrl;
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const audioResponse = await fetch(remoteUrl);
            if (!audioResponse.ok) return remoteUrl;
            const buffer = Buffer.from(await audioResponse.arrayBuffer());
            const fileName = `story-${projectId}-${fileLabel}-${Date.now()}.mp3`;
            const bunnyResult = await uploadAudio(fileName, buffer);
            return bunnyResult.url;
          } catch (e) {
            const retryable =
              attempt < maxAttempts &&
              (String((e as Error)?.cause ?? (e as Error)?.message ?? e).includes("ECONNRESET") ||
                String((e as Error)?.message ?? e).includes("fetch failed") ||
                String((e as Error)?.message ?? e).includes("ETIMEDOUT"));
            if (retryable) {
              await new Promise((r) => setTimeout(r, 800 * attempt));
              continue;
            }
            console.warn(`${LOG_TAG} Bunny upload failed (${fileLabel})`, e);
            return remoteUrl;
          }
        }
        return remoteUrl;
      };

      const audioPromises = storyScript.map(async (scene, index) => {
        if (
          scene.multi_talk &&
          (scene.audio_left || "").trim() &&
          (scene.audio_right || "").trim()
        ) {
          const vL = voiceMap[(scene.character_left || "").trim().toLowerCase()] || STORY_DEFAULT_NARRATOR_VOICE;
          const vR = voiceMap[(scene.character_right || "").trim().toLowerCase()] || STORY_DEFAULT_NARRATOR_VOICE;
          console.log(`${LOG_TAG} Scene ${scene.id}: multi_talk L="${vL}" R="${vR}"`);
          const leftRaw = await generateStoryAudio((scene.audio_left || "").trim(), vL);
          const rightRaw = await generateStoryAudio((scene.audio_right || "").trim(), vR);
          const leftStored = await storeAudioOnBunny(leftRaw, `scene-${index + 1}-L`);
          const rightStored = await storeAudioOnBunny(rightRaw, `scene-${index + 1}-R`);
          if (!leftStored || !rightStored) {
            throw new Error(`Scene ${scene.id} returned empty multi-talk audio URL`);
          }
          return { index, url: leftStored, urlRight: rightStored };
        }

        const voiceId = voiceMap[(scene.character || "").trim().toLowerCase()] || STORY_DEFAULT_NARRATOR_VOICE;
        const line = typeof scene.audio === "string" ? scene.audio : "";
        console.log(`${LOG_TAG} Scene ${scene.id}: voice="${voiceId}" for "${scene.character}"`);
        const audioUrl = await generateStoryAudio(line, voiceId);
        const storedUrl = await storeAudioOnBunny(audioUrl, `scene-${index + 1}`);
        if (!storedUrl) {
          throw new Error(`Scene ${scene.id} returned empty audio URL`);
        }
        return { index, url: storedUrl, urlRight: "" };
      });

      const audioResults = await Promise.all(audioPromises);
      const audioUrls: string[] = new Array(storyScript.length).fill("");
      const audioUrlsRight: string[] = new Array(storyScript.length).fill("");
      for (const r of audioResults) {
        if (r.url) audioUrls[r.index] = r.url;
        if (r.urlRight) audioUrlsRight[r.index] = r.urlRight;
      }

      await storage.updateProject(projectId, { storyAudioUrls: audioUrls, storyAudioUrlsRight: audioUrlsRight });
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_audio",
        message: `Generated ${audioUrls.filter(Boolean).length}/${storyScript.length} audio files`,
        status: "completed",
      });

      // ── Step 5: Generate scene images ──
      currentStep = "scene_images";
      console.log(`${LOG_TAG} Step 5: Generating ${storyScript.length} scene images`);
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_images",
        message: "Painting the scenes...",
        status: "started",
      });

      const sceneDescriptions = storyScript.map((s) => s.scene_description);
      const refUrls = collectStoryCharacterReferenceImageUrls(storyCharacters);

      let sceneImages: string[];
      if (refUrls.length > 0) {
        sceneImages = await generateSceneImages(sceneDescriptions, refUrls, aspectRatio);
      } else {
        sceneImages = await generateSceneImagesFromText(sceneDescriptions, aspectRatio);
      }

      await storage.updateProject(projectId, {
        storySceneImages: sceneImages,
        currentStep: 3,
      });
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_images",
        message: `Generated ${sceneImages.length} scene images`,
        status: "completed",
      });

      // ── Step 6: Generate video segments ──
      currentStep = "video_segments";
      console.log(`${LOG_TAG} Step 6: Generating ${sceneImages.length} video segments`);
      const generationId = nanoid();
      await storage.updateProject(projectId, {
        generationId,
        generationStatus: "generating",
        generationStartedAt: new Date(),
        generationTimeoutAt: new Date(Date.now() + 30 * 60 * 1000),
        currentStep: 4,
      });

      await storage.addGenerationLog({
        projectId,
        step: "auto_story_video_start",
        message: "Bringing scenes to life...",
        status: "started",
      });

      const dimensions =
        aspectRatio === "9:16" ? "1080x1920"
        : aspectRatio === "3:4" ? "1080x1440"
        : "1920x1080";

      const videoSegmentPromises = sceneImages.map(async (sceneImage, i) => {
        const sceneAudio = audioUrls[i];
        const sceneAudioRight = (audioUrlsRight[i] || "").trim();
        const scenePrompt = sceneDescriptions[i] || "animated scene";
        const isNarrator = storyScript[i]?.character === "Narrator";
        const sc = storyScript[i];
        const useInfinitetalkMulti =
          !isNarrator &&
          !!sc?.multi_talk &&
          (sc.audio_left || "").trim() &&
          (sc.audio_right || "").trim() &&
          !!sceneAudio &&
          !!sceneAudioRight;
        const multiOrder =
          sc?.multi_talk_order === "right_left" || sc?.multi_talk_order === "meanwhile"
            ? sc.multi_talk_order
            : "left_right";

        const modelLabel = isNarrator ? "seedance" : useInfinitetalkMulti ? "infinitetalk/multi" : "infinitetalk";
        console.log(`${LOG_TAG} Scene ${i + 1}/${sceneImages.length} — "${storyScript[i]?.character}", model: ${modelLabel}`);

        try {
          let clipUrl: string;

          if (isNarrator) {
            const silentVideoUrl = await generateVideoSegment(
              "",
              sceneImage,
              scenePrompt,
              "seedance",
              9,
              (videoQuality as "quick" | "medium" | "premium") || "medium",
              aspectRatio,
            );
            if (sceneAudio) {
              const mergeResult = await mergeVideos([silentVideoUrl], sceneAudio, undefined, undefined, undefined, dimensions);
              clipUrl = mergeResult.download_url;
            } else {
              clipUrl = silentVideoUrl;
            }
          } else if (useInfinitetalkMulti) {
            clipUrl = await generateInfinitetalkMultiVideoSegment(
              sceneImage,
              sceneAudio,
              sceneAudioRight,
              multiOrder,
              scenePrompt,
              "480p",
            );
          } else {
            clipUrl = await generateVideoSegment(
              sceneAudio || "",
              sceneImage,
              scenePrompt,
              "infinitetalk",
              5,
              (videoQuality as "quick" | "medium" | "premium") || "medium",
              aspectRatio,
            );
          }

          let storedClipUrl = clipUrl;
          if (isBunnyConfigured()) {
            try {
              const clipResponse = await fetch(clipUrl);
              if (clipResponse.ok) {
                const buffer = Buffer.from(await clipResponse.arrayBuffer());
                const fileName = `story-${projectId}-seg-${i + 1}-${Date.now()}.mp4`;
                const bunnyResult = await uploadToBunnyStorage("scenes", fileName, buffer);
                storedClipUrl = bunnyResult.url;
              }
            } catch (bunnyErr) {
              console.warn(`${LOG_TAG} Bunny upload failed for segment ${i + 1}`, bunnyErr);
            }
          }

          console.log(`${LOG_TAG} Scene ${i + 1} complete: ${storedClipUrl.substring(0, 80)}`);
          return { index: i, url: storedClipUrl };
        } catch (segErr) {
          console.error(`${LOG_TAG} Scene ${i + 1} failed:`, segErr);
          throw new Error(`Scene ${i + 1} video generation failed: ${(segErr as Error).message}`);
        }
      });

      const results = await Promise.all(videoSegmentPromises);
      const videoSegmentUrls = results.sort((a, b) => a.index - b.index).map((r) => r.url);

      await storage.updateProject(projectId, { videoSegments: videoSegmentUrls });
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_video_segments",
        message: `All ${videoSegmentUrls.length} video segments generated`,
        status: "completed",
      });

      // ── Step 7: Merge, captions, finalize ──
      currentStep = "merge_finalize";
      console.log(`${LOG_TAG} Step 7: Merging ${videoSegmentUrls.length} segments`);
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_merge",
        message: "Assembling the final video...",
        status: "started",
      });

      const outroVideoUrl = "https://neonvideo.b-cdn.net/neonvideooutros/neonvideo_vertical.mp4";

      const mergeResult = await mergeVideos(
        videoSegmentUrls,
        undefined,
        undefined,
        undefined,
        outroVideoUrl,
        dimensions,
      );

      let finalVideoUrl = mergeResult.download_url;
      if (isBunnyConfigured() && finalVideoUrl) {
        try {
          const mergedResponse = await fetch(finalVideoUrl);
          if (mergedResponse.ok) {
            const buffer = Buffer.from(await mergedResponse.arrayBuffer());
            const fileName = `story-${projectId}-final-${Date.now()}.mp4`;
            const bunnyResult = await uploadToBunnyStorage("final", fileName, buffer);
            finalVideoUrl = bunnyResult.url;
            console.log(`${LOG_TAG} Final video on Bunny: ${finalVideoUrl}`);
          }
        } catch (uploadErr) {
          console.warn(`${LOG_TAG} Bunny upload for final video failed, using merge URL`, uploadErr);
        }
      }

      if (includeCaptions) {
        try {
          currentStep = "captions";
          await storage.addGenerationLog({
            projectId,
            step: "auto_story_captions",
            message: "Adding captions...",
            status: "started",
          });

          const { addTikTokCaptions } = await import("./services/ffmpegCaptions");
          const captionResult = await addTikTokCaptions({
            videoUrl: finalVideoUrl,
            subtitleStyle: "yellow-bg",
            language: "auto",
            aspectRatio,
            position: "bottom",
            maxCharsPerLine: 50,
            maxLines: 1,
          });

          if (isBunnyConfigured()) {
            const capResponse = await fetch(captionResult.download_url);
            if (capResponse.ok) {
              const capBuffer = Buffer.from(await capResponse.arrayBuffer());
              const capFileName = `story-${projectId}-final-captioned-${Date.now()}.mp4`;
              const capBunny = await uploadToBunnyStorage("final", capFileName, capBuffer);
              finalVideoUrl = capBunny.url;
            } else {
              finalVideoUrl = captionResult.download_url;
            }
          } else {
            finalVideoUrl = captionResult.download_url;
          }

          await storage.addGenerationLog({
            projectId,
            step: "auto_story_captions",
            message: "Captions added",
            status: "completed",
          });
        } catch (capErr) {
          console.error(`${LOG_TAG} Caption step failed:`, capErr);
          await storage.addGenerationLog({
            projectId,
            step: "auto_story_captions",
            message: `Captions failed: ${(capErr as Error).message}`,
            status: "error",
          });
          throw capErr;
        }
      }

      await storage.updateProject(projectId, {
        finalVideoUrl,
        isCompleted: true,
        currentStep: 5,
        generationStatus: "completed",
      });

      await storage.addGenerationLog({
        projectId,
        step: "auto_story_complete",
        message: "Story video is ready!",
        status: "completed",
        metadata: { finalVideoUrl },
      });

      try {
        await createMuxAssetForVideo(projectId, finalVideoUrl);
        console.log(`${LOG_TAG} MUX asset creation initiated for project ${projectId}`);
      } catch (muxErr) {
        console.warn(`${LOG_TAG} MUX asset creation failed:`, muxErr);
      }

      console.log(`${LOG_TAG} Generation complete for project ${projectId}`);

      await sendStoryNotificationEmail(
        "success",
        `Auto-generated story video is ready: ${storyTitle}`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Auto-Generated Story Video Ready</h2>
            <p><strong>${storyTitle}</strong></p>
            <p>Theme: ${storyData.theme} | Style: ${artStyle} | Duration: ${targetDuration}s</p>
            <p>Characters: ${storyCharacters.map((c) => c.name).join(", ")}</p>
            <p><a href="${baseUrl}/v/${projectId}">View project</a></p>
            <p style="color:#666; font-size: 12px;">Project ID: ${projectId}</p>
          </div>
        `,
      );
    } catch (error) {
      const errMsg = (error as Error).message;
      console.error(`${LOG_TAG} Error:`, error);

      await storage.updateProject(projectId, { generationStatus: "failed" });
      await storage.addGenerationLog({
        projectId,
        step: "auto_story_error",
        message: `Generation failed at ${currentStep}: ${errMsg}`,
        status: "error",
        metadata: { failedStep: currentStep },
      });
      await sendFailureEmail(currentStep, errMsg);
    }
  }

  app.get("/api/auto-generate-story-video", extractTokenFromUrl, authenticateToken, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    try {
      const userId = req.user!.userId;
      const { duration: requestedDuration, quality: requestedQuality, captions: requestedCaptions } = req.query;

      const validQualities = ["medium", "premium"];
      const videoQuality = validQualities.includes(requestedQuality) ? requestedQuality : "medium";

      let targetDuration = 45;
      if (requestedDuration) {
        const parsedDuration = parseInt(requestedDuration, 10);
        if (!isNaN(parsedDuration) && parsedDuration >= 15 && parsedDuration <= 60) {
          targetDuration = parsedDuration;
        }
      }

      const includeCaptions = requestedCaptions !== "false";

      console.log(`[AUTO-STORY] Starting auto story video generation for user ${userId} (duration=${targetDuration}s, quality=${videoQuality}, captions=${includeCaptions})`);

      const project = await storage.createProject({
        userId,
        title: "Auto-Generated Story Video",
        description: "",
        projectType: "story_video",
        storyDuration: targetDuration,
        storyNarrator: true,
        aspectRatio: "9:16",
        videoQuality,
        currentStep: 1,
      });

      await storage.addGenerationLog({
        projectId: project.id,
        step: "project_creation",
        message: "Setting up Auto-Generate Story Video...",
        status: "completed",
        metadata: {},
      });

      const baseUrl = process.env.FRONTEND_URL || "https://neonvideo.ai";
      const notificationEmail = process.env.CONTACT_EMAIL || "info@neonvideo.ai";
      const timestamp = new Date().toISOString();
      const apiOrigin = getBaseUrl(req);
      const logsSoFar = await storage.getGenerationLogs(project.id);

      res.json({
        success: true,
        projectId: project.id,
        message: `Auto-generated story video is being processed. You will receive an email at ${notificationEmail} when it's ready.`,
        timestamp,
        statusUrl: `/api/neon-single-prompt/status/${project.id}`,
        projectUrl: `${baseUrl}/v/${project.id}`,
        details: {
          duration: targetDuration,
          quality: videoQuality,
          captions: includeCaptions,
          aspectRatio: "9:16",
        },
        debug: {
          summary:
            "The projectId above identifies this run. The pipeline runs in the background after this response. Refresh the poll URL below (same auth as this request) to see newer generation logs and final state.",
          generationLogsSnapshot: logsSoFar.map((l) => ({
            step: l.step,
            message: l.message,
            status: l.status,
            createdAt: l.createdAt,
            metadata: l.metadata,
          })),
          pollDetailedLogsPath: `/api/auto-generate-story-video/debug/${project.id}`,
          pollDetailedLogsUrl: `${apiOrigin}/api/auto-generate-story-video/debug/${project.id}`,
          authHint:
            "Open pollDetailedLogsUrl with the same ?token=... or Authorization: Bearer ... you used for this request.",
          resendEmailConfigured: !!process.env.RESEND_API_KEY?.trim(),
          openaiApiConfigured: !!process.env.OPENAI_API_KEY?.trim(),
          wavespeedConfigured: !!process.env.WAVESPEED_API_KEY?.trim(),
          notificationRecipient: notificationEmail,
        },
      });

      const createdProjectId = project.id;
      processAutoGenerateStoryVideo(
        userId,
        createdProjectId,
        targetDuration,
        includeCaptions,
        videoQuality,
      ).catch(async (error) => {
        console.error("[AUTO-STORY] Background processing rejected (unexpected):", error);
        const notifyTo = process.env.CONTACT_EMAIL || "info@neonvideo.ai";
        const frontend = process.env.FRONTEND_URL || "https://neonvideo.ai";
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack || "" : "";
        try {
          const sent = await emailService.sendEmail({
            to: notifyTo,
            subject: "Auto-generated story video failed (unexpected)",
            html: `<div style="font-family:Arial,sans-serif"><h2>Unexpected pipeline failure</h2><p>Project: <code>${createdProjectId}</code></p><p><strong>Error:</strong> ${errMsg}</p><pre style="white-space:pre-wrap;font-size:12px">${errStack}</pre><p><a href="${frontend}/v/${createdProjectId}">View project</a></p><p>If no email usually arrives, set RESEND_API_KEY.</p></div>`,
          });
          if (!sent) {
            console.error("[AUTO-STORY] Failure email not sent (Resend not configured or API error).");
          }
        } catch (emailErr) {
          console.error("[AUTO-STORY] Could not send unexpected-failure email:", emailErr);
        }
      });
    } catch (error) {
      console.error("[AUTO-STORY] Route error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to start auto-generate story video",
      });
    }
  });

  // Register public API v1 routes
  registerApiV1Routes(app);

  const httpServer = createServer(app);
  return httpServer;
}
