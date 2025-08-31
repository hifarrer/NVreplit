import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertProjectSchema, insertGenerationLogSchema, insertUserSchema, insertSavedCharacterSchema } from "@shared/schema";
import { generateLyrics, generateScenePrompts } from "./services/openai";
import { generateSong } from "./services/elevenlabs";
import { generateCharacterImage, generateSceneImages } from "./services/fal";
import { generateAllVideoSegments } from "./services/wavespeed";
import { splitAudio, mergeVideos } from "./services/ffmpeg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Configure multer for audio uploads
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req: any, file: any, cb: any) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `audio-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/aac', 'audio/mp3'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|aac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, and AAC files are allowed.'));
    }
  }
});

const JWT_SECRET = process.env.JWT_SECRET || "music-video-maker-secret-key";

// Middleware to verify JWT token
function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.post("/api/register", async (req, res) => {
    try {
      const { username, email, password } = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUserByUsername = await storage.getUserByUsername(username);
      if (existingUserByUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }
      
      const existingUserByEmail = await storage.getUserByEmail(email);
      if (existingUserByEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }
      
      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Create user
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword
      });
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.status(201).json({
        user: { id: user.id, username: user.username, email: user.email },
        token
      });
    } catch (error) {
      console.error("Register error:", error);
      const message = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      // Find user by username or email
      let user = await storage.getUserByUsername(username);
      if (!user) {
        user = await storage.getUserByEmail(username); // Allow login with email
      }
      
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        user: { id: user.id, username: user.username, email: user.email },
        token
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/me", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser((req as any).user.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        email: user.email
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user info" });
    }
  });

  // Create a new project
  app.post("/api/projects", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projectData = {
        ...req.body,
        userId // Use authenticated user ID
      };
      
      console.log("Creating project with data:", projectData);
      const validatedData = insertProjectSchema.parse(projectData);
      console.log("Validated data:", validatedData);
      const project = await storage.createProject(validatedData);
      res.json(project);
    } catch (error) {
      console.error("Create project error:", error);
      if (error instanceof Error && 'name' in error && error.name === 'ZodError') {
        console.error("Validation errors:", (error as any).errors);
        res.status(400).json({ error: "Validation failed", details: (error as any).errors });
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ error: "Invalid project data", message });
      }
    }
  });

  // Get project by ID
  app.get("/api/projects/:id", authenticateToken, async (req, res) => {
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
  app.patch("/api/projects/:id", authenticateToken, async (req, res) => {
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

  // Upload audio file
  app.post("/api/projects/:id/upload-audio", audioUpload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const audioUrl = `/uploads/${req.file.filename}`;
      
      // Update project with audio URL
      const project = await storage.updateProject(req.params.id, { 
        audioUrl,
        audioType: 'uploaded'
      });
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_upload",
        message: "Audio file uploaded successfully",
        status: "completed",
        metadata: { 
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          audioUrl 
        }
      });

      res.json({ 
        audioUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error("Upload audio error:", error);
      
      // Clean up file if it was uploaded but processing failed
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error("Failed to clean up uploaded file:", cleanupError);
        }
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "audio_upload",
        message: `Audio upload failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });

      res.status(500).json({ error: "Failed to upload audio file" });
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
      console.log("Character generation route called with body:", req.body);
      const { prompt } = req.body;
      console.log("Extracted prompt:", prompt);
      
      if (!prompt || !prompt.trim()) {
        throw new Error("No prompt provided");
      }
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Starting character generation",
        status: "started",
        metadata: { prompt }
      });

      console.log("About to call generateCharacterImage...");
      const imageUrl = await generateCharacterImage(prompt);
      console.log("generateCharacterImage returned:", imageUrl);
      
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
      if (!project || !project.characterImageUrl) {
        return res.status(400).json({ error: "Missing required project data" });
      }

      // For uploaded audio files, we need to create a generic prompt
      let audioPrompt = project.audioPrompt;
      if (!audioPrompt) {
        if (project.audioType === 'uploaded') {
          audioPrompt = "Create a music video with dramatic scenes";
        } else {
          return res.status(400).json({ error: "Audio prompt is required for scene generation" });
        }
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: "Generating scene prompts",
        status: "started",
        metadata: {}
      });

      const scenePrompts = await generateScenePrompts(audioPrompt);
      
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

  // Saved characters routes
  app.get("/api/characters", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const characters = await storage.getSavedCharacters(userId);
      res.json(characters);
    } catch (error) {
      console.error("Get saved characters error:", error);
      res.status(500).json({ error: "Failed to get saved characters" });
    }
  });

  app.post("/api/characters", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const characterData = {
        ...req.body,
        userId
      };
      
      const validatedData = insertSavedCharacterSchema.parse(characterData);
      const character = await storage.saveCharacter(validatedData);
      res.status(201).json(character);
    } catch (error) {
      console.error("Save character error:", error);
      const message = error instanceof Error ? error.message : 'Failed to save character';
      res.status(400).json({ error: message });
    }
  });

  app.delete("/api/characters/:id", authenticateToken, async (req, res) => {
    try {
      const deleted = await storage.deleteSavedCharacter(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete character error:", error);
      res.status(500).json({ error: "Failed to delete character" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
