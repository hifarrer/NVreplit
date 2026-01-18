const WAVESPEED_API_KEY =
  process.env.WAVESPEED_API_KEY ||
  process.env.WAVESPEED_API_KEY_ENV_VAR ||
  "default_key";

// Interface for timestamped words from subtitles
interface TimestampedWord {
  start: number; // Start time in seconds
  end: number; // End time in seconds
  text: string;
}

// Function to parse .ass subtitle file and extract timestamped words
export function parseAssSubtitles(assContent: string): TimestampedWord[] {
  const words: TimestampedWord[] = [];
  const lines = assContent.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('Dialogue:')) {
      // Format: Dialogue: Marked=0,0:00:00.00,0:00:01.00,Default,,0000,0000,0000,,word
      const parts = line.split(',');
      if (parts.length >= 10) {
        const startTimeStr = parts[1];
        const endTimeStr = parts[2];
        const text = parts.slice(9).join(',').trim();
        
        // Convert ASS time format (H:MM:SS.CC) to seconds
        const parseTime = (timeStr: string): number => {
          const [hours, minutes, secondsAndCentiseconds] = timeStr.split(':');
          const [seconds, centiseconds] = secondsAndCentiseconds.split('.');
          return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(centiseconds || '0') / 100;
        };
        
        if (text) {
          words.push({
            start: parseTime(startTimeStr),
            end: parseTime(endTimeStr),
            text
          });
        }
      }
    }
  }
  
  return words;
}

// Function to check if a time segment contains lyrics
export function segmentHasLyrics(
  segmentStartTime: number,
  segmentEndTime: number,
  timestampedWords: TimestampedWord[]
): boolean {
  // Check if any word overlaps with this segment
  let wordCount = 0;
  for (const word of timestampedWords) {
    // Word overlaps if it starts before segment ends AND ends after segment starts
    if (word.start < segmentEndTime && word.end > segmentStartTime) {
      wordCount++;
    }
  }
  
  if (wordCount > 0) {
    console.log(`Segment ${segmentStartTime.toFixed(1)}s-${segmentEndTime.toFixed(1)}s contains ${wordCount} word(s)`);
  } else {
    console.log(`Segment ${segmentStartTime.toFixed(1)}s-${segmentEndTime.toFixed(1)}s has NO lyrics`);
  }
  
  return wordCount > 0;
}

// Safe fallback prompt when content is flagged as sensitive
const SAFE_FALLBACK_PROMPT = "the character dances gracefully";

// Video quality type for different AI models
export type VideoQuality = "quick" | "medium" | "premium";

