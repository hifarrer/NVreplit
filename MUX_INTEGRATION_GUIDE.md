# MUX Video Processing Integration Guide

This document explains how MUX is integrated for video processing and HLS streaming in the NeonVideo application. Use this as a reference for implementing similar functionality in other projects.

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup & Configuration](#setup--configuration)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Complete Flow](#complete-flow)
7. [Best Practices](#best-practices)

---

## Overview

**What is MUX?**
MUX is a video infrastructure platform that:
- Converts uploaded videos into optimized HLS (HTTP Live Streaming) format
- Provides adaptive bitrate streaming for optimal performance across devices
- Handles video encoding, storage, and delivery via CDN
- Offers analytics and thumbnails

**Why use MUX?**
- Better user experience with adaptive streaming
- Reduces server load (videos stream from MUX's CDN)
- Automatic quality optimization
- Reliable video playback across all devices and network conditions

---

## Architecture

```
┌─────────────────┐
│ Video Generation│
│   (Your App)    │
└────────┬────────┘
         │ 1. Upload to Object Storage
         ▼
┌─────────────────┐
│ Object Storage  │ (e.g., Replit/GCS/S3)
│   /objects/     │
│  videos/xyz.mp4 │
└────────┬────────┘
         │ 2. Create MUX Job
         ▼
┌─────────────────┐
│  MUX Job Queue  │ (Background processor)
│  - pending      │
│  - processing   │
│  - completed    │
└────────┬────────┘
         │ 3. Create MUX Asset
         ▼
┌─────────────────┐
│   MUX API       │
│ Assets Endpoint │
└────────┬────────┘
         │ 4. MUX processes video
         │    (30 sec - 5 min)
         ▼
┌─────────────────┐
│ MUX CDN         │
│ Playback ID:    │
│ abc123.m3u8     │
└────────┬────────┘
         │ 5. Frontend plays HLS
         ▼
┌─────────────────┐
│ MUX Player      │
│ (React)         │
└─────────────────┘
```

---

## Setup & Configuration

### 1. Install Required Packages

```bash
npm install @mux/mux-node @mux/mux-player-react
```

### 2. Get MUX Credentials

1. Sign up at [mux.com](https://mux.com)
2. Create an API Access Token
3. You'll receive:
   - `MUX_TOKEN_ID` (e.g., `abc123-def456`)
   - `MUX_TOKEN_SECRET` (e.g., `xyz789...`)

### 3. Environment Variables

```bash
MUX_TOKEN_ID=your_token_id_here
MUX_TOKEN_SECRET=your_token_secret_here
```

### 4. Database Schema

Add these fields to your project/video table:

```typescript
// Database fields for MUX
muxAssetId: varchar("mux_asset_id"),        // MUX asset ID
muxPlaybackId: varchar("mux_playback_id"),  // Playback ID for streaming
muxAssetStatus: varchar("mux_asset_status"), // Status: preparing/ready/errored
```

---

## Backend Implementation

### Step 1: MUX Service (`server/services/mux.ts`)

This service handles all MUX API interactions.

```typescript
import Mux from '@mux/mux-node';

// Initialize MUX client
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

/**
 * Create a new MUX asset from a video URL
 * 
 * @param videoUrl - Full URL to your video (must be publicly accessible)
 * @returns Object with assetId, playbackId, and status
 */
export async function createMuxAsset(videoUrl: string) {
  // Ensure the URL is absolute and publicly accessible
  const fullVideoUrl = normalizeVideoUrl(videoUrl);
  
  // Create MUX asset
  const asset = await mux.video.assets.create({
    inputs: [{ url: fullVideoUrl }],
    playback_policy: ['public'],       // Makes video publicly streamable
    encoding_tier: 'baseline',         // Quality tier
    mp4_support: 'none',               // We only need HLS streaming
    normalize_audio: true,             // Improve audio quality
  });

  const playbackId = asset.playback_ids?.[0]?.id;
  
  return {
    assetId: asset.id,                 // Use to track asset status
    playbackId,                        // Use for video playback
    status: asset.status,              // preparing/ready/errored
  };
}

/**
 * Check the processing status of a MUX asset
 */
export async function getMuxAssetStatus(assetId: string) {
  const asset = await mux.video.assets.retrieve(assetId);
  
  const playbackId = asset.playback_ids?.[0]?.id;
  const hlsUrl = playbackId 
    ? `https://stream.mux.com/${playbackId}.m3u8` 
    : undefined;

  return {
    assetId: asset.id,
    status: asset.status,              // Check if 'ready'
    playbackId,
    hlsUrl,                            // HLS streaming URL
    duration: asset.duration,
    errors: asset.errors?.messages || [],
  };
}

/**
 * Get HLS streaming URL from playback ID
 */
export function getHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/**
 * Delete a MUX asset (cleanup)
 */
export async function deleteMuxAsset(assetId: string): Promise<void> {
  await mux.video.assets.delete(assetId);
}

/**
 * Check if MUX is configured
 */
export function isMuxConfigured(): boolean {
  return !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);
}
```

**Key Points:**
- **Video URL must be publicly accessible** - MUX needs to download it
- **Use absolute URLs** - Convert relative paths to full URLs
- **Playback ID** - This is what you use for video playback
- **Asset ID** - Use this to check processing status

---

### Step 2: Background Job Manager (`server/services/muxJobs.ts`)

MUX processing takes time (30 seconds to 5 minutes). Use a job queue to handle this asynchronously.

```typescript
import { createMuxAsset, getMuxAssetStatus, isMuxConfigured } from './mux.js';

interface MuxJob {
  projectId: string;
  videoUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  assetId?: string;
  playbackId?: string;
  attempts: number;
  createdAt: Date;
}

class MuxJobManager {
  private jobs = new Map<string, MuxJob>();
  private isProcessing = false;
  private processInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Check job status every 30 seconds
    this.startProcessing();
  }

  /**
   * Add a new MUX job for a completed video
   */
  async addJob(projectId: string, videoUrl: string): Promise<void> {
    if (!isMuxConfigured()) {
      console.log('MUX not configured, skipping');
      return;
    }

    const job: MuxJob = {
      projectId,
      videoUrl,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    };

    this.jobs.set(projectId, job);
    
    // Process immediately
    if (!this.isProcessing) {
      this.processJobs();
    }
  }

  private startProcessing(): void {
    // Poll every 30 seconds
    this.processInterval = setInterval(() => {
      this.processJobs();
    }, 30000);
  }

  private async processJobs(): Promise<void> {
    if (this.isProcessing || !isMuxConfigured()) return;
    
    this.isProcessing = true;

    try {
      const pendingJobs = Array.from(this.jobs.values()).filter(
        job => job.status === 'pending' || job.status === 'processing'
      );

      for (const job of pendingJobs) {
        await this.processJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: MuxJob): Promise<void> {
    const maxAttempts = 5;
    
    try {
      if (job.status === 'pending') {
        // Step 1: Create MUX asset
        console.log(`Creating MUX asset for project ${job.projectId}`);
        
        const result = await createMuxAsset(job.videoUrl);
        
        job.assetId = result.assetId;
        job.playbackId = result.playbackId;
        job.status = 'processing';

        // Update database with MUX IDs
        await storage.updateProject(job.projectId, {
          muxAssetId: result.assetId,
          muxPlaybackId: result.playbackId,
          muxAssetStatus: result.status,
        });

        console.log(`MUX asset created: ${result.assetId}`);
        
      } else if (job.status === 'processing' && job.assetId) {
        // Step 2: Check asset status
        const status = await getMuxAssetStatus(job.assetId);
        
        if (status.status === 'ready') {
          // Success! Video is ready to stream
          job.status = 'completed';
          
          await storage.updateProject(job.projectId, {
            muxAssetStatus: 'ready',
          });

          console.log(`MUX asset ready: ${status.hlsUrl}`);
          
          // Clean up completed job after 24 hours
          setTimeout(() => {
            this.jobs.delete(job.projectId);
          }, 24 * 60 * 60 * 1000);
          
        } else if (status.status === 'errored') {
          // Failed
          job.status = 'failed';
          
          await storage.updateProject(job.projectId, {
            muxAssetStatus: 'errored',
          });

          console.error(`MUX asset failed:`, status.errors);
        }
      }

      job.attempts++;
      this.jobs.set(job.projectId, job);

    } catch (error) {
      console.error(`Error processing MUX job:`, error);
      
      job.attempts++;
      
      if (job.attempts >= maxAttempts) {
        job.status = 'failed';
      }
      
      this.jobs.set(job.projectId, job);
    }
  }
}

// Singleton instance
export const muxJobManager = new MuxJobManager();

// Helper function to queue a video for MUX processing
export async function createMuxAssetForVideo(
  projectId: string, 
  videoUrl: string
): Promise<void> {
  await muxJobManager.addJob(projectId, videoUrl);
}
```

**How it works:**
1. When a video is ready, call `createMuxAssetForVideo(projectId, videoUrl)`
2. Job manager creates MUX asset and marks job as 'processing'
3. Every 30 seconds, check if asset is ready
4. When ready, update database with 'ready' status
5. Frontend can now stream the video

---

### Step 3: Integration Point

When your video generation completes, add the MUX job:

```typescript
// In your video completion handler
async function handleVideoComplete(projectId: string, videoUrl: string) {
  // 1. Save video URL to database
  await storage.updateProject(projectId, {
    finalVideoUrl: videoUrl,
    isCompleted: true,
  });
  
  // 2. Queue for MUX processing (non-blocking)
  await createMuxAssetForVideo(projectId, videoUrl);
  
  // Video is immediately playable via direct URL
  // MUX HLS will be available after processing completes
}
```

---

## Frontend Implementation

### MUX Video Player Component

```typescript
import MuxPlayer from '@mux/mux-player-react';

interface MuxVideoPlayerProps {
  playbackId?: string | null;  // MUX playback ID
  fallbackUrl?: string;         // Direct video URL fallback
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export const MuxVideoPlayer = ({ 
  playbackId, 
  fallbackUrl,
  className,
  controls = true,
  autoPlay = false,
  loop = false,
  muted = false,
}: MuxVideoPlayerProps) => {
  
  // If MUX playback ID is available, use MUX player
  if (playbackId) {
    return (
      <MuxPlayer
        playbackId={playbackId}
        streamType="on-demand"
        controls={controls}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        className={className}
      />
    );
  }

  // Fallback to regular video element
  if (fallbackUrl) {
    return (
      <video
        src={fallbackUrl}
        controls={controls}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        className={className}
      />
    );
  }

  return <div>No video available</div>;
};
```

### Usage in Your App

```typescript
function VideoPage({ project }) {
  return (
    <MuxVideoPlayer
      playbackId={project.muxPlaybackId}
      fallbackUrl={project.finalVideoUrl}
      controls={true}
    />
  );
}
```

**Smart Fallback Strategy:**
1. First tries MUX HLS (if playbackId exists)
2. Falls back to direct video URL (while MUX is processing)
3. Seamless user experience - video always plays

---

## Complete Flow

### End-to-End Example

```typescript
// 1. VIDEO GENERATION COMPLETES
async function onVideoGenerationComplete(projectId: string) {
  // Generate final video and upload to object storage
  const finalVideoBuffer = await mergeVideoSegments(segments);
  const videoUrl = await uploadToObjectStorage(finalVideoBuffer);
  
  // Save to database
  await storage.updateProject(projectId, {
    finalVideoUrl: videoUrl,
    isCompleted: true,
  });
  
  // 2. QUEUE FOR MUX PROCESSING (non-blocking)
  await createMuxAssetForVideo(projectId, videoUrl);
  
  console.log('Video complete! MUX processing started in background.');
}

// 3. MUX JOB PROCESSOR (runs every 30 seconds)
// - Creates MUX asset
// - Polls status until ready
// - Updates database when complete

// 4. FRONTEND DISPLAYS VIDEO
function VideoPlayer({ projectId }) {
  const { data: project } = useQuery({
    queryKey: ['/api/projects', projectId],
  });
  
  return (
    <MuxVideoPlayer
      playbackId={project.muxPlaybackId}     // HLS if ready
      fallbackUrl={project.finalVideoUrl}    // Direct video fallback
      controls={true}
    />
  );
}
```

### Timeline

```
T+0s    Video generation completes → Upload to storage
T+1s    MUX job created (status: pending)
T+2s    MUX asset creation initiated (status: processing)
T+30s   First status check (still processing...)
T+60s   Second status check (still processing...)
T+90s   Third status check (ready!)
T+91s   Database updated with playbackId
T+92s   Frontend switches to HLS streaming
```

---

## Best Practices

### 1. URL Requirements

MUX requires publicly accessible URLs:

```typescript
// ❌ BAD - Relative path
createMuxAsset('/objects/videos/video.mp4')

// ❌ BAD - Localhost
createMuxAsset('http://localhost:5000/objects/videos/video.mp4')

// ✅ GOOD - Full production URL
createMuxAsset('https://your-domain.com/objects/videos/video.mp4')

// Helper function
function normalizeVideoUrl(videoUrl: string): string {
  if (videoUrl.startsWith('http')) {
    return videoUrl; // Already absolute
  }
  
  const baseUrl = process.env.PRODUCTION_URL || 'https://your-domain.com';
  const cleanPath = videoUrl.startsWith('/') ? videoUrl.slice(1) : videoUrl;
  
  return `${baseUrl}/${cleanPath}`;
}
```

### 2. Error Handling

```typescript
// Always check if MUX is configured
if (!isMuxConfigured()) {
  console.log('MUX not configured, video will use direct playback');
  return;
}

// Handle failures gracefully
try {
  await createMuxAsset(videoUrl);
} catch (error) {
  console.error('MUX asset creation failed:', error);
  // Video still works via fallback URL
}
```

### 3. Database Status Tracking

```typescript
// Track MUX status in database
muxAssetStatus: 'preparing' | 'ready' | 'errored' | null

// Frontend can show status
{project.muxAssetStatus === 'preparing' && (
  <div>Optimizing video for streaming...</div>
)}

{project.muxAssetStatus === 'ready' && (
  <div>✓ Optimized for all devices</div>
)}
```

### 4. Cleanup

```typescript
// Delete MUX assets when deleting videos
async function deleteProject(projectId: string) {
  const project = await storage.getProject(projectId);
  
  // Delete MUX asset
  if (project.muxAssetId) {
    await deleteMuxAsset(project.muxAssetId);
  }
  
  // Delete from database
  await storage.deleteProject(projectId);
}
```

### 5. Testing

```typescript
// Test MUX integration
async function testMuxIntegration() {
  // 1. Upload a test video
  const testVideoUrl = 'https://your-domain.com/test-video.mp4';
  
  // 2. Create MUX asset
  const result = await createMuxAsset(testVideoUrl);
  console.log('Asset created:', result.assetId);
  
  // 3. Poll status
  let status;
  do {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
    status = await getMuxAssetStatus(result.assetId);
    console.log('Status:', status.status);
  } while (status.status === 'preparing');
  
  // 4. Test playback
  if (status.status === 'ready') {
    console.log('✓ HLS URL:', status.hlsUrl);
    console.log('✓ Playback ID:', status.playbackId);
  }
}
```

---

## Troubleshooting

### Issue: "Asset creation failed"

**Causes:**
- Video URL not publicly accessible
- Invalid MUX credentials
- Video format not supported

**Solution:**
```typescript
// Test URL accessibility
const response = await fetch(videoUrl);
console.log('URL accessible:', response.ok);

// Check credentials
console.log('MUX configured:', isMuxConfigured());
```

### Issue: "Asset stuck in 'preparing'"

**Causes:**
- Large video file (can take 5-10 minutes)
- MUX service issues

**Solution:**
- Wait longer (check every 30-60 seconds)
- Check MUX dashboard for errors
- Videos still playable via fallback URL

### Issue: "Playback fails"

**Causes:**
- Browser doesn't support HLS
- Network issues

**Solution:**
- Always provide fallback URL
- Use MuxPlayer component (handles compatibility)

---

## Cost Considerations

MUX pricing (as of 2024):
- **Encoding:** ~$0.005 per minute of video
- **Streaming:** ~$0.001 per GB delivered
- **Storage:** ~$0.01 per GB per month

Example:
- 1000 videos × 2 min each = 2000 min = $10 encoding
- 10000 views × 50MB each = 500GB = $0.50 streaming
- Total: ~$10.50/month for this usage

---

## Summary

### Key Takeaways

1. **Async Processing** - Use job queue for background processing
2. **Fallback Strategy** - Always provide direct video URL as fallback
3. **Status Tracking** - Poll MUX API to check processing status
4. **Public URLs** - Ensure videos are publicly accessible
5. **Graceful Degradation** - Videos work even if MUX fails

### Minimal Implementation Checklist

- [ ] Install `@mux/mux-node` and `@mux/mux-player-react`
- [ ] Add MUX credentials to environment variables
- [ ] Add database fields: `muxAssetId`, `muxPlaybackId`, `muxAssetStatus`
- [ ] Create `mux.ts` service file
- [ ] Create `muxJobs.ts` job manager
- [ ] Update video completion handler to queue MUX jobs
- [ ] Create `MuxVideoPlayer` component with fallback
- [ ] Test with a sample video

### When to Use MUX

**Use MUX when:**
- Videos are > 1 minute long
- You need adaptive bitrate streaming
- Users have varying network speeds
- You want to reduce server bandwidth

**Skip MUX when:**
- Videos are < 30 seconds
- Low traffic application
- Budget constrained
- Direct video playback is sufficient

---

## Additional Resources

- [MUX Documentation](https://docs.mux.com/)
- [MUX Node SDK](https://github.com/muxinc/mux-node-sdk)
- [MUX React Player](https://github.com/muxinc/elements/tree/main/packages/mux-player-react)
- [HLS.js Documentation](https://github.com/video-dev/hls.js/)

---

**Created:** November 2025  
**Project:** NeonVideo AI  
**Purpose:** Reusable MUX integration guide for other projects
