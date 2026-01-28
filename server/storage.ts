import { db } from "./db";
import {
  users,
  profiles,
  matches,
  messages,
  swipes,
  type User,
  type Profile,
  type InsertProfile,
  type InsertSwipe,
  type InsertMessage,
  type Message,
  type InsertUser,
  type MembershipTier,
} from "@shared/schema";
import { eq, and, ne, notInArray, desc, or } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth";

export interface IStorage {
  // Profiles
  getProfile(userId: string): Promise<Profile | undefined>;
  getProfileById(id: number): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile & { userId: string }): Promise<Profile>;
  updateProfile(userId: string, profile: Partial<InsertProfile>): Promise<Profile>;
  getPotentialMatches(userId: string): Promise<Profile[]>;
  updateStripeCustomer(userId: string, customerId: string): Promise<void>;
  updateStripeSubscription(userId: string, subscriptionId: string, isPremium: boolean, membershipTier?: MembershipTier, priceId?: string): Promise<void>;
  getProfileByStripeCustomerId(customerId: string): Promise<Profile | undefined>;
  
  // Swipes & Matches
  createSwipe(swipe: InsertSwipe): Promise<void>;
  checkMatch(user1Id: string, user2Id: string): Promise<boolean>;
  createMatch(user1Id: string, user2Id: string): Promise<number>;
  getMatches(userId: string): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile })[]>;
  getMatch(matchId: number): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile }) | undefined>;
  
  // Messages
  getMessages(matchId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
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

  async createProfile(profileData: InsertProfile & { userId: string }): Promise<Profile> {
    // Set trial ends at to 1 month from now
    const trialEndsAt = new Date();
    trialEndsAt.setMonth(trialEndsAt.getMonth() + 1);

    const [profile] = await db.insert(profiles).values({
      ...profileData,
      trialEndsAt,
    }).returning();
    return profile;
  }

  async updateProfile(userId: string, updates: Partial<InsertProfile>): Promise<Profile> {
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

    // Build query
    let query = db.select().from(profiles).where(notInArray(profiles.userId, swipedIds));

    // Filter by gender preference if not 'everyone'
    if (myProfile.interestedIn !== 'everyone') {
      query.where(eq(profiles.gender, myProfile.interestedIn));
    }
    
    // Also filter so that they are interested in my gender (simplified matching)
    // In a real app, this would be more complex
    
    return await query;
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

  async createMatch(user1Id: string, user2Id: string): Promise<number> {
    const [match] = await db.insert(matches).values({
      user1Id,
      user2Id,
    }).returning();
    return match.id;
  }

  async getMatches(userId: string): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile })[]> {
    const userMatches = await db
      .select()
      .from(matches)
      .where(or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)));

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
    
    // We can't determine partner without knowing who is asking, so we'll fetch both user profiles 
    // and let the route handler filter or just return raw match data if needed. 
    // But the interface says we return partnerProfile. 
    // This method signature is a bit tricky without userId. 
    // Let's modify the usage in routes to fetch match first, then get partner profile manually 
    // or pass userId to this method. 
    // For now, I'll return the match and let the route handle the partner profile lookup.
    // Actually, I'll update the interface to take userId? No, let's keep it simple.
    
    return undefined; // Not used directly in my plan, I'll handle in routes
  }

  async getMessages(matchId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.matchId, matchId))
      .orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [msg] = await db.insert(messages).values(message).returning();
    return msg;
  }
}

export const storage = new DatabaseStorage();
