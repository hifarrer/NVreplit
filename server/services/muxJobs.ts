import { createMuxAsset, getMuxAssetStatus, isMuxConfigured } from './mux.js';
import { storage } from '../storage.js';

interface MuxJob {
  projectId: string;
  videoUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  assetId?: string;
  playbackId?: string;
  attempts: number;
  createdAt: Date;
  lastChecked?: Date;
}

class MuxJobManager {
  private jobs = new Map<string, MuxJob>();
  private isProcessing = false;
  private processInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start processing jobs every 30 seconds
    this.startProcessing();
  }

  /**
   * Add a new Mux job for a completed video
   */
  async addJob(projectId: string, videoUrl: string): Promise<void> {
    if (!isMuxConfigured()) {
      console.log('Mux not configured, skipping asset creation');
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
    console.log(`Added Mux job for project ${projectId}`);
    
    // Process immediately if not already processing
    if (!this.isProcessing) {
      this.processJobs();
    }
  }

  /**
   * Start background processing of Mux jobs
   */
  private startProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
    }

    // Process jobs every 30 seconds
    this.processInterval = setInterval(() => {
      this.processJobs();
    }, 30000);

    console.log('Mux job processing started');
  }

  /**
   * Process pending and in-progress Mux jobs
   */
  private async processJobs(): Promise<void> {
    if (this.isProcessing || !isMuxConfigured()) {
      return;
    }

    this.isProcessing = true;

    try {
      const pendingJobs = Array.from(this.jobs.values()).filter(
        job => job.status === 'pending' || job.status === 'processing'
      );

      for (const job of pendingJobs) {
        await this.processJob(job);
      }
    } catch (error) {
      console.error('Error processing Mux jobs:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single Mux job
   */
  private async processJob(job: MuxJob): Promise<void> {
    const maxAttempts = 5;
    
    try {
      job.lastChecked = new Date();

      if (job.status === 'pending') {
        // Create Mux asset
        console.log(`Creating Mux asset for project ${job.projectId}`);
        
        const result = await createMuxAsset(job.videoUrl);
        
        job.assetId = result.assetId;
        job.playbackId = result.playbackId;
        job.status = 'processing';

        // Update project in database
        await storage.updateProject(job.projectId, {
          muxAssetId: result.assetId,
          muxPlaybackId: result.playbackId,
          muxAssetStatus: result.status,
        });

        console.log(`Mux asset created for project ${job.projectId}: ${result.assetId}`);
        
      } else if (job.status === 'processing' && job.assetId) {
        // Check asset status
        const status = await getMuxAssetStatus(job.assetId);
        
        if (status.status === 'ready') {
          job.status = 'completed';
          
          // Update project in database
          await storage.updateProject(job.projectId, {
            muxAssetStatus: 'ready',
          });

          console.log(`Mux asset ready for project ${job.projectId}: ${status.hlsUrl}`);
          
          // Remove completed job after 24 hours
          setTimeout(() => {
            this.jobs.delete(job.projectId);
          }, 24 * 60 * 60 * 1000);
          
        } else if (status.status === 'errored') {
          job.status = 'failed';
          
          // Update project in database
          await storage.updateProject(job.projectId, {
            muxAssetStatus: 'errored',
          });

          console.error(`Mux asset failed for project ${job.projectId}:`, status.errors);
          
        } else {
          console.log(`Mux asset still processing for project ${job.projectId}`);
        }
      }

      job.attempts++;
      this.jobs.set(job.projectId, job);

    } catch (error) {
      console.error(`Error processing Mux job for project ${job.projectId}:`, error);
      
      job.attempts++;
      
      if (job.attempts >= maxAttempts) {
        job.status = 'failed';
        console.error(`Mux job failed after ${maxAttempts} attempts for project ${job.projectId}`);
      }
      
      this.jobs.set(job.projectId, job);
    }
  }

  /**
   * Get job status for a project
   */
  getJobStatus(projectId: string): MuxJob | undefined {
    return this.jobs.get(projectId);
  }

  /**
   * Clean up old completed and failed jobs
   */
  cleanup(): void {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    for (const [projectId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.createdAt < cutoff
      ) {
        this.jobs.delete(projectId);
      }
    }
  }

  /**
   * Stop processing (for cleanup)
   */
  stop(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }
}

// Create singleton instance
export const muxJobManager = new MuxJobManager();

/**
 * Helper function to create Mux asset for a completed video
 */
export async function createMuxAssetForVideo(projectId: string, videoUrl: string): Promise<void> {
  await muxJobManager.addJob(projectId, videoUrl);
}