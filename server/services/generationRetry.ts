/**
 * Retries async generation API calls (WaveSpeed, ffmpegapi, etc.) on failure with backoff.
 * Configure with GENERATION_API_RETRY_ATTEMPTS (default 3), GENERATION_API_RETRY_DELAY_MS (default 2000).
 */

function clampAttempts(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(10, Math.floor(n));
}

export function getGenerationRetryAttempts(): number {
  return clampAttempts(parseInt(process.env.GENERATION_API_RETRY_ATTEMPTS || "3", 10));
}

export function getGenerationRetryBaseDelayMs(): number {
  const n = parseInt(process.env.GENERATION_API_RETRY_DELAY_MS || "2000", 10);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

export function getGenerationRetryMaxDelayMs(): number {
  const n = parseInt(process.env.GENERATION_API_RETRY_MAX_DELAY_MS || "30000", 10);
  return Number.isFinite(n) && n >= 500 ? n : 30000;
}

export type GenerationRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to stop retrying (e.g. local ffmpeg missing). */
  shouldRetry?: (error: Error, attempt: number) => boolean;
};

/**
 * Runs `fn` up to `maxAttempts` times. Waits with exponential backoff between failures.
 */
export async function withGenerationApiRetries<T>(
  label: string,
  fn: () => Promise<T>,
  options?: GenerationRetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? getGenerationRetryAttempts();
  const baseDelayMs = options?.baseDelayMs ?? getGenerationRetryBaseDelayMs();
  const maxDelayMs = options?.maxDelayMs ?? getGenerationRetryMaxDelayMs();
  const shouldRetry = options?.shouldRetry ?? (() => true);

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastError = err;
      const canRetry = attempt < maxAttempts && shouldRetry(err, attempt);
      if (!canRetry) {
        throw err;
      }
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      console.warn(
        `[${label}] attempt ${attempt}/${maxAttempts} failed: ${err.message.slice(0, 200)} — retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError ?? new Error(`${label}: unknown error after retries`);
}
