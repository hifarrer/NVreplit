import { type User, type InsertUser, type Project, type InsertProject, type GenerationLog, type InsertGenerationLog, type SavedCharacter, type InsertSavedCharacter, type Plan, type InsertPlan, type VideoQueue, type InsertVideoQueue, type Song, type InsertSong, type VideoGenerationConfig, type InsertVideoGenerationConfig, users, projects, generationLogs, savedCharacters, plans, videoQueue, songs, videoGenerationConfig } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, asc, sql } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserGoogleId(id: string, googleId: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;

  // Project methods
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByUser(userId: string): Promise<Project[]>;
  getUserProjects(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  deleteProjectWithLogs(id: string): Promise<boolean>;

  // Generation log methods
  addGenerationLog(log: InsertGenerationLog): Promise<GenerationLog>;
  getGenerationLogs(projectId: string): Promise<GenerationLog[]>;
  deleteGenerationLogsByProject(projectId: string): Promise<boolean>;

  // Saved character methods
  getSavedCharacters(userId: string): Promise<SavedCharacter[]>;
  saveCharacter(character: InsertSavedCharacter): Promise<SavedCharacter>;
  deleteSavedCharacter(id: string): Promise<boolean>;

  // Video queue methods
  addToVideoQueue(entry: InsertVideoQueue): Promise<VideoQueue>;
  getActiveVideoCount(): Promise<number>;
  getQueuePosition(projectId: string): Promise<number | null>;
  startVideoProcessing(projectId: string): Promise<boolean>;
  completeVideoProcessing(projectId: string, status: 'completed' | 'failed'): Promise<boolean>;
  cleanupStaleEntries(): Promise<void>;

  // Song methods
  getSongs(userId: string): Promise<Song[]>;
  addSong(song: InsertSong): Promise<Song>;
  deleteSong(id: string): Promise<boolean>;

  // Video generation config methods
  getVideoGenerationConfig(durationSeconds: number): Promise<VideoGenerationConfig | undefined>;
  getAllVideoGenerationConfigs(): Promise<VideoGenerationConfig[]>;
  createVideoGenerationConfig(config: InsertVideoGenerationConfig): Promise<VideoGenerationConfig>;
  updateVideoGenerationConfig(id: string, updates: Partial<VideoGenerationConfig>): Promise<VideoGenerationConfig | undefined>;

  // Plan methods
  getAllPlans(): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, updates: Partial<Plan>): Promise<Plan | undefined>;
  deletePlan(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private projects: Map<string, Project>;
  private generationLogs: Map<string, GenerationLog>;
  private savedCharacters: Map<string, SavedCharacter>;
  private plans: Map<string, Plan>;
  private videoQueues: Map<string, VideoQueue>;
  private songs: Map<string, Song>;
  private videoGenerationConfigs: Map<string, VideoGenerationConfig>;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.generationLogs = new Map();
    this.savedCharacters = new Map();
    this.plans = new Map();
    this.videoQueues = new Map();
    this.songs = new Map();
    this.videoGenerationConfigs = new Map();
    
    // Initialize default video generation configs
    this.initializeDefaultConfigs();
  }

  private initializeDefaultConfigs() {
    const defaultConfigs = [
      { id: '1', videoDurationSeconds: 30, numberOfAudioParts: 3, numberOfScenesCreated: 3, numberOfVideosRegularApi: 2, numberOfVideosLipsync: 1 },
      { id: '2', videoDurationSeconds: 60, numberOfAudioParts: 6, numberOfScenesCreated: 6, numberOfVideosRegularApi: 3, numberOfVideosLipsync: 3 },
      { id: '3', videoDurationSeconds: 90, numberOfAudioParts: 9, numberOfScenesCreated: 9, numberOfVideosRegularApi: 5, numberOfVideosLipsync: 4 },
      { id: '4', videoDurationSeconds: 120, numberOfAudioParts: 12, numberOfScenesCreated: 12, numberOfVideosRegularApi: 6, numberOfVideosLipsync: 6 },
    ];
    
    defaultConfigs.forEach(config => {
      const now = new Date();
      this.videoGenerationConfigs.set(config.id, {
        ...config,
        createdAt: now,
        updatedAt: now
      });
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.googleId === googleId,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser,
      id,
      avatarUrl: insertUser.avatarUrl || null,
      googleId: insertUser.googleId || null,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      return undefined;
    }
    const updatedUser = { ...existingUser, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserGoogleId(id: string, googleId: string): Promise<void> {
    const existingUser = this.users.get(id);
    if (existingUser) {
      const updatedUser = { ...existingUser, googleId };
      this.users.set(id, updatedUser);
    }
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (project) => project.userId === userId,
    );
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    return Array.from(this.projects.values()).filter(
      (project) => project.userId === userId,
    );
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = new Date();
    const project: Project = { 
      ...insertProject, 
      id,
      description: insertProject.description || null,
      currentStep: insertProject.currentStep || 1,
      audioUrl: insertProject.audioUrl || null,
      audioType: insertProject.audioType || null,
      audioPrompt: insertProject.audioPrompt || null,
      audioTags: insertProject.audioTags || null,
      audioLyrics: insertProject.audioLyrics || null,
      audioDuration: insertProject.audioDuration || null,
      addSubtitles: insertProject.addSubtitles !== undefined ? insertProject.addSubtitles : false,
      subtitleFileUrl: insertProject.subtitleFileUrl || null,
      kieTaskId: insertProject.kieTaskId || null,
      kieAudioId: insertProject.kieAudioId || null,
      characterImageUrl: insertProject.characterImageUrl || null,
      characterType: insertProject.characterType || null,
      characterPrompt: insertProject.characterPrompt || null,
      makeCharacterSing: insertProject.makeCharacterSing !== undefined ? insertProject.makeCharacterSing : true,
      scenePrompts: insertProject.scenePrompts || null,
      sceneImages: insertProject.sceneImages || null,
      audioSegments: insertProject.audioSegments || null,
      videoSegments: insertProject.videoSegments || null,
      finalVideoUrl: insertProject.finalVideoUrl || null,
      isCompleted: insertProject.isCompleted || false,
      // Video generation tracking fields
      generationId: insertProject.generationId || null,
      generationStatus: insertProject.generationStatus || null,
      generationStartedAt: insertProject.generationStartedAt || null,
      generationTimeoutAt: insertProject.generationTimeoutAt || null,
      createdAt: now,
      updatedAt: now
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const existing = this.projects.get(id);
    if (!existing) return undefined;

    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async deleteProjectWithLogs(id: string): Promise<boolean> {
    // Delete generation logs first
    await this.deleteGenerationLogsByProject(id);
    // Then delete project
    return this.deleteProject(id);
  }

  async addGenerationLog(insertLog: InsertGenerationLog): Promise<GenerationLog> {
    const id = randomUUID();
    const log: GenerationLog = {
      ...insertLog,
      id,
      metadata: insertLog.metadata || null,
      createdAt: new Date()
    };
    this.generationLogs.set(id, log);
    return log;
  }

  async getGenerationLogs(projectId: string): Promise<GenerationLog[]> {
    return Array.from(this.generationLogs.values())
      .filter((log) => log.projectId === projectId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async deleteGenerationLogsByProject(projectId: string): Promise<boolean> {
    const logs = Array.from(this.generationLogs.values()).filter(log => log.projectId === projectId);
    logs.forEach(log => this.generationLogs.delete(log.id));
    return logs.length > 0;
  }

  async getSavedCharacters(userId: string): Promise<SavedCharacter[]> {
    return Array.from(this.savedCharacters.values())
      .filter((character) => character.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async saveCharacter(insertCharacter: InsertSavedCharacter): Promise<SavedCharacter> {
    const id = randomUUID();
    const character: SavedCharacter = {
      ...insertCharacter,
      id,
      createdAt: new Date()
    };
    this.savedCharacters.set(id, character);
    return character;
  }

  async deleteSavedCharacter(id: string): Promise<boolean> {
    return this.savedCharacters.delete(id);
  }

  async addToVideoQueue(insertEntry: InsertVideoQueue): Promise<VideoQueue> {
    const id = randomUUID();
    const entry: VideoQueue = {
      ...insertEntry,
      id,
      startedAt: insertEntry.startedAt || null,
      completedAt: insertEntry.completedAt || null,
      createdAt: new Date()
    };
    this.videoQueues.set(id, entry);
    return entry;
  }

  async getActiveVideoCount(): Promise<number> {
    return Array.from(this.videoQueues.values())
      .filter(entry => entry.status === 'processing').length;
  }

  async getQueuePosition(projectId: string): Promise<number | null> {
    const entry = Array.from(this.videoQueues.values()).find(e => e.projectId === projectId);
    return entry ? entry.queuePosition : null;
  }

  async startVideoProcessing(projectId: string): Promise<boolean> {
    const entry = Array.from(this.videoQueues.values()).find(e => e.projectId === projectId);
    if (entry && entry.status === 'queued') {
      entry.status = 'processing';
      entry.startedAt = new Date();
      this.videoQueues.set(entry.id, entry);
      return true;
    }
    return false;
  }

  async completeVideoProcessing(projectId: string, status: 'completed' | 'failed'): Promise<boolean> {
    const entry = Array.from(this.videoQueues.values()).find(e => e.projectId === projectId);
    if (entry) {
      entry.status = status;
      entry.completedAt = new Date();
      this.videoQueues.set(entry.id, entry);
      return true;
    }
    return false;
  }

  async cleanupStaleEntries(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const staleEntries = Array.from(this.videoQueues.values())
      .filter(entry => 
        entry.status === 'processing' && 
        entry.startedAt && 
        entry.startedAt < cutoff
      );
    
    staleEntries.forEach(entry => {
      entry.status = 'failed';
      entry.completedAt = new Date();
      this.videoQueues.set(entry.id, entry);
    });
  }

  async getSongs(userId: string): Promise<Song[]> {
    return Array.from(this.songs.values()).filter(song => song.userId === userId);
  }

  async addSong(insertSong: InsertSong): Promise<Song> {
    const id = randomUUID();
    const song: Song = {
      ...insertSong,
      id,
      prompt: insertSong.prompt || null,
      tags: insertSong.tags || null,
      lyrics: insertSong.lyrics || null,
      subtitleFileUrl: insertSong.subtitleFileUrl || null,
      kieTaskId: insertSong.kieTaskId || null,
      kieAudioId: insertSong.kieAudioId || null,
      createdAt: new Date()
    };
    this.songs.set(id, song);
    return song;
  }

  async deleteSong(id: string): Promise<boolean> {
    return this.songs.delete(id);
  }

  async getVideoGenerationConfig(durationSeconds: number): Promise<VideoGenerationConfig | undefined> {
    return Array.from(this.videoGenerationConfigs.values()).find(
      config => config.videoDurationSeconds === durationSeconds
    );
  }

  async getAllVideoGenerationConfigs(): Promise<VideoGenerationConfig[]> {
    return Array.from(this.videoGenerationConfigs.values());
  }

  async createVideoGenerationConfig(insertConfig: InsertVideoGenerationConfig): Promise<VideoGenerationConfig> {
    const id = randomUUID();
    const now = new Date();
    const config: VideoGenerationConfig = {
      ...insertConfig,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.videoGenerationConfigs.set(id, config);
    return config;
  }

  async updateVideoGenerationConfig(id: string, updates: Partial<VideoGenerationConfig>): Promise<VideoGenerationConfig | undefined> {
    const existing = this.videoGenerationConfigs.get(id);
    if (!existing) {
      return undefined;
    }
    const updatedConfig = { ...existing, ...updates, updatedAt: new Date() };
    this.videoGenerationConfigs.set(id, updatedConfig);
    return updatedConfig;
  }

  // Plan methods
  async getAllPlans(): Promise<Plan[]> {
    return Array.from(this.plans.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getActivePlans(): Promise<Plan[]> {
    return Array.from(this.plans.values()).filter(plan => plan.isActive).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    return this.plans.get(id);
  }

  async createPlan(insertPlan: InsertPlan): Promise<Plan> {
    const id = randomUUID();
    const now = new Date();
    const plan: Plan = {
      ...insertPlan,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.plans.set(id, plan);
    return plan;
  }

  async updatePlan(id: string, updates: Partial<Plan>): Promise<Plan | undefined> {
    const existing = this.plans.get(id);
    if (!existing) {
      return undefined;
    }
    const updatedPlan = { ...existing, ...updates, updatedAt: new Date() };
    this.plans.set(id, updatedPlan);
    return updatedPlan;
  }

  async deletePlan(id: string): Promise<boolean> {
    return this.plans.delete(id);
  }
}

// Database Storage Implementation
export class DbStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    try {
      // Handle the case where DATABASE_URL might just be the database name
      const connectionString = process.env.DATABASE_URL!.includes('postgresql://') 
        ? process.env.DATABASE_URL!
        : `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=require`;
      
      const client = postgres(connectionString);
      this.db = drizzle(client);
    } catch (error) {
      throw new Error("Failed to connect to database: " + (error as Error).message);
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await this.db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async updateUserGoogleId(id: string, googleId: string): Promise<void> {
    await this.db.update(users)
      .set({ googleId })
      .where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return await this.db.select().from(users);
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.db.delete(users).where(eq(users.id, id));
    return result.length > 0;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const result = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result[0];
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
    return await this.db.select().from(projects).where(eq(projects.userId, userId));
  }

  async getUserProjects(userId: string): Promise<Project[]> {
    return await this.db.select().from(projects).where(eq(projects.userId, userId));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const result = await this.db.insert(projects).values(insertProject).returning();
    return result[0];
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const result = await this.db.update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return result[0];
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await this.db.delete(projects).where(eq(projects.id, id));
    return result.length > 0;
  }

  async deleteProjectWithLogs(id: string): Promise<boolean> {
    try {
      // Use a transaction to ensure both operations succeed or fail together
      await this.db.transaction(async (tx) => {
        // First delete generation logs
        await tx.delete(generationLogs).where(eq(generationLogs.projectId, id));
        // Then delete the project
        await tx.delete(projects).where(eq(projects.id, id));
      });
      return true;
    } catch (error) {
      console.error("Transaction failed:", error);
      return false;
    }
  }

  async addGenerationLog(insertLog: InsertGenerationLog): Promise<GenerationLog> {
    const result = await this.db.insert(generationLogs).values(insertLog).returning();
    return result[0];
  }

  async getGenerationLogs(projectId: string): Promise<GenerationLog[]> {
    return await this.db.select().from(generationLogs)
      .where(eq(generationLogs.projectId, projectId))
      .orderBy(asc(generationLogs.createdAt));
  }

  async deleteGenerationLogsByProject(projectId: string): Promise<boolean> {
    const result = await this.db.delete(generationLogs).where(eq(generationLogs.projectId, projectId));
    return result.length > 0;
  }

  async getSavedCharacters(userId: string): Promise<SavedCharacter[]> {
    return await this.db.select().from(savedCharacters)
      .where(eq(savedCharacters.userId, userId))
      .orderBy(asc(savedCharacters.createdAt));
  }

  async saveCharacter(insertCharacter: InsertSavedCharacter): Promise<SavedCharacter> {
    const result = await this.db.insert(savedCharacters).values(insertCharacter).returning();
    return result[0];
  }

  async deleteSavedCharacter(id: string): Promise<boolean> {
    const result = await this.db.delete(savedCharacters).where(eq(savedCharacters.id, id));
    return result.length > 0;
  }

  async addToVideoQueue(insertEntry: InsertVideoQueue): Promise<VideoQueue> {
    const result = await this.db.insert(videoQueue).values(insertEntry).returning();
    return result[0];
  }

  async getActiveVideoCount(): Promise<number> {
    const result = await this.db.select()
      .from(videoQueue)
      .where(eq(videoQueue.status, 'processing'));
    return result.length;
  }

  async getQueuePosition(projectId: string): Promise<number | null> {
    const result = await this.db.select()
      .from(videoQueue)
      .where(eq(videoQueue.projectId, projectId));
    return result.length > 0 ? result[0].queuePosition : null;
  }

  async startVideoProcessing(projectId: string): Promise<boolean> {
    const result = await this.db.update(videoQueue)
      .set({ 
        status: 'processing',
        startedAt: sql`NOW()`
      })
      .where(eq(videoQueue.projectId, projectId))
      .returning();
    return result.length > 0;
  }

  async completeVideoProcessing(projectId: string, status: 'completed' | 'failed'): Promise<boolean> {
    const result = await this.db.update(videoQueue)
      .set({ 
        status,
        completedAt: sql`NOW()`
      })
      .where(eq(videoQueue.projectId, projectId))
      .returning();
    return result.length > 0;
  }

  async cleanupStaleEntries(): Promise<void> {
    await this.db.update(videoQueue)
      .set({ 
        status: 'failed',
        completedAt: sql`NOW()`
      })
      .where(sql`${videoQueue.status} = 'processing' AND ${videoQueue.startedAt} < NOW() - INTERVAL '30 minutes'`);
  }

  async getSongs(userId: string): Promise<Song[]> {
    return await this.db.select()
      .from(songs)
      .where(eq(songs.userId, userId))
      .orderBy(asc(songs.createdAt));
  }

  async addSong(insertSong: InsertSong): Promise<Song> {
    const result = await this.db.insert(songs)
      .values({
        ...insertSong,
        createdAt: sql`NOW()`
      })
      .returning();
    return result[0];
  }

  async deleteSong(id: string): Promise<boolean> {
    const result = await this.db.delete(songs)
      .where(eq(songs.id, id))
      .returning();
    return result.length > 0;
  }

  async getVideoGenerationConfig(durationSeconds: number): Promise<VideoGenerationConfig | undefined> {
    try {
      const result = await this.db.select()
        .from(videoGenerationConfig)
        .where(eq(videoGenerationConfig.videoDurationSeconds, durationSeconds))
        .limit(1);
      
      if (result[0]) {
        return result[0];
      }
      
      // If no exact match, find the closest config or create default configs
      const allConfigs = await this.db.select()
        .from(videoGenerationConfig)
        .orderBy(asc(videoGenerationConfig.videoDurationSeconds));
      
      // If database is completely empty, use fallback configs
      if (allConfigs.length === 0) {
        console.warn('No video generation configs found in database, using fallback');
        throw new Error('Database empty, triggering fallback');
      }
      
      // Find the appropriate config based on duration
      let selectedConfig = allConfigs[allConfigs.length - 1]; // Default to largest config
      for (const config of allConfigs) {
        if (durationSeconds <= config.videoDurationSeconds) {
          selectedConfig = config;
          break;
        }
      }
      
      return selectedConfig;
    } catch (error) {
      console.warn('Database error getting video config, using fallback:', error);
      // Fallback to hardcoded config if database fails
      const configs = [
        { videoDurationSeconds: 30, numberOfAudioParts: 3, numberOfScenesCreated: 3, numberOfVideosRegularApi: 2, numberOfVideosLipsync: 1 },
        { videoDurationSeconds: 60, numberOfAudioParts: 6, numberOfScenesCreated: 6, numberOfVideosRegularApi: 3, numberOfVideosLipsync: 3 },
        { videoDurationSeconds: 90, numberOfAudioParts: 9, numberOfScenesCreated: 9, numberOfVideosRegularApi: 5, numberOfVideosLipsync: 4 },
        { videoDurationSeconds: 120, numberOfAudioParts: 12, numberOfScenesCreated: 12, numberOfVideosRegularApi: 6, numberOfVideosLipsync: 6 }
      ];
      
      let selectedConfig = configs[configs.length - 1];
      for (const config of configs) {
        if (durationSeconds <= config.videoDurationSeconds) {
          selectedConfig = config;
          break;
        }
      }
      
      return {
        id: 'fallback',
        videoDurationSeconds: selectedConfig.videoDurationSeconds,
        numberOfAudioParts: selectedConfig.numberOfAudioParts,
        numberOfScenesCreated: selectedConfig.numberOfScenesCreated,
        numberOfVideosRegularApi: selectedConfig.numberOfVideosRegularApi,
        numberOfVideosLipsync: selectedConfig.numberOfVideosLipsync,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  }

  async getAllVideoGenerationConfigs(): Promise<VideoGenerationConfig[]> {
    try {
      return await this.db.select()
        .from(videoGenerationConfig)
        .orderBy(asc(videoGenerationConfig.videoDurationSeconds));
    } catch (error) {
      console.warn('Database error getting all video configs:', error);
      return [];
    }
  }


  async createVideoGenerationConfig(insertConfig: InsertVideoGenerationConfig): Promise<VideoGenerationConfig> {
    const result = await this.db.insert(videoGenerationConfig)
      .values(insertConfig)
      .returning();
    return result[0];
  }

  async updateVideoGenerationConfig(id: string, updates: Partial<VideoGenerationConfig>): Promise<VideoGenerationConfig | undefined> {
    const result = await this.db.update(videoGenerationConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(videoGenerationConfig.id, id))
      .returning();
    return result[0] || undefined;
  }

  async initializeVideoGenerationConfigs(): Promise<void> {
    try {
      // Check if configs already exist
      const existingConfigs = await this.db.select()
        .from(videoGenerationConfig)
        .limit(1);

      if (existingConfigs.length > 0) {
        console.log('Video generation configs already exist, skipping initialization');
        return;
      }

      console.log('Initializing default video generation configurations...');
      
      // Insert default configurations
      const defaultConfigs = [
        { videoDurationSeconds: 30, numberOfAudioParts: 3, numberOfScenesCreated: 3, numberOfVideosRegularApi: 2, numberOfVideosLipsync: 1 },
        { videoDurationSeconds: 60, numberOfAudioParts: 6, numberOfScenesCreated: 6, numberOfVideosRegularApi: 3, numberOfVideosLipsync: 3 },
        { videoDurationSeconds: 90, numberOfAudioParts: 9, numberOfScenesCreated: 9, numberOfVideosRegularApi: 5, numberOfVideosLipsync: 4 },
        { videoDurationSeconds: 120, numberOfAudioParts: 12, numberOfScenesCreated: 12, numberOfVideosRegularApi: 6, numberOfVideosLipsync: 6 }
      ];

      await this.db.insert(videoGenerationConfig).values(defaultConfigs);
      console.log('✅ Default video generation configurations initialized successfully');
    } catch (error) {
      console.warn('Failed to initialize video generation configs:', error);
    }
  }

  // Plan methods
  async getAllPlans(): Promise<Plan[]> {
    return await this.db.select().from(plans).orderBy(asc(plans.name));
  }

  async getActivePlans(): Promise<Plan[]> {
    return await this.db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.name));
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    const result = await this.db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return result[0];
  }

  async createPlan(plan: InsertPlan): Promise<Plan> {
    const result = await this.db.insert(plans).values(plan).returning();
    return result[0];
  }

  async updatePlan(id: string, updates: Partial<Plan>): Promise<Plan | undefined> {
    const result = await this.db
      .update(plans)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return result[0];
  }

  async deletePlan(id: string): Promise<boolean> {
    const result = await this.db.delete(plans).where(eq(plans.id, id)).returning();
    return result.length > 0;
  }
}

// Use database storage if DATABASE_URL is available, otherwise fallback to memory storage
let storage: IStorage;

// Initialize storage synchronously first, then async initialize configs
try {
  // Use database storage if PostgreSQL environment variables are available
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
    storage = new DbStorage();
    console.log("Using database storage");
    // Initialize video generation configs asynchronously
    (storage as DbStorage).initializeVideoGenerationConfigs().catch(error => {
      console.warn("Failed to initialize video generation configs:", error);
    });
  } else {
    storage = new MemStorage();
    console.log("Using memory storage");
  }
} catch (error) {
  console.warn("Database connection failed, using memory storage:", error);
  storage = new MemStorage();
}

export { storage };
