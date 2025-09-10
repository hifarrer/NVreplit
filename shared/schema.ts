import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Plans table needs to be defined before users since users references it
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  features: jsonb("features").notNull().$type<string[]>(), // Array of feature strings
  monthlyPrice: integer("monthly_price").notNull(), // Price in cents
  yearlyPrice: integer("yearly_price").notNull(), // Price in cents
  stripeMonthlyPriceId: text("stripe_monthly_price_id"),
  stripeYearlyPriceId: text("stripe_yearly_price_id"),
  credits: integer("credits").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  googleId: text("google_id").unique(),
  avatarUrl: text("avatar_url").default("/public-objects/avatars/anonymous.png"),
  planId: varchar("plan_id").references(() => plans.id),
  creditsUsed: integer("credits_used").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  currentStep: integer("current_step").default(1).notNull(),
  audioUrl: text("audio_url"),
  audioType: text("audio_type"), // 'uploaded' | 'generated'
  audioPrompt: text("audio_prompt"),
  audioTags: text("audio_tags"),
  audioLyrics: text("audio_lyrics"),
  audioDuration: integer("audio_duration"), // Duration in seconds
  addSubtitles: boolean("add_subtitles").default(false), // Whether to add subtitles
  subtitleFileUrl: text("subtitle_file_url"), // URL to .ass subtitle file
  kieTaskId: text("kie_task_id"), // KIE.ai task ID for getting timestamped lyrics
  kieAudioId: text("kie_audio_id"), // KIE.ai audio ID for getting timestamped lyrics
  characterImageUrl: text("character_image_url"),
  characterType: text("character_type"), // 'uploaded' | 'generated'
  characterPrompt: text("character_prompt"),
  makeCharacterSing: boolean("make_character_sing").default(true),
  scenePrompts: jsonb("scene_prompts"), // Array of scene prompts
  sceneImages: jsonb("scene_images"), // Array of generated scene image URLs
  audioSegments: jsonb("audio_segments"), // Array of split audio URLs
  videoSegments: jsonb("video_segments"), // Array of generated video URLs
  finalVideoUrl: text("final_video_url"),
  isCompleted: boolean("is_completed").default(false),
  // Video generation tracking
  generationId: varchar("generation_id"), // Unique identifier for each generation attempt
  generationStatus: text("generation_status"), // 'idle' | 'generating' | 'completed' | 'failed'
  generationStartedAt: timestamp("generation_started_at"),
  generationTimeoutAt: timestamp("generation_timeout_at"), // 30 minutes from start
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const generationLogs = pgTable("generation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  step: text("step").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(), // 'started' | 'progress' | 'completed' | 'error'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const savedCharacters = pgTable("saved_characters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const videoQueue = pgTable("video_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  status: text("status").notNull(), // 'queued' | 'processing' | 'completed' | 'failed'
  queuePosition: integer("queue_position").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const songs = pgTable("songs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  duration: integer("duration").notNull(), // Duration in seconds
  tags: text("tags"),
  lyrics: text("lyrics"),
  prompt: text("prompt"),
  subtitleFileUrl: text("subtitle_file_url"), // URL to .ass subtitle file
  kieTaskId: text("kie_task_id"), // KIE.ai task ID for getting timestamped lyrics
  kieAudioId: text("kie_audio_id"), // KIE.ai audio ID for getting timestamped lyrics
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Video generation configuration table
export const videoGenerationConfig = pgTable("video_generation_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoDurationSeconds: integer("video_duration_seconds").notNull().unique(),
  numberOfAudioParts: integer("number_audio_parts").notNull(),
  numberOfScenesCreated: integer("number_scenes_created").notNull(),
  numberOfVideosRegularApi: integer("number_videos_regular_api").notNull(), // seedance model
  numberOfVideosLipsync: integer("number_videos_lipsync").notNull(), // multitalk model
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Application settings table for storing configuration like Stripe keys
export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value"),
  isSecret: boolean("is_secret").default(false).notNull(), // Flag for sensitive data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGenerationLogSchema = createInsertSchema(generationLogs).omit({
  id: true,
  createdAt: true,
});

export const insertSavedCharacterSchema = createInsertSchema(savedCharacters).omit({
  id: true,
  createdAt: true,
});

export const insertVideoQueueSchema = createInsertSchema(videoQueue).omit({
  id: true,
  createdAt: true,
});

export const insertSongSchema = createInsertSchema(songs).omit({
  id: true,
  createdAt: true,
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVideoGenerationConfigSchema = createInsertSchema(videoGenerationConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertGenerationLog = z.infer<typeof insertGenerationLogSchema>;
export type GenerationLog = typeof generationLogs.$inferSelect;
export type InsertSavedCharacter = z.infer<typeof insertSavedCharacterSchema>;
export type SavedCharacter = typeof savedCharacters.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertVideoQueue = z.infer<typeof insertVideoQueueSchema>;
export type VideoQueue = typeof videoQueue.$inferSelect;
export type InsertSong = z.infer<typeof insertSongSchema>;
export type Song = typeof songs.$inferSelect;
export type InsertVideoGenerationConfig = z.infer<typeof insertVideoGenerationConfigSchema>;
export type VideoGenerationConfig = typeof videoGenerationConfig.$inferSelect;
