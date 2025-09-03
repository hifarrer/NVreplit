const FFMPEG_API_KEY = process.env.FFMPEG_API_KEY || "ffmpeg_KfTAf98EY9OCuriwBtLT34ZtWZLJtnXX";

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

export async function mergeVideos(videoUrls: string[], audioUrl?: string): Promise<{ download_url: string; filename: string }> {
  try {
    const requestBody: any = {
      video_urls: videoUrls,
      async: true,
    };
    
    // Add the full song audio URL if provided
    if (audioUrl) {
      requestBody.audio_url = audioUrl;
    }
    
    console.log("=== FFMPEG MERGE VIDEOS REQUEST ===");
    console.log("Endpoint: https://ffmpegapi.net/api/merge_videos");
    console.log("Number of videos to merge:", videoUrls.length);
    console.log("Audio URL (full song):", audioUrl || "Not provided");
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
    
    if (!result.success) {
      throw new Error(`Video merging failed: ${result.message || "Unknown error"}`);
    }

    return {
      download_url: result.download_url,
      filename: result.filename,
    };
  } catch (error) {
    console.error("Video merging error:", error);
    throw new Error("Failed to merge videos: " + (error as Error).message);
  }
}
