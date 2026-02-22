import { storage } from "../storage";

const MAX_CONCURRENT_VIDEOS = 20;

export class VideoQueueService {
  
  /**
   * Attempts to start video processing for a project
   * Returns true if processing can start immediately, false if queued
   */
  async requestVideoGeneration(projectId: string, userId: string): Promise<{ canStart: boolean; queuePosition?: number }> {
    // Clean up any stale entries first
    await storage.cleanupStaleEntries();
    
    // Check current active processing count
    const activeCount = await storage.getActiveVideoCount();
    
    if (activeCount < MAX_CONCURRENT_VIDEOS) {
      // Can start processing immediately
      await storage.addToVideoQueue({
        projectId,
        userId,
        status: 'processing',
        queuePosition: 0,
        startedAt: new Date()
      });
      
      return { canStart: true };
    } else {
      // Need to queue the request
      const queuePosition = await this.getNextQueuePosition();
      
      await storage.addToVideoQueue({
        projectId,
        userId,
        status: 'queued',
        queuePosition
      });
      
      return { canStart: false, queuePosition };
    }
  }
  
  /**
   * Marks video processing as completed and processes queue.
   * When success is true, removes the project from video_queue so it no longer blocks project deletion.
   */
  async completeVideoGeneration(projectId: string, success: boolean): Promise<void> {
    // Mark the current video as completed
    await storage.completeVideoProcessing(projectId, success ? 'completed' : 'failed');
    // Remove from video_queue when done so completed videos don't keep FK references (enables project delete)
    await storage.deleteVideoQueueByProject(projectId);
    // Process the next item in the queue
    await this.processNextInQueue();
  }

  /**
   * Removes a project from the video queue (e.g. when user cancels or regeneration fails).
   */
  async removeFromQueue(projectId: string): Promise<void> {
    await storage.deleteVideoQueueByProject(projectId);
  }
  
  /**
   * Gets the current queue position for a project
   */
  async getQueuePosition(projectId: string): Promise<number | null> {
    return await storage.getQueuePosition(projectId);
  }
  
  /**
   * Waits for a queued video to be ready for processing
   */
  async waitForQueuePosition(projectId: string, timeoutMs: number = 300000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const position = await this.getQueuePosition(projectId);
      
      if (position === null) {
        // Entry not found, something went wrong
        return false;
      }
      
      if (position === 0) {
        // Ready to start processing
        await storage.startVideoProcessing(projectId);
        return true;
      }
      
      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Timeout
    return false;
  }
  
  private async getNextQueuePosition(): Promise<number> {
    // For simplicity, use timestamp-based positioning
    // In a production system, you'd want more sophisticated queue management
    return Date.now() % 1000000; // Use timestamp as position
  }
  
  private async processNextInQueue(): Promise<void> {
    // This would typically involve checking the queue and updating positions
    // For now, the queue will be processed when new requests come in
    // In a production system, you'd want a background worker for this
  }
  
  /**
   * Gets current queue statistics
   */
  async getQueueStats(): Promise<{ activeCount: number; maxConcurrent: number }> {
    const activeCount = await storage.getActiveVideoCount();
    return {
      activeCount,
      maxConcurrent: MAX_CONCURRENT_VIDEOS
    };
  }
}

export const videoQueueService = new VideoQueueService();