// Internal function that generates a single video segment attempt
async function generateVideoSegmentInternal(
  audioUrl: string,
  imageUrl: string,
  prompt: string,
  model: "infinitetalk" | "seedance" = "infinitetalk",
  segmentDuration: number = 10,
  videoQuality: VideoQuality = "quick",
): Promise<string> {
  console.log("=== GENERATING VIDEO SEGMENT ===");
  console.log("Audio URL:", audioUrl);
  console.log("Image URL:", imageUrl);
  console.log("Prompt:", prompt);
  console.log("Model:", model);
  console.log("Video Quality:", videoQuality);
  console.log("Segment Duration:", segmentDuration, "seconds");

  // Determine endpoint and request body based on video quality and model type
  let endpoint: string;
  let requestBody: any;

  if (model === "infinitetalk") {
    // Infinitetalk is used for lipsync - uses audio
    // Select endpoint and resolution based on video quality
    switch (videoQuality) {
      case "premium":
        // Premium quality: infinitetalk with 720p resolution
        endpoint = "https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk";
        requestBody = {
          audio: audioUrl,
          image: imageUrl,
          resolution: "720p",
          seed: -1,
        };
        break;
      case "medium":
        // Medium quality: infinitetalk with 480p resolution
        endpoint = "https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk";
        requestBody = {
          audio: audioUrl,
          image: imageUrl,
          resolution: "480p",
          seed: -1,
        };
        break;
      case "quick":
      default:
        // Quick quality: infinitetalk-fast (no resolution param)
        endpoint = "https://api.wavespeed.ai/api/v3/wavespeed-ai/infinitetalk-fast";
        requestBody = {
          audio: audioUrl,
          image: imageUrl,
          prompt: prompt,
          seed: -1,
        };
        break;
    }
  } else {
    // Seedance-type models (no audio, image-to-video)
    // Duration must be an integer between 2-12 for seedance models
    const roundedDuration = Math.min(12, Math.max(2, Math.round(segmentDuration)));
    console.log(`Seedance duration: ${segmentDuration}s → rounded to ${roundedDuration}s (valid range: 2-12)`);
    
    // Select model based on video quality
    switch (videoQuality) {
      case "premium":
        // Alibaba Wan 2.5 - Premium quality
        endpoint = "https://api.wavespeed.ai/api/v3/alibaba/wan-2.5/image-to-video";
        requestBody = {
          duration: roundedDuration,
          enable_prompt_expansion: false,
          image: imageUrl,
          prompt: prompt,
          resolution: "720p",
          seed: -1,
        };
        break;
      case "medium":
        // Seedance v1.5 Pro Fast - Medium quality
        endpoint = "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1.5-pro/image-to-video-fast";
        requestBody = {
          camera_fixed: false,
          duration: roundedDuration,
          generate_audio: true,
          image: imageUrl,
          prompt: prompt,
          resolution: "720p",
          seed: -1,
        };
        break;
      case "quick":
      default:
        // Seedance v1 Pro 480p - Quick quality (original)
        endpoint = "https://api.wavespeed.ai/api/v3/bytedance/seedance-v1-pro-i2v-480p";
        requestBody = {
          camera_fixed: false,
          duration: roundedDuration,
          image: imageUrl,
          prompt: prompt,
          seed: -1,
        };
        break;
    }
  }

  console.log("Selected endpoint:", endpoint);

  console.log(
    "Wavespeed request body:",
    JSON.stringify(requestBody, null, 2),
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WAVESPEED_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wavespeed API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const requestId = result.data?.id || result.id;

  if (!requestId) {
    console.error("Wavespeed response:", JSON.stringify(result, null, 2));
    throw new Error("No request ID received from Wavespeed");
  }

  console.log(
    `Video segment submission successful, request ID: ${requestId}`,
  );

  // Poll for results
  let attempts = 0;
  const maxAttempts = 60; // 10 minutes with 10-second intervals

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

    const statusResponse = await fetch(
      `https://api.wavespeed.ai/api/v3/predictions/${requestId}/result`,
      {
        headers: {
          Authorization: `Bearer ${WAVESPEED_API_KEY}`,
        },
      },
    );

    if (!statusResponse.ok) {
      throw new Error(`Status check failed: ${statusResponse.status}`);
    }

    const statusResult = await statusResponse.json();

    if (
      statusResult.data?.status === "completed" &&
      statusResult.data.outputs &&
      statusResult.data.outputs.length > 0
    ) {
      return statusResult.data.outputs[0];
    } else if (statusResult.data?.status === "failed") {
      throw new Error(
        `Video generation failed: ${statusResult.data.error || "Unknown error"}`,
      );
    }

    attempts++;
  }

  throw new Error("Video generation timed out");
}

// Check if error is due to sensitive content flagging
function isSensitiveContentError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  return errorMessage.includes('sensitive') || 
         errorMessage.includes('flagged') ||
         errorMessage.includes('content policy') ||
         errorMessage.includes('nsfw') ||
         errorMessage.includes('inappropriate');
}

export async function generateVideoSegment(
  audioUrl: string,
  imageUrl: string,
  prompt: string,
  model: "infinitetalk" | "seedance" = "infinitetalk",
  segmentDuration: number = 10,
  videoQuality: VideoQuality = "quick",
): Promise<string> {
  try {
    // First attempt with original prompt
    return await generateVideoSegmentInternal(audioUrl, imageUrl, prompt, model, segmentDuration, videoQuality);
  } catch (error) {
    const err = error as Error;
    
    // Check if the error is due to sensitive content
    if (isSensitiveContentError(err)) {
      console.log(`\n=== SENSITIVE CONTENT DETECTED ===`);
      console.log(`Original prompt was flagged: "${prompt}"`);
      console.log(`Retrying with safe fallback prompt: "${SAFE_FALLBACK_PROMPT}"`);
      console.log(`================================\n`);
      
      try {
        // Retry with safe fallback prompt
        const result = await generateVideoSegmentInternal(audioUrl, imageUrl, SAFE_FALLBACK_PROMPT, model, segmentDuration, videoQuality);
        console.log(`Successfully generated video with fallback prompt`);
        return result;
      } catch (retryError) {
        console.error("Fallback prompt also failed:", retryError);
        throw new Error(
          "Failed to generate video segment even with fallback prompt: " + (retryError as Error).message,
        );
      }
    }
    
    // For non-sensitive errors, throw as before
    console.error("Wavespeed generation error:", error);
    throw new Error(
      "Failed to generate video segment: " + err.message,
    );
  }
}

