const FFMPEG_API_KEY = process.env.FFMPEG_API_KEY || "ffmpeg_KfTAf98EY9OCuriwBtLT34ZtWZLJtnXX";

// Helper function to get watermark URL from public storage
export async function getWatermarkUrl(): Promise<string | null> {
  try {
    // Use a base64 data URL for the watermark - this is always accessible
    // Create a simple PNG watermark as base64
    const watermarkBase64 = "data:image/svg+xml;base64," + Buffer.from(`
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
      </svg>
    `).toString('base64');
    
    console.log("Using base64 watermark - guaranteed to work with FFMPEG API");
    return watermarkBase64;
  } catch (error) {
    console.error("Failed to generate watermark URL:", error);
    return null;
  }
}

export async function splitAudio(audioUrl: string, parts: number = 4): Promise<{ part: string; download_url: string }[]> {
  try {
    console.log(`Splitting audio into ${parts} segments`);
    const response = await fetch("https://ffmpegapi.net/api/split_audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FFMPEG_API_KEY,
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        parts: parts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FFMPEG API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`Audio splitting failed: ${result.message || "Unknown error"}`);
    }

    return result.audio_parts || [];
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
      async: true,
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
