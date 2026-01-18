/**
 * Lyrics duration validation utility
 * 
 * Validates that user-provided lyrics can reasonably fit within the specified duration.
 * Uses word-count heuristics to prevent abuse while being forgiving for legitimate use.
 * 
 * Thresholds:
 * - Max words per second: 3.5 (covers fast singing/rap)
 * - Tolerance buffer: 20% (allows some overage)
 */

export interface LyricsValidationResult {
  isValid: boolean;
  wordCount: number;
  maxWordsAllowed: number;
  estimatedMinDuration: number;
  message?: string;
}

const MAX_WORDS_PER_SECOND = 3.5;
const TOLERANCE_BUFFER = 0.20; // 20% buffer

/**
 * Count the number of words in a text string
 */
export function countWords(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .length;
}

/**
 * Calculate the maximum words allowed for a given duration
 */
export function getMaxWordsForDuration(durationSeconds: number): number {
  const baseMax = Math.floor(durationSeconds * MAX_WORDS_PER_SECOND);
  const withBuffer = Math.floor(baseMax * (1 + TOLERANCE_BUFFER));
  return withBuffer;
}

/**
 * Estimate the minimum duration needed for a given word count
 */
export function estimateMinDuration(wordCount: number): number {
  return Math.ceil(wordCount / MAX_WORDS_PER_SECOND);
}

/**
 * Validate that lyrics can fit within the specified duration
 * 
 * @param lyrics - The lyrics text to validate
 * @param durationSeconds - The target duration in seconds
 * @returns Validation result with details
 */
export function validateLyricsDuration(
  lyrics: string,
  durationSeconds: number
): LyricsValidationResult {
  const wordCount = countWords(lyrics);
  const maxWordsAllowed = getMaxWordsForDuration(durationSeconds);
  const estimatedMinDuration = estimateMinDuration(wordCount);
  
  const isValid = wordCount <= maxWordsAllowed;
  
  let message: string | undefined;
  if (!isValid) {
    const suggestedDuration = Math.ceil(estimatedMinDuration / 30) * 30; // Round to nearest 30s
    message = `These lyrics have ${wordCount} words, which would need about ${formatDuration(estimatedMinDuration)}. For a ${formatDuration(durationSeconds)} song, you can use up to ${maxWordsAllowed} words. Try shortening the lyrics or increasing the duration to ${formatDuration(suggestedDuration)}.`;
  }
  
  return {
    isValid,
    wordCount,
    maxWordsAllowed,
    estimatedMinDuration,
    message,
  };
}

/**
 * Format seconds into a human-readable duration string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `${mins} min`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
