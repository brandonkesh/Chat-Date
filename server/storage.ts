import { db } from "./db";
import {
  users,
  profiles,
  matches,
  messages,
  swipes,
  reports,
  type User,
  type Profile,
  type InsertProfile,
  type InsertSwipe,
  type InsertMessage,
  type Message,
  type UpsertUser,
  type MembershipTier,
  type VerificationStatus,
  type Report,
  type InsertReport,
} from "@shared/schema";
import { eq, and, ne, notInArray, desc, or } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth";

export interface IStorage {
  // Profiles
  getProfile(userId: string): Promise<Profile | undefined>;
  getProfileById(id: number): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile & { userId: string; ageVerified?: boolean }): Promise<Profile>;
  updateProfile(userId: string, profile: Partial<InsertProfile> & { ageVerified?: boolean }): Promise<Profile>;
  getPotentialMatches(userId: string): Promise<Profile[]>;
  getRecommendedProfiles(userId: string): Promise<Profile[]>;
  getCrushPicks(userId: string): Promise<Profile[]>;
  updateStripeCustomer(userId: string, customerId: string): Promise<void>;
  updateStripeSubscription(userId: string, subscriptionId: string, isPremium: boolean, membershipTier?: MembershipTier, priceId?: string): Promise<void>;
  getProfileByStripeCustomerId(customerId: string): Promise<Profile | undefined>;
  
  // Swipes & Matches
  createSwipe(swipe: InsertSwipe): Promise<void>;
  checkMatch(user1Id: string, user2Id: string): Promise<boolean>;
  createMatch(user1Id: string, user2Id: string, isDailyMatch?: boolean): Promise<number>;
  getDailyMatch(userId: string): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile }) | undefined>;
  
  // Messages
  getMessages(matchId: number): Promise<Message[]>;
  createMessage(message: InsertMessage & { senderId: string }): Promise<Message>;
  
  // Verification
  submitVerification(userId: string, photoUrl: string): Promise<Profile>;
  updateVerificationStatus(userId: string, status: VerificationStatus): Promise<Profile>;

  // Two-factor authentication
  enableTwoFactor(userId: string, secret: string): Promise<Profile>;
  disableTwoFactor(userId: string): Promise<Profile>;
  getTwoFactorSecret(userId: string): Promise<string | null>;

  // Email verification
  setEmailVerificationCode(userId: string, code: string, expiry: Date): Promise<Profile>;
  verifyEmail(userId: string): Promise<Profile>;

  // Reports
  createReport(reporterId: string, report: InsertReport): Promise<Report>;
  hasReported(reporterId: string, reportedUserId: string): Promise<boolean>;
  getReportsByUser(reporterId: string): Promise<Report[]>;
}

