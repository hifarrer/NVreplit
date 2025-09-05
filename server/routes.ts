import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertProjectSchema, insertGenerationLogSchema, insertUserSchema, insertSavedCharacterSchema } from "@shared/schema";
import { generateLyrics, generateScenePrompts, splitLyricsIntoSections } from "./services/openai";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { generateSongWithElevenLabs } from "./services/elevenlabs";
import { generateSong as generateSongWithKie, getTimestampedLyrics, convertTimestampedLyricsToASS, storeSubtitleFile } from "./services/kie";
import { createForcedAlignment, convertElevenLabsAlignmentToASS, storeElevenLabsSubtitleFile } from "./services/elevenlabs";
import { generateCharacterImage, generateCharacterImages, generateSceneImages, generateSingleSceneImage } from "./services/fal";
import { generateAllVideoSegments, generateAllVideoSegmentsDynamic } from "./services/wavespeed";
import { splitAudio, mergeVideos, pictureInPicture, getWatermarkUrl } from "./services/ffmpeg";
import { VideoQueueService } from "./services/videoQueue";
import { downloadAndStoreImage } from "./services/imageStorage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

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

// Initialize video queue service
const videoQueueService = new VideoQueueService();

// Admin credentials (hardcoded for now)
const ADMIN_CREDENTIALS = {
  username: "admin",
  password: "password123"
};

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

