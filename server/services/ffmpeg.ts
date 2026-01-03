const FFMPEG_API_KEY = process.env.FFMPEG_API_KEY || "ffmpeg_KfTAf98EY9OCuriwBtLT34ZtWZLJtnXX";

// Helper function to get watermark URL from public storage
export async function getWatermarkUrl(): Promise<string | null> {
  return "https://notifications.nusong.ai/neonlogo.png";
}

export async function getAudioDurationFromFile(filePath: string): Promise<number> {
  try {
    const { parseFile } = await import('music-metadata');
    console.log(`Getting audio duration from file: ${filePath}`);
    
    const metadata = await parseFile(filePath);
    // Use Math.ceil to ensure we don't lose any audio content
    const duration = Math.ceil(metadata.format.duration || 0);
    
    console.log(`Audio duration: ${duration} seconds`);
    return duration;
  } catch (error) {
    console.error("Get audio duration error:", error);
    throw new Error("Failed to get audio duration: " + (error as Error).message);
  }
}

export async function trimAudio(audioUrl: string, desiredLength: number): Promise<{ download_url: string; filename: string; trimmed_length: number }> {
  try {
    console.log(`Trimming audio to ${desiredLength} seconds`);
    console.log(`Audio URL: ${audioUrl}`);
    
    const response = await fetch("https://ffmpegapi.net/api/trim_audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        desired_length: desiredLength,
        fade_duration: 5  // Always use 5 seconds fade as specified
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`Audio trimming failed: ${result.message || "Unknown error"}`);
    }

    console.log(`Audio trimmed successfully: ${result.filename}`);
    return {
      download_url: result.download_url,
      filename: result.filename,
      trimmed_length: result.trimmed_length
    };
  } catch (error) {
    console.error("Audio trimming error:", error);
    throw new Error("Failed to trim audio: " + (error as Error).message);
  }
}

export interface AudioSegment {
  part: string;
  download_url: string;
  duration: number; // Duration of this specific segment in seconds
}

