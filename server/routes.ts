import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertProjectSchema, insertGenerationLogSchema, insertUserSchema, insertSavedCharacterSchema } from "@shared/schema";
import { generateLyrics, generateScenePrompts, splitLyricsIntoSections } from "./services/openai";
import { ObjectStorageService } from "./objectStorage";
import { generateSong } from "./services/elevenlabs";
import { generateCharacterImage, generateSceneImages } from "./services/fal";
import { generateAllVideoSegments } from "./services/wavespeed";
import { splitAudio, mergeVideos, pictureInPicture } from "./services/ffmpeg";
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

  // Get all user's completed videos
  app.get("/api/my-videos", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projects = await storage.getProjectsByUser(userId);
      // Filter only completed projects with final videos
      const completedVideos = projects
        .filter(p => p.isCompleted && p.finalVideoUrl)
        .map(p => ({
          id: p.id,
          title: p.title,
          videoUrl: p.finalVideoUrl,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        }));
      res.json(completedVideos);
    } catch (error) {
      console.error("Get my videos error:", error);
      res.status(500).json({ error: "Failed to get videos" });
    }
  });

  // Get all user's generated songs
  app.get("/api/my-songs", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projects = await storage.getProjectsByUser(userId);
      // Filter projects with generated audio
      const generatedSongs = projects
        .filter(p => p.audioUrl && p.audioType === 'generated')
        .map(p => ({
          id: p.id,
          title: p.title,
          audioUrl: p.audioUrl,
          audioTags: p.audioTags,
          audioLyrics: p.audioLyrics,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        }));
      res.json(generatedSongs);
    } catch (error) {
      console.error("Get my songs error:", error);
      res.status(500).json({ error: "Failed to get songs" });
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
      const { prompt, aspectRatio = "16:9" } = req.body;
      console.log("Extracted prompt:", prompt);
      console.log("Aspect ratio:", aspectRatio);
      
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

      console.log("About to call generateCharacterImage with aspect ratio:", aspectRatio);
      const imageUrl = await generateCharacterImage(prompt, aspectRatio);
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

  // Select song from library for project
  app.post("/api/projects/:id/select-song", authenticateToken, async (req, res) => {
    try {
      const { audioUrl, audioTags, audioLyrics, audioType } = req.body;
      
      const project = await storage.updateProject(req.params.id, {
        audioUrl,
        audioTags,
        audioLyrics,
        audioType,
        currentStep: 2,
      });
      
      res.json({ 
        audioUrl: project.audioUrl,
        message: 'Song selected from library successfully' 
      });
    } catch (error) {
      console.error("Select song error:", error);
      res.status(500).json({ error: "Failed to select song from library" });
    }
  });

  // Save selected character to project
  app.post("/api/projects/:id/save-character", authenticateToken, async (req, res) => {
    try {
      console.log("Save character request body:", JSON.stringify(req.body, null, 2));
      console.log("Project ID:", req.params.id);
      
      const { imageUrl, prompt } = req.body;
      
      if (!imageUrl || !prompt) {
        console.log("Missing required fields - imageUrl:", !!imageUrl, "prompt:", !!prompt);
        return res.status(400).json({ error: "Image URL and prompt are required" });
      }

      const updateData = {
        characterImageUrl: imageUrl,
        characterPrompt: prompt,
        characterType: "selected",
        currentStep: 3
      };
      
      console.log("Updating project with data:", JSON.stringify(updateData, null, 2));
      
      const updatedProject = await storage.updateProject(req.params.id, updateData);
      
      console.log("Updated project result:", JSON.stringify(updatedProject, null, 2));

      res.json({ success: true });
    } catch (error) {
      console.error("Save character to project error:", error);
      res.status(500).json({ error: "Failed to save character to project" });
    }
  });

  // Generate scenes
  app.post("/api/projects/:id/generate-scenes", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      console.log("Project data for scene generation:", JSON.stringify(project, null, 2));
      
      if (!project) {
        console.log("No project found for ID:", req.params.id);
        return res.status(400).json({ error: "Project not found" });
      }
      
      if (!project.characterImageUrl) {
        console.log("Missing characterImageUrl in project:", project.characterImageUrl);
        return res.status(400).json({ error: "Character image URL is required. Please create or select a character first." });
      }

      // Create a prompt based on what we have
      let audioPrompt = project.audioPrompt;
      if (!audioPrompt) {
        if (project.audioType === 'uploaded') {
          audioPrompt = "Create a music video with dramatic scenes";
        } else if (project.audioType === 'generated' && project.audioLyrics) {
          // Use the lyrics/tags to create a prompt for generated songs
          const tags = project.audioTags || "music";
          audioPrompt = `${tags} music video based on these lyrics: ${project.audioLyrics.substring(0, 200)}`;
        } else {
          audioPrompt = "Create an engaging music video";
        }
      }

      // Combine audio description with character description for better scene generation
      let combinedPrompt = audioPrompt;
      if (project.characterPrompt) {
        combinedPrompt = `Music theme: ${audioPrompt}. Character: ${project.characterPrompt}`;
      }
      
      // Split lyrics into 4 sections if available
      let lyricsSections: string[] | undefined;
      if (project.audioLyrics) {
        lyricsSections = splitLyricsIntoSections(project.audioLyrics);
        console.log("Split lyrics into sections:", lyricsSections.map(s => s.substring(0, 50) + "..."));
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: "Generating scene prompts",
        status: "started",
        metadata: { combinedPrompt, hasSections: !!lyricsSections }
      });

      const scenePrompts = await generateScenePrompts(combinedPrompt, lyricsSections);
      
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

      // Convert relative path to full URL for FFMPEG API
      let audioUrl = project.audioUrl;
      if (audioUrl.startsWith('/')) {
        // Use the actual Replit dev domain from environment
        const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;
        
        if (replitDevDomain) {
          // Use the actual Replit dev domain
          audioUrl = `https://${replitDevDomain}${audioUrl}`;
        } else {
          // Fallback to constructing from environment variables
          const replSlug = process.env.REPL_SLUG;
          const replOwner = process.env.REPL_OWNER;
          
          if (replSlug && replOwner) {
            audioUrl = `https://${replSlug}-${replOwner}.replit.app${audioUrl}`;
          } else {
            // Final fallback to host header
            const host = req.get('host') || 'localhost:5000';
            audioUrl = host.includes('localhost') ? `http://${host}${audioUrl}` : `https://${host}${audioUrl}`;
          }
        }
      }
      
      console.log("=== AUDIO URL DEBUG ===");
      console.log("Original audio URL:", project.audioUrl);
      console.log("REPLIT_DEV_DOMAIN:", process.env.REPLIT_DEV_DOMAIN);
      console.log("Host:", req.get('host'));
      console.log("Final audio URL for FFMPEG:", audioUrl);
      console.log("=== END DEBUG ===");
      const audioSegments = await splitAudio(audioUrl);
      console.log("Audio segments result:", JSON.stringify(audioSegments, null, 2));
      
      const audioUrls = audioSegments.map(segment => segment.download_url);
      console.log("Audio URLs for video generation:", audioUrls);

      await storage.updateProject(req.params.id, {
        audioSegments: audioSegments
      });

      // Step 2: Generate video segments
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Generating 4 videos with audio (multitalk) and 4 without audio (seedance)",
        status: "progress",
        metadata: { step: 2, total: 5 }
      });

      const { videoUrls: allVideoUrls, segmentPairs } = await generateAllVideoSegments(
        audioUrls,
        project.sceneImages as string[],
        project.scenePrompts as string[]
      );

      await storage.updateProject(req.params.id, {
        videoSegments: allVideoUrls
      });

      // Step 3: Create picture-in-picture compositions
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Creating picture-in-picture compositions",
        status: "progress",
        metadata: { step: 3, total: 5 }
      });

      console.log("=== STARTING PICTURE-IN-PICTURE COMPOSITIONS ===");
      console.log("Number of segment pairs:", segmentPairs.length);
      
      const objectStorageService = new ObjectStorageService();
      const pipVideos: string[] = [];
      for (let i = 0; i < segmentPairs.length; i++) {
        console.log(`\n--- PiP Composition ${i + 1}/4 ---`);
        console.log(`Main video (${i + 1}a):`, segmentPairs[i].a);
        console.log(`PiP video (${i + 1}b):`, segmentPairs[i].b);
        
        try {
          const pipResult = await pictureInPicture(segmentPairs[i].a, segmentPairs[i].b);
          console.log(`PiP composition ${i + 1} successful:`, pipResult.download_url);
          
          // Save the PiP video to object storage to prevent expiration
          console.log(`Saving PiP segment ${i + 1} to object storage...`);
          const savedVideoUrl = await objectStorageService.uploadVideoFromUrl(
            pipResult.download_url,
            `pip_segment_${i + 1}_${Date.now()}.mp4`
          );
          pipVideos.push(savedVideoUrl);
          console.log(`PiP segment ${i + 1} saved to storage:`, savedVideoUrl);
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: `Created PiP composition ${i + 1}/4`,
            status: "progress",
            metadata: { 
              pipSegment: i + 1,
              resultUrl: pipResult.download_url
            }
          });
        } catch (pipError) {
          console.error(`PiP composition ${i + 1} failed:`, pipError);
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: `PiP composition ${i + 1} failed: ${(pipError as Error).message}`,
            status: "error",
            metadata: { 
              pipSegment: i + 1,
              error: (pipError as Error).message
            }
          });
          throw new Error(`Picture-in-Picture failed at segment ${i + 1}: ${(pipError as Error).message}`);
        }
      }
      
      console.log("\n=== ALL PiP COMPOSITIONS COMPLETED ===");
      console.log("PiP video URLs:", pipVideos);

      // Step 4: Merge final video
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Merging final video from 4 PiP segments",
        status: "progress",
        metadata: { step: 4, total: 5 }
      });

      console.log("\n=== STARTING FINAL VIDEO MERGE ===");
      console.log("Number of PiP videos to merge:", pipVideos.length);
      console.log("PiP video URLs to merge:", pipVideos);
      
      let finalVideo;
      let savedFinalVideoUrl: string;
      try {
        finalVideo = await mergeVideos(pipVideos);
        console.log("Final video merge successful:", finalVideo.download_url);
        
        // Save the final video to object storage as well
        console.log("Saving final video to object storage...");
        const objectStorageService = new ObjectStorageService();
        savedFinalVideoUrl = await objectStorageService.uploadVideoFromUrl(
          finalVideo.download_url,
          `final_video_${Date.now()}.mp4`
        );
        console.log("Final video saved to storage:", savedFinalVideoUrl);
      } catch (mergeError) {
        console.error("Final video merge failed:", mergeError);
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: `Final video merge failed: ${(mergeError as Error).message}`,
          status: "error",
          metadata: { 
            error: (mergeError as Error).message,
            videosAttempted: pipVideos
          }
        });
        throw new Error(`Final video merge failed: ${(mergeError as Error).message}`);
      }

      await storage.updateProject(req.params.id, {
        finalVideoUrl: savedFinalVideoUrl,
        isCompleted: true,
        currentStep: 6
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Video generation completed",
        status: "completed",
        metadata: { finalVideoUrl: savedFinalVideoUrl }
      });

      res.json({ finalVideoUrl: savedFinalVideoUrl });
    } catch (error) {
      console.error("Generate video error:", error);
      const errorMessage = (error as Error).message;
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Video generation failed: ${errorMessage}`,
        status: "error",
        metadata: { error: errorMessage }
      });
      
      // Send specific error message to help with debugging
      res.status(500).json({ 
        error: errorMessage || "Failed to generate video",
        details: "Check server logs for detailed FFMPEG API requests and responses"
      });
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