// Dynamic video generation based on configuration with smart lyrics detection
export async function generateAllVideoSegmentsDynamic(
  audioSegments: string[],
  imageUrls: string[],
  prompts: string[],
  config: {
    numberOfVideosRegularApi: number;
    numberOfVideosLipsync: number;
    makeCharacterSing: boolean;
    videoQuality?: VideoQuality;
  },
  subtitleData?: {
    assContent?: string;
    totalDuration?: number;
  },
  segmentDurations?: number[] // Duration of each segment in seconds (important for last segment)
): Promise<{
  videoUrls: string[];
  segmentPairs: Array<{ a: string; b: string }>;
}> {
  const videoQuality = config.videoQuality || "quick";
  console.log(`Starting dynamic video generation:`);
  console.log(`- Audio segments: ${audioSegments.length}`);
  console.log(`- Scene images: ${imageUrls.length}`);
  console.log(
    `- Regular videos (seedance): ${config.numberOfVideosRegularApi}`,
  );
  console.log(`- Lipsync videos (infinitetalk): ${config.numberOfVideosLipsync}`);
  console.log(`- Make character sing: ${config.makeCharacterSing}`);
  console.log(`- Video quality: ${videoQuality}`);
  console.log(`- Has subtitle data: ${!!subtitleData?.assContent}`);
  console.log(`- Segment durations provided: ${segmentDurations ? segmentDurations.join(', ') + 's' : 'using defaults'}`);

  const totalVideos =
    config.numberOfVideosRegularApi +
    (config.makeCharacterSing ? config.numberOfVideosLipsync : 0);

  if (
    audioSegments.length !== imageUrls.length ||
    audioSegments.length !== prompts.length
  ) {
    throw new Error(
      `Mismatch in segments: ${audioSegments.length} audio, ${imageUrls.length} images, ${prompts.length} prompts`,
    );
  }

  // Parse subtitle data if available for smart lyrics detection
  let timestampedWords: TimestampedWord[] = [];
  if (subtitleData?.assContent) {
    timestampedWords = parseAssSubtitles(subtitleData.assContent);
    console.log(`Parsed ${timestampedWords.length} timestamped words from subtitles for smart lyrics detection`);
  } else {
    console.log("No subtitle data available - will not use lipsync for segments without detected lyrics");
  }
  
  // Use provided segment durations or calculate from total duration
  // For proper sync, each segment should be 10 seconds except potentially the last one
  const totalDuration = subtitleData?.totalDuration || (audioSegments.length * 10);
  
  // Helper to get segment duration for a given index
  const getSegmentDuration = (index: number): number => {
    if (segmentDurations && segmentDurations[index] !== undefined) {
      // Use provided segment duration, but ensure minimum of 1 second
      return Math.max(1, segmentDurations[index]);
    }
    // Fallback: calculate based on total duration
    const defaultDuration = 10;
    if (index < audioSegments.length - 1) {
      return defaultDuration;
    }
    // Last segment gets remainder - use actual remainder value for proper sync
    // For exact multiples of 10, the remainder is 0 but the segment still exists,
    // so default to 10 seconds in that case
    const usedDuration = (audioSegments.length - 1) * defaultDuration;
    const remainder = totalDuration - usedDuration;
    // Cap at 10, minimum of 1 second (handle edge case of exact multiples)
    return Math.min(defaultDuration, Math.max(1, remainder));
  };
  
  // Log calculated segment durations
  for (let i = 0; i < audioSegments.length; i++) {
    console.log(`Segment ${i + 1} duration: ${getSegmentDuration(i)}s`);
  }
  
  // Generate videos using intercalated pattern when makeCharacterSing is enabled
  const videoPromises: Promise<string>[] = [];
  const videoTypes: ("seedance" | "infinitetalk")[] = [];

  if (config.makeCharacterSing) {
    // Special handling for 30-second videos (3 segments)
    if (audioSegments.length === 3) {
      // For 30-second videos: Scene 1 (index 0) = seedance, Scenes 2-3 (indices 1-2) = infinitetalk
      // This matches the pattern defined in scene generation (openai.ts)
      console.log("Using 30-second video pattern: Scene 1=REGULAR, Scenes 2-3=LIPSYNC");
      for (let i = 0; i < audioSegments.length; i++) {
        let model: "seedance" | "infinitetalk";
        const segDuration = getSegmentDuration(i);
        
        // Follow the exact scene generation pattern
        if (i === 0) {
          // Scene 1 (index 0): REGULAR = seedance
          model = "seedance";
          console.log(`Segment ${i + 1} (Scene ${i + 1}): REGULAR scene → using seedance (${segDuration}s)`);
        } else {
          // Scenes 2-3 (indices 1-2): LIPSYNC = infinitetalk
          model = "infinitetalk";
          console.log(`Segment ${i + 1} (Scene ${i + 1}): LIPSYNC scene → using infinitetalk (${segDuration}s)`);
        }
        
        videoTypes.push(model);
        
        if (model === "infinitetalk") {
          // Infinitetalk requires audio for lipsync (duration comes from audio)
          videoPromises.push(
            generateVideoSegment(
              audioSegments[i],
              imageUrls[i],
              prompts[i],
              "infinitetalk",
              segDuration,
              videoQuality,
            ),
          );
        } else {
          // Seedance uses explicit duration parameter
          videoPromises.push(
            generateVideoSegment("", imageUrls[i], prompts[i], "seedance", segDuration, videoQuality),
          );
        }
      }
    } else {
      // For longer videos: Follow scene generation pattern
      // ODD scenes (1, 3, 5...) = REGULAR = seedance (indices 0, 2, 4...)
      // EVEN scenes (2, 4, 6...) = LIPSYNC = infinitetalk (indices 1, 3, 5...)
      for (let i = 0; i < audioSegments.length; i++) {
        let model: "seedance" | "infinitetalk";
        const sceneNumber = i + 1; // 1-indexed scene number
        const segDuration = getSegmentDuration(i);
        
        // Calculate time range for logging
        let cumulativeStart = 0;
        for (let j = 0; j < i; j++) {
          cumulativeStart += getSegmentDuration(j);
        }
        const segmentEnd = cumulativeStart + segDuration;
        
        console.log(`\n=== SEGMENT ${i + 1} (${cumulativeStart.toFixed(1)}s-${segmentEnd.toFixed(1)}s, duration: ${segDuration}s) ===`);
        console.log(`  - Scene ${sceneNumber} (index ${i})`);
        
        // Seedance requires minimum 10 seconds, so for shorter segments use infinitetalk
        // which derives its duration from the audio segment length
        const isLastSegment = i === audioSegments.length - 1;
        const shouldForceLipsync = isLastSegment && segDuration < 10;
        
        if (shouldForceLipsync) {
          // Last segment with duration < 10s: force infinitetalk to match audio length
          model = "infinitetalk";
          console.log(`  - Last segment with ${segDuration}s < 10s → forcing infinitetalk for proper sync`);
        } else if (sceneNumber % 2 === 1) {
          // ODD scene numbers (1, 3, 5...) = REGULAR = seedance
          model = "seedance";
          console.log(`  - ODD scene → REGULAR → using seedance`);
        } else {
          // EVEN scene numbers (2, 4, 6...) = LIPSYNC = infinitetalk
          model = "infinitetalk";
          console.log(`  - EVEN scene → LIPSYNC → using infinitetalk`);
        }

        videoTypes.push(model);

        if (model === "infinitetalk") {
          // Infinitetalk requires audio for lipsync (duration comes from audio)
          console.log(`  → Audio URL: ${audioSegments[i].substring(0, 50)}...`);
          videoPromises.push(
            generateVideoSegment(
              audioSegments[i],
              imageUrls[i],
              prompts[i],
              "infinitetalk",
              segDuration,
              videoQuality,
            ),
          );
        } else {
          // Seedance uses explicit duration parameter (always >= 10s at this point)
          console.log(`  → Using seedance with duration: ${segDuration}s`);
          videoPromises.push(
            generateVideoSegment("", imageUrls[i], prompts[i], "seedance", segDuration, videoQuality),
          );
        }
      }
    }
  } else {
    // Only use seedance model when makeCharacterSing is disabled
    // Note: For the last segment with duration < 10s, seedance will still generate 10s
    // but since there's no lipsync, sync issues are not a concern - the audio simply ends first
    for (let i = 0; i < audioSegments.length; i++) {
      const segDuration = getSegmentDuration(i);
      // Seedance requires minimum 10 seconds, use full 10s for short last segment
      const effectiveDuration = Math.max(10, segDuration);
      
      console.log(
        `Generating video segment ${i + 1} using seedance model (no lipsync, ${effectiveDuration}s)`,
      );
      videoTypes.push("seedance");
      videoPromises.push(
        generateVideoSegment("", imageUrls[i], prompts[i], "seedance", effectiveDuration, videoQuality),
      );
    }
  }

  const videoUrls = await Promise.all(videoPromises);
  console.log(`All ${videoUrls.length} video segments generated successfully`);

  // Create segment pairs for Picture-in-Picture compositions
  // Group videos into pairs based on their types: infinitetalk (main) + seedance (overlay)
  const segmentPairs: Array<{ a: string; b: string }> = [];

  if (config.makeCharacterSing) {
    // Separate videos by type
    const infinitetalkVideos: string[] = [];
    const seedanceVideos: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      if (videoTypes[i] === "infinitetalk") {
        infinitetalkVideos.push(videoUrls[i]);
      } else {
        seedanceVideos.push(videoUrls[i]);
      }
    }

    console.log(
      `Separating videos for PiP: ${infinitetalkVideos.length} infinitetalk, ${seedanceVideos.length} seedance`,
    );

    // Create pairs: infinitetalk as main video (a), seedance as overlay (b)
    const pairCount = Math.min(infinitetalkVideos.length, seedanceVideos.length);
    for (let i = 0; i < pairCount; i++) {
      segmentPairs.push({
        a: infinitetalkVideos[i], // Main video (infinitetalk with lipsync)
        b: seedanceVideos[i], // Overlay video (seedance)
      });
    }

    console.log(
      `Created ${segmentPairs.length} segment pairs for PiP composition`,
    );
  } else {
    // When makeCharacterSing is disabled, we only have seedance videos
    // For PiP composition, we need pairs, so we'll pair adjacent videos
    console.log(
      `Make character sing disabled - pairing adjacent seedance videos for PiP`,
    );
    for (let i = 0; i < videoUrls.length - 1; i += 2) {
      if (i + 1 < videoUrls.length) {
        segmentPairs.push({
          a: videoUrls[i], // First video as main
          b: videoUrls[i + 1], // Second video as overlay
        });
      }
    }
    console.log(
      `Created ${segmentPairs.length} segment pairs from seedance videos`,
    );
  }

  return { videoUrls, segmentPairs };
}

