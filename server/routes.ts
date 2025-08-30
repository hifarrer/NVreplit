import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertGenerationLogSchema } from "@shared/schema";
import { generateLyrics, generateScenePrompts } from "./services/openai";
import { generateSong } from "./services/elevenlabs";
import { generateCharacterImage, generateSceneImages } from "./services/fal";
import { generateAllVideoSegments } from "./services/wavespeed";
import { splitAudio, mergeVideos } from "./services/ffmpeg";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create a new project
  app.post("/api/projects", async (req, res) => {
    try {
      const validatedData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validatedData);
      res.json(project);
    } catch (error) {
      console.error("Create project error:", error);
      res.status(400).json({ error: "Invalid project data" });
    }
  });

  // Get project by ID
  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Get project error:", error);
      res.status(500).json({ error: "Failed to get project" });
    }
  });

  // Update project
  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Update project error:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  // Generate lyrics
  app.post("/api/projects/:id/generate-lyrics", async (req, res) => {
    try {
      const { description } = req.body;
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: "Starting lyrics generation",
        status: "started",
        metadata: { description }
      });

      const lyrics = await generateLyrics(description);
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: "Lyrics generated successfully",
        status: "completed",
        metadata: { lyrics }
      });

      res.json({ lyrics });
    } catch (error) {
      console.error("Generate lyrics error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: `Lyrics generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate lyrics" });
    }
  });

  // Generate song
  app.post("/api/projects/:id/generate-song", async (req, res) => {
    try {
      const { tags, lyrics } = req.body;
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: "Starting song generation",
        status: "started",
        metadata: { tags, lyrics }
      });

      const result = await generateSong(tags, lyrics);
      
      await storage.updateProject(req.params.id, {
        audioUrl: result.audioUrl,
        audioType: "generated",
        audioTags: tags,
        audioLyrics: lyrics,
        currentStep: 2
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: "Song generated successfully",
        status: "completed",
        metadata: { audioUrl: result.audioUrl, duration: result.duration }
      });

      res.json(result);
    } catch (error) {
      console.error("Generate song error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: `Song generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate song" });
    }
  });

  // Generate character
  app.post("/api/projects/:id/generate-character", async (req, res) => {
    try {
      const { prompt } = req.body;
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Starting character generation",
        status: "started",
        metadata: { prompt }
      });

      const imageUrl = await generateCharacterImage(prompt);
      
      await storage.updateProject(req.params.id, {
        characterImageUrl: imageUrl,
        characterType: "generated",
        characterPrompt: prompt,
        currentStep: 3
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character generated successfully",
        status: "completed",
        metadata: { imageUrl }
      });

      res.json({ imageUrl });
    } catch (error) {
      console.error("Generate character error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: `Character generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate character" });
    }
  });

  // Generate scenes
  app.post("/api/projects/:id/generate-scenes", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || !project.audioPrompt || !project.characterImageUrl) {
        return res.status(400).json({ error: "Missing required project data" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: "Generating scene prompts",
        status: "started",
        metadata: {}
      });

      const scenePrompts = await generateScenePrompts(project.audioPrompt);
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: "Generating scene images",
        status: "progress",
        metadata: { scenePrompts }
      });

      const sceneImages = await generateSceneImages(scenePrompts, project.characterImageUrl);
      
      await storage.updateProject(req.params.id, {
        scenePrompts: scenePrompts,
        sceneImages: sceneImages,
        currentStep: 4
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: "Scene generation completed",
        status: "completed",
        metadata: { scenePrompts, sceneImages }
      });

      res.json({ scenePrompts, sceneImages });
    } catch (error) {
      console.error("Generate scenes error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Scene generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate scenes" });
    }
  });

  // Generate video
  app.post("/api/projects/:id/generate-video", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || !project.audioUrl || !project.sceneImages || !project.scenePrompts) {
        return res.status(400).json({ error: "Missing required project data" });
      }

      // Step 1: Split audio
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Splitting audio into segments",
        status: "progress",
        metadata: { step: 1, total: 4 }
      });

      const audioSegments = await splitAudio(project.audioUrl);
      const audioUrls = audioSegments.map(segment => segment.download_url);

      await storage.updateProject(req.params.id, {
        audioSegments: audioSegments
      });

      // Step 2: Generate video segments
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Generating video segments",
        status: "progress",
        metadata: { step: 2, total: 4 }
      });

      const videoUrls = await generateAllVideoSegments(
        audioUrls,
        project.sceneImages as string[],
        project.scenePrompts as string[]
      );

      await storage.updateProject(req.params.id, {
        videoSegments: videoUrls
      });

      // Step 3: Merge videos
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Merging final video",
        status: "progress",
        metadata: { step: 3, total: 4 }
      });

      const finalVideo = await mergeVideos(videoUrls);

      await storage.updateProject(req.params.id, {
        finalVideoUrl: finalVideo.download_url,
        isCompleted: true,
        currentStep: 6
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Video generation completed",
        status: "completed",
        metadata: { finalVideoUrl: finalVideo.download_url }
      });

      res.json({ finalVideoUrl: finalVideo.download_url });
    } catch (error) {
      console.error("Generate video error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Video generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate video" });
    }
  });

  // Get generation logs
  app.get("/api/projects/:id/logs", async (req, res) => {
    try {
      const logs = await storage.getGenerationLogs(req.params.id);
      res.json(logs);
    } catch (error) {
      console.error("Get logs error:", error);
      res.status(500).json({ error: "Failed to get logs" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
