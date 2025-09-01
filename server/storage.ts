import { type User, type InsertUser, type Project, type InsertProject, type GenerationLog, type InsertGenerationLog, type SavedCharacter, type InsertSavedCharacter, users, projects, generationLogs, savedCharacters } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // Project methods
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByUser(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Generation log methods
  addGenerationLog(log: InsertGenerationLog): Promise<GenerationLog>;
  getGenerationLogs(projectId: string): Promise<GenerationLog[]>;

  // Saved character methods
  getSavedCharacters(userId: string): Promise<SavedCharacter[]>;
  saveCharacter(character: InsertSavedCharacter): Promise<SavedCharacter>;
  deleteSavedCharacter(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private projects: Map<string, Project>;
  private generationLogs: Map<string, GenerationLog>;
  private savedCharacters: Map<string, SavedCharacter>;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.generationLogs = new Map();
    this.savedCharacters = new Map();
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
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

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
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
      characterImageUrl: insertProject.characterImageUrl || null,
      characterType: insertProject.characterType || null,
      characterPrompt: insertProject.characterPrompt || null,
      scenePrompts: insertProject.scenePrompts || null,
      sceneImages: insertProject.sceneImages || null,
      audioSegments: insertProject.audioSegments || null,
      videoSegments: insertProject.videoSegments || null,
      finalVideoUrl: insertProject.finalVideoUrl || null,
      isCompleted: insertProject.isCompleted || false,
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

  async getProject(id: string): Promise<Project | undefined> {
    const result = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result[0];
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
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

  async addGenerationLog(insertLog: InsertGenerationLog): Promise<GenerationLog> {
    const result = await this.db.insert(generationLogs).values(insertLog).returning();
    return result[0];
  }

  async getGenerationLogs(projectId: string): Promise<GenerationLog[]> {
    return await this.db.select().from(generationLogs)
      .where(eq(generationLogs.projectId, projectId))
      .orderBy(generationLogs.createdAt);
  }

  async getSavedCharacters(userId: string): Promise<SavedCharacter[]> {
    return await this.db.select().from(savedCharacters)
      .where(eq(savedCharacters.userId, userId))
      .orderBy(savedCharacters.createdAt);
  }

  async saveCharacter(insertCharacter: InsertSavedCharacter): Promise<SavedCharacter> {
    const result = await this.db.insert(savedCharacters).values(insertCharacter).returning();
    return result[0];
  }

  async deleteSavedCharacter(id: string): Promise<boolean> {
    const result = await this.db.delete(savedCharacters).where(eq(savedCharacters.id, id));
    return result.length > 0;
  }
}

// Use database storage if DATABASE_URL is available, otherwise fallback to memory storage
let storage: IStorage;

try {
  if (process.env.DATABASE_URL) {
    storage = new DbStorage();
    console.log("Using database storage");
  } else {
    storage = new MemStorage();
    console.log("Using memory storage");
  }
} catch (error) {
  console.warn("Database connection failed, using memory storage:", error);
  storage = new MemStorage();
}

export { storage };