// Legacy function for backward compatibility
export async function generateAllVideoSegments(
  audioSegments: string[],
  imageUrls: string[],
  prompts: string[],
): Promise<{
  videoUrls: string[];
  segmentPairs: Array<{ a: string; b: string }>;
}> {
  console.log(
    `Starting video generation for ${audioSegments.length} audio segments and ${imageUrls.length} scenes`,
  );

  if (
    audioSegments.length !== 4 ||
    imageUrls.length !== 8 ||
    prompts.length !== 8
  ) {
    throw new Error(
      `Expected 4 audio segments and 8 scenes, got ${audioSegments.length} audio, ${imageUrls.length} images, ${prompts.length} prompts`,
    );
  }

  // Generate videos in parallel
  const videoPromises: Promise<string>[] = [];

  // Generate 4 videos with audio using infinitetalk (part_1a, part_2a, etc.)
  for (let i = 0; i < 4; i++) {
    const segmentLabel = `${i + 1}a`;
    console.log(
      `Generating video segment ${segmentLabel} using infinitetalk model with audio`,
    );
    console.log(`Audio URL: ${audioSegments[i]}`);
    console.log(`Image URL: ${imageUrls[i * 2]}`); // Use every other image for 'a' videos
    console.log(`Prompt: ${prompts[i * 2]}`);

    videoPromises.push(
      generateVideoSegment(
        audioSegments[i],
        imageUrls[i * 2],
        prompts[i * 2],
        "infinitetalk",
      ),
    );
  }

  // Generate 4 short videos without audio using seedance (part_1b, part_2b, etc.)
  for (let i = 0; i < 4; i++) {
    const segmentLabel = `${i + 1}b`;
    console.log(
      `Generating video segment ${segmentLabel} using seedance model (no audio, 10 seconds)`,
    );
    console.log(`Image URL: ${imageUrls[i * 2 + 1]}`); // Use alternate images for 'b' videos
    console.log(`Prompt: ${prompts[i * 2 + 1]}`);

    // Seedance doesn't use audio, pass empty string
    videoPromises.push(
      generateVideoSegment(
        "",
        imageUrls[i * 2 + 1],
        prompts[i * 2 + 1],
        "seedance",
      ),
    );
  }

  const videoUrls = await Promise.all(videoPromises);
  console.log(`All ${videoUrls.length} video segments generated successfully`);

  // Group videos into pairs for picture-in-picture
  // First 4 are 'a' videos, last 4 are 'b' videos
  const segmentPairs: Array<{ a: string; b: string }> = [];
  for (let i = 0; i < 4; i++) {
    segmentPairs.push({
      a: videoUrls[i], // infinitetalk video with audio (1a, 2a, 3a, 4a)
      b: videoUrls[i + 4], // seedance video without audio (1b, 2b, 3b, 4b)
    });
  }

  return { videoUrls, segmentPairs };
}