export async function splitAudio(audioUrl: string, parts: number = 4, totalDurationSeconds?: number): Promise<AudioSegment[]> {
  try {
    // Split audio into fixed 10-second segments for consistent video generation
    // This ensures both lipsync (infinitetalk-fast) and non-lipsync (bytedance/seedance) models
    // work with 10-second segments as required by the non-lipsync model's limit
    const segmentDuration = 10; // 10 seconds per segment
    
    console.log(`Splitting audio into ${segmentDuration}-second segments using /api/split_audio_segments (total duration: ${totalDurationSeconds || 'unknown'}s)`);
    
    // Use the new /api/split_audio_segments endpoint which properly splits by segment duration
    // This ensures each segment is exactly 10 seconds (except the last one which is the remainder)
    const response = await fetch("https://ffmpegapi.net/api/split_audio_segments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        segment_duration: segmentDuration,
        async: false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    console.log("=== FFMPEG SPLIT AUDIO SEGMENTS RESPONSE ===");
    console.log("Full response:", JSON.stringify(result, null, 2));
    
    if (!result.success) {
      throw new Error(`Audio splitting failed: ${result.message || "Unknown error"}`);
    }

    // Parse audio segments from API response
    // The new /api/split_audio_segments endpoint returns:
    // { segments: [{ segment: "segment_01.mp3", download_url: "..." }, ...], total_segments: 7 }
    const segments = result.segments || [];
    const segmentsWithDurations: AudioSegment[] = [];
    
    console.log(`API returned ${segments.length} audio segments (total_segments: ${result.total_segments})`);
    
    for (let i = 0; i < segments.length; i++) {
      let segDuration: number;
      
      // Calculate duration: all segments except last are 10 seconds
      if (totalDurationSeconds) {
        if (i < segments.length - 1) {
          segDuration = segmentDuration;
        } else {
          // Last segment gets the remainder
          const usedDuration = (segments.length - 1) * segmentDuration;
          segDuration = totalDurationSeconds - usedDuration;
          // Minimum 1 second for edge cases
          segDuration = Math.max(1, segDuration);
        }
      } else {
        // Fallback: assume 10 seconds per segment
        segDuration = segmentDuration;
      }
      
      segmentsWithDurations.push({
        part: segments[i].segment,
        download_url: segments[i].download_url,
        duration: segDuration
      });
      
      console.log(`Segment ${i + 1}: ${segDuration} seconds (API url: ${segments[i].download_url})`);
    }

    console.log(`Successfully split audio into ${segmentsWithDurations.length} parts with calculated durations`);
    return segmentsWithDurations;
  } catch (error) {
    console.error("Audio splitting error:", error);
    throw new Error("Failed to split audio: " + (error as Error).message);
  }
}

export async function pictureInPicture(mainVideoUrl: string, pipVideoUrl: string): Promise<{ download_url: string; filename: string }> {
  try {
    const requestBody = {
      main_video_url: mainVideoUrl,
      pip_video_url: pipVideoUrl,
      position: "middle",
      scale: "iw:ih",
      audio_option: "video1"
    };
    
    console.log("=== FFMPEG PICTURE-IN-PICTURE REQUEST ===");
    console.log("Endpoint: https://ffmpegapi.net/api/picture_in_picture");
    console.log("Request body:", JSON.stringify(requestBody, null, 2));
    
    const response = await fetch("https://ffmpegapi.net/api/picture_in_picture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG PiP API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`Picture-in-picture failed: ${result.message || "Unknown error"}`);
    }

    return {
      download_url: result.download_url,
      filename: result.filename,
    };
  } catch (error) {
    console.error("Picture-in-picture error:", error);
    throw new Error("Failed to create picture-in-picture: " + (error as Error).message);
  }
}

export async function mergeVideos(videoUrls: string[], audioUrl?: string, subtitleUrl?: string, watermarkUrl?: string): Promise<{ download_url: string; filename: string }> {
  try {
    const requestBody: any = {
      video_urls: videoUrls,
      async: false,
    };
    
    // Add the full song audio URL if provided
    if (audioUrl) {
      requestBody.audio_url = audioUrl;
    }
    
    // Add subtitle URL if provided
    if (subtitleUrl) {
      requestBody.subtitle_url = subtitleUrl;
    }
    
    // Add watermark URL if provided
    if (watermarkUrl) {
      requestBody.watermark_url = watermarkUrl;
    }
    
    console.log("=== FFMPEG MERGE VIDEOS REQUEST ===");
    console.log("Endpoint: https://ffmpegapi.net/api/merge_videos");
    console.log("Number of videos to merge:", videoUrls.length);
    console.log("Audio URL (full song):", audioUrl || "Not provided");
    console.log("Subtitle URL (.ass file):", subtitleUrl || "Not provided");
    console.log("Watermark URL:", watermarkUrl || "Not provided");
    console.log("Request body:", JSON.stringify(requestBody, null, 2));
    
    const response = await fetch("https://ffmpegapi.net/api/merge_videos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG merge API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    console.log("=== FFMPEG MERGE RESPONSE ===");
    console.log("Raw response:", JSON.stringify(result, null, 2));
    console.log("Response success field:", result.success);
    
    if (!result.success) {
      throw new Error(`Video merging failed: ${result.message || "Unknown error"}`);
    }

    // Check if this is async processing (job_id present)
    if (result.job_id && result.status_url) {
      console.log("=== ASYNC PROCESSING DETECTED ===");
      console.log("Job ID:", result.job_id);
      console.log("Status URL:", result.status_url);
      
      // Poll the status URL until completion
      const maxAttempts = 60; // 5 minutes max (5 second intervals)
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        attempts++;
        
        console.log(`Polling attempt ${attempts}/${maxAttempts}...`);
        
        try {
          const statusResponse = await fetch(result.status_url, {
            headers: {
              "X-API-Key": FFMPEG_API_KEY,
            },
          });
          
          if (!statusResponse.ok) {
            console.warn(`Status check failed (${statusResponse.status}), retrying...`);
            continue;
          }
          
          const statusResult = await statusResponse.json();
          console.log(`Job status: ${statusResult.status}`);
          
          if (statusResult.status === "completed" && statusResult.download_url) {
            console.log("✅ Async job completed successfully!");
            console.log("Final download URL:", statusResult.download_url);
            return {
              download_url: statusResult.download_url,
              filename: statusResult.filename || "merged_video.mp4",
            };
          } else if (statusResult.status === "failed") {
            throw new Error(`Async video merging failed: ${statusResult.message || "Unknown error"}`);
          }
          // Continue polling if status is still "pending" or "processing"
          
        } catch (pollError) {
          console.warn(`Status polling error (attempt ${attempts}):`, pollError);
          // Continue to next attempt
        }
      }
      
      throw new Error(`Video merging timed out after ${maxAttempts} attempts (${maxAttempts * 5} seconds)`);
      
    } else {
      // Synchronous response (direct download_url)
      console.log("=== SYNCHRONOUS RESPONSE ===");
      console.log("Download URL:", result.download_url);
      return {
        download_url: result.download_url,
        filename: result.filename,
      };
    }
  } catch (error) {
    console.error("Video merging error:", error);
    throw new Error("Failed to merge videos: " + (error as Error).message);
  }
}
