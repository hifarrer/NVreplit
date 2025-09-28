import Mux from '@mux/mux-node';
import { storage } from '../storage.js';
import type { Project } from '../../shared/schema.js';

// Initialize Mux client
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export interface CreateMuxAssetResponse {
  assetId: string;
  playbackId: string;
  status: 'preparing' | 'ready' | 'errored';
}

export interface MuxAssetStatus {
  assetId: string;
  status: 'preparing' | 'ready' | 'errored';
  playbackId?: string;
  hlsUrl?: string;
  duration?: number;
  errors?: string[];
}

/**
 * Convert relative video URL to full URL for Mux
 */
function normalizeVideoUrl(videoUrl: string): string {
  // If it's already a full URL, return as-is
  if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
    return videoUrl;
  }
  
  // For relative URLs, construct full URL using the current domain
  let baseUrl: string;
  
  if (process.env.REPLIT_DOMAIN) {
    baseUrl = `https://${process.env.REPLIT_DOMAIN}`;
  } else if (process.env.NODE_ENV === 'production') {
    // Production domain for neonvideo.ai
    baseUrl = 'http://neonvideo.ai';
  } else {
    // Development fallback
    baseUrl = 'http://localhost:5000';
  }
    
  // Remove leading slash if present to avoid double slashes
  const cleanPath = videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl;
  
  return `${baseUrl}/${cleanPath}`;
}

/**
 * Create a new Mux asset from a video URL
 */
export async function createMuxAsset(videoUrl: string): Promise<CreateMuxAssetResponse> {
  try {
    // Normalize the video URL to ensure it's a full URL
    const fullVideoUrl = normalizeVideoUrl(videoUrl);
    console.log(`Creating Mux asset with URL: ${fullVideoUrl}`);
    
    const asset = await mux.video.assets.create({
      inputs: [{ url: fullVideoUrl }],
      playback_policy: ['public'],
      encoding_tier: 'baseline', // Good balance of quality and encoding speed
      mp4_support: 'none', // We only need HLS streaming
      normalize_audio: true, // Improve audio quality
    });

    // Get the playback ID (should be created automatically with public policy)
    const playbackId = asset.playback_ids?.[0]?.id;
    
    if (!playbackId) {
      throw new Error('Failed to create playback ID for Mux asset');
    }

    return {
      assetId: asset.id,
      playbackId,
      status: asset.status as 'preparing' | 'ready' | 'errored',
    };
  } catch (error) {
    console.error('Error creating Mux asset:', error);
    throw new Error(`Failed to create Mux asset: ${error}`);
  }
}

/**
 * Get the status of a Mux asset
 */
export async function getMuxAssetStatus(assetId: string): Promise<MuxAssetStatus> {
  try {
    const asset = await mux.video.assets.retrieve(assetId);
    
    const playbackId = asset.playback_ids?.[0]?.id;
    const hlsUrl = playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : undefined;

    return {
      assetId: asset.id,
      status: asset.status as 'preparing' | 'ready' | 'errored',
      playbackId,
      hlsUrl,
      duration: asset.duration,
      errors: asset.errors?.messages || [],
    };
  } catch (error) {
    console.error('Error getting Mux asset status:', error);
    throw new Error(`Failed to get Mux asset status: ${error}`);
  }
}

/**
 * Get HLS streaming URL for a playback ID
 */
export function getHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/**
 * Get thumbnail URL for a playback ID
 */
export function getThumbnailUrl(playbackId: string, options: {
  time?: number;
  width?: number;
  height?: number;
  fit_mode?: 'preserve' | 'crop' | 'pad';
} = {}): string {
  const params = new URLSearchParams();
  
  if (options.time !== undefined) params.set('time', options.time.toString());
  if (options.width) params.set('width', options.width.toString());
  if (options.height) params.set('height', options.height.toString());
  if (options.fit_mode) params.set('fit_mode', options.fit_mode);
  
  const queryString = params.toString();
  return `https://image.mux.com/${playbackId}/thumbnail.jpg${queryString ? `?${queryString}` : ''}`;
}

/**
 * Delete a Mux asset (cleanup)
 */
export async function deleteMuxAsset(assetId: string): Promise<void> {
  try {
    await mux.video.assets.delete(assetId);
  } catch (error) {
    console.error('Error deleting Mux asset:', error);
    // Don't throw here - deletion failures shouldn't break the main flow
  }
}

/**
 * Check if Mux is properly configured
 */
export function isMuxConfigured(): boolean {
  return !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);
}

/**
 * Reset Mux migration status for failed videos
 */
export async function resetFailedMuxMigrations(): Promise<{ resetCount: number }> {
  try {
    const projects = await storage.getAllVideosForAdmin();
    
    // Find projects with failed Mux assets
    const failedProjects = projects.filter((p: Project) => 
      p.isCompleted && 
      p.finalVideoUrl && 
      p.muxAssetStatus === 'errored'
    );
    
    // Reset their Mux fields
    let resetCount = 0;
    for (const project of failedProjects) {
      await storage.updateProject(project.id, {
        muxAssetId: null,
        muxPlaybackId: null, 
        muxAssetStatus: null,
      });
      resetCount++;
    }
    
    console.log(`Reset ${resetCount} failed Mux migrations`);
    return { resetCount };
  } catch (error) {
    console.error('Error resetting failed Mux migrations:', error);
    throw new Error(`Failed to reset migrations: ${error}`);
  }
}

/**
 * Migrate a single video to Mux for testing
 */
export async function migrateSingleVideoToMux(): Promise<{ projectId: string; videoUrl: string; success: boolean; error?: string }> {
  try {
    const projects = await storage.getAllVideosForAdmin();
    
    // Find a completed video without Mux asset
    const candidateProject = projects.find((p: Project) => 
      p.isCompleted && 
      p.finalVideoUrl && 
      !p.muxAssetId
    );
    
    if (!candidateProject) {
      throw new Error('No videos available for migration');
    }
    
    console.log(`Testing migration for project ${candidateProject.id}`);
    
    try {
      // Create Mux asset
      const result = await createMuxAsset(candidateProject.finalVideoUrl);
      
      // Update project with Mux info
      await storage.updateProject(candidateProject.id, {
        muxAssetId: result.assetId,
        muxPlaybackId: result.playbackId,
        muxAssetStatus: result.status,
      });
      
      console.log(`Successfully started Mux migration for project ${candidateProject.id}`);
      
      return {
        projectId: candidateProject.id,
        videoUrl: candidateProject.finalVideoUrl,
        success: true,
      };
      
    } catch (muxError) {
      console.error(`Mux migration failed for project ${candidateProject.id}:`, muxError);
      
      return {
        projectId: candidateProject.id,
        videoUrl: candidateProject.finalVideoUrl,
        success: false,
        error: String(muxError),
      };
    }
    
  } catch (error) {
    console.error('Error in single video migration:', error);
    throw new Error(`Failed to migrate single video: ${error}`);
  }
}