export class DatabaseStorage implements IStorage {
  async getProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    return profile;
  }

  async getProfileById(id: number): Promise<Profile | undefined> {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
    return profile;
  }

  async createProfile(profileData: InsertProfile & { userId: string; ageVerified?: boolean }): Promise<Profile> {
    // Set trial ends at to 1 month from now
    const trialEndsAt = new Date();
    trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);

    const [profile] = await db.insert(profiles).values({
      ...profileData,
      trialEndsAt,
    }).returning();
    return profile;
  }

  async updateProfile(userId: string, updates: Partial<InsertProfile> & { ageVerified?: boolean }): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async updateStripeCustomer(userId: string, customerId: string): Promise<void> {
    await db
      .update(profiles)
      .set({ stripeCustomerId: customerId })
      .where(eq(profiles.userId, userId));
  }

  async updateStripeSubscription(userId: string, subscriptionId: string, isPremium: boolean, membershipTier?: MembershipTier, priceId?: string): Promise<void> {
    const updates: Record<string, any> = { 
      stripeSubscriptionId: subscriptionId, 
      isPremium 
    };
    if (membershipTier) {
      updates.membershipTier = membershipTier;
    }
    if (priceId) {
      updates.stripePriceId = priceId;
    }
    if (!isPremium) {
      updates.membershipTier = 'free';
      updates.stripePriceId = null;
    }
    await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId));
  }

  async getProfileByStripeCustomerId(customerId: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.stripeCustomerId, customerId));
    return profile;
  }

  async getPotentialMatches(userId: string): Promise<Profile[]> {
    // Get current user's profile to know preferences
    const myProfile = await this.getProfile(userId);
    if (!myProfile) return [];

    // Get IDs already swiped
    const swiped = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, userId));
    
    const swipedIds = swiped.map(s => s.swipedId);
    swipedIds.push(userId); // Exclude self

    // Build query with gender filter
    if (myProfile.interestedIn !== 'everyone') {
      return await db
        .select()
        .from(profiles)
        .where(and(
          notInArray(profiles.userId, swipedIds),
          eq(profiles.gender, myProfile.interestedIn)
        ));
    }
    
    return await db
      .select()
      .from(profiles)
      .where(notInArray(profiles.userId, swipedIds));
  }

  async getRecommendedProfiles(userId: string): Promise<Profile[]> {
    // Get current user's profile to know preferences and interests
    const myProfile = await this.getProfile(userId);
    if (!myProfile) return [];

    // Get IDs already swiped
    const swiped = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, userId));
    
    const swipedIds = swiped.map(s => s.swipedId);
    swipedIds.push(userId); // Exclude self

    // Get potential profiles matching gender preference
    let potentialProfiles: Profile[];
    if (myProfile.interestedIn !== 'everyone') {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(and(
          notInArray(profiles.userId, swipedIds),
          eq(profiles.gender, myProfile.interestedIn)
        ));
    } else {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(notInArray(profiles.userId, swipedIds));
    }

    // Score and sort by matching interests
    const myInterests = myProfile.interests || [];
    const scored = potentialProfiles.map(profile => {
      const theirInterests = profile.interests || [];
      const commonInterests = myInterests.filter(i => theirInterests.includes(i));
      return { profile, score: commonInterests.length };
    });

    // Sort by score descending, take top 10 with at least 1 shared interest
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(s => s.profile);
  }

  async getCrushPicks(userId: string): Promise<Profile[]> {
    // Get current user's profile to know preferences
    const myProfile = await this.getProfile(userId);
    if (!myProfile) return [];

    // Get IDs already swiped
    const swiped = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, userId));
    
    const swipedIds = swiped.map(s => s.swipedId);
    swipedIds.push(userId); // Exclude self

    // Get potential profiles matching gender preference
    let potentialProfiles: Profile[];
    if (myProfile.interestedIn !== 'everyone') {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(and(
          notInArray(profiles.userId, swipedIds),
          eq(profiles.gender, myProfile.interestedIn)
        ));
    } else {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(notInArray(profiles.userId, swipedIds));
    }

    // Crush picks: prioritize verified users and premium members
    const scored = potentialProfiles.map(profile => {
      let score = 0;
      if (profile.isVerified) score += 3;
      if (profile.isPremium) score += 2;
      if (profile.membershipTier === 'elite') score += 2;
      else if (profile.membershipTier === 'pro') score += 1;
      if (profile.photoUrl) score += 1; // Has a photo
      if (profile.bio && profile.bio.length > 20) score += 1; // Has a bio
      return { profile, score };
    });

    // Sort by score descending, take top 6
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(s => s.profile);
  }

  async createSwipe(swipe: InsertSwipe): Promise<void> {
    await db.insert(swipes).values(swipe);
  }

  async checkMatch(user1Id: string, user2Id: string): Promise<boolean> {
    // Check if user2 has liked user1
    const [swipe] = await db
      .select()
      .from(swipes)
      .where(and(
        eq(swipes.swiperId, user2Id),
        eq(swipes.swipedId, user1Id),
        eq(swipes.liked, true)
      ));
    return !!swipe;
  }

  async createMatch(user1Id: string, user2Id: string, isDailyMatch: boolean = false): Promise<number> {
    const [match] = await db.insert(matches).values({
      user1Id,
      user2Id,
      isDailyMatch,
    }).returning();
    return match.id;
  }

  async getDailyMatch(userId: string): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile }) | undefined> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [dailyMatch] = await db
      .select()
      .from(matches)
      .where(and(
        or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)),
        eq(matches.isDailyMatch, true),
        desc(matches.createdAt)
      ))
      .limit(1);

    if (!dailyMatch) return undefined;

    // Check if it's from today
    if (dailyMatch.createdAt && dailyMatch.createdAt < today) {
      return undefined;
    }

    const partnerId = dailyMatch.user1Id === userId ? dailyMatch.user2Id : dailyMatch.user1Id;
    const partnerProfile = await this.getProfile(partnerId);
    if (!partnerProfile) return undefined;

    return { ...dailyMatch, partnerProfile };
  }

  async getMatches(userId: string): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile })[]> {
    const userMatches = await db
      .select()
      .from(matches)
      .where(and(
        or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)),
        eq(matches.isDailyMatch, false)
      ));

    const results = [];
    for (const match of userMatches) {
      const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
      const partnerProfile = await this.getProfile(partnerId);
      if (partnerProfile) {
        results.push({ ...match, partnerProfile });
      }
    }
    return results;
  }

  async getMatch(matchId: number): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile }) | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) return undefined;
    
    // In actual usage we'd need userId to know who the partner is, 
    // but the getMatches logic above handles it correctly by iterating.
    return undefined;
  }

  async getMessages(matchId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.matchId, matchId))
      .orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage & { senderId: string }): Promise<Message> {
    const [msg] = await db.insert(messages).values(message).returning();
    return msg;
  }

  async submitVerification(userId: string, photoUrl: string): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({ 
        verificationPhotoUrl: photoUrl,
        verificationStatus: 'pending',
      })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async updateVerificationStatus(userId: string, status: VerificationStatus): Promise<Profile> {
    const updates: Record<string, any> = { verificationStatus: status };
    if (status === 'approved') {
      updates.isVerified = true;
    } else if (status === 'rejected') {
      updates.isVerified = false;
    }
    const [updated] = await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async enableTwoFactor(userId: string, secret: string): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({ twoFactorEnabled: true, twoFactorSecret: secret })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async disableTwoFactor(userId: string): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({ twoFactorEnabled: false, twoFactorSecret: null })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async getTwoFactorSecret(userId: string): Promise<string | null> {
    const profile = await this.getProfile(userId);
    return profile?.twoFactorSecret ?? null;
  }

  async setEmailVerificationCode(userId: string, code: string, expiry: Date): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({ emailVerificationCode: code, emailVerificationExpiry: expiry })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async verifyEmail(userId: string): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({ emailVerified: true, emailVerificationCode: null, emailVerificationExpiry: null })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async createReport(reporterId: string, report: InsertReport): Promise<Report> {
    const [created] = await db
      .insert(reports)
      .values({ ...report, reporterId })
      .returning();
    return created;
  }

  async hasReported(reporterId: string, reportedUserId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(reports)
      .where(and(eq(reports.reporterId, reporterId), eq(reports.reportedUserId, reportedUserId)));
    return !!existing;
  }

  async getReportsByUser(reporterId: string): Promise<Report[]> {
    return db.select().from(reports).where(eq(reports.reporterId, reporterId)).orderBy(desc(reports.createdAt));
  }
}

export const storage = new DatabaseStorage();
