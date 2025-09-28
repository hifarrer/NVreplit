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
  emailVerified: boolean("email_verified").default(false).notNull(),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationTokenExpiresAt: timestamp("email_verification_token_expires_at"),
  googleId: text("google_id").unique(),
  avatarUrl: text("avatar_url").default("/public-objects/avatars/anonymous.png"),
  planId: varchar("plan_id").references(() => plans.id),
  creditsUsed: integer("credits_used").default(0).notNull(),
  bonusCredits: integer("bonus_credits").default(0).notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  referredBy: varchar("referred_by").references(() => users.id), // Who referred this user
  referralCode: text("referral_code").unique(), // User's personal referral code (auto-generated)
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
  // Mux video streaming integration
  muxAssetId: text("mux_asset_id"), // Mux asset ID for video streaming
  muxPlaybackId: text("mux_playback_id"), // Mux playback ID for HLS streaming
  muxAssetStatus: text("mux_asset_status"), // 'preparing' | 'ready' | 'errored'
  isCompleted: boolean("is_completed").default(false),
  likesCount: integer("likes_count").default(0).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(), // Admin can feature videos for home page
  // Video generation tracking
  generationId: varchar("generation_id"), // Unique identifier for each generation attempt
  generationStatus: text("generation_status"), // 'idle' | 'generating' | 'completed' | 'failed'
  generationStartedAt: timestamp("generation_started_at"),
  generationTimeoutAt: timestamp("generation_timeout_at"), // 30 minutes from start
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const videoLikes = pgTable("video_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const videoComments = pgTable("video_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
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

// Referrals table to track successful referrals and credit rewards
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").references(() => users.id).notNull(), // Who made the referral
  referredUserId: varchar("referred_user_id").references(() => users.id).notNull(), // Who was referred
  creditsAwarded: integer("credits_awarded").default(0).notNull(), // Credits given to referrer
  isRewarded: boolean("is_rewarded").default(false).notNull(), // Whether credits have been awarded
  rewardedAt: timestamp("rewarded_at"), // When credits were awarded
  planUpgradeAt: timestamp("plan_upgrade_at"), // When referred user upgraded to paid plan
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Affiliates table to track users with affiliate status
export const affiliates = pgTable("affiliates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(), // User who is an affiliate
  affiliateCode: text("affiliate_code").notNull().unique(), // Custom affiliate code (similar to referral code)
  commissionRate: integer("commission_rate").default(30).notNull(), // Commission percentage (30%)
  totalEarnings: integer("total_earnings").default(0).notNull(), // Total earnings in cents
  totalPaidOut: integer("total_paid_out").default(0).notNull(), // Total amount already paid out in cents
  paypalEmail: text("paypal_email"), // PayPal email for payouts
  isActive: boolean("is_active").default(true).notNull(), // Whether affiliate is active
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Affiliate signups to track users who signed up via affiliate links
export const affiliateSignups = pgTable("affiliate_signups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  affiliateId: varchar("affiliate_id").references(() => affiliates.id).notNull(), // Which affiliate
  signupUserId: varchar("signup_user_id").references(() => users.id).notNull().unique(), // User who signed up (unique to prevent duplicate bonuses)
  bonusCreditsAwarded: integer("bonus_credits_awarded").default(500).notNull(), // Credits given to new user
  isCreditsAwarded: boolean("is_credits_awarded").default(false).notNull(), // Whether credits were given
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Affiliate earnings to track revenue from subscriptions
export const affiliateEarnings = pgTable("affiliate_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  affiliateId: varchar("affiliate_id").references(() => affiliates.id).notNull(), // Which affiliate
  signupUserId: varchar("signup_user_id").references(() => users.id).notNull(), // User who subscribed
  subscriptionAmount: integer("subscription_amount").notNull(), // Subscription amount in cents
  commissionAmount: integer("commission_amount").notNull(), // Commission earned in cents (30% of subscription)
  subscriptionPeriod: text("subscription_period").notNull(), // "monthly" or "yearly"
  planName: text("plan_name").notNull(), // Which plan they subscribed to
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Affiliate payouts to track payout requests
export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  affiliateId: varchar("affiliate_id").references(() => affiliates.id).notNull(), // Which affiliate
  requestedAmount: integer("requested_amount").notNull(), // Amount requested in cents
  paypalEmail: text("paypal_email").notNull(), // PayPal email for payout
  status: text("status").default("pending").notNull(), // "pending", "completed", "failed"
  completedAt: timestamp("completed_at"), // When payout was completed
  createdAt: timestamp("created_at").defaultNow().notNull(),
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

export const insertVideoLikeSchema = createInsertSchema(videoLikes).omit({
  id: true,
  createdAt: true,
});

export const insertVideoCommentSchema = createInsertSchema(videoComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true,
  createdAt: true,
});

export const insertAffiliateSchema = createInsertSchema(affiliates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAffiliateSignupSchema = createInsertSchema(affiliateSignups).omit({
  id: true,
  createdAt: true,
});

export const insertAffiliateEarningSchema = createInsertSchema(affiliateEarnings).omit({
  id: true,
  createdAt: true,
});

export const insertAffiliatePayoutSchema = createInsertSchema(affiliatePayouts).omit({
  id: true,
  createdAt: true,
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
export type InsertVideoLike = z.infer<typeof insertVideoLikeSchema>;
export type VideoLike = typeof videoLikes.$inferSelect;
export type InsertVideoComment = z.infer<typeof insertVideoCommentSchema>;
export type VideoComment = typeof videoComments.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;
export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;
export type Affiliate = typeof affiliates.$inferSelect;
export type InsertAffiliateSignup = z.infer<typeof insertAffiliateSignupSchema>;
export type AffiliateSignup = typeof affiliateSignups.$inferSelect;
export type InsertAffiliateEarning = z.infer<typeof insertAffiliateEarningSchema>;
export type AffiliateEarning = typeof affiliateEarnings.$inferSelect;
export type InsertAffiliatePayout = z.infer<typeof insertAffiliatePayoutSchema>;
export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;
