import { db } from "./db";
import { sql } from "drizzle-orm";

export async function initializeDatabase() {
  try {
    console.log("Initializing database schema...");
    
    // Create users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "username" text NOT NULL,
        "password" text NOT NULL,
        "email" text NOT NULL,
        "avatar_url" text DEFAULT '/public-objects/avatars/anonymous.png',
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_username_unique" UNIQUE("username"),
        CONSTRAINT "users_email_unique" UNIQUE("email")
      );
    `);

    // Create projects table  
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "projects" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "current_step" integer DEFAULT 1 NOT NULL,
        "audio_url" text,
        "audio_type" text,
        "audio_prompt" text,
        "audio_tags" text,
        "audio_lyrics" text,
        "character_image_url" text,
        "character_type" text,
        "character_prompt" text,
        "scene_prompts" jsonb,
        "scene_images" jsonb,
        "audio_segments" jsonb,
        "video_segments" jsonb,
        "final_video_url" text,
        "is_completed" boolean DEFAULT false,
        "generation_id" varchar,
        "generation_status" text,
        "generation_started_at" timestamp,
        "generation_timeout_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    // Create other tables
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "generation_logs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "step" text NOT NULL,
        "message" text NOT NULL,
        "status" text NOT NULL,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "saved_characters" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "name" text NOT NULL,
        "prompt" text NOT NULL,
        "image_url" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "songs" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" varchar NOT NULL,
        "title" text NOT NULL,
        "url" text NOT NULL,
        "duration" integer NOT NULL,
        "tags" text,
        "lyrics" text,
        "prompt" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "video_queue" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" varchar NOT NULL,
        "user_id" varchar NOT NULL,
        "status" text NOT NULL,
        "queue_position" integer NOT NULL,
        "started_at" timestamp,
        "completed_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
    `);

    console.log("Database schema initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
}