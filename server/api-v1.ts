import type { Express } from "express";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { isBunnyUrl } from "./services/bunny";
import { VideoQueueService } from "./services/videoQueue";
import { defaultSubtitleStyle, isSubtitleStyle } from "@shared/subtitleStyles";

const JWT_SECRET = process.env.JWT_SECRET || "music-video-maker-secret-key";
const videoQueueService = new VideoQueueService();

function extractTokenFromUrl(req: any, _res: any, next: any) {
  if (!req.headers['authorization'] && req.query.token) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
}

function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
    if (!err) {
      try {
        const userRecord = await storage.getUser(user.userId);
        if (userRecord) {
          const isBanned = await storage.isEmailBanned(userRecord.email);
          if (isBanned) {
            return res.status(403).json({
              error: 'This account has been suspended'
            });
          }
        }
      } catch (banCheckError) {
        console.error('Error checking ban status:', banCheckError);
      }
      req.user = user;
      return next();
    }

    try {
      const oauthToken = await storage.getOauthAccessToken(token);
      if (!oauthToken) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      if (new Date() > oauthToken.expiresAt) {
        await storage.deleteExpiredOauthTokens();
        return res.status(403).json({ error: 'Token has expired' });
      }
      try {
        const userRecord = await storage.getUser(oauthToken.userId);
        if (userRecord) {
          const isBanned = await storage.isEmailBanned(userRecord.email);
          if (isBanned) {
            return res.status(403).json({
              error: 'This account has been suspended'
            });
          }
        }
      } catch (banCheckError) {
        console.error('Error checking ban status:', banCheckError);
      }
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

async function requirePaidUser(req: any, res: any, next: any) {
  try {
    const userWithPlan = await storage.getUserWithPlan(req.user.userId);
    if (!userWithPlan) {
      return res.status(404).json({ error: "User not found" });
    }
    const isPaid = userWithPlan.plan && (userWithPlan.plan.monthlyPrice ?? 0) > 0;
    if (!isPaid) {
      return res.status(403).json({
        error: "API access requires a paid plan. Please upgrade at https://neonvideo.ai/plans"
      });
    }
    req.userWithPlan = userWithPlan;
    next();
  } catch (error) {
    console.error("[API-V1] Error checking paid status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

function getBaseUrl(req?: any): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (process.env.API_URL) return process.env.API_URL;
  if (req) {
    const forwardedProto = req.get('x-forwarded-proto') || req.headers?.['x-forwarded-proto'];
    const protocol = forwardedProto || req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get('host') || req.headers?.host;
    if (host) return `${protocol}://${host}`;
  }
  const port = process.env.PORT || '5000';
  return `http://localhost:${port}`;
}

export function registerApiV1Routes(app: Express) {
  // CORS preflight for all v1 endpoints
  app.options("/api/v1/*", (_req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
  });

  // ─── Generate API Token ────────────────────────────────────────────
  app.post("/api/v1/auth/token", extractTokenFromUrl, authenticateToken, requirePaidUser, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    try {
      const user = await storage.getUser(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const apiToken = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '365d' }
      );

      console.log(`[API-V1] Generated API token for user ${user.username}`);

      res.json({
        token: apiToken,
        expires_in: "365 days",
        token_type: "Bearer"
      });
    } catch (error) {
      console.error("[API-V1] Error generating token:", error);
      res.status(500).json({ error: "Failed to generate API token" });
    }
  });

  // ─── Create Video ──────────────────────────────────────────────────
  app.post("/api/v1/videos", extractTokenFromUrl, authenticateToken, requirePaidUser, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    try {
      const {
        prompt,
        image_url: imageUrl,
        audio_url: audioUrl,
        aspect_ratio: requestedAspectRatio,
        video_duration: requestedDuration,
        captions,
      } = req.body;

      const userId = req.user.userId;

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({
          error: "The 'prompt' field is required and must be a non-empty string"
        });
      }

      const validAspectRatios = ["16:9", "9:16"];
      const aspectRatio = validAspectRatios.includes(requestedAspectRatio) ? requestedAspectRatio : "16:9";

      const duration = typeof requestedDuration === 'number'
        ? Math.max(15, Math.min(180, Math.round(requestedDuration)))
        : 15;

      const addSubtitles = captions === true || captions === 'true';

      if (imageUrl && typeof imageUrl !== 'string') {
        return res.status(400).json({ error: "'image_url' must be a string URL" });
      }
      if (audioUrl && typeof audioUrl !== 'string') {
        return res.status(400).json({ error: "'audio_url' must be a string URL" });
      }

      console.log(`[API-V1] Create video request from user ${userId}: prompt="${prompt.substring(0, 80)}...", duration=${duration}s, aspect=${aspectRatio}`);

      // Forward to the existing simple-mode endpoint internally
      const baseUrl = getBaseUrl(req);

      const internalBody: any = {
        prompt,
        aspectRatio,
        duration,
        addSubtitles,
      };

      if (audioUrl) {
        internalBody.audioUrl = audioUrl;
      }
      if (imageUrl) {
        internalBody.referenceImageUrl = imageUrl;
      }

      const authHeader = req.headers['authorization'];
      const internalResponse = await fetch(`${baseUrl}/api/simple-mode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify(internalBody),
      });

      const internalResult = await internalResponse.json();

      if (!internalResponse.ok) {
        console.error(`[API-V1] Internal simple-mode call failed:`, internalResult);
        return res.status(internalResponse.status).json({
          error: internalResult.error || "Failed to create video"
        });
      }

      const projectId = internalResult.projectId;

      console.log(`[API-V1] Video creation started, project ${projectId}`);

      res.status(202).json({
        video_id: projectId,
        status: "processing",
        status_url: `/api/v1/videos/${projectId}/status`,
        message: "Video generation started. Poll the status_url to track progress."
      });

    } catch (error) {
      console.error("[API-V1] Error creating video:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to create video"
      });
    }
  });

  // ─── Check Video Status ────────────────────────────────────────────
  app.get("/api/v1/videos/:id/status", extractTokenFromUrl, authenticateToken, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      if (!id) {
        return res.status(400).json({ error: "Video ID is required" });
      }

      const project = await storage.getProject(id);

      if (!project) {
        return res.status(404).json({ error: "Video not found" });
      }

      if (project.userId !== userId) {
        return res.status(403).json({ error: "You do not have access to this video" });
      }

      let status = 'processing';
      let progress = 0;

      if (project.isCompleted && project.finalVideoUrl) {
        status = 'completed';
        progress = 100;
      } else if (project.generationStatus === 'failed') {
        status = 'failed';
        progress = 0;
      } else {
        progress = Math.round((project.currentStep / 5) * 100);
      }

      const response: any = {
        video_id: project.id,
        status,
        progress,
        current_step: project.currentStep,
        title: project.title,
      };

      if (status === 'completed' && project.finalVideoUrl) {
        let videoUrl = project.finalVideoUrl;
        if (videoUrl.startsWith('/')) {
          const publicBase = process.env.FRONTEND_URL || 'https://neonvideo.ai';
          videoUrl = `${publicBase}${videoUrl}`;
        }
        response.video_url = videoUrl;
        if (project.finalVideoUrl && isBunnyUrl(project.finalVideoUrl)) {
          response.bunny_storage_url = project.finalVideoUrl;
        }
        if (project.muxPlaybackId) {
          response.streaming_url = `https://stream.mux.com/${project.muxPlaybackId}.m3u8`;
        }
      }

      if (status === 'processing') {
        const queuePosition = await videoQueueService.getQueuePosition(id);
        if (queuePosition !== null && queuePosition > 0) {
          response.queue_position = queuePosition;
          response.message = `Video is queued for processing. Position: ${queuePosition}`;
        } else {
          response.message = 'Video is being generated...';
        }
      }

      if (status === 'failed') {
        response.message = 'Video generation failed. Please try again.';
      }

      res.json(response);

    } catch (error) {
      console.error("[API-V1] Error checking status:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get video status"
      });
    }
  });

  // ─── Video Tools: Add Captions ────────────────────────────────────────
  app.post("/api/v1/tools/add-captions", extractTokenFromUrl, authenticateToken, requirePaidUser, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    try {
      const { video_url: videoUrlInput, caption_style: captionStyleInput, position: positionInput } = req.body;
      const userId = req.user.userId;

      if (!videoUrlInput || typeof videoUrlInput !== "string" || !videoUrlInput.trim()) {
        return res.status(400).json({
          error: "The 'video_url' parameter is required and must be a non-empty string"
        });
      }

      const videoUrl = videoUrlInput.trim();
      const subtitleStyle = isSubtitleStyle(captionStyleInput) ? captionStyleInput : defaultSubtitleStyle;
      const validPositions = ["top", "center", "bottom"];
      const position = typeof positionInput === "string" && validPositions.includes(positionInput) ? positionInput : "bottom";

      console.log(`[API-V1] Add captions request from user ${userId}, style=${subtitleStyle}, position=${position}`);

      const { addTikTokCaptions } = await import("./services/ffmpegCaptions");
      const captionResult = await addTikTokCaptions({
        videoUrl,
        subtitleStyle,
        position,
        aspectRatio: "9:16",
      });

      const { ObjectStorageService } = await import("./objectStorage");
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
      } as any);

      const response: any = {
        video_id: newProject.id,
        video_url: captionedResult.url,
      };
      if (captionedResult.url && isBunnyUrl(captionedResult.url)) {
        response.bunny_storage_url = captionedResult.url;
      }

      res.json(response);
    } catch (error) {
      console.error("[API-V1] Add captions tool error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to add captions",
      });
    }
  });

  // ─── Video Tools: Video Upscaler ────────────────────────────────────────
  app.post("/api/v1/tools/video-upscaler", extractTokenFromUrl, authenticateToken, requirePaidUser, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    try {
      const { video_url: videoUrlInput, target_resolution: targetResolutionInput, duration_seconds: durationSecondsInput } = req.body;
      const userId = req.user.userId;

      if (!videoUrlInput || typeof videoUrlInput !== "string" || !videoUrlInput.trim()) {
        return res.status(400).json({
          error: "The 'video_url' parameter is required and must be a non-empty string"
        });
      }

      const videoUrl = videoUrlInput.trim();
      const targetResolutionRaw = typeof targetResolutionInput === "string" ? targetResolutionInput : "1080p";
      const targetResolution = String(targetResolutionRaw).toLowerCase();
      const validResolutions = ["1080p", "2k", "4k"];
      const normalizedResolution =
        targetResolution === "1080p" ? "1080p"
          : targetResolution === "2k" ? "2k"
            : targetResolution === "4k" ? "4k"
              : "1080p";

      if (!validResolutions.includes(normalizedResolution)) {
        return res.status(400).json({
          error: "Invalid target_resolution. Must be one of: 1080p, 2k, 4k."
        });
      }

      const durationSecondsRaw = typeof durationSecondsInput === "number" ? durationSecondsInput : Number(durationSecondsInput);
      const durationSeconds = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0 ? durationSecondsRaw : 15;

      const units = Math.max(1, Math.ceil(durationSeconds / 15));
      const ratePerUnit = normalizedResolution === "1080p" ? 250 : normalizedResolution === "2k" ? 500 : 1000;
      const creditsRequired = units * ratePerUnit;

      const canAfford = await storage.canUserAffordCredits(userId, creditsRequired);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Video Upscaler",
          credits_required: creditsRequired,
          credits_remaining: creditsRemaining,
        });
      }

      const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || "";
      if (!WAVESPEED_API_KEY) {
        return res.status(500).json({ error: "Video upscaler service is not configured" });
      }

      console.log(`[API-V1] Video upscaler request from user ${userId}, resolution=${normalizedResolution}, duration=${durationSeconds}s`);

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
        console.error("[API-V1] Video upscaler submit error:", errorText);
        return res.status(500).json({ error: "Video upscaler submit failed" });
      }

      const submitJson: any = await submitResponse.json();
      const requestId = submitJson?.data?.id;
      if (!requestId) {
        console.error("[API-V1] Video upscaler unexpected response:", submitJson);
        return res.status(500).json({ error: "Video upscaler did not return a request ID" });
      }

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
          console.error("[API-V1] Video upscaler status error:", errorText);
          return res.status(500).json({ error: "Video upscaler status check failed" });
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
          console.error("[API-V1] Video upscaler job failed:", errorMessage);
          return res.status(500).json({ error: errorMessage });
        }
      }

      if (!finalUrl) {
        console.error("[API-V1] Video upscaler timed out. Last status:", lastStatus);
        return res.status(504).json({ error: "Timed out waiting for video upscaler result" });
      }

      const creditDeducted = await storage.deductUserCredits(userId, creditsRequired);
      if (!creditDeducted) {
        console.error("[API-V1] Failed to deduct credits after video upscale");
      } else {
        console.log(`[API-V1] Deducted ${creditsRequired} credits for video upscaler from user ${userId}`);
      }

      res.json({
        video_url: finalUrl,
        target_resolution: normalizedResolution,
        credits_required: creditsRequired,
        duration_seconds_used: units * 15,
      });
    } catch (error) {
      console.error("[API-V1] Video upscaler tool error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upscale video",
      });
    }
  });

  // ─── Video Tools: AI Video Edition ──────────────────────────────────────
  app.post("/api/v1/tools/ai-video-edition", extractTokenFromUrl, authenticateToken, requirePaidUser, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    try {
      const { video_url: videoUrlInput, prompt: promptInput, duration_seconds: durationSecondsInput } = req.body;
      const userId = req.user.userId;

      const prompt = typeof promptInput === "string" ? promptInput.trim() : "";
      if (!prompt) {
        return res.status(400).json({
          error: "The 'prompt' parameter is required and must be a non-empty string"
        });
      }

      if (!videoUrlInput || typeof videoUrlInput !== "string" || !videoUrlInput.trim()) {
        return res.status(400).json({
          error: "The 'video_url' parameter is required and must be a non-empty string"
        });
      }

      const videoUrl = videoUrlInput.trim();
      const mode = "replace_video";

      const durationSecondsRaw = typeof durationSecondsInput === "number" ? durationSecondsInput : Number(durationSecondsInput);
      const durationSeconds = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0 ? durationSecondsRaw : 15;

      const CREDITS_PER_15S = 500;
      const units = Math.max(1, Math.ceil(durationSeconds / 15));
      const creditsRequired = units * CREDITS_PER_15S;

      const canAfford = await storage.canUserAffordCredits(userId, creditsRequired);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for AI Video Edition",
          credits_required: creditsRequired,
          credits_remaining: creditsRemaining,
        });
      }

      const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || "";
      if (!WAVESPEED_API_KEY) {
        return res.status(500).json({ error: "AI Video Edition service is not configured" });
      }

      console.log(`[API-V1] AI Video Edition request from user ${userId}, prompt length=${prompt.length}, duration=${durationSeconds}s`);

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
        console.error("[API-V1] AI Video Edition submit error:", errorText);
        return res.status(500).json({ error: "AI Video Edition submit failed" });
      }

      const submitJson: any = await submitResponse.json();
      const requestId = submitJson?.data?.id;
      if (!requestId) {
        console.error("[API-V1] AI Video Edition unexpected response:", submitJson);
        return res.status(500).json({ error: "AI Video Edition did not return a request ID" });
      }

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
          console.error("[API-V1] AI Video Edition status error:", errorText);
          return res.status(500).json({ error: "AI Video Edition status check failed" });
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
          console.error("[API-V1] AI Video Edition job failed:", errorMessage);
          return res.status(500).json({ error: errorMessage });
        }
      }

      if (!finalUrl) {
        console.error("[API-V1] AI Video Edition timed out. Last status:", lastStatus);
        return res.status(504).json({ error: "Timed out waiting for AI Video Edition result" });
      }

      const creditDeducted = await storage.deductUserCredits(userId, creditsRequired);
      if (!creditDeducted) {
        console.error("[API-V1] Failed to deduct credits after AI Video Edition");
      } else {
        console.log(`[API-V1] Deducted ${creditsRequired} credits for AI Video Edition from user ${userId}`);
      }

      res.json({
        video_url: finalUrl,
        credits_required: creditsRequired,
        duration_seconds_used: units * 15,
      });
    } catch (error) {
      console.error("[API-V1] AI Video Edition tool error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to run AI Video Edition",
      });
    }
  });

  // ─── Video Tools: Video Background Remover ──────────────────────────────
  app.post("/api/v1/tools/video-background-remover", extractTokenFromUrl, authenticateToken, requirePaidUser, async (req: any, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    try {
      const { video_url: videoUrlInput, duration_seconds: durationSecondsInput } = req.body;
      const userId = req.user.userId;

      if (!videoUrlInput || typeof videoUrlInput !== "string" || !videoUrlInput.trim()) {
        return res.status(400).json({
          error: "The 'video_url' parameter is required and must be a non-empty string"
        });
      }

      const videoUrl = videoUrlInput.trim();

      const durationSecondsRaw = typeof durationSecondsInput === "number" ? durationSecondsInput : Number(durationSecondsInput);
      const durationSeconds = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0 ? durationSecondsRaw : 15;

      const CREDITS_PER_15S = 250;
      const units = Math.max(1, Math.ceil(durationSeconds / 15));
      const creditsRequired = units * CREDITS_PER_15S;

      const canAfford = await storage.canUserAffordCredits(userId, creditsRequired);
      if (!canAfford) {
        const creditsRemaining = await storage.getUserCreditsRemaining(userId);
        return res.status(402).json({
          error: "Insufficient credits for Video Background Remover",
          credits_required: creditsRequired,
          credits_remaining: creditsRemaining,
        });
      }

      const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY || "";
      if (!WAVESPEED_API_KEY) {
        return res.status(500).json({ error: "Video Background Remover service is not configured" });
      }

      console.log(`[API-V1] Video Background Remover request from user ${userId}, duration=${durationSeconds}s`);

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
        console.error("[API-V1] Video Background Remover submit error:", errorText);
        return res.status(500).json({ error: "Video Background Remover submit failed" });
      }

      const submitJson: any = await submitResponse.json();
      const requestId = submitJson?.data?.id;
      if (!requestId) {
        console.error("[API-V1] Video Background Remover unexpected response:", submitJson);
        return res.status(500).json({ error: "Video Background Remover did not return a request ID" });
      }

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
          console.error("[API-V1] Video Background Remover status error:", errorText);
          return res.status(500).json({ error: "Video Background Remover status check failed" });
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
          const errorMessage = statusJson?.data?.error || statusJson?.message || "Video Background Remover job failed";
          console.error("[API-V1] Video Background Remover job failed:", errorMessage);
          return res.status(500).json({ error: errorMessage });
        }
      }

      if (!finalUrl) {
        console.error("[API-V1] Video Background Remover timed out. Last status:", lastStatus);
        return res.status(504).json({ error: "Timed out waiting for Video Background Remover result" });
      }

      const creditDeducted = await storage.deductUserCredits(userId, creditsRequired);
      if (!creditDeducted) {
        console.error("[API-V1] Failed to deduct credits after Video Background Remover");
      } else {
        console.log(`[API-V1] Deducted ${creditsRequired} credits for Video Background Remover from user ${userId}`);
      }

      res.json({
        video_url: finalUrl,
        credits_required: creditsRequired,
        duration_seconds_used: units * 15,
      });
    } catch (error) {
      console.error("[API-V1] Video Background Remover tool error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to run Video Background Remover",
      });
    }
  });
}