// Middleware to verify admin JWT token
function authenticateAdmin(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    // Check if this is an admin token
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
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
      
      // Create user with default avatar
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        avatarUrl: "/public-objects/public/avatars/anonymous.png"
      });
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.status(201).json({
        user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl },
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
        user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl },
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
        email: user.email,
        avatarUrl: user.avatarUrl
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user info" });
    }
  });

  // Update username
  app.patch("/api/user/username", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { username } = req.body;
      
      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ error: "Username is required" });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username.trim());
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: "Username already taken" });
      }
      
      // Update username
      const user = await storage.updateUser(userId, { username: username.trim() });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        email: user.email
      });
    } catch (error) {
      console.error("Update username error:", error);
      res.status(500).json({ error: "Failed to update username" });
    }
  });

  // Admin authentication routes
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      
      // Check admin credentials
      if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
        return res.status(401).json({ error: "Invalid admin credentials" });
      }
      
      // Generate admin JWT token
      const token = jwt.sign(
        { username: ADMIN_CREDENTIALS.username, isAdmin: true },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      res.json({
        admin: { username: ADMIN_CREDENTIALS.username },
        token
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ error: "Admin login failed" });
    }
  });

  // Admin routes
  app.get("/api/admin/users", authenticateAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithStats = await Promise.all(users.map(async (user) => {
        const projects = await storage.getUserProjects(user.id);
        const songs = await storage.getSongs(user.id);
        return {
          id: user.id,
          username: user.username,
          email: user.email,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
          projectCount: projects.length,
          songCount: songs.length
        };
      }));
      res.json(usersWithStats);
    } catch (error) {
      console.error("Admin get users error:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  app.delete("/api/admin/users/:userId", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Admin delete user error:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.put("/api/admin/users/:userId", authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { username, email } = req.body;
      await storage.updateUser(userId, { username, email });
      res.json({ success: true });
    } catch (error) {
      console.error("Admin update user error:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.get("/api/admin/stats", authenticateAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const allProjects = await Promise.all(users.map(user => storage.getUserProjects(user.id)));
      const allSongs = await Promise.all(users.map(user => storage.getSongs(user.id)));
      
      const projects = allProjects.flat();
      const songs = allSongs.flat();
      
      // Calculate stats
      const totalUsers = users.length;
      const totalProjects = projects.length;
      const totalSongs = songs.length;
      const completedProjects = projects.filter(p => p.isCompleted).length;
      
      // Group by creation date for charts
      const userSignupsByDay = users.reduce((acc: any, user) => {
        const date = user.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});

      const projectsByDay = projects.reduce((acc: any, project) => {
        const date = project.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});
      
      res.json({
        overview: {
          totalUsers,
          totalProjects,
          totalSongs,
          completedProjects
        },
        charts: {
          userSignups: Object.entries(userSignupsByDay).map(([date, count]) => ({ date, count })),
          projectCreations: Object.entries(projectsByDay).map(([date, count]) => ({ date, count }))
        }
      });
    } catch (error) {
      console.error("Admin get stats error:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  app.post("/api/admin/reset-password", authenticateAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // In production, this would update the database
      ADMIN_CREDENTIALS.password = newPassword;
      res.json({ success: true, message: "Admin password updated successfully" });
    } catch (error) {
      console.error("Admin reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Update password
  app.patch("/api/user/password", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters long" });
      }
      
      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
      
      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      
      // Update password
      const updatedUser = await storage.updateUser(userId, { password: hashedPassword });
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({ error: "Failed to update password" });
    }
  });

  // Get video generation configurations
  app.get("/api/video-generation-configs", async (req, res) => {
    try {
      const configs = await storage.getAllVideoGenerationConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Get video generation configs error:", error);
      res.status(500).json({ error: "Failed to get video generation configurations" });
    }
  });

  // Get avatar upload URL
  app.post("/api/user/avatar/upload-url", authenticateToken, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Get avatar upload URL error:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Update user avatar
  app.patch("/api/user/avatar", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const { avatarUrl } = req.body;
      
      if (!avatarUrl) {
        return res.status(400).json({ error: "Avatar URL is required" });
      }
      
      // For public avatars (predefined avatars), store the URL as-is
      // For uploaded avatars, we would normalize them, but predefined avatars don't need normalization
      const finalAvatarUrl = avatarUrl;
      
      // Update user avatar
      const user = await storage.updateUser(userId, { avatarUrl: finalAvatarUrl });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl
      });
    } catch (error) {
      console.error("Update avatar error:", error);
      res.status(500).json({ error: "Failed to update avatar" });
    }
  });

  // Get avatar options with production-safe URLs
  app.get("/api/avatar-options", authenticateToken, async (req, res) => {
    try {
      const avatarOptions = [];
      
      // Always use fallback URLs for avatars since the actual files may not exist in object storage
      // This ensures avatars display consistently in both development and production
      
      // Add anonymous avatar (default for new users)
      avatarOptions.push({
        id: 0,
        url: `/public-objects/public/avatars/anonymous.png`,
        localUrl: `/public-objects/public/avatars/anonymous.png`
      });
      
      for (let i = 1; i <= 20; i++) {
        avatarOptions.push({
          id: i,
          url: `/public-objects/public/avatars/avatar${i}.png`,
          localUrl: `/public-objects/public/avatars/avatar${i}.png`
        });
      }
      
      if (process.env.NODE_ENV === 'production') {
        // In production, try to enhance with signed URLs if files exist, but don't fail if they don't
        const objectStorageService = new ObjectStorageService();
        
        // Try to get signed URLs for existing files, but keep fallbacks
        for (let option of avatarOptions) {
          try {
            const fileName = option.id === 0 ? 'avatars/anonymous.png' : `avatars/avatar${option.id}.png`;
            const avatarFile = await objectStorageService.searchPublicObject(fileName);
            if (avatarFile) {
              const signedUrl = await avatarFile.getSignedUrl({
                action: 'read',
                expires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
              });
              option.url = signedUrl[0]; // Update with signed URL, keep fallback as localUrl
            }
          } catch (error) {
            // Keep the fallback URL if signed URL generation fails
            console.log(`Using fallback URL for avatar ${option.id}`);
          }
        }
      }
      // Development and production now use the same avatar array structure
      
      res.json({ avatarOptions });
    } catch (error) {
      console.error("Error getting avatar options:", error);
      res.status(500).json({ error: "Failed to get avatar options" });
    }
  });


  // Serve public objects (like avatars)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    try {
      const filePath = req.params.filePath;
      console.log(`Public object request: ${filePath}`);
      
      // Skip object storage search in production if it's causing auth issues
      // Go straight to fallbacks for known file types
      let shouldSearchObjectStorage = true;
      
      if (process.env.NODE_ENV === 'production') {
        // In production, skip object storage search for watermark to avoid auth errors
        if (filePath.includes('neonlogo_watermark.png')) {
          shouldSearchObjectStorage = false;
          console.log("Skipping object storage search for watermark in production - using SVG fallback");
        }
      }
      
      if (shouldSearchObjectStorage) {
        try {
          const objectStorageService = new ObjectStorageService();
          
          // Try to find the file in object storage
          const file = await objectStorageService.searchPublicObject(filePath);
          if (file) {
            console.log(`Found file in object storage: ${filePath}`);
            return objectStorageService.downloadObject(file, res);
          } else {
            console.log(`File not found in object storage: ${filePath}`);
          }
        } catch (storageError) {
          console.warn(`Object storage search failed for ${filePath}:`, storageError);
        }
      }
      
      // If it's an avatar request and file doesn't exist, provide a generic fallback
      if (filePath.includes('avatars/')) {
        // Generate a simple SVG avatar as fallback
        const avatarMatch = filePath.match(/avatar(\d+)\.png/);
        const avatarId = avatarMatch ? avatarMatch[1] : '?';
        const isAnonymous = filePath.includes('anonymous.png');
        const displayText = isAnonymous ? '?' : avatarId;
        
        const svgContent = `
        <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="grad" cx="50%" cy="30%" r="70%">
              <stop offset="0%" style="stop-color:#6366f1;stop-opacity:0.8" />
              <stop offset="100%" style="stop-color:#3730a3;stop-opacity:1" />
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="32" fill="url(#grad)"/>
          <text x="32" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
                text-anchor="middle" fill="white">${displayText}</text>
        </svg>`;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(svgContent);
      }
      
      // If it's a watermark request and file doesn't exist, provide a fallback watermark
      if (filePath.includes('neonlogo_watermark.png')) {
        // Generate a simple SVG watermark as fallback
        const svgWatermark = `
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
        </svg>`;
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(svgWatermark);
      }
      
      // For non-avatar files, return 404
      return res.status(404).json({ error: "File not found" });
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve avatar images
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof Error && error.message === "Object not found") {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
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

  // Delete a project
  app.delete("/api/projects/:id", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projectId = req.params.id;
      
      // Check if the project exists and belongs to the user
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this project" });
      }
      
      // Delete the project and its related generation logs
      await storage.deleteProjectWithLogs(projectId);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Delete project error:", error);
      res.status(500).json({ error: "Failed to delete project" });
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
      console.log("=== FETCHING SONGS FOR USER ===");
      console.log("User ID:", userId);
      
      const songs = await storage.getSongs(userId);
      console.log("Raw songs from database:", songs.length);
      console.log("Songs data:", JSON.stringify(songs, null, 2));
      
      // Sort by newest first and format for frontend
      const formattedSongs = songs
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(song => ({
          id: song.id,
          title: song.title,
          audioUrl: song.url,
          audioTags: song.tags,
          audioLyrics: song.lyrics,
          duration: song.duration,
          createdAt: song.createdAt,
          updatedAt: song.createdAt // Songs table doesn't have updatedAt
        }));
      
      console.log("Formatted songs to return:", formattedSongs.length);
      res.json(formattedSongs);
    } catch (error) {
      console.error("Get my songs error:", error);
      res.status(500).json({ error: "Failed to get songs" });
    }
  });

  // Get user's current project (most recent)
  app.get("/api/current-project", authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.userId;
      const projects = await storage.getProjectsByUser(userId);
      // Get the most recent project (in-progress or completed)
      const currentProject = projects
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
      
      if (!currentProject) {
        return res.status(404).json({ error: "No project found" });
      }
      
      res.json(currentProject);
    } catch (error) {
      console.error("Get current project error:", error);
      res.status(500).json({ error: "Failed to get current project" });
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
      const { description, duration = 120 } = req.body; // Duration in seconds
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "lyrics_generation",
        message: "Starting lyrics generation",
        status: "started",
        metadata: { description }
      });

      const lyrics = await generateLyrics(description, duration);
      
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
      const { description, tags, lyrics, duration = 120, addSubtitles = false } = req.body; // Duration in seconds
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: "Starting song generation",
        status: "started",
        metadata: { tags, lyrics, addSubtitles }
      });

      let result;
      let subtitleFileUrl = null;
      let generatedSubtitlesContent = null;
      let kieTaskId = null;
      let kieAudioId = null;
      
      // Always use ElevenLabs for song generation
      console.log("Using ElevenLabs for song generation...");
      const durationMs = duration * 1000; // Convert to milliseconds for ElevenLabs
      const elevenLabsSong = await generateSongWithElevenLabs(tags, lyrics, durationMs);
      
      // Create result format similar to KIE response but with single song
      result = {
        songs: [elevenLabsSong],
        firstSongUrl: elevenLabsSong.audioUrl
      };
      
      // Generate subtitles using ElevenLabs forced alignment if requested
      if (addSubtitles && lyrics) {
        console.log("Generating subtitles using ElevenLabs forced alignment...");
        
        try {
          // Create forced alignment with ElevenLabs
          const alignmentResponse = await createForcedAlignment(elevenLabsSong.audioUrl, lyrics);
          
          // Convert to .ass format
          const assContent = convertElevenLabsAlignmentToASS(alignmentResponse);
          generatedSubtitlesContent = assContent; // Store for debugging display
          
          // Store subtitle file with the song ID for proper association
          const songId = elevenLabsSong.audioUrl.split('/').pop()?.replace('.mp3', '') || undefined;
          subtitleFileUrl = await storeElevenLabsSubtitleFile(assContent, songId);
          
          console.log("ElevenLabs subtitle file stored at:", subtitleFileUrl);
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation", 
            message: "Subtitles generated successfully using ElevenLabs forced alignment",
            status: "completed",
            metadata: { subtitleFileUrl, wordCount: alignmentResponse.words?.length || 0 }
          });
        } catch (subtitleError) {
          console.error("ElevenLabs subtitle generation failed:", subtitleError);
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "subtitle_generation",
            message: `ElevenLabs subtitle generation failed: ${(subtitleError as Error).message}`,
            status: "error",
            metadata: { error: (subtitleError as Error).message }
          });
          // Continue without subtitles
        }
      }
      
      // Get the project to find the user ID
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Save the song to the user's library
      const selectedSong = result.songs[0];
      const songData = {
        userId: project.userId,
        title: description || tags || "Generated Song",
        url: selectedSong.audioUrl,
        duration: duration,
        tags: tags || null,
        lyrics: lyrics || null,
        prompt: description || null,
        subtitleFileUrl: subtitleFileUrl || null,
        // Remove KIE fields since we're using ElevenLabs
        kieTaskId: null,
        kieAudioId: null
      };
      
      console.log("=== ATTEMPTING TO SAVE SONG TO LIBRARY ===");
      console.log("Song data:", JSON.stringify(songData, null, 2));
      
      let savedSong;
      try {
        savedSong = await storage.addSong(songData);
        console.log("✅ Song successfully saved to user library!");
        console.log("Saved song ID:", savedSong.id);
        console.log("Saved song URL:", savedSong.url);
        
        // If subtitles were generated but we have the song ID now, 
        // re-store the subtitle file with the song ID as the filename
        if (addSubtitles && generatedSubtitlesContent && savedSong.id) {
          try {
            console.log("Re-storing ElevenLabs subtitle file with song ID...");
            const namedSubtitleUrl = await storeElevenLabsSubtitleFile(generatedSubtitlesContent, savedSong.id);
            subtitleFileUrl = namedSubtitleUrl;
            
            console.log("Updated ElevenLabs subtitle file URL:", namedSubtitleUrl);
            
          } catch (subtitleUpdateError) {
            console.warn("Failed to re-store ElevenLabs subtitle with song ID:", subtitleUpdateError);
            // Keep the original subtitle URL
          }
        }
      } catch (libraryError) {
        console.error("❌ FAILED to save song to library:");
        console.error("Error details:", libraryError);
        console.error("Error message:", (libraryError as Error).message);
        console.error("Error stack:", (libraryError as Error).stack);
        // Don't fail the entire request if saving to library fails
      }
      
      // Update the project with the selected song
      await storage.updateProject(req.params.id, {
        title: description || tags, // Use the full song description as the project title, fallback to tags
        audioUrl: selectedSong.audioUrl,
        audioType: "generated",
        audioPrompt: description,
        audioTags: tags,
        audioLyrics: lyrics,
        audioDuration: duration, // Store the duration in seconds
        addSubtitles: addSubtitles,
        subtitleFileUrl: subtitleFileUrl,
        // Remove KIE fields since we're using ElevenLabs
        kieTaskId: null,
        kieAudioId: null,
        currentStep: 2
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_generation",
        message: `Generated ${result.songs.length} songs successfully`,
        status: "completed",
        metadata: { songs: result.songs }
      });

      // Add debugging subtitle content to response if generated
      const responseData = {
        ...result,
        subtitleFileUrl,
        generatedSubtitlesContent // For debugging display
      };
      
      res.json(responseData);
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

  // Generate multiple character options (KIE.ai API)
  app.post("/api/projects/:id/generate-character-options", async (req, res) => {
    try {
      console.log("Character options generation route called with body:", req.body);
      const { prompt, aspectRatio = "16:9" } = req.body;
      console.log("Extracted prompt:", prompt);
      console.log("Aspect ratio:", aspectRatio);
      
      if (!prompt || !prompt.trim()) {
        throw new Error("No prompt provided");
      }
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Starting character options generation",
        status: "started",
        metadata: { prompt }
      });

      console.log("About to call generateCharacterImages with aspect ratio:", aspectRatio);
      const imageUrls = await generateCharacterImages(prompt, aspectRatio);
      console.log("generateCharacterImages returned:", imageUrls);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character options generated successfully",
        status: "completed",
        metadata: { imageUrls, count: imageUrls.length }
      });

      res.json({ imageUrls, prompt });
    } catch (error) {
      console.error("Generate character options error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: `Character options generation failed: ${(error as Error).message}`,
        status: "error",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to generate character options" });
    }
  });

  // Save selected character option to project  
  app.post("/api/projects/:id/save-character-option", async (req, res) => {
    try {
      console.log("Save character option request body:", req.body);
      const { imageUrl, prompt } = req.body;
      
      if (!imageUrl || !prompt) {
        return res.status(400).json({ error: "Image URL and prompt are required" });
      }

      // Download and store the image permanently
      console.log("Downloading and storing character image...");
      const storedImage = await downloadAndStoreImage(imageUrl, "characters");
      console.log("Image stored successfully:", storedImage.storedUrl);

      const project = await storage.updateProject(req.params.id, {
        characterImageUrl: storedImage.storedUrl,
        characterType: "generated",
        characterPrompt: prompt,
        currentStep: 3
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "character_generation",
        message: "Character option saved successfully with permanent storage",
        status: "completed",
        metadata: { 
          originalImageUrl: imageUrl,
          storedImageUrl: storedImage.storedUrl,
          prompt 
        }
      });

      res.json({ 
        characterImageUrl: project?.characterImageUrl,
        message: 'Character saved successfully' 
      });
    } catch (error) {
      console.error("Save character option error:", error);
      res.status(500).json({ error: "Failed to save character option" });
    }
  });

  // Select song for project (handles both generated songs and library songs)
  app.post("/api/projects/:id/select-song", authenticateToken, async (req, res) => {
    try {
      const { audioUrl, audioTags, audioLyrics, audioType, duration, subtitleFileUrl, kieTaskId, kieAudioId } = req.body;
      
      console.log("=== SELECT-SONG REQUEST ===");
      console.log("Request body:", JSON.stringify(req.body, null, 2));
      console.log("Duration received:", duration);
      
      // Build update data based on what's provided
      const updateData: any = {
        audioUrl,
        currentStep: 2
      };
      
      // Add optional fields if provided (for library songs)
      if (audioTags) updateData.audioTags = audioTags;
      if (audioLyrics) updateData.audioLyrics = audioLyrics;
      if (audioType) updateData.audioType = audioType;
      if (duration) updateData.audioDuration = duration;
      if (subtitleFileUrl) {
        updateData.addSubtitles = true;
        updateData.subtitleFileUrl = subtitleFileUrl;
        updateData.kieTaskId = kieTaskId;
        updateData.kieAudioId = kieAudioId;
      }
      
      console.log("Update data to save:", JSON.stringify(updateData, null, 2));
      
      const project = await storage.updateProject(req.params.id, updateData);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "song_selection",
        message: "Song selected for project",
        status: "completed",
        metadata: { audioUrl, audioTags, audioLyrics, duration }
      });
      
      res.json({ 
        audioUrl: project.audioUrl,
        message: 'Song selected successfully' 
      });
    } catch (error) {
      console.error("Select song error:", error);
      res.status(500).json({ error: "Failed to select song" });
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

      let characterImageUrl = imageUrl;
      
      // Only download and store if it's an external URL (starts with http)
      // Library characters already have relative URLs to our object storage
      if (imageUrl.startsWith('http')) {
        console.log("Downloading and storing external character image...");
        const storedImage = await downloadAndStoreImage(imageUrl, "characters");
        console.log("Image stored successfully:", storedImage.storedUrl);
        characterImageUrl = storedImage.storedUrl;
      } else {
        console.log("Using existing character from library:", imageUrl);
      }

      const updateData = {
        characterImageUrl,
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
      
      // Get audio duration to determine configuration
      const audioDuration = project.audioDuration || 120; // Use stored duration or default to 2 minutes
      
      console.log("=== SCENE GENERATION DURATION CHECK ===");
      console.log("Project audioDuration:", project.audioDuration);
      console.log("Final audioDuration used:", audioDuration);
      
      // Get the video generation configuration for dynamic scene count
      const config = await storage.getVideoGenerationConfig(audioDuration);
      if (!config) {
        throw new Error(`No video generation configuration found for duration ${audioDuration} seconds`);
      }
      
      console.log("Using configuration for scene generation:", config);
      console.log("Number of scenes to generate:", config.numberOfScenesCreated);
      
      // Split lyrics into sections based on configuration
      let lyricsSections: string[] | undefined;
      if (project.audioLyrics) {
        lyricsSections = splitLyricsIntoSections(project.audioLyrics, config.numberOfAudioParts);
        console.log(`Split lyrics into ${config.numberOfAudioParts} sections:`, lyricsSections.map(s => s.substring(0, 50) + "..."));
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Generating ${config.numberOfScenesCreated} scene prompts`,
        status: "started",
        metadata: { 
          combinedPrompt, 
          hasSections: !!lyricsSections,
          numberOfScenes: config.numberOfScenesCreated
        }
      });

      const scenePrompts = await generateScenePrompts(combinedPrompt, config.numberOfScenesCreated, lyricsSections);
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_generation",
        message: `Generating ${config.numberOfScenesCreated} scene images`,
        status: "progress",
        metadata: { scenePrompts, numberOfScenes: config.numberOfScenesCreated }
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

  // Regenerate individual scene endpoint
  app.post("/api/projects/:id/regenerate-scene", async (req, res) => {
    try {
      const { sceneIndex, prompt } = req.body;
      
      if (sceneIndex === undefined || !prompt) {
        return res.status(400).json({ error: "Scene index and prompt are required" });
      }

      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }
      
      if (!project.characterImageUrl) {
        return res.status(400).json({ error: "Character image URL is required" });
      }

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: `Regenerating scene ${sceneIndex + 1}`,
        status: "started",
        metadata: { sceneIndex, prompt }
      });

      // Generate a single scene image with the custom prompt
      const imageUrl = await generateSingleSceneImage(prompt, project.characterImageUrl);

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: `Scene ${sceneIndex + 1} regenerated successfully`,
        status: "completed",
        metadata: { sceneIndex, newImageUrl: imageUrl }
      });

      res.json({ 
        imageUrl: imageUrl,
        sceneIndex: sceneIndex
      });
    } catch (error) {
      console.error("Scene regeneration error:", error);
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "scene_regeneration",
        message: "Scene regeneration failed",
        status: "failed",
        metadata: { error: (error as Error).message }
      });
      res.status(500).json({ error: "Failed to regenerate scene" });
    }
  });

  // Generate video
  app.post("/api/projects/:id/generate-video", async (req, res) => {
    let isInQueue = false;
    
    try {
      const project = await storage.getProject(req.params.id);
      if (!project || !project.audioUrl || !project.sceneImages || !project.scenePrompts) {
        return res.status(400).json({ error: "Missing required project data" });
      }

      // Check if video generation is already in progress or completed
      if ((project as any).generationStatus === 'generating') {
        // Check if generation has timed out (30 minutes)
        const generationStarted = (project as any).generationStartedAt;
        if (generationStarted) {
          const timeoutThreshold = new Date(generationStarted.getTime() + 30 * 60 * 1000);
          if (new Date() > timeoutThreshold) {
            // Mark as failed due to timeout
            await storage.updateProject(req.params.id, {
              generationStatus: 'failed' as any,
              currentStep: 3, // Reset to step 3 so user can try again
            });
          } else {
            // Generation is still active, don't start new one
            return res.status(409).json({ 
              error: "Video generation already in progress. Please wait for it to complete.", 
              generationId: (project as any).generationId 
            });
          }
        }
      }

      if ((project as any).generationStatus === 'completed' && project.finalVideoUrl) {
        // Video already generated successfully
        return res.json({ 
          message: "Video already generated", 
          finalVideoUrl: project.finalVideoUrl 
        });
      }

      // Generate unique identifier for this generation attempt
      const generationId = crypto.randomUUID();
      const now = new Date();
      const timeoutAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now

      // Mark generation as started
      await storage.updateProject(req.params.id, {
        generationId: generationId as any,
        generationStatus: 'generating' as any,
        generationStartedAt: now as any,
        generationTimeoutAt: timeoutAt as any,
      });

      // Import video queue service
      const { videoQueueService } = await import("./services/videoQueue");
      
      // Check queue and either start immediately or wait
      const queueResult = await videoQueueService.requestVideoGeneration(req.params.id, project.userId);
      
      if (!queueResult.canStart) {
        isInQueue = true;
        
        // Log queue status
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: `Video queued at position ${queueResult.queuePosition}. Waiting for processing capacity...`,
          status: "progress",
          metadata: { queuePosition: queueResult.queuePosition, queued: true }
        });
        
        // Wait for queue position
        const canProcess = await videoQueueService.waitForQueuePosition(req.params.id, 300000); // 5 minute timeout
        
        if (!canProcess) {
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: "Video generation timeout - please try again",
            status: "error",
            metadata: { error: "Queue timeout" }
          });
          return res.status(408).json({ error: "Video generation queue timeout. Please try again." });
        }
        
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation", 
          message: "Queue position reached - starting video generation",
          status: "progress",
          metadata: { startingProcessing: true }
        });
      } else {
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: "Starting video generation immediately",
          status: "progress", 
          metadata: { immediateStart: true }
        });
      }

      // Get configuration based on audio duration
      const audioDuration = project.audioDuration || 120; // Use stored duration or default to 2 minutes
      
      console.log(`Using audio duration: ${audioDuration} seconds for video generation`);
      
      // Get the video generation configuration
      const config = await storage.getVideoGenerationConfig(audioDuration);
      if (!config) {
        throw new Error(`No video generation configuration found for duration ${audioDuration} seconds`);
      }
      
      console.log("Using video generation config:", config);
      
      // Step 1: Split audio based on configuration
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Splitting audio into ${config.numberOfAudioParts} segments`,
        status: "progress",
        metadata: { step: 1, total: 4, numberOfSegments: config.numberOfAudioParts }
      });

      // Convert audio URL to externally accessible signed URL for FFMPEG API
      let audioUrl = project.audioUrl;
      if (audioUrl.startsWith('/objects/')) {
        // Generate signed URL for object storage files
        const objectStorageService = new ObjectStorageService();
        audioUrl = await objectStorageService.getSignedUrlForPath(audioUrl, 3600); // 1 hour TTL
      } else if (audioUrl.startsWith('/')) {
        // Use the actual Replit dev domain from environment for local files
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
      const audioSegments = await splitAudio(audioUrl, config.numberOfAudioParts);
      console.log("Audio segments result:", JSON.stringify(audioSegments, null, 2));
      
      const audioUrls = audioSegments.map(segment => segment.download_url);
      console.log("Audio URLs for video generation:", audioUrls);

      await storage.updateProject(req.params.id, {
        audioSegments: audioSegments
      });

      // Step 2: Generate video segments dynamically based on configuration
      const makeCharacterSing = project.makeCharacterSing || true;
      const videoGenerationMessage = makeCharacterSing 
        ? `Generating ${config.numberOfVideosRegularApi} regular videos (seedance) and ${config.numberOfVideosLipsync} lipsync videos (multitalk)`
        : `Generating ${config.numberOfVideosRegularApi} regular videos (seedance only)`;
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: videoGenerationMessage,
        status: "progress",
        metadata: { 
          step: 2, 
          total: 5,
          regularVideos: config.numberOfVideosRegularApi,
          lipsyncVideos: makeCharacterSing ? config.numberOfVideosLipsync : 0
        }
      });

      const { videoUrls: allVideoUrls, segmentPairs } = await generateAllVideoSegmentsDynamic(
        audioUrls,
        project.sceneImages as string[],
        project.scenePrompts as string[],
        {
          numberOfVideosRegularApi: config.numberOfVideosRegularApi,
          numberOfVideosLipsync: config.numberOfVideosLipsync,
          makeCharacterSing: makeCharacterSing
        }
      );

      await storage.updateProject(req.params.id, {
        videoSegments: allVideoUrls
      });

      // Step 3: Merge final video directly from all individual segments (simplified workflow)
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Merging final video from ${allVideoUrls.length} individual segments + outro video`,
        status: "progress",
        metadata: { step: 3, total: 4 }
      });

      console.log("\n=== STARTING FINAL VIDEO MERGE (SIMPLIFIED) ===");
      console.log("Number of individual videos to merge:", allVideoUrls.length);
      console.log("Individual video URLs to merge:", allVideoUrls);
      
      // Convert video URLs to signed URLs for external FFMPEG API
      const objectStorageService = new ObjectStorageService();
      const signedVideoUrls: string[] = [];
      for (let i = 0; i < allVideoUrls.length; i++) {
        const videoUrl = allVideoUrls[i];
        if (videoUrl.startsWith('/objects/')) {
          // Internal object storage URL - convert to signed URL
          const signedUrl = await objectStorageService.getSignedUrlForPath(videoUrl, 7200); // 2 hours
          signedVideoUrls.push(signedUrl);
          console.log(`Generated signed URL for segment ${i + 1}: ${videoUrl} -> ${signedUrl}`);
        } else {
          // External URL - use as-is
          signedVideoUrls.push(videoUrl);
          console.log(`Using external URL for segment ${i + 1}: ${videoUrl}`);
        }
      }
      
      // Add outro video to the end of the video list  
      try {
        // Try to find outro.mp4 in the public object storage
        const objectStorageService = new ObjectStorageService();
        const outroFile = await objectStorageService.searchPublicObject('outro.mp4');
        
        if (outroFile) {
          console.log("Found outro.mp4 in object storage, generating signed URL...");
          // Generate signed URL for the outro video to ensure external API access
          const signedOutroUrl = await objectStorageService.signObjectURL({
            bucketName: outroFile.bucket.name,
            objectName: outroFile.name,
            method: "GET",
            ttlSec: 7200
          });
          signedVideoUrls.push(signedOutroUrl);
          console.log("Added outro video to merge with signed URL from object storage:", signedOutroUrl);
        } else {
          console.log("outro.mp4 not found in object storage, using fallback URL");
          // Fallback to host-based URL for development
          const host = req.get('host') || 'localhost:5000';
          const fallbackOutroUrl = host.includes('localhost') ? `http://${host}/public-objects/outro.mp4` : `https://${host}/public-objects/outro.mp4`;
          signedVideoUrls.push(fallbackOutroUrl);
          console.log("Using fallback outro video URL:", fallbackOutroUrl);
        }
      } catch (error) {
        console.error("Failed to handle outro video:", error);
        // Final fallback to host-based URL
        const host = req.get('host') || 'localhost:5000';
        const fallbackOutroUrl = host.includes('localhost') ? `http://${host}/public-objects/outro.mp4` : `https://${host}/public-objects/outro.mp4`;
        signedVideoUrls.push(fallbackOutroUrl);
        console.log("Using final fallback outro video URL:", fallbackOutroUrl);
      }
      
      console.log("Signed video URLs for FFMPEG merge (including outro):", signedVideoUrls);
      
      // Convert audio URL to signed URL if it's an internal object storage URL
      let finalAudioUrl = project.audioUrl; // Use original audio URL from project
      if (finalAudioUrl.startsWith('/objects/')) {
        // Internal object storage URL - convert to signed URL
        finalAudioUrl = await objectStorageService.getSignedUrlForPath(finalAudioUrl, 7200); // 2 hours
        console.log("Generated signed URL for audio:", project.audioUrl, "->", finalAudioUrl);
      } else {
        console.log("Using external audio URL:", finalAudioUrl);
      }
      console.log("Final audio URL for FFMPEG merge:", finalAudioUrl);
      
      // Get subtitle URL from project
      let subtitleUrl: string | undefined;
      if (project.subtitleFileUrl) {
        if (project.subtitleFileUrl.startsWith('/public-objects/')) {
          // Public object URL - convert to full URL accessible by FFMPEG
          const host = req.get('host') || 'localhost:5000';
          subtitleUrl = host.includes('localhost') ? `http://${host}${project.subtitleFileUrl}` : `https://${host}${project.subtitleFileUrl}`;
          console.log("Generated public URL for subtitles:", project.subtitleFileUrl, "->", subtitleUrl);
        } else if (project.subtitleFileUrl.startsWith('/objects/')) {
          // Legacy private object URL - convert to signed URL (for backward compatibility)
          subtitleUrl = await objectStorageService.getSignedUrlForPath(project.subtitleFileUrl, 7200); // 2 hours
          console.log("Generated signed URL for legacy subtitles:", project.subtitleFileUrl, "->", subtitleUrl);
        } else {
          // External URL - use as-is
          subtitleUrl = project.subtitleFileUrl;
          console.log("Using external subtitle URL:", subtitleUrl);
        }
      }
      console.log("Subtitle URL for FFMPEG merge:", subtitleUrl || "Not provided");
      
      let finalVideo;
      let savedFinalVideoUrl: string;
      try {
        // Get watermark URL for branding
        const watermarkUrl = await getWatermarkUrl();
        
        finalVideo = await mergeVideos(signedVideoUrls, finalAudioUrl, subtitleUrl, watermarkUrl || undefined);
        console.log("Final video merge successful:", finalVideo.download_url);
        
        // Try to save the final video to object storage
        console.log("Saving final video to object storage...");
        const objectStorageService = new ObjectStorageService();
        
        try {
          savedFinalVideoUrl = await objectStorageService.uploadVideoFromUrl(
            finalVideo.download_url,
            `final_video_${Date.now()}.mp4`
          );
          console.log("Final video saved to storage:", savedFinalVideoUrl);
        } catch (storageError) {
          console.warn("Failed to save video to object storage, using temporary URL:", storageError);
          // Fallback: use the FFMPEG download URL temporarily
          // Note: This URL may expire after some time
          savedFinalVideoUrl = finalVideo.download_url;
          
          await storage.addGenerationLog({
            projectId: req.params.id,
            step: "video_generation",
            message: `Video generated successfully but storage failed. Using temporary URL: ${(storageError as Error).message}`,
            status: "warning",
            metadata: { 
              temporaryUrl: finalVideo.download_url,
              storageError: (storageError as Error).message
            }
          });
        }
      } catch (mergeError) {
        console.error("Final video merge failed:", mergeError);
        await storage.addGenerationLog({
          projectId: req.params.id,
          step: "video_generation",
          message: `Final video merge failed: ${(mergeError as Error).message}`,
          status: "error",
          metadata: { 
            error: (mergeError as Error).message,
            videosAttempted: allVideoUrls
          }
        });
        throw new Error(`Final video merge failed: ${(mergeError as Error).message}`);
      }

      await storage.updateProject(req.params.id, {
        finalVideoUrl: savedFinalVideoUrl,
        isCompleted: true,
        currentStep: 6,
        generationStatus: 'completed' as any,
      });

      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: "Video generation completed",
        status: "completed",
        metadata: { finalVideoUrl: savedFinalVideoUrl }
      });

      // Complete video processing in queue
      await videoQueueService.completeVideoGeneration(req.params.id, true);

      res.json({ finalVideoUrl: savedFinalVideoUrl });
    } catch (error) {
      console.error("Generate video error:", error);
      const errorMessage = (error as Error).message;
      
      // Mark generation as failed
      await storage.updateProject(req.params.id, {
        generationStatus: 'failed' as any,
        currentStep: 3, // Reset to step 3 so user can try again
      });
      
      await storage.addGenerationLog({
        projectId: req.params.id,
        step: "video_generation",
        message: `Video generation failed: ${errorMessage}`,
        status: "error",
        metadata: { error: errorMessage }
      });

      // Complete video processing in queue (mark as failed)
      if (isInQueue) {
        await videoQueueService.completeVideoGeneration(req.params.id, false);
      }
      
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

  // Get video queue status
  app.get("/api/video-queue/status", async (req, res) => {
    try {
      const stats = await videoQueueService.getQueueStats();
      res.json(stats);
    } catch (error) {
      console.error("Queue status error:", error);
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  // Get queue position for a specific project
  app.get("/api/projects/:id/queue-position", async (req, res) => {
    try {
      const position = await videoQueueService.getQueuePosition(req.params.id);
      res.json({ queuePosition: position });
    } catch (error) {
      console.error("Queue position error:", error);
      res.status(500).json({ error: "Failed to get queue position" });
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
      const { imageUrl, ...restData } = req.body;
      
      // Download and store the image permanently
      console.log("Downloading and storing character image for library...");
      const storedImage = await downloadAndStoreImage(imageUrl, "saved-characters");
      console.log("Image stored successfully:", storedImage.storedUrl);
      
      const characterData = {
        ...restData,
        imageUrl: storedImage.storedUrl,
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
