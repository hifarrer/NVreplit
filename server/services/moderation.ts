/**
 * WaveSpeed content-moderation helpers, shared by routes.ts and api-v1.ts.
 * Extracted from routes.ts so v1 endpoints can moderate uploads without a
 * circular import (routes.ts imports api-v1.ts).
 */

const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY;

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
  return Array.from(new Set(violations));
}

export async function moderateImageContent(imageUrl: string): Promise<{ safe: boolean; violations: string[]; error?: string }> {
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
