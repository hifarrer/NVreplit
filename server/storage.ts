import { type User, type InsertUser, type Project, type InsertProject, type GenerationLog, type InsertGenerationLog, type SavedCharacter, type InsertSavedCharacter, type Plan, type InsertPlan, type VideoQueue, type InsertVideoQueue, type Song, type InsertSong, type VideoGenerationConfig, type InsertVideoGenerationConfig, type VideoLike, type InsertVideoLike, type VideoComment, type InsertVideoComment, type Referral, type InsertReferral, type Affiliate, type InsertAffiliate, type AffiliateSignup, type InsertAffiliateSignup, type AffiliateEarning, type InsertAffiliateEarning, type AffiliatePayout, type InsertAffiliatePayout, type PostizPost, type InsertPostizPost, type OauthClient, type InsertOauthClient, type OauthAuthorizationCode, type InsertOauthAuthorizationCode, type OauthAccessToken, type InsertOauthAccessToken, type BannedUser, type InsertBannedUser, type GiftSubscription, type InsertGiftSubscription, type GreetingCard, type InsertGreetingCard, type CouponCode, type InsertCouponCode, type CouponRedemption, type InsertCouponRedemption, type ImagekitBackup, type InsertImagekitBackup, users, projects, generationLogs, savedCharacters, plans, videoQueue, songs, videoGenerationConfig, appSettings, videoLikes, videoComments, referrals, affiliates, affiliateSignups, affiliateEarnings, affiliatePayouts, postizPosts, oauthClients, oauthAuthorizationCodes, oauthAccessTokens, bannedUsers, giftSubscriptions, greetingCards, couponCodes, couponRedemptions, imagekitBackups } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, asc, desc, sql, and, inArray, ilike } from "drizzle-orm";
import { withDbRetry } from "./db";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserGoogleId(id: string, googleId: string): Promise<void>;
  verifyUserEmail(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;
  
  // Credit methods
  getUserWithPlan(id: string): Promise<(User & { plan?: Plan }) | undefined>;
  getUserCreditsRemaining(userId: string): Promise<number>;
  canUserAffordCredits(userId: string, credits: number): Promise<boolean>;
  deductUserCredits(userId: string, credits: number): Promise<boolean>;
  getFreePlan(): Promise<Plan | undefined>;

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
  getAllSavedCharacters(): Promise<SavedCharacter[]>;
  getAllSavedCharactersWithUsers(): Promise<Array<SavedCharacter & { user: { id: string; username: string; email: string } }>>;
  getAllSavedCharactersWithUsersPaginated(options: { page: number; limit: number }): Promise<{
    characters: Array<SavedCharacter & { user: { id: string; username: string; email: string } }>;
    totalCount: number;
  }>;
  saveCharacter(character: InsertSavedCharacter): Promise<SavedCharacter>;
  updateSavedCharacter(id: string, userId: string, updates: Partial<SavedCharacter>): Promise<SavedCharacter | undefined>;
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
  getAllSongs(): Promise<Song[]>;
  getSong(id: string): Promise<Song | undefined>;
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
  getPlanById(id: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, updates: Partial<Plan>): Promise<Plan | undefined>;
  deletePlan(id: string): Promise<boolean>;

  // Admin Video Management methods
  getAllVideosForAdmin(): Promise<Project[]>;
  updateVideoAsAdmin(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteVideoAsAdmin(id: string): Promise<boolean>;
  
  // Optimized admin methods with database-level pagination and search
  getAdminUsersPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    planFilter?: string;
  }): Promise<{
    users: Array<{
      id: string;
      username: string;
      email: string;
      emailVerified: boolean;
      avatarUrl: string | null;
      createdAt: Date;
      projectCount: number;
      songCount: number;
      planName: string;
      planId: string;
      creditsUsed: number;
      creditsLimit: number;
      planCredits: number;
      bonusCredits: number;
    }>;
    totalCount: number;
  }>;
  
  getAdminVideosPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    statusFilter?: string;
  }): Promise<{
    videos: Project[];
    totalCount: number;
  }>;
  
  // App settings methods
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string, isSecret?: boolean): Promise<void>;
  getAllSettings(): Promise<{ key: string; value: string; isSecret: boolean }[]>;

  // Video likes methods
  likeVideo(projectId: string, userId: string): Promise<boolean>;
  unlikeVideo(projectId: string, userId: string): Promise<boolean>;
  isVideoLikedByUser(projectId: string, userId: string): Promise<boolean>;
  getVideoLikesCount(projectId: string): Promise<number>;

  // Video comments methods
  addComment(comment: InsertVideoComment): Promise<VideoComment>;
  getComments(projectId: string): Promise<VideoComment[]>;
  deleteComment(commentId: string, userId: string): Promise<boolean>;
  getAllComments(): Promise<VideoComment[]>;
  adminDeleteComment(commentId: string): Promise<boolean>;

  // Referral methods
  generateReferralCode(userId: string): Promise<string>;
  setReferralCode(userId: string, code: string): Promise<boolean>;
  getUserByReferralCode(code: string): Promise<User | undefined>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  getUserReferrals(userId: string): Promise<Referral[]>;
  getReferralStats(userId: string): Promise<{ totalReferrals: number; totalCreditsEarned: number; pendingReferrals: number }>;
  awardReferralCredits(referralId: string, credits: number): Promise<boolean>;
  addCreditsToUser(userId: string, credits: number): Promise<boolean>;
  updateReferral(referralId: string, updates: Partial<Referral>): Promise<boolean>;

  // Affiliate methods
  createAffiliate(affiliate: InsertAffiliate): Promise<Affiliate>;
  getAffiliate(userId: string): Promise<Affiliate | undefined>;
  getAffiliateByCode(code: string): Promise<Affiliate | undefined>;
  updateAffiliate(affiliateId: string, updates: Partial<Affiliate>): Promise<Affiliate | undefined>;
  setAffiliateCode(userId: string, code: string): Promise<boolean>;
  createAffiliateSignup(signup: InsertAffiliateSignup): Promise<AffiliateSignup>;
  getAffiliateSignups(affiliateId: string): Promise<AffiliateSignup[]>;
  createAffiliateEarning(earning: InsertAffiliateEarning): Promise<AffiliateEarning>;
  getAffiliateEarnings(affiliateId: string): Promise<AffiliateEarning[]>;
  getAffiliateStats(affiliateId: string): Promise<{ totalSignups: number; totalEarnings: number; pendingBalance: number; totalPaidOut: number }>;
  createAffiliatePayout(payout: InsertAffiliatePayout): Promise<AffiliatePayout>;
  getAffiliatePayouts(affiliateId: string): Promise<AffiliatePayout[]>;
  updateAffiliatePayout(payoutId: string, updates: Partial<AffiliatePayout>): Promise<AffiliatePayout | undefined>;

  // Postiz posts methods
  createPostizPost(post: InsertPostizPost): Promise<PostizPost>;
  getPostizPostByProjectId(projectId: string): Promise<PostizPost | undefined>;
  updatePostizPost(projectId: string, updates: Partial<PostizPost>): Promise<PostizPost | undefined>;
  getAllProjects(): Promise<Project[]>;

  // OAuth methods
  createOauthClient(client: InsertOauthClient): Promise<OauthClient>;
  getOauthClient(clientId: string): Promise<OauthClient | undefined>;
  createOauthAuthorizationCode(code: InsertOauthAuthorizationCode): Promise<OauthAuthorizationCode>;
  getOauthAuthorizationCode(code: string): Promise<OauthAuthorizationCode | undefined>;
  deleteOauthAuthorizationCode(code: string): Promise<boolean>;
  createOauthAccessToken(token: InsertOauthAccessToken): Promise<OauthAccessToken>;
  getOauthAccessToken(token: string): Promise<OauthAccessToken | undefined>;
  deleteExpiredOauthTokens(): Promise<void>;

  // Banned user methods
  isEmailBanned(email: string): Promise<boolean>;
  banUser(email: string, bannedBy: string, reason?: string): Promise<void>;
  unbanUser(email: string): Promise<void>;
  getAllBannedUsers(): Promise<BannedUser[]>;

  // Gift subscription methods
  createGiftSubscription(gift: InsertGiftSubscription): Promise<GiftSubscription>;
  getGiftSubscriptionByCode(code: string): Promise<GiftSubscription | undefined>;
  getGiftSubscriptionsByPurchaser(userId: string): Promise<GiftSubscription[]>;
  updateGiftSubscription(id: string, updates: Partial<GiftSubscription>): Promise<GiftSubscription | undefined>;
  redeemGiftSubscription(code: string, userId: string): Promise<GiftSubscription | undefined>;

  // Greeting card methods
  createGreetingCard(card: InsertGreetingCard): Promise<GreetingCard>;
  getGreetingCardByToken(token: string): Promise<GreetingCard | undefined>;
  getPendingGreetingCardsForToday(): Promise<GreetingCard[]>;
  updateGreetingCard(id: string, updates: Partial<GreetingCard>): Promise<GreetingCard | undefined>;

  // Coupon code methods
  createCouponCode(coupon: InsertCouponCode): Promise<CouponCode>;
  getCouponCodeByCode(code: string): Promise<CouponCode | undefined>;
  getCouponCode(id: string): Promise<CouponCode | undefined>;
  getAllCouponCodes(): Promise<CouponCode[]>;
  updateCouponCode(id: string, updates: Partial<CouponCode>): Promise<CouponCode | undefined>;
  deleteCouponCode(id: string): Promise<boolean>;
  redeemCouponCode(code: string, userId: string): Promise<{ success: boolean; message: string; creditsAwarded?: number }>;
  hasUserRedeemedCoupon(couponId: string, userId: string): Promise<boolean>;
  getCouponRedemptions(couponId: string): Promise<CouponRedemption[]>;

  // ImageKit backup methods
  getBackedUpPaths(): Promise<Set<string>>;
  recordImagekitBackup(backup: InsertImagekitBackup): Promise<ImagekitBackup>;
  getImagekitBackupByPath(originalPath: string): Promise<ImagekitBackup | null>;
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
  private appSettingsStorage: Map<string, { value: string; isSecret: boolean }>;
  private videoLikesStorage: Map<string, VideoLike>;
  private videoCommentsStorage: Map<string, VideoComment>;
  private referralsStorage: Map<string, Referral>;
  private affiliatesStorage: Map<string, Affiliate>;
  private affiliateSignupsStorage: Map<string, AffiliateSignup>;
  private affiliateEarningsStorage: Map<string, AffiliateEarning>;
  private affiliatePayoutsStorage: Map<string, AffiliatePayout>;
  private bannedUsersStorage: Map<string, BannedUser>;
  private giftSubscriptionsStorage: Map<string, GiftSubscription>;
  private imagekitBackupsStorage: Map<string, ImagekitBackup>;

  constructor() {
    this.users = new Map();
    this.projects = new Map();
    this.generationLogs = new Map();
    this.savedCharacters = new Map();
    this.plans = new Map();
    this.videoQueues = new Map();
    this.songs = new Map();
    this.videoGenerationConfigs = new Map();
    this.appSettingsStorage = new Map();
    this.videoLikesStorage = new Map();
    this.videoCommentsStorage = new Map();
    this.referralsStorage = new Map();
    this.affiliatesStorage = new Map();
    this.affiliateSignupsStorage = new Map();
    this.affiliateEarningsStorage = new Map();
    this.affiliatePayoutsStorage = new Map();
    this.bannedUsersStorage = new Map();
    this.giftSubscriptionsStorage = new Map();
    this.imagekitBackupsStorage = new Map();
    
    // Initialize default video generation configs
    this.initializeDefaultConfigs();
  }

  private initializeDefaultConfigs() {
    // All configs now use 6-second segments for both lipsync and non-lipsync models
    // numberOfAudioParts and numberOfScenesCreated = ceil(duration / 6)
    const defaultConfigs = [
      { id: '1', videoDurationSeconds: 30, numberOfAudioParts: 5, numberOfScenesCreated: 5, numberOfVideosRegularApi: 3, numberOfVideosLipsync: 2 },
      { id: '2', videoDurationSeconds: 60, numberOfAudioParts: 10, numberOfScenesCreated: 10, numberOfVideosRegularApi: 5, numberOfVideosLipsync: 5 },
      { id: '3', videoDurationSeconds: 90, numberOfAudioParts: 15, numberOfScenesCreated: 15, numberOfVideosRegularApi: 8, numberOfVideosLipsync: 7 },
      { id: '4', videoDurationSeconds: 120, numberOfAudioParts: 20, numberOfScenesCreated: 20, numberOfVideosRegularApi: 10, numberOfVideosLipsync: 10 },
      { id: '5', videoDurationSeconds: 150, numberOfAudioParts: 25, numberOfScenesCreated: 25, numberOfVideosRegularApi: 13, numberOfVideosLipsync: 12 },
      { id: '6', videoDurationSeconds: 180, numberOfAudioParts: 30, numberOfScenesCreated: 30, numberOfVideosRegularApi: 15, numberOfVideosLipsync: 15 },
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

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.stripeCustomerId === stripeCustomerId,
    );
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.emailVerificationToken === token,
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

  async verifyUserEmail(id: string): Promise<void> {
    const existingUser = this.users.get(id);
    if (existingUser) {
      const updatedUser = { 
        ...existingUser, 
        emailVerified: true, 
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null
      };
      this.users.set(id, updatedUser);
    }
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async getUserWithPlan(id: string): Promise<(User & { plan?: Plan }) | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    let plan: Plan | undefined;
    if (user.planId) {
      plan = await this.getPlan(user.planId);
    }
    if (!plan) {
      plan = await this.getFreePlan();
    }
    
    return { ...user, plan };
  }

  async getUserCreditsRemaining(userId: string): Promise<number> {
    const userWithPlan = await this.getUserWithPlan(userId);
    if (!userWithPlan || !userWithPlan.plan) return 0;
    
    const creditsLimit = userWithPlan.plan.credits;
    const bonusCredits = userWithPlan.bonusCredits || 0;
    const creditsUsed = userWithPlan.creditsUsed || 0;
    return Math.max(0, creditsLimit + bonusCredits - creditsUsed);
  }

  async canUserAffordCredits(userId: string, credits: number): Promise<boolean> {
    const remaining = await this.getUserCreditsRemaining(userId);
    return remaining >= credits;
  }

  async deductUserCredits(userId: string, credits: number): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    
    const canAfford = await this.canUserAffordCredits(userId, credits);
    if (!canAfford) return false;
    
    const newCreditsUsed = (user.creditsUsed || 0) + credits;
    await this.updateUser(userId, { creditsUsed: newCreditsUsed });
    return true;
  }

  async getFreePlan(): Promise<Plan | undefined> {
    const plans = Array.from(this.plans.values());
    return plans.find(p => p.name.toLowerCase() === 'free' && p.isActive);
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

  async getAllSavedCharacters(): Promise<SavedCharacter[]> {
    return Array.from(this.savedCharacters.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAllSavedCharactersWithUsers(): Promise<Array<SavedCharacter & { user: { id: string; username: string; email: string } }>> {
    const allCharacters = Array.from(this.savedCharacters.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return allCharacters.map(char => {
      const user = this.users.get(char.userId);
      return {
        ...char,
        user: {
          id: user?.id || char.userId,
          username: user?.username || 'Unknown',
          email: user?.email || 'unknown@example.com',
        },
      };
    });
  }

  async getAllSavedCharactersWithUsersPaginated(options: { page: number; limit: number }): Promise<{
    characters: Array<SavedCharacter & { user: { id: string; username: string; email: string } }>;
    totalCount: number;
  }> {
    const { page, limit } = options;
    const allCharacters = Array.from(this.savedCharacters.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const totalCount = allCharacters.length;
    const offset = (page - 1) * limit;
    const paginatedCharacters = allCharacters.slice(offset, offset + limit);
    
    return {
      characters: paginatedCharacters.map(char => {
        const user = this.users.get(char.userId);
        return {
          ...char,
          user: {
            id: user?.id || char.userId,
            username: user?.username || 'Unknown',
            email: user?.email || 'unknown@example.com',
          },
        };
      }),
      totalCount,
    };
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

  async updateSavedCharacter(id: string, userId: string, updates: Partial<SavedCharacter>): Promise<SavedCharacter | undefined> {
    const existing = this.savedCharacters.get(id);
    if (!existing || existing.userId !== userId) {
      return undefined;
    }
    const updatedCharacter = { ...existing, ...updates };
    this.savedCharacters.set(id, updatedCharacter);
    return updatedCharacter;
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

  async getAllSongs(): Promise<Song[]> {
    return Array.from(this.songs.values());
  }

  async getSong(id: string): Promise<Song | undefined> {
    return this.songs.get(id);
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

  async getPlanById(id: string): Promise<Plan | undefined> {
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

  // Admin Video Management methods
  async getAllVideosForAdmin(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateVideoAsAdmin(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    const updated = { ...project, ...updates, updatedAt: new Date() };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteVideoAsAdmin(id: string): Promise<boolean> {
    // Delete associated generation logs first
    for (const [logId, log] of this.generationLogs) {
      if (log.projectId === id) {
        this.generationLogs.delete(logId);
      }
    }
    return this.projects.delete(id);
  }

  async getAdminUsersPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    planFilter?: string;
  }): Promise<{
    users: Array<{
      id: string;
      username: string;
      email: string;
      emailVerified: boolean;
      avatarUrl: string | null;
      createdAt: Date;
      projectCount: number;
      songCount: number;
      planName: string;
      planId: string;
      creditsUsed: number;
      creditsLimit: number;
      planCredits: number;
      bonusCredits: number;
    }>;
    totalCount: number;
  }> {
    const { page, limit, search, planFilter } = options;
    let allUsers = Array.from(this.users.values());
    
    if (search) {
      const searchLower = search.toLowerCase();
      allUsers = allUsers.filter(u => 
        u.username.toLowerCase().includes(searchLower) || 
        u.email.toLowerCase().includes(searchLower)
      );
    }
    
    if (planFilter && planFilter !== "all") {
      const usersWithPlans = await Promise.all(allUsers.map(async (u) => {
        const userWithPlan = await this.getUserWithPlan(u.id);
        return { user: u, planName: userWithPlan?.plan?.name || "Free" };
      }));
      allUsers = usersWithPlans.filter(u => u.planName === planFilter).map(u => u.user);
    }
    
    const totalCount = allUsers.length;
    const offset = (page - 1) * limit;
    const paginatedUsers = allUsers.slice(offset, offset + limit);
    
    const usersWithStats = await Promise.all(paginatedUsers.map(async (user) => {
      const projects = await this.getUserProjects(user.id);
      const songs = await this.getSongs(user.id);
      const userWithPlan = await this.getUserWithPlan(user.id);
      
      const planCredits = userWithPlan?.plan?.credits || 0;
      const bonusCredits = userWithPlan?.bonusCredits || 0;
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        projectCount: projects.length,
        songCount: songs.length,
        planName: userWithPlan?.plan?.name || "Free",
        planId: userWithPlan?.planId || "",
        creditsUsed: userWithPlan?.creditsUsed || 0,
        creditsLimit: planCredits + bonusCredits,
        planCredits: planCredits,
        bonusCredits: bonusCredits
      };
    }));
    
    return { users: usersWithStats, totalCount };
  }

  async getAdminVideosPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    statusFilter?: string;
  }): Promise<{
    videos: Project[];
    totalCount: number;
  }> {
    const { page, limit, search, statusFilter } = options;
    let allProjects = Array.from(this.projects.values())
      .filter(p => p.finalVideoUrl)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    if (search) {
      const searchLower = search.toLowerCase();
      allProjects = allProjects.filter(p => {
        const user = this.users.get(p.userId);
        return p.title.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.audioPrompt?.toLowerCase().includes(searchLower) ||
          user?.username.toLowerCase().includes(searchLower) ||
          p.userId.toLowerCase().includes(searchLower);
      });
    }
    
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "completed") {
        allProjects = allProjects.filter(p => p.currentStep === 7);
      } else if (statusFilter === "in-progress") {
        allProjects = allProjects.filter(p => p.currentStep < 7);
      } else if (statusFilter === "featured") {
        allProjects = allProjects.filter(p => p.isFeatured);
      }
    }
    
    const totalCount = allProjects.length;
    const offset = (page - 1) * limit;
    const paginatedVideos = allProjects.slice(offset, offset + limit);
    
    return { videos: paginatedVideos, totalCount };
  }
  
  // App settings methods
  async getSetting(key: string): Promise<string | null> {
    const setting = this.appSettingsStorage.get(key);
    return setting ? setting.value : null;
  }
  
  async setSetting(key: string, value: string, isSecret: boolean = false): Promise<void> {
    this.appSettingsStorage.set(key, { value, isSecret });
  }
  
  async getAllSettings(): Promise<{ key: string; value: string; isSecret: boolean }[]> {
    const settings: { key: string; value: string; isSecret: boolean }[] = [];
    for (const [key, data] of this.appSettingsStorage) {
      settings.push({ key, value: data.value, isSecret: data.isSecret });
    }
    return settings;
  }

  // Video likes methods
  async likeVideo(projectId: string, userId: string): Promise<boolean> {
    const likeKey = `${projectId}:${userId}`;
    
    // Check if already liked
    if (this.videoLikesStorage.has(likeKey)) {
      return false; // Already liked
    }
    
    // Add like
    const like: VideoLike = {
      id: randomUUID(),
      projectId,
      userId,
      createdAt: new Date()
    };
    this.videoLikesStorage.set(likeKey, like);
    
    // Increment likes count on project
    const project = this.projects.get(projectId);
    if (project) {
      project.likesCount = (project.likesCount || 0) + 1;
      this.projects.set(projectId, project);
    }
    
    return true;
  }

  async unlikeVideo(projectId: string, userId: string): Promise<boolean> {
    const likeKey = `${projectId}:${userId}`;
    
    if (!this.videoLikesStorage.has(likeKey)) {
      return false; // Not liked
    }
    
    // Remove like
    this.videoLikesStorage.delete(likeKey);
    
    // Decrement likes count on project
    const project = this.projects.get(projectId);
    if (project && project.likesCount > 0) {
      project.likesCount = project.likesCount - 1;
      this.projects.set(projectId, project);
    }
    
    return true;
  }

  async isVideoLikedByUser(projectId: string, userId: string): Promise<boolean> {
    const likeKey = `${projectId}:${userId}`;
    return this.videoLikesStorage.has(likeKey);
  }

  async getVideoLikesCount(projectId: string): Promise<number> {
    const project = this.projects.get(projectId);
    return project?.likesCount || 0;
  }

  // Video comments methods
  async addComment(comment: InsertVideoComment): Promise<VideoComment> {
    const newComment: VideoComment = {
      id: randomUUID(),
      projectId: comment.projectId,
      userId: comment.userId,
      content: comment.content,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.videoCommentsStorage.set(newComment.id, newComment);
    return newComment;
  }

  async getComments(projectId: string): Promise<VideoComment[]> {
    const comments: VideoComment[] = [];
    for (const comment of this.videoCommentsStorage.values()) {
      if (comment.projectId === projectId) {
        comments.push(comment);
      }
    }
    // Sort by creation date (newest first)
    return comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    const comment = this.videoCommentsStorage.get(commentId);
    if (!comment || comment.userId !== userId) {
      return false; // Comment doesn't exist or user doesn't own it
    }
    
    this.videoCommentsStorage.delete(commentId);
    return true;
  }

  async getAllComments(): Promise<VideoComment[]> {
    // Get all comments with user and video details
    const commentsWithDetails = await Promise.all(
      Array.from(this.videoCommentsStorage.values()).map(async (comment) => {
        const user = this.users.get(comment.userId);
        const project = this.projects.get(comment.projectId);
        const videoCreator = project ? this.users.get(project.userId) : null;
        
        return {
          ...comment,
          user: {
            id: comment.userId,
            username: user?.username || 'Unknown',
            avatarUrl: user?.avatarUrl || null
          },
          video: {
            id: comment.projectId,
            title: project?.title || 'Unknown Video',
            creator: {
              username: videoCreator?.username || 'Unknown'
            }
          }
        };
      })
    );
    
    return commentsWithDetails.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async adminDeleteComment(commentId: string): Promise<boolean> {
    const exists = this.videoCommentsStorage.has(commentId);
    if (!exists) {
      return false;
    }
    
    this.videoCommentsStorage.delete(commentId);
    return true;
  }

  // Referral methods implementation
  async generateReferralCode(userId: string): Promise<string> {
    // Generate a unique referral code
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      // Generate random 8-character code
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
      attempts++;
    } while (await this.getUserByReferralCode(code) && attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique referral code");
    }
    
    // Update user with the new referral code
    await this.setReferralCode(userId, code);
    return code;
  }

  async setReferralCode(userId: string, code: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    
    // Check if code is already taken by another user
    const existingUser = await this.getUserByReferralCode(code);
    if (existingUser && existingUser.id !== userId) {
      return false;
    }
    
    // Update user's referral code
    const updatedUser = { ...user, referralCode: code };
    this.users.set(userId, updatedUser);
    return true;
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.referralCode === code) {
        return user;
      }
    }
    return undefined;
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    const id = randomUUID();
    const newReferral: Referral = {
      id,
      ...referral,
      createdAt: new Date(),
    };
    this.referralsStorage.set(id, newReferral);
    return newReferral;
  }

  async getUserReferrals(userId: string): Promise<Referral[]> {
    const referrals: Referral[] = [];
    for (const referral of this.referralsStorage.values()) {
      if (referral.referrerId === userId) {
        referrals.push(referral);
      }
    }
    // Sort by creation date (newest first)
    return referrals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getReferralStats(userId: string): Promise<{ totalReferrals: number; totalCreditsEarned: number; pendingReferrals: number }> {
    const referrals = await this.getUserReferrals(userId);
    const totalReferrals = referrals.length;
    const totalCreditsEarned = referrals.reduce((sum, ref) => sum + ref.creditsAwarded, 0);
    const pendingReferrals = referrals.filter(ref => !ref.isRewarded && ref.planUpgradeAt).length;
    
    return { totalReferrals, totalCreditsEarned, pendingReferrals };
  }

  async awardReferralCredits(referralId: string, credits: number): Promise<boolean> {
    const referral = this.referralsStorage.get(referralId);
    if (!referral || referral.isRewarded) return false;
    
    // Update referral as rewarded
    const updatedReferral = {
      ...referral,
      creditsAwarded: credits,
      isRewarded: true,
      rewardedAt: new Date(),
    };
    this.referralsStorage.set(referralId, updatedReferral);
    
    // Add credits to referrer
    return await this.addCreditsToUser(referral.referrerId, credits);
  }

  async addCreditsToUser(userId: string, credits: number): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;
    
    // Reduce credits used (effectively adding credits)
    const newCreditsUsed = Math.max(0, user.creditsUsed - credits);
    const updatedUser = { ...user, creditsUsed: newCreditsUsed };
    this.users.set(userId, updatedUser);
    return true;
  }

  async updateReferral(referralId: string, updates: Partial<Referral>): Promise<boolean> {
    const referral = this.referralsStorage.get(referralId);
    if (!referral) return false;
    
    const updatedReferral = { ...referral, ...updates };
    this.referralsStorage.set(referralId, updatedReferral);
    return true;
  }

  // Affiliate methods implementation
  async createAffiliate(insertAffiliate: InsertAffiliate): Promise<Affiliate> {
    // Check for duplicate userId
    const existingAffiliate = await this.getAffiliate(insertAffiliate.userId);
    if (existingAffiliate) {
      throw new Error(`Affiliate already exists for userId: ${insertAffiliate.userId}`);
    }
    
    // Check for duplicate affiliate code (case-insensitive)
    if (insertAffiliate.affiliateCode) {
      const existingCodeAffiliate = await this.getAffiliateByCode(insertAffiliate.affiliateCode);
      if (existingCodeAffiliate) {
        throw new Error(`Affiliate code '${insertAffiliate.affiliateCode}' is already taken`);
      }
    }
    
    const id = randomUUID();
    const affiliate: Affiliate = {
      id,
      ...insertAffiliate,
      totalEarnings: insertAffiliate.totalEarnings || 0,
      totalPaidOut: insertAffiliate.totalPaidOut || 0,
      isActive: insertAffiliate.isActive !== undefined ? insertAffiliate.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.affiliatesStorage.set(id, affiliate);
    return affiliate;
  }

  async getAffiliate(userId: string): Promise<Affiliate | undefined> {
    for (const affiliate of this.affiliatesStorage.values()) {
      if (affiliate.userId === userId) {
        return affiliate;
      }
    }
    return undefined;
  }

  async getAffiliateByCode(code: string): Promise<Affiliate | undefined> {
    for (const affiliate of this.affiliatesStorage.values()) {
      if (affiliate.affiliateCode?.toLowerCase() === code.toLowerCase()) {
        return affiliate;
      }
    }
    return undefined;
  }

  async updateAffiliate(affiliateId: string, updates: Partial<Affiliate>): Promise<Affiliate | undefined> {
    const existing = this.affiliatesStorage.get(affiliateId);
    if (!existing) return undefined;

    const updatedAffiliate = { 
      ...existing, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.affiliatesStorage.set(affiliateId, updatedAffiliate);
    return updatedAffiliate;
  }

  async setAffiliateCode(userId: string, code: string): Promise<boolean> {
    try {
      const affiliate = await this.getAffiliate(userId);
      if (!affiliate) {
        console.warn(`No affiliate found for userId: ${userId}`);
        return false;
      }
      
      // Check if code is already taken by another affiliate (case-insensitive)
      const existingAffiliate = await this.getAffiliateByCode(code);
      if (existingAffiliate && existingAffiliate.id !== affiliate.id) {
        console.warn(`Affiliate code '${code}' is already taken by another affiliate`);
        return false;
      }
      
      // Update affiliate's code
      const result = await this.updateAffiliate(affiliate.id, { affiliateCode: code });
      return !!result;
    } catch (error) {
      console.error("Error setting affiliate code in MemStorage:", error);
      return false;
    }
  }

  async createAffiliateSignup(insertSignup: InsertAffiliateSignup): Promise<AffiliateSignup> {
    // Check for duplicate signupUserId to prevent duplicate signup bonuses
    const existingSignup = Array.from(this.affiliateSignupsStorage.values())
      .find(signup => signup.signupUserId === insertSignup.signupUserId);
    
    if (existingSignup) {
      throw new Error(`Signup with userId ${insertSignup.signupUserId} already exists`);
    }
    
    const id = randomUUID();
    const signup: AffiliateSignup = {
      id,
      ...insertSignup,
      createdAt: new Date()
    };
    this.affiliateSignupsStorage.set(id, signup);
    return signup;
  }

  async getAffiliateSignups(affiliateId: string): Promise<AffiliateSignup[]> {
    const signups: AffiliateSignup[] = [];
    for (const signup of this.affiliateSignupsStorage.values()) {
      if (signup.affiliateId === affiliateId) {
        signups.push(signup);
      }
    }
    // Sort by creation date (newest first)
    return signups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createAffiliateEarning(insertEarning: InsertAffiliateEarning): Promise<AffiliateEarning> {
    const id = randomUUID();
    const earning: AffiliateEarning = {
      id,
      ...insertEarning,
      createdAt: new Date()
    };
    this.affiliateEarningsStorage.set(id, earning);
    return earning;
  }

  async getAffiliateEarnings(affiliateId: string): Promise<AffiliateEarning[]> {
    const earnings: AffiliateEarning[] = [];
    for (const earning of this.affiliateEarningsStorage.values()) {
      if (earning.affiliateId === affiliateId) {
        earnings.push(earning);
      }
    }
    // Sort by creation date (newest first)
    return earnings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAffiliateStats(affiliateId: string): Promise<{ totalSignups: number; totalEarnings: number; pendingBalance: number; totalPaidOut: number }> {
    const signups = await this.getAffiliateSignups(affiliateId);
    const earnings = await this.getAffiliateEarnings(affiliateId);
    const payouts = await this.getAffiliatePayouts(affiliateId);
    
    const totalSignups = signups.length;
    const totalEarnings = earnings.reduce((sum, earning) => sum + earning.amount, 0);
    const totalPaidOut = payouts
      .filter(payout => payout.status === 'completed')
      .reduce((sum, payout) => sum + payout.amount, 0);
    const pendingBalance = totalEarnings - totalPaidOut;
    
    return { totalSignups, totalEarnings, pendingBalance, totalPaidOut };
  }

  async createAffiliatePayout(insertPayout: InsertAffiliatePayout): Promise<AffiliatePayout> {
    const id = randomUUID();
    const payout: AffiliatePayout = {
      id,
      ...insertPayout,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.affiliatePayoutsStorage.set(id, payout);
    return payout;
  }

  async getAffiliatePayouts(affiliateId: string): Promise<AffiliatePayout[]> {
    const payouts: AffiliatePayout[] = [];
    for (const payout of this.affiliatePayoutsStorage.values()) {
      if (payout.affiliateId === affiliateId) {
        payouts.push(payout);
      }
    }
    // Sort by creation date (newest first)
    return payouts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateAffiliatePayout(payoutId: string, updates: Partial<AffiliatePayout>): Promise<AffiliatePayout | undefined> {
    const existing = this.affiliatePayoutsStorage.get(payoutId);
    if (!existing) return undefined;

    const updatedPayout = { 
      ...existing, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.affiliatePayoutsStorage.set(payoutId, updatedPayout);
    return updatedPayout;
  }

  async createPostizPost(insertPost: InsertPostizPost): Promise<PostizPost> {
    throw new Error("Memory storage not supported for Postiz posts");
  }

  async getPostizPostByProjectId(projectId: string): Promise<PostizPost | undefined> {
    return undefined;
  }

  async updatePostizPost(projectId: string, updates: Partial<PostizPost>): Promise<PostizPost | undefined> {
    return undefined;
  }

  async getAllProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createOauthClient(client: InsertOauthClient): Promise<OauthClient> {
    throw new Error("OAuth not supported in MemStorage - use DbStorage");
  }

  async getOauthClient(clientId: string): Promise<OauthClient | undefined> {
    throw new Error("OAuth not supported in MemStorage - use DbStorage");
  }

  async createOauthAuthorizationCode(code: InsertOauthAuthorizationCode): Promise<OauthAuthorizationCode> {
    throw new Error("OAuth not supported in MemStorage - use DbStorage");
  }

  async getOauthAuthorizationCode(code: string): Promise<OauthAuthorizationCode | undefined> {
    throw new Error("OAuth not supported in MemStorage - use DbStorage");
  }

  async deleteOauthAuthorizationCode(code: string): Promise<boolean> {
    throw new Error("OAuth not supported in MemStorage - use DbStorage");
  }

  async createOauthAccessToken(token: InsertOauthAccessToken): Promise<OauthAccessToken> {
    throw new Error("OAuth not supported in MemStorage - use DbStorage");
  }

  async getOauthAccessToken(token: string): Promise<OauthAccessToken | undefined> {
    throw new Error("OAuth not supported in MemStorage - use DbStorage");
  }

  async deleteExpiredOauthTokens(): Promise<void> {
    throw new Error("OAuth not supported in MemStorage - use DbStorage");
  }

  // Banned user methods
  async isEmailBanned(email: string): Promise<boolean> {
    for (const bannedUser of this.bannedUsersStorage.values()) {
      if (bannedUser.email.toLowerCase() === email.toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  async banUser(email: string, bannedBy: string, reason?: string): Promise<void> {
    const id = randomUUID();
    const now = new Date();
    this.bannedUsersStorage.set(email.toLowerCase(), {
      id,
      email: email.toLowerCase(),
      reason: reason || null,
      bannedBy,
      createdAt: now
    });
  }

  async unbanUser(email: string): Promise<void> {
    this.bannedUsersStorage.delete(email.toLowerCase());
  }

  async getAllBannedUsers(): Promise<BannedUser[]> {
    return Array.from(this.bannedUsersStorage.values());
  }

  // Gift subscription methods
  async createGiftSubscription(gift: InsertGiftSubscription): Promise<GiftSubscription> {
    const id = randomUUID();
    const now = new Date();
    const giftSubscription: GiftSubscription = {
      ...gift,
      id,
      recipientName: gift.recipientName || null,
      personalMessage: gift.personalMessage || null,
      stripePaymentIntentId: gift.stripePaymentIntentId || null,
      stripeSessionId: gift.stripeSessionId || null,
      status: gift.status || 'pending',
      redeemedByUserId: gift.redeemedByUserId || null,
      redeemedAt: gift.redeemedAt || null,
      createdAt: now
    };
    this.giftSubscriptionsStorage.set(id, giftSubscription);
    return giftSubscription;
  }

  async getGiftSubscriptionByCode(code: string): Promise<GiftSubscription | undefined> {
    for (const gift of this.giftSubscriptionsStorage.values()) {
      if (gift.redemptionCode === code) {
        return gift;
      }
    }
    return undefined;
  }

  async getGiftSubscriptionsByPurchaser(userId: string): Promise<GiftSubscription[]> {
    return Array.from(this.giftSubscriptionsStorage.values())
      .filter(gift => gift.purchaserUserId === userId);
  }

  async updateGiftSubscription(id: string, updates: Partial<GiftSubscription>): Promise<GiftSubscription | undefined> {
    const existing = this.giftSubscriptionsStorage.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.giftSubscriptionsStorage.set(id, updated);
    return updated;
  }

  async redeemGiftSubscription(code: string, userId: string): Promise<GiftSubscription | undefined> {
    const gift = await this.getGiftSubscriptionByCode(code);
    if (!gift || gift.status !== 'paid') return undefined;
    const now = new Date();
    if (gift.expiresAt < now) return undefined;
    const updated: GiftSubscription = {
      ...gift,
      status: 'redeemed',
      redeemedByUserId: userId,
      redeemedAt: now
    };
    this.giftSubscriptionsStorage.set(gift.id, updated);
    return updated;
  }

  // Greeting card methods
  private greetingCardsStorage: Map<string, GreetingCard> = new Map();

  async createGreetingCard(card: InsertGreetingCard): Promise<GreetingCard> {
    const id = randomUUID();
    const now = new Date();
    const greetingCard: GreetingCard = {
      ...card,
      id,
      senderName: card.senderName || null,
      message: card.message || null,
      status: card.status || 'pending',
      sentAt: card.sentAt || null,
      createdAt: now
    };
    this.greetingCardsStorage.set(id, greetingCard);
    return greetingCard;
  }

  async getGreetingCardByToken(token: string): Promise<GreetingCard | undefined> {
    for (const card of this.greetingCardsStorage.values()) {
      if (card.uniqueToken === token) {
        return card;
      }
    }
    return undefined;
  }

  async getPendingGreetingCardsForToday(): Promise<GreetingCard[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    return Array.from(this.greetingCardsStorage.values())
      .filter(card => 
        card.status === 'pending' && 
        card.scheduledDate >= startOfDay && 
        card.scheduledDate < endOfDay
      );
  }

  async updateGreetingCard(id: string, updates: Partial<GreetingCard>): Promise<GreetingCard | undefined> {
    const existing = this.greetingCardsStorage.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.greetingCardsStorage.set(id, updated);
    return updated;
  }

  // Coupon code methods (MemStorage stub implementations)
  private couponCodesStorage: Map<string, CouponCode> = new Map();
  private couponRedemptionsStorage: Map<string, CouponRedemption> = new Map();

  async createCouponCode(coupon: InsertCouponCode): Promise<CouponCode> {
    const id = randomUUID();
    const newCoupon: CouponCode = {
      id,
      code: coupon.code,
      credits: coupon.credits,
      maxUses: coupon.maxUses ?? null,
      usesCount: coupon.usesCount ?? 0,
      isActive: coupon.isActive ?? true,
      expiresAt: coupon.expiresAt ?? null,
      createdAt: new Date(),
    };
    this.couponCodesStorage.set(id, newCoupon);
    return newCoupon;
  }

  async getCouponCodeByCode(code: string): Promise<CouponCode | undefined> {
    return Array.from(this.couponCodesStorage.values()).find(c => c.code === code);
  }

  async getCouponCode(id: string): Promise<CouponCode | undefined> {
    return this.couponCodesStorage.get(id);
  }

  async getAllCouponCodes(): Promise<CouponCode[]> {
    return Array.from(this.couponCodesStorage.values());
  }

  async updateCouponCode(id: string, updates: Partial<CouponCode>): Promise<CouponCode | undefined> {
    const existing = this.couponCodesStorage.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.couponCodesStorage.set(id, updated);
    return updated;
  }

  async deleteCouponCode(id: string): Promise<boolean> {
    return this.couponCodesStorage.delete(id);
  }

  async redeemCouponCode(code: string, userId: string): Promise<{ success: boolean; message: string; creditsAwarded?: number }> {
    const coupon = await this.getCouponCodeByCode(code);
    if (!coupon) {
      return { success: false, message: "Invalid code" };
    }
    if (!coupon.isActive) {
      return { success: false, message: "This code is no longer active" };
    }
    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
      return { success: false, message: "This code has expired" };
    }
    if (coupon.maxUses && coupon.usesCount >= coupon.maxUses) {
      return { success: false, message: "This code has reached its maximum uses" };
    }
    const alreadyRedeemed = await this.hasUserRedeemedCoupon(coupon.id, userId);
    if (alreadyRedeemed) {
      return { success: false, message: "You have already redeemed this code" };
    }
    
    // Add credits to user
    await this.addCreditsToUser(userId, coupon.credits);
    
    // Create redemption record
    const redemptionId = randomUUID();
    const redemption: CouponRedemption = {
      id: redemptionId,
      couponId: coupon.id,
      userId,
      creditsAwarded: coupon.credits,
      createdAt: new Date(),
    };
    this.couponRedemptionsStorage.set(redemptionId, redemption);
    
    // Update coupon uses count
    await this.updateCouponCode(coupon.id, { usesCount: coupon.usesCount + 1 });
    
    return { success: true, message: "Code redeemed successfully!", creditsAwarded: coupon.credits };
  }

  async hasUserRedeemedCoupon(couponId: string, userId: string): Promise<boolean> {
    return Array.from(this.couponRedemptionsStorage.values())
      .some(r => r.couponId === couponId && r.userId === userId);
  }

  async getCouponRedemptions(couponId: string): Promise<CouponRedemption[]> {
    return Array.from(this.couponRedemptionsStorage.values())
      .filter(r => r.couponId === couponId);
  }

  async getBackedUpPaths(): Promise<Set<string>> {
    return new Set(Array.from(this.imagekitBackupsStorage.values()).map(b => b.originalPath));
  }

  async recordImagekitBackup(backup: InsertImagekitBackup): Promise<ImagekitBackup> {
    const id = randomUUID();
    const newBackup: ImagekitBackup = {
      id,
      originalPath: backup.originalPath,
      imagekitUrl: backup.imagekitUrl,
      imagekitFileId: backup.imagekitFileId || null,
      fileType: backup.fileType,
      createdAt: new Date()
    };
    this.imagekitBackupsStorage.set(id, newBackup);
    return newBackup;
  }

  async getImagekitBackupByPath(originalPath: string): Promise<ImagekitBackup | null> {
    for (const backup of this.imagekitBackupsStorage.values()) {
      if (backup.originalPath === originalPath) {
        return backup;
      }
    }
    return null;
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

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId)).limit(1);
    return result[0];
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.emailVerificationToken, token)).limit(1);
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

  async verifyUserEmail(id: string): Promise<void> {
    await this.db.update(users)
      .set({ 
        emailVerified: true, 
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null
      })
      .where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return await this.db.select().from(users);
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      return await this.db.transaction(async (tx) => {
        // First, get all projects for this user to handle nested deletions
        const userProjects = await tx.select({ id: projects.id }).from(projects).where(eq(projects.userId, id));
        const projectIds = userProjects.map(p => p.id);

        // Delete in order to respect foreign key constraints
        
        // 1. Delete generation logs for user's projects
        if (projectIds.length > 0) {
          await tx.delete(generationLogs).where(inArray(generationLogs.projectId, projectIds));
        }
        
        // 2. Delete video likes for user's projects and by this user
        if (projectIds.length > 0) {
          await tx.delete(videoLikes).where(inArray(videoLikes.projectId, projectIds));
        }
        await tx.delete(videoLikes).where(eq(videoLikes.userId, id));
        
        // 3. Delete video comments for user's projects and by this user
        if (projectIds.length > 0) {
          await tx.delete(videoComments).where(inArray(videoComments.projectId, projectIds));
        }
        await tx.delete(videoComments).where(eq(videoComments.userId, id));
        
        // 4. Delete video queue entries for user's projects and by this user
        if (projectIds.length > 0) {
          await tx.delete(videoQueue).where(inArray(videoQueue.projectId, projectIds));
        }
        await tx.delete(videoQueue).where(eq(videoQueue.userId, id));
        
        // 5. Delete user's projects
        await tx.delete(projects).where(eq(projects.userId, id));
        
        // 6. Delete user's saved characters
        await tx.delete(savedCharacters).where(eq(savedCharacters.userId, id));
        
        // 7. Delete user's songs
        await tx.delete(songs).where(eq(songs.userId, id));
        
        // 8. Finally, delete the user
        const result = await tx.delete(users).where(eq(users.id, id)).returning({ id: users.id });
        return result.length > 0;
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }

  async getUserWithPlan(id: string): Promise<(User & { plan?: Plan }) | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    let plan: Plan | undefined;
    if (user.planId) {
      plan = await this.getPlan(user.planId);
    }
    if (!plan) {
      plan = await this.getFreePlan();
    }
    
    return { ...user, plan };
  }

  async getUserCreditsRemaining(userId: string): Promise<number> {
    const userWithPlan = await this.getUserWithPlan(userId);
    if (!userWithPlan || !userWithPlan.plan) return 0;
    
    const creditsLimit = userWithPlan.plan.credits;
    const bonusCredits = userWithPlan.bonusCredits || 0;
    const creditsUsed = userWithPlan.creditsUsed || 0;
    return Math.max(0, creditsLimit + bonusCredits - creditsUsed);
  }

  async canUserAffordCredits(userId: string, credits: number): Promise<boolean> {
    const remaining = await this.getUserCreditsRemaining(userId);
    return remaining >= credits;
  }

  async deductUserCredits(userId: string, credits: number): Promise<boolean> {
    return withDbRetry(async () => {
      const user = await this.getUser(userId);
      if (!user) return false;
      
      const canAfford = await this.canUserAffordCredits(userId, credits);
      if (!canAfford) return false;
      
      const newCreditsUsed = (user.creditsUsed || 0) + credits;
      await this.updateUser(userId, { creditsUsed: newCreditsUsed });
      return true;
    }, { operationName: 'deductUserCredits' });
  }

  async getFreePlan(): Promise<Plan | undefined> {
    const result = await this.db.select()
      .from(plans)
      .where(and(ilike(plans.name, 'free'), eq(plans.isActive, true)))
      .limit(1);
    return result[0];
  }

  async getProject(id: string): Promise<Project | undefined> {
    return withDbRetry(async () => {
      const result = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return result[0];
    }, { operationName: 'getProject' });
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
    return withDbRetry(async () => {
      const result = await this.db.update(projects)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return result[0];
    }, { operationName: 'updateProject' });
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await this.db.delete(projects).where(eq(projects.id, id));
    return result.length > 0;
  }

  async deleteProjectWithLogs(id: string): Promise<boolean> {
    try {
      // Use a transaction to ensure all operations succeed or fail together
      await this.db.transaction(async (tx) => {
        // First delete greeting cards that reference this project
        await tx.delete(greetingCards).where(eq(greetingCards.projectId, id));
        // Then delete generation logs
        await tx.delete(generationLogs).where(eq(generationLogs.projectId, id));
        // Finally delete the project
        await tx.delete(projects).where(eq(projects.id, id));
      });
      return true;
    } catch (error) {
      console.error("Transaction failed:", error);
      throw error; // Re-throw so the route can return proper error
    }
  }

  async addGenerationLog(insertLog: InsertGenerationLog): Promise<GenerationLog> {
    return withDbRetry(async () => {
      const result = await this.db.insert(generationLogs).values(insertLog).returning();
      return result[0];
    }, { operationName: 'addGenerationLog' });
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

  async getAllSavedCharacters(): Promise<SavedCharacter[]> {
    return await this.db.select().from(savedCharacters)
      .orderBy(asc(savedCharacters.createdAt));
  }

  async getAllSavedCharactersWithUsers(): Promise<Array<SavedCharacter & { user: { id: string; username: string; email: string } }>> {
    const characters = await this.db
      .select({
        id: savedCharacters.id,
        userId: savedCharacters.userId,
        name: savedCharacters.name,
        prompt: savedCharacters.prompt,
        imageUrl: savedCharacters.imageUrl,
        createdAt: savedCharacters.createdAt,
        username: users.username,
        userEmail: users.email,
      })
      .from(savedCharacters)
      .innerJoin(users, eq(savedCharacters.userId, users.id))
      .orderBy(desc(savedCharacters.createdAt));
    
    return characters.map(char => ({
      id: char.id,
      userId: char.userId,
      name: char.name,
      prompt: char.prompt,
      imageUrl: char.imageUrl,
      createdAt: char.createdAt,
      user: {
        id: char.userId,
        username: char.username,
        email: char.userEmail,
      },
    }));
  }

  async getAllSavedCharactersWithUsersPaginated(options: { page: number; limit: number }): Promise<{
    characters: Array<SavedCharacter & { user: { id: string; username: string; email: string } }>;
    totalCount: number;
  }> {
    const { page, limit } = options;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(savedCharacters);
    const totalCount = Number(countResult[0]?.count || 0);

    // Get paginated characters
    const characters = await this.db
      .select({
        id: savedCharacters.id,
        userId: savedCharacters.userId,
        name: savedCharacters.name,
        prompt: savedCharacters.prompt,
        imageUrl: savedCharacters.imageUrl,
        createdAt: savedCharacters.createdAt,
        username: users.username,
        userEmail: users.email,
      })
      .from(savedCharacters)
      .innerJoin(users, eq(savedCharacters.userId, users.id))
      .orderBy(desc(savedCharacters.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      characters: characters.map(char => ({
        id: char.id,
        userId: char.userId,
        name: char.name,
        prompt: char.prompt,
        imageUrl: char.imageUrl,
        createdAt: char.createdAt,
        user: {
          id: char.userId,
          username: char.username,
          email: char.userEmail,
        },
      })),
      totalCount,
    };
  }

  async saveCharacter(insertCharacter: InsertSavedCharacter): Promise<SavedCharacter> {
    const result = await this.db.insert(savedCharacters).values(insertCharacter).returning();
    return result[0];
  }

  async updateSavedCharacter(id: string, userId: string, updates: Partial<SavedCharacter>): Promise<SavedCharacter | undefined> {
    // First check if the character exists and belongs to the user
    const existing = await this.db.select().from(savedCharacters)
      .where(eq(savedCharacters.id, id))
      .limit(1);
    
    if (existing.length === 0 || existing[0].userId !== userId) {
      return undefined;
    }

    const result = await this.db.update(savedCharacters)
      .set(updates)
      .where(eq(savedCharacters.id, id))
      .returning();
    
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
    return withDbRetry(async () => {
      const result = await this.db.update(videoQueue)
        .set({ 
          status,
          completedAt: sql`NOW()`
        })
        .where(eq(videoQueue.projectId, projectId))
        .returning();
      return result.length > 0;
    }, { operationName: 'completeVideoProcessing' });
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

  async getAllSongs(): Promise<Song[]> {
    return await this.db.select()
      .from(songs)
      .orderBy(asc(songs.createdAt));
  }

  async getSong(id: string): Promise<Song | undefined> {
    const result = await this.db.select()
      .from(songs)
      .where(eq(songs.id, id));
    return result[0] || undefined;
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

  async getPlanById(id: string): Promise<Plan | undefined> {
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

  // Admin Video Management methods
  async getAllVideosForAdmin(): Promise<Project[]> {
    const result = await this.db
      .select()
      .from(projects)
      .orderBy(sql`${projects.createdAt} DESC`);
    return result;
  }

  async updateVideoAsAdmin(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const result = await this.db
      .update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return result[0];
  }

  async deleteVideoAsAdmin(id: string): Promise<boolean> {
    // Delete associated generation logs first
    await this.db.delete(generationLogs).where(eq(generationLogs.projectId, id));
    // Delete the project
    const result = await this.db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  }

  async getAdminUsersPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    planFilter?: string;
  }): Promise<{
    users: Array<{
      id: string;
      username: string;
      email: string;
      emailVerified: boolean;
      avatarUrl: string | null;
      createdAt: Date;
      projectCount: number;
      songCount: number;
      planName: string;
      planId: string;
      creditsUsed: number;
      creditsLimit: number;
      planCredits: number;
      bonusCredits: number;
    }>;
    totalCount: number;
  }> {
    const { page, limit, search, planFilter } = options;
    const offset = (page - 1) * limit;
    
    const conditions: any[] = [];
    
    if (search && search.trim()) {
      const searchLower = `%${search.toLowerCase().trim()}%`;
      conditions.push(
        sql`(LOWER(${users.username}) LIKE ${searchLower} OR LOWER(${users.email}) LIKE ${searchLower})`
      );
    }
    
    const allPlans = await this.getAllPlans();
    const planMap = new Map(allPlans.map(p => [p.id, p]));
    const freePlan = allPlans.find(p => p.name === "Free");
    
    if (planFilter && planFilter !== "all") {
      const matchingPlan = allPlans.find(p => p.name === planFilter);
      if (matchingPlan) {
        conditions.push(eq(users.planId, matchingPlan.id));
      } else if (planFilter === "Free") {
        conditions.push(sql`(${users.planId} IS NULL OR ${users.planId} = ${freePlan?.id || ''})`);
      }
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);
    const totalCount = Number(countResult[0]?.count || 0);
    
    const paginatedUsers = await this.db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(sql`${users.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
    
    const usersWithStats = await Promise.all(paginatedUsers.map(async (user) => {
      const [projectCountResult, songCountResult] = await Promise.all([
        this.db.select({ count: sql<number>`count(*)` }).from(projects).where(eq(projects.userId, user.id)),
        this.db.select({ count: sql<number>`count(*)` }).from(songs).where(eq(songs.userId, user.id))
      ]);
      
      const userPlan = user.planId ? planMap.get(user.planId) : freePlan;
      
      const planCredits = userPlan?.credits || 0;
      const bonusCredits = user.bonusCredits || 0;
      
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        projectCount: Number(projectCountResult[0]?.count || 0),
        songCount: Number(songCountResult[0]?.count || 0),
        planName: userPlan?.name || "Free",
        planId: user.planId || "",
        creditsUsed: user.creditsUsed || 0,
        creditsLimit: planCredits + bonusCredits,
        planCredits: planCredits,
        bonusCredits: bonusCredits
      };
    }));
    
    return { users: usersWithStats, totalCount };
  }

  async getAdminVideosPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    statusFilter?: string;
  }): Promise<{
    videos: Project[];
    totalCount: number;
  }> {
    const { page, limit, search, statusFilter } = options;
    const offset = (page - 1) * limit;
    
    const conditions: any[] = [sql`${projects.finalVideoUrl} IS NOT NULL`];
    
    if (search && search.trim()) {
      const searchLower = `%${search.toLowerCase().trim()}%`;
      conditions.push(
        sql`(
          LOWER(${projects.title}) LIKE ${searchLower} OR 
          LOWER(${projects.description}) LIKE ${searchLower} OR 
          LOWER(${projects.audioPrompt}) LIKE ${searchLower} OR
          LOWER(${projects.userId}) LIKE ${searchLower} OR
          EXISTS (SELECT 1 FROM ${users} u WHERE u.id = ${projects.userId} AND LOWER(u.username) LIKE ${searchLower})
        )`
      );
    }
    
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "completed") {
        conditions.push(eq(projects.currentStep, 7));
      } else if (statusFilter === "in-progress") {
        conditions.push(sql`${projects.currentStep} < 7`);
      } else if (statusFilter === "featured") {
        conditions.push(eq(projects.isFeatured, true));
      }
    }
    
    const whereClause = and(...conditions);
    
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(projects)
      .where(whereClause);
    const totalCount = Number(countResult[0]?.count || 0);
    
    const paginatedVideos = await this.db
      .select()
      .from(projects)
      .where(whereClause)
      .orderBy(sql`${projects.createdAt} DESC`)
      .limit(limit)
      .offset(offset);
    
    return { videos: paginatedVideos, totalCount };
  }
  
  // App settings methods
  async getSetting(key: string): Promise<string | null> {
    const [setting] = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key));
    return setting ? setting.value : null;
  }
  
  async setSetting(key: string, value: string, isSecret: boolean = false): Promise<void> {
    await this.db
      .insert(appSettings)
      .values({ key, value, isSecret })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value,
          isSecret,
          updatedAt: new Date()
        }
      });
  }
  
  async getAllSettings(): Promise<{ key: string; value: string; isSecret: boolean }[]> {
    const settings = await this.db.select().from(appSettings);
    return settings.map(s => ({
      key: s.key,
      value: s.value || '',
      isSecret: s.isSecret
    }));
  }

  // Video likes methods
  async likeVideo(projectId: string, userId: string): Promise<boolean> {
    try {
      // Check if already liked
      const existingLike = await this.db
        .select()
        .from(videoLikes)
        .where(eq(videoLikes.projectId, projectId))
        .where(eq(videoLikes.userId, userId))
        .limit(1);
      
      if (existingLike.length > 0) {
        return false; // Already liked
      }

      // Add like
      await this.db.insert(videoLikes).values({
        projectId,
        userId
      });

      // Increment likes count on project
      await this.db
        .update(projects)
        .set({ likesCount: sql`${projects.likesCount} + 1` })
        .where(eq(projects.id, projectId));

      return true;
    } catch (error) {
      console.error("Error liking video:", error);
      return false;
    }
  }

  async unlikeVideo(projectId: string, userId: string): Promise<boolean> {
    try {
      // Remove like
      const result = await this.db
        .delete(videoLikes)
        .where(eq(videoLikes.projectId, projectId))
        .where(eq(videoLikes.userId, userId));

      if (result.rowCount === 0) {
        return false; // Not liked
      }

      // Decrement likes count on project
      await this.db
        .update(projects)
        .set({ likesCount: sql`GREATEST(${projects.likesCount} - 1, 0)` })
        .where(eq(projects.id, projectId));

      return true;
    } catch (error) {
      console.error("Error unliking video:", error);
      return false;
    }
  }

  async isVideoLikedByUser(projectId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db
        .select()
        .from(videoLikes)
        .where(eq(videoLikes.projectId, projectId))
        .where(eq(videoLikes.userId, userId))
        .limit(1);
      
      return result.length > 0;
    } catch (error) {
      console.error("Error checking if video is liked:", error);
      return false;
    }
  }

  async getVideoLikesCount(projectId: string): Promise<number> {
    try {
      const result = await this.db
        .select({ likesCount: projects.likesCount })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      
      return result[0]?.likesCount || 0;
    } catch (error) {
      console.error("Error getting video likes count:", error);
      return 0;
    }
  }

  // Video comments methods
  async addComment(comment: InsertVideoComment): Promise<VideoComment> {
    try {
      const result = await this.db
        .insert(videoComments)
        .values(comment)
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Error adding comment:", error);
      throw new Error("Failed to add comment");
    }
  }

  async getComments(projectId: string): Promise<VideoComment[]> {
    try {
      const result = await this.db
        .select()
        .from(videoComments)
        .where(eq(videoComments.projectId, projectId))
        .orderBy(sql`${videoComments.createdAt} DESC`);
      
      return result;
    } catch (error) {
      console.error("Error getting comments:", error);
      return [];
    }
  }

  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(videoComments)
        .where(and(eq(videoComments.id, commentId), eq(videoComments.userId, userId)))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting comment:", error);
      return false;
    }
  }

  async getAllComments(): Promise<VideoComment[]> {
    try {
      // Get all comments with user and video details
      const results = await this.db
        .select({
          id: videoComments.id,
          content: videoComments.content,
          createdAt: videoComments.createdAt,
          updatedAt: videoComments.updatedAt,
          userId: videoComments.userId,
          projectId: videoComments.projectId,
          userUsername: users.username,
          userAvatarUrl: users.avatarUrl,
          videoTitle: projects.title,
          videoUserId: projects.userId
        })
        .from(videoComments)
        .innerJoin(users, eq(videoComments.userId, users.id))
        .innerJoin(projects, eq(videoComments.projectId, projects.id))
        .orderBy(sql`${videoComments.createdAt} DESC`);
      
      // Get video creators for each comment
      const commentsWithCreators = await Promise.all(
        results.map(async (result) => {
          const videoCreator = await this.db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, result.videoUserId))
            .limit(1);
          
          return {
            id: result.id,
            content: result.content,
            createdAt: result.createdAt,
            updatedAt: result.updatedAt,
            userId: result.userId,
            projectId: result.projectId,
            user: {
              id: result.userId,
              username: result.userUsername,
              avatarUrl: result.userAvatarUrl
            },
            video: {
              id: result.projectId,
              title: result.videoTitle,
              creator: {
                username: videoCreator[0]?.username || 'Unknown'
              }
            }
          };
        })
      );
      
      return commentsWithCreators;
    } catch (error) {
      console.error("Error getting all comments:", error);
      return [];
    }
  }

  async adminDeleteComment(commentId: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(videoComments)
        .where(eq(videoComments.id, commentId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error admin deleting comment:", error);
      return false;
    }
  }

  // Referral methods implementation for DbStorage
  async generateReferralCode(userId: string): Promise<string> {
    // Generate a unique referral code
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      // Generate random 8-character code
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
      attempts++;
      const existingUser = await this.getUserByReferralCode(code);
      if (!existingUser) break;
    } while (attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      throw new Error("Failed to generate unique referral code");
    }
    
    // Update user with the new referral code
    const success = await this.setReferralCode(userId, code);
    if (!success) {
      throw new Error("Failed to set referral code");
    }
    
    return code;
  }

  async setReferralCode(userId: string, code: string): Promise<boolean> {
    try {
      // Check if code is already taken by another user
      const existingUser = await this.getUserByReferralCode(code);
      if (existingUser && existingUser.id !== userId) {
        return false;
      }
      
      // Update user's referral code
      const result = await this.db
        .update(users)
        .set({ referralCode: code })
        .where(eq(users.id, userId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error setting referral code:", error);
      return false;
    }
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.referralCode, code))
        .limit(1);
      
      return result[0];
    } catch (error) {
      console.error("Error getting user by referral code:", error);
      return undefined;
    }
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    try {
      const result = await this.db
        .insert(referrals)
        .values(referral)
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Error creating referral:", error);
      throw new Error("Failed to create referral");
    }
  }

  async getUserReferrals(userId: string): Promise<Referral[]> {
    try {
      const result = await this.db
        .select()
        .from(referrals)
        .where(eq(referrals.referrerId, userId))
        .orderBy(sql`${referrals.createdAt} DESC`);
      
      return result;
    } catch (error) {
      console.error("Error getting user referrals:", error);
      return [];
    }
  }

  async getReferralStats(userId: string): Promise<{ totalReferrals: number; totalCreditsEarned: number; pendingReferrals: number }> {
    try {
      const userReferrals = await this.getUserReferrals(userId);
      const totalReferrals = userReferrals.length;
      const totalCreditsEarned = userReferrals.reduce((sum, ref) => sum + ref.creditsAwarded, 0);
      const pendingReferrals = userReferrals.filter(ref => !ref.isRewarded && ref.planUpgradeAt).length;
      
      return { totalReferrals, totalCreditsEarned, pendingReferrals };
    } catch (error) {
      console.error("Error getting referral stats:", error);
      return { totalReferrals: 0, totalCreditsEarned: 0, pendingReferrals: 0 };
    }
  }

  async awardReferralCredits(referralId: string, credits: number): Promise<boolean> {
    try {
      // Get the referral
      const referralResult = await this.db
        .select()
        .from(referrals)
        .where(eq(referrals.id, referralId))
        .limit(1);
      
      if (referralResult.length === 0 || referralResult[0].isRewarded) {
        return false;
      }
      
      const referral = referralResult[0];
      
      // Update referral as rewarded
      await this.db
        .update(referrals)
        .set({
          creditsAwarded: credits,
          isRewarded: true,
          rewardedAt: new Date(),
        })
        .where(eq(referrals.id, referralId));
      
      // Add credits to referrer
      return await this.addCreditsToUser(referral.referrerId, credits);
    } catch (error) {
      console.error("Error awarding referral credits:", error);
      return false;
    }
  }

  async addCreditsToUser(userId: string, credits: number): Promise<boolean> {
    try {
      // Get current user's credits used
      const userResult = await this.db
        .select({ creditsUsed: users.creditsUsed })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (userResult.length === 0) return false;
      
      // Reduce credits used (effectively adding credits)
      const newCreditsUsed = Math.max(0, userResult[0].creditsUsed - credits);
      
      const result = await this.db
        .update(users)
        .set({ creditsUsed: newCreditsUsed })
        .where(eq(users.id, userId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error adding credits to user:", error);
      return false;
    }
  }

  async updateReferral(referralId: string, updates: Partial<Referral>): Promise<boolean> {
    try {
      const result = await this.db
        .update(referrals)
        .set(updates)
        .where(eq(referrals.id, referralId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error updating referral:", error);
      return false;
    }
  }

  // Affiliate methods implementation
  async createAffiliate(insertAffiliate: InsertAffiliate): Promise<Affiliate> {
    try {
      const result = await this.db
        .insert(affiliates)
        .values(insertAffiliate)
        .returning();
      return result[0];
    } catch (error: any) {
      console.error("Error creating affiliate:", error);
      
      // Handle unique constraint violations
      if (error.code === '23505') {
        if (error.constraint?.includes('user_id')) {
          throw new Error(`Affiliate already exists for userId: ${insertAffiliate.userId}`);
        }
        if (error.constraint?.includes('affiliate_code')) {
          throw new Error(`Affiliate code '${insertAffiliate.affiliateCode}' is already taken`);
        }
      }
      
      // For other database errors, re-throw with context
      throw new Error(`Failed to create affiliate: ${error.message}`);
    }
  }

  async getAffiliate(userId: string): Promise<Affiliate | undefined> {
    try {
      const result = await this.db
        .select()
        .from(affiliates)
        .where(eq(affiliates.userId, userId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting affiliate:", error);
      return undefined;
    }
  }

  async getAffiliateByCode(code: string): Promise<Affiliate | undefined> {
    try {
      const result = await this.db
        .select()
        .from(affiliates)
        .where(sql`LOWER(${affiliates.affiliateCode}) = LOWER(${code})`)
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting affiliate by code:", error);
      return undefined;
    }
  }

  async updateAffiliate(affiliateId: string, updates: Partial<Affiliate>): Promise<Affiliate | undefined> {
    try {
      const result = await this.db
        .update(affiliates)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(affiliates.id, affiliateId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating affiliate:", error);
      return undefined;
    }
  }

  async setAffiliateCode(userId: string, code: string): Promise<boolean> {
    try {
      // Check if code is already taken by another affiliate (case-insensitive)
      const existingAffiliate = await this.getAffiliateByCode(code);
      if (existingAffiliate && existingAffiliate.userId !== userId) {
        console.warn(`Affiliate code '${code}' is already taken by another affiliate`);
        return false;
      }
      
      // Update affiliate's code
      const result = await this.db
        .update(affiliates)
        .set({ affiliateCode: code, updatedAt: new Date() })
        .where(eq(affiliates.userId, userId))
        .returning();
      
      if (result.length === 0) {
        console.warn(`No affiliate found for userId: ${userId}`);
        return false;
      }
      
      return true;
    } catch (error: any) {
      console.error("Error setting affiliate code:", error);
      
      // Handle unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('affiliate_code')) {
        console.warn(`Affiliate code '${code}' already exists (unique constraint violation)`);
        return false;
      }
      
      // For other database errors, log and return false
      return false;
    }
  }

  async createAffiliateSignup(insertSignup: InsertAffiliateSignup): Promise<AffiliateSignup> {
    try {
      const result = await this.db
        .insert(affiliateSignups)
        .values(insertSignup)
        .returning();
      return result[0];
    } catch (error: any) {
      console.error("Error creating affiliate signup:", error);
      
      // Handle unique constraint violation for signupUserId
      if (error.code === '23505' && error.constraint?.includes('signup_user_id')) {
        throw new Error(`Signup with userId ${insertSignup.signupUserId} already exists`);
      }
      
      // For other database errors, re-throw with context
      throw new Error(`Failed to create affiliate signup: ${error.message}`);
    }
  }

  async getAffiliateSignups(affiliateId: string): Promise<AffiliateSignup[]> {
    try {
      return await this.db
        .select()
        .from(affiliateSignups)
        .where(eq(affiliateSignups.affiliateId, affiliateId))
        .orderBy(sql`${affiliateSignups.createdAt} DESC`);
    } catch (error) {
      console.error("Error getting affiliate signups:", error);
      return [];
    }
  }

  async createAffiliateEarning(insertEarning: InsertAffiliateEarning): Promise<AffiliateEarning> {
    try {
      const result = await this.db
        .insert(affiliateEarnings)
        .values(insertEarning)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating affiliate earning:", error);
      throw error;
    }
  }

  async getAffiliateEarnings(affiliateId: string): Promise<AffiliateEarning[]> {
    try {
      return await this.db
        .select()
        .from(affiliateEarnings)
        .where(eq(affiliateEarnings.affiliateId, affiliateId))
        .orderBy(sql`${affiliateEarnings.createdAt} DESC`);
    } catch (error) {
      console.error("Error getting affiliate earnings:", error);
      return [];
    }
  }

  async getAffiliateStats(affiliateId: string): Promise<{ totalSignups: number; totalEarnings: number; pendingBalance: number; totalPaidOut: number }> {
    try {
      const [signups, earnings, payouts] = await Promise.all([
        this.getAffiliateSignups(affiliateId),
        this.getAffiliateEarnings(affiliateId),
        this.getAffiliatePayouts(affiliateId)
      ]);
      
      const totalSignups = signups.length;
      const totalEarnings = earnings.reduce((sum, earning) => sum + earning.amount, 0);
      const totalPaidOut = payouts
        .filter(payout => payout.status === 'completed')
        .reduce((sum, payout) => sum + payout.amount, 0);
      const pendingBalance = totalEarnings - totalPaidOut;
      
      return { totalSignups, totalEarnings, pendingBalance, totalPaidOut };
    } catch (error) {
      console.error("Error getting affiliate stats:", error);
      return { totalSignups: 0, totalEarnings: 0, pendingBalance: 0, totalPaidOut: 0 };
    }
  }

  async createAffiliatePayout(insertPayout: InsertAffiliatePayout): Promise<AffiliatePayout> {
    try {
      const result = await this.db
        .insert(affiliatePayouts)
        .values(insertPayout)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating affiliate payout:", error);
      throw error;
    }
  }

  async getAffiliatePayouts(affiliateId: string): Promise<AffiliatePayout[]> {
    try {
      return await this.db
        .select()
        .from(affiliatePayouts)
        .where(eq(affiliatePayouts.affiliateId, affiliateId))
        .orderBy(sql`${affiliatePayouts.createdAt} DESC`);
    } catch (error) {
      console.error("Error getting affiliate payouts:", error);
      return [];
    }
  }

  async updateAffiliatePayout(payoutId: string, updates: Partial<AffiliatePayout>): Promise<AffiliatePayout | undefined> {
    try {
      const result = await this.db
        .update(affiliatePayouts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(affiliatePayouts.id, payoutId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating affiliate payout:", error);
      return undefined;
    }
  }

  async createPostizPost(insertPost: InsertPostizPost): Promise<PostizPost> {
    try {
      const result = await this.db
        .insert(postizPosts)
        .values(insertPost)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating postiz post:", error);
      throw error;
    }
  }

  async getPostizPostByProjectId(projectId: string): Promise<PostizPost | undefined> {
    try {
      const result = await this.db
        .select()
        .from(postizPosts)
        .where(eq(postizPosts.projectId, projectId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting postiz post:", error);
      return undefined;
    }
  }

  async updatePostizPost(projectId: string, updates: Partial<PostizPost>): Promise<PostizPost | undefined> {
    try {
      const result = await this.db
        .update(postizPosts)
        .set(updates)
        .where(eq(postizPosts.projectId, projectId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating postiz post:", error);
      return undefined;
    }
  }

  async getAllProjects(): Promise<Project[]> {
    try {
      return await this.db
        .select()
        .from(projects)
        .orderBy(sql`${projects.createdAt} DESC`);
    } catch (error) {
      console.error("Error getting all projects:", error);
      return [];
    }
  }

  async createOauthClient(client: InsertOauthClient): Promise<OauthClient> {
    try {
      const result = await this.db
        .insert(oauthClients)
        .values(client)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating OAuth client:", error);
      throw error;
    }
  }

  async getOauthClient(clientId: string): Promise<OauthClient | undefined> {
    try {
      const result = await this.db
        .select()
        .from(oauthClients)
        .where(eq(oauthClients.clientId, clientId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting OAuth client:", error);
      return undefined;
    }
  }

  async createOauthAuthorizationCode(code: InsertOauthAuthorizationCode): Promise<OauthAuthorizationCode> {
    try {
      const result = await this.db
        .insert(oauthAuthorizationCodes)
        .values(code)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating OAuth authorization code:", error);
      throw error;
    }
  }

  async getOauthAuthorizationCode(code: string): Promise<OauthAuthorizationCode | undefined> {
    try {
      const result = await this.db
        .select()
        .from(oauthAuthorizationCodes)
        .where(eq(oauthAuthorizationCodes.code, code))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting OAuth authorization code:", error);
      return undefined;
    }
  }

  async deleteOauthAuthorizationCode(code: string): Promise<boolean> {
    try {
      await this.db
        .delete(oauthAuthorizationCodes)
        .where(eq(oauthAuthorizationCodes.code, code));
      return true;
    } catch (error) {
      console.error("Error deleting OAuth authorization code:", error);
      return false;
    }
  }

  async createOauthAccessToken(token: InsertOauthAccessToken): Promise<OauthAccessToken> {
    try {
      const result = await this.db
        .insert(oauthAccessTokens)
        .values(token)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error creating OAuth access token:", error);
      throw error;
    }
  }

  async getOauthAccessToken(token: string): Promise<OauthAccessToken | undefined> {
    try {
      const result = await this.db
        .select()
        .from(oauthAccessTokens)
        .where(eq(oauthAccessTokens.token, token))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting OAuth access token:", error);
      return undefined;
    }
  }

  async deleteExpiredOauthTokens(): Promise<void> {
    try {
      await this.db
        .delete(oauthAccessTokens)
        .where(sql`${oauthAccessTokens.expiresAt} < NOW()`);
      
      await this.db
        .delete(oauthAuthorizationCodes)
        .where(sql`${oauthAuthorizationCodes.expiresAt} < NOW()`);
    } catch (error) {
      console.error("Error deleting expired OAuth tokens:", error);
    }
  }

  // Banned user methods
  async isEmailBanned(email: string): Promise<boolean> {
    try {
      const result = await this.db
        .select()
        .from(bannedUsers)
        .where(eq(bannedUsers.email, email.toLowerCase()))
        .limit(1);
      return result.length > 0;
    } catch (error) {
      console.error("Error checking if email is banned:", error);
      return false;
    }
  }

  async banUser(email: string, bannedBy: string, reason?: string): Promise<void> {
    try {
      await this.db
        .insert(bannedUsers)
        .values({
          email: email.toLowerCase(),
          bannedBy,
          reason: reason || null
        });
    } catch (error) {
      console.error("Error banning user:", error);
      throw error;
    }
  }

  async unbanUser(email: string): Promise<void> {
    try {
      await this.db
        .delete(bannedUsers)
        .where(eq(bannedUsers.email, email.toLowerCase()));
    } catch (error) {
      console.error("Error unbanning user:", error);
      throw error;
    }
  }

  async getAllBannedUsers(): Promise<BannedUser[]> {
    try {
      const result = await this.db
        .select()
        .from(bannedUsers);
      return result;
    } catch (error) {
      console.error("Error getting banned users:", error);
      return [];
    }
  }

  // Gift subscription methods
  async createGiftSubscription(gift: InsertGiftSubscription): Promise<GiftSubscription> {
    const result = await this.db.insert(giftSubscriptions).values(gift).returning();
    return result[0];
  }

  async getGiftSubscriptionByCode(code: string): Promise<GiftSubscription | undefined> {
    const result = await this.db.select().from(giftSubscriptions)
      .where(eq(giftSubscriptions.redemptionCode, code))
      .limit(1);
    return result[0];
  }

  async getGiftSubscriptionsByPurchaser(userId: string): Promise<GiftSubscription[]> {
    return await this.db.select().from(giftSubscriptions)
      .where(eq(giftSubscriptions.purchaserUserId, userId))
      .orderBy(asc(giftSubscriptions.createdAt));
  }

  async updateGiftSubscription(id: string, updates: Partial<GiftSubscription>): Promise<GiftSubscription | undefined> {
    const result = await this.db.update(giftSubscriptions)
      .set(updates)
      .where(eq(giftSubscriptions.id, id))
      .returning();
    return result[0];
  }

  async redeemGiftSubscription(code: string, userId: string): Promise<GiftSubscription | undefined> {
    const gift = await this.getGiftSubscriptionByCode(code);
    if (!gift || gift.status !== 'paid') return undefined;
    const now = new Date();
    if (gift.expiresAt < now) return undefined;
    
    const result = await this.db.update(giftSubscriptions)
      .set({
        status: 'redeemed',
        redeemedByUserId: userId,
        redeemedAt: now
      })
      .where(eq(giftSubscriptions.id, gift.id))
      .returning();
    return result[0];
  }

  // Greeting card methods
  async createGreetingCard(card: InsertGreetingCard): Promise<GreetingCard> {
    const result = await this.db.insert(greetingCards).values(card).returning();
    return result[0];
  }

  async getGreetingCardByToken(token: string): Promise<GreetingCard | undefined> {
    const result = await this.db.select().from(greetingCards)
      .where(eq(greetingCards.uniqueToken, token))
      .limit(1);
    return result[0];
  }

  async getPendingGreetingCardsForToday(): Promise<GreetingCard[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    return await this.db.select().from(greetingCards)
      .where(
        and(
          eq(greetingCards.status, 'pending'),
          sql`${greetingCards.scheduledDate} >= ${startOfDay.toISOString()}`,
          sql`${greetingCards.scheduledDate} < ${endOfDay.toISOString()}`
        )
      );
  }

  async updateGreetingCard(id: string, updates: Partial<GreetingCard>): Promise<GreetingCard | undefined> {
    const result = await this.db.update(greetingCards)
      .set(updates)
      .where(eq(greetingCards.id, id))
      .returning();
    return result[0];
  }

  // Coupon code methods
  async createCouponCode(coupon: InsertCouponCode): Promise<CouponCode> {
    const result = await this.db.insert(couponCodes).values(coupon).returning();
    return result[0];
  }

  async getCouponCodeByCode(code: string): Promise<CouponCode | undefined> {
    const result = await this.db.select().from(couponCodes)
      .where(eq(couponCodes.code, code))
      .limit(1);
    return result[0];
  }

  async getCouponCode(id: string): Promise<CouponCode | undefined> {
    const result = await this.db.select().from(couponCodes)
      .where(eq(couponCodes.id, id))
      .limit(1);
    return result[0];
  }

  async getAllCouponCodes(): Promise<CouponCode[]> {
    return await this.db.select().from(couponCodes);
  }

  async updateCouponCode(id: string, updates: Partial<CouponCode>): Promise<CouponCode | undefined> {
    const result = await this.db.update(couponCodes)
      .set(updates)
      .where(eq(couponCodes.id, id))
      .returning();
    return result[0];
  }

  async deleteCouponCode(id: string): Promise<boolean> {
    try {
      await this.db.delete(couponRedemptions).where(eq(couponRedemptions.couponId, id));
      await this.db.delete(couponCodes).where(eq(couponCodes.id, id));
      return true;
    } catch {
      return false;
    }
  }

  async redeemCouponCode(code: string, userId: string): Promise<{ success: boolean; message: string; creditsAwarded?: number }> {
    try {
      return await this.db.transaction(async (tx) => {
        // Lock and fetch coupon within transaction
        const couponResult = await tx.select().from(couponCodes)
          .where(eq(couponCodes.code, code.toUpperCase().trim()))
          .limit(1);
        
        const coupon = couponResult[0];
        if (!coupon) {
          return { success: false, message: "Invalid code" };
        }
        if (!coupon.isActive) {
          return { success: false, message: "This code is no longer active" };
        }
        if (coupon.expiresAt && new Date() > coupon.expiresAt) {
          return { success: false, message: "This code has expired" };
        }
        if (coupon.maxUses && coupon.usesCount >= coupon.maxUses) {
          return { success: false, message: "This code has reached its maximum uses" };
        }
        
        // Check if user already redeemed within transaction
        const existingRedemption = await tx.select().from(couponRedemptions)
          .where(and(
            eq(couponRedemptions.couponId, coupon.id),
            eq(couponRedemptions.userId, userId)
          ))
          .limit(1);
        
        if (existingRedemption.length > 0) {
          return { success: false, message: "You have already redeemed this code" };
        }
        
        // Insert redemption record - unique constraint provides additional safety
        await tx.insert(couponRedemptions).values({
          couponId: coupon.id,
          userId,
          creditsAwarded: coupon.credits,
        });
        
        // Update coupon uses count atomically with conditional check for maxUses
        if (coupon.maxUses) {
          const updateResult = await tx.update(couponCodes)
            .set({ usesCount: sql`${couponCodes.usesCount} + 1` })
            .where(and(
              eq(couponCodes.id, coupon.id),
              sql`${couponCodes.usesCount} < ${coupon.maxUses}`
            ))
            .returning();
          
          if (updateResult.length === 0) {
            throw new Error("MAX_USES_EXCEEDED");
          }
        } else {
          await tx.update(couponCodes)
            .set({ usesCount: sql`${couponCodes.usesCount} + 1` })
            .where(eq(couponCodes.id, coupon.id));
        }
        
        // Add bonus credits to user within same transaction
        await tx.update(users)
          .set({ bonusCredits: sql`${users.bonusCredits} + ${coupon.credits}` })
          .where(eq(users.id, userId));
        
        return { success: true, message: "Code redeemed successfully!", creditsAwarded: coupon.credits };
      });
    } catch (error: any) {
      // Handle specific error cases
      if (error.message === "MAX_USES_EXCEEDED") {
        return { success: false, message: "This code has reached its maximum uses" };
      }
      if (error.code === '23505') {
        return { success: false, message: "You have already redeemed this code" };
      }
      console.error("Error redeeming coupon:", error);
      return { success: false, message: "Failed to redeem code. Please try again." };
    }
  }

  async hasUserRedeemedCoupon(couponId: string, userId: string): Promise<boolean> {
    const result = await this.db.select().from(couponRedemptions)
      .where(and(
        eq(couponRedemptions.couponId, couponId),
        eq(couponRedemptions.userId, userId)
      ))
      .limit(1);
    return result.length > 0;
  }

  async getCouponRedemptions(couponId: string): Promise<CouponRedemption[]> {
    return await this.db.select().from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, couponId));
  }

  async getBackedUpPaths(): Promise<Set<string>> {
    const backups = await this.db.select({ originalPath: imagekitBackups.originalPath }).from(imagekitBackups);
    return new Set(backups.map(b => b.originalPath));
  }

  async recordImagekitBackup(backup: InsertImagekitBackup): Promise<ImagekitBackup> {
    const [newBackup] = await this.db.insert(imagekitBackups).values(backup).returning();
    return newBackup;
  }

  async getImagekitBackupByPath(originalPath: string): Promise<ImagekitBackup | null> {
    const [backup] = await this.db
      .select()
      .from(imagekitBackups)
      .where(eq(imagekitBackups.originalPath, originalPath))
      .limit(1);
    return backup || null;
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
