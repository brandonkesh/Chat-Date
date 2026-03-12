import { db } from "./db";
import {
  users,
  profiles,
  matches,
  messages,
  swipes,
  reports,
  blocks,
  savedProfiles,
  hiddenProfiles,
  microDates,
  microDateResponses,
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
  type Block,
  type MicroDate,
  type MicroDateResponse,
  type SavedProfile,
  type HiddenProfile,
} from "@shared/schema";
import { eq, and, ne, notInArray, desc, or } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth";

export interface MatchmakingResult {
  profile: Profile;
  compatibilityScore: number;
  matchReasons: string[];
}

export interface IStorage {
  // Profiles
  getProfile(userId: string): Promise<Profile | undefined>;
  getProfileById(id: number): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile & { userId: string; ageVerified?: boolean }): Promise<Profile>;
  updateProfile(userId: string, profile: Partial<InsertProfile> & { ageVerified?: boolean }): Promise<Profile>;
  getPotentialMatches(userId: string): Promise<Profile[]>;
  getRecommendedProfiles(userId: string): Promise<Profile[]>;
  getCrushPicks(userId: string): Promise<Profile[]>;
  getMatchmakingProfiles(userId: string): Promise<MatchmakingResult[]>;
  updateStripeCustomer(userId: string, customerId: string): Promise<void>;
  updateStripeSubscription(userId: string, subscriptionId: string, isPremium: boolean, membershipTier?: MembershipTier, priceId?: string): Promise<void>;
  getProfileByStripeCustomerId(customerId: string): Promise<Profile | undefined>;
  
  // Swipes & Matches
  createSwipe(swipe: InsertSwipe): Promise<void>;
  checkMatch(user1Id: string, user2Id: string): Promise<boolean>;
  createMatch(user1Id: string, user2Id: string, isDailyMatch?: boolean): Promise<number>;
  getDailyMatch(userId: string): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile }) | undefined>;
  getMatch(matchId: number): Promise<typeof matches.$inferSelect | undefined>;
  deleteMatch(matchId: number, userId: string): Promise<boolean>;
  getLikesReceived(userId: string): Promise<Profile[]>;
  
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

  // Blocks
  blockUser(blockerId: string, blockedUserId: string): Promise<Block>;
  unblockUser(blockerId: string, blockedUserId: string): Promise<void>;
  isBlocked(blockerId: string, blockedUserId: string): Promise<boolean>;
  isBlockedEither(userId1: string, userId2: string): Promise<boolean>;
  getBlockedUserIds(userId: string): Promise<string[]>;
  getBlockedUsers(userId: string): Promise<{ block: Block; profile: Profile }[]>;

  // Saved Profiles
  saveProfile(userId: string, savedUserId: string): Promise<void>;
  unsaveProfile(userId: string, savedUserId: string): Promise<void>;
  isSaved(userId: string, savedUserId: string): Promise<boolean>;
  getSavedProfiles(userId: string): Promise<Profile[]>;

  // Hidden Profiles
  hideProfile(userId: string, hiddenUserId: string): Promise<void>;
  unhideProfile(userId: string, hiddenUserId: string): Promise<void>;
  isHidden(userId: string, hiddenUserId: string): Promise<boolean>;
  getHiddenUserIds(userId: string): Promise<string[]>;

  // Micro Dates
  createMicroDate(matchId: number, inviterId: string, inviteeId: string, activities: string): Promise<MicroDate>;
  getMicroDate(id: number): Promise<MicroDate | undefined>;
  getMicroDateByMatch(matchId: number, status?: string): Promise<MicroDate | undefined>;
  updateMicroDateStatus(id: number, status: string, startedAt?: Date, endsAt?: Date): Promise<MicroDate>;
  advanceMicroDateActivity(id: number, newIndex: number): Promise<MicroDate>;
  getMicroDateResponses(microDateId: number): Promise<MicroDateResponse[]>;
  createMicroDateResponse(microDateId: number, activityIndex: number, userId: string, response: string): Promise<MicroDateResponse>;
  getMicroDatesForUser(userId: string): Promise<MicroDate[]>;
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
    const myProfile = await this.getProfile(userId);
    if (!myProfile) return [];

    const swiped = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, userId));
    
    const swipedIds = swiped.map(s => s.swipedId);
    const blockedIds = await this.getBlockedUserIds(userId);
    const hiddenIds = await this.getHiddenUserIds(userId);
    const excludeIds = [...new Set([...swipedIds, ...blockedIds, ...hiddenIds, userId])];

    let potentialProfiles: Profile[];
    if (myProfile.interestedIn !== 'everyone') {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(and(
          notInArray(profiles.userId, excludeIds),
          eq(profiles.gender, myProfile.interestedIn)
        ));
    } else {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(notInArray(profiles.userId, excludeIds));
    }

    if (myProfile.zipCode) {
      const sameZip: Profile[] = [];
      const otherZip: Profile[] = [];
      for (const p of potentialProfiles) {
        if (p.zipCode === myProfile.zipCode) {
          sameZip.push(p);
        } else {
          otherZip.push(p);
        }
      }
      return [...sameZip, ...otherZip];
    }

    return potentialProfiles;
  }

  async getRecommendedProfiles(userId: string): Promise<Profile[]> {
    const myProfile = await this.getProfile(userId);
    if (!myProfile) return [];

    const swiped = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, userId));
    
    const swipedIds = swiped.map(s => s.swipedId);
    const blockedIds = await this.getBlockedUserIds(userId);
    const hiddenIds = await this.getHiddenUserIds(userId);
    const excludeIds = [...new Set([...swipedIds, ...blockedIds, ...hiddenIds, userId])];

    let potentialProfiles: Profile[];
    if (myProfile.interestedIn !== 'everyone') {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(and(
          notInArray(profiles.userId, excludeIds),
          eq(profiles.gender, myProfile.interestedIn)
        ));
    } else {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(notInArray(profiles.userId, excludeIds));
    }

    const myInterests = myProfile.interests || [];
    const scored = potentialProfiles.map(profile => {
      const theirInterests = profile.interests || [];
      const commonInterests = myInterests.filter(i => theirInterests.includes(i));
      let score = commonInterests.length;
      if (myProfile.zipCode && profile.zipCode && myProfile.zipCode === profile.zipCode) {
        score += 5;
      }
      return { profile, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(s => s.profile);
  }

  async getCrushPicks(userId: string): Promise<Profile[]> {
    const myProfile = await this.getProfile(userId);
    if (!myProfile) return [];

    const swiped = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, userId));
    
    const swipedIds = swiped.map(s => s.swipedId);
    const blockedIds = await this.getBlockedUserIds(userId);
    const hiddenIds = await this.getHiddenUserIds(userId);
    const excludeIds = [...new Set([...swipedIds, ...blockedIds, ...hiddenIds, userId])];

    let potentialProfiles: Profile[];
    if (myProfile.interestedIn !== 'everyone') {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(and(
          notInArray(profiles.userId, excludeIds),
          eq(profiles.gender, myProfile.interestedIn)
        ));
    } else {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(notInArray(profiles.userId, excludeIds));
    }

    const scored = potentialProfiles.map(profile => {
      let score = 0;
      if (myProfile.zipCode && profile.zipCode && myProfile.zipCode === profile.zipCode) score += 4;
      if (profile.isVerified) score += 3;
      if (profile.isPremium) score += 2;
      if (profile.membershipTier === 'elite') score += 2;
      else if (profile.membershipTier === 'pro') score += 1;
      if (profile.photoUrl) score += 1;
      if (profile.bio && profile.bio.length > 20) score += 1;
      return { profile, score };
    });

    // Sort by score descending, take top 6
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(s => s.profile);
  }

  async getMatchmakingProfiles(userId: string): Promise<MatchmakingResult[]> {
    const myProfile = await this.getProfile(userId);
    if (!myProfile) return [];

    const swiped = await db
      .select({ swipedId: swipes.swipedId })
      .from(swipes)
      .where(eq(swipes.swiperId, userId));
    
    const swipedIds = swiped.map(s => s.swipedId);
    const blockedIds = await this.getBlockedUserIds(userId);
    const hiddenIds = await this.getHiddenUserIds(userId);
    const excludeIds = [...new Set([...swipedIds, ...blockedIds, ...hiddenIds, userId])];

    let potentialProfiles: Profile[];
    if (myProfile.interestedIn !== 'everyone') {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(and(
          notInArray(profiles.userId, excludeIds),
          eq(profiles.gender, myProfile.interestedIn)
        ));
    } else {
      potentialProfiles = await db
        .select()
        .from(profiles)
        .where(notInArray(profiles.userId, excludeIds));
    }

    const results: MatchmakingResult[] = potentialProfiles.map(candidate => {
      let totalScore = 0;
      let maxScore = 0;
      const reasons: string[] = [];

      if (myProfile.zipCode && candidate.zipCode) {
        maxScore += 15;
        if (myProfile.zipCode === candidate.zipCode) {
          totalScore += 15;
          reasons.unshift("In your area");
        }
      }

      const myInterests = myProfile.interests || [];
      const theirInterests = candidate.interests || [];
      if (myInterests.length > 0 && theirInterests.length > 0) {
        maxScore += 25;
        const common = myInterests.filter(i => theirInterests.includes(i));
        const interestScore = Math.min(common.length / Math.max(myInterests.length, 1), 1);
        totalScore += interestScore * 25;
        if (common.length >= 3) reasons.push(`${common.length} shared interests`);
        else if (common.length > 0) reasons.push(`Shares ${common.slice(0, 3).join(", ")}`);
      }

      const lifestyleFields: { field: keyof Profile; label: string }[] = [
        { field: "drinking", label: "Drinking habits" },
        { field: "smoking", label: "Smoking habits" },
        { field: "exercise", label: "Exercise habits" },
        { field: "diet", label: "Diet" },
      ];

      let lifestyleMatches = 0;
      let lifestyleTotal = 0;
      for (const { field } of lifestyleFields) {
        const myVal = myProfile[field] as string | null;
        const theirVal = candidate[field] as string | null;
        if (myVal && theirVal) {
          lifestyleTotal++;
          if (myVal === theirVal) {
            lifestyleMatches++;
          }
        }
      }
      if (lifestyleTotal > 0) {
        maxScore += 20;
        totalScore += (lifestyleMatches / lifestyleTotal) * 20;
        if (lifestyleMatches >= 3) reasons.push("Similar lifestyle");
        else if (lifestyleMatches >= 2) reasons.push("Compatible lifestyle");
      }

      if (myProfile.relationshipGoal && candidate.relationshipGoal) {
        maxScore += 15;
        if (myProfile.relationshipGoal === candidate.relationshipGoal) {
          totalScore += 15;
          const goalLabels: Record<string, string> = {
            casual: "Both looking for something casual",
            serious: "Both seeking a serious relationship",
            marriage: "Both looking for marriage",
            not_sure: "Both open to possibilities",
          };
          reasons.push(goalLabels[myProfile.relationshipGoal] || "Same relationship goals");
        }
      }

      if (myProfile.religion && candidate.religion) {
        maxScore += 10;
        if (myProfile.religion === candidate.religion) {
          totalScore += 10;
          reasons.push("Same faith");
        }
      }

      if (myProfile.familyPlans && candidate.familyPlans) {
        maxScore += 10;
        const compatible = myProfile.familyPlans === candidate.familyPlans ||
          (["want_kids", "open_to_kids"].includes(myProfile.familyPlans) &&
           ["want_kids", "open_to_kids"].includes(candidate.familyPlans));
        if (compatible) {
          totalScore += 10;
          reasons.push("Compatible family plans");
        }
      }

      if (myProfile.education && candidate.education) {
        maxScore += 5;
        if (myProfile.education === candidate.education) {
          totalScore += 5;
          reasons.push("Same education level");
        }
      }

      if (myProfile.pets && candidate.pets) {
        maxScore += 5;
        if (myProfile.pets === candidate.pets) {
          totalScore += 5;
          reasons.push("Same pet preferences");
        }
      }

      const myLangs = myProfile.languages || [];
      const theirLangs = candidate.languages || [];
      if (myLangs.length > 0 && theirLangs.length > 0) {
        maxScore += 5;
        const commonLangs = myLangs.filter(l => theirLangs.includes(l));
        if (commonLangs.length > 0) {
          totalScore += 5;
          reasons.push(`Speaks ${commonLangs[0]}`);
        }
      }

      maxScore += 5;
      if (candidate.isVerified) {
        totalScore += 3;
        reasons.push("Verified profile");
      }
      if (candidate.photoUrl) totalScore += 2;

      const compatibilityScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      return { profile: candidate, compatibilityScore, matchReasons: reasons };
    });

    return results
      .filter(r => r.compatibilityScore >= 15 && r.matchReasons.length >= 1)
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, 20);
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
        eq(matches.isDailyMatch, true)
      ))
      .orderBy(desc(matches.createdAt))
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

  async getMatch(matchId: number): Promise<typeof matches.$inferSelect | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    return match || undefined;
  }

  async deleteMatch(matchId: number, userId: string): Promise<boolean> {
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match) return false;
    if (match.user1Id !== userId && match.user2Id !== userId) return false;
    await db.transaction(async (tx) => {
      const relatedMicroDates = await tx.select().from(microDates).where(eq(microDates.matchId, matchId));
      for (const md of relatedMicroDates) {
        await tx.delete(microDateResponses).where(eq(microDateResponses.microDateId, md.id));
      }
      await tx.delete(microDates).where(eq(microDates.matchId, matchId));
      await tx.delete(messages).where(eq(messages.matchId, matchId));
      await tx.delete(matches).where(eq(matches.id, matchId));
    });
    return true;
  }

  async getLikesReceived(userId: string): Promise<Profile[]> {
    const blockedIds = await this.getBlockedUserIds(userId);

    const matchedUserIds = await db
      .select({ id: matches.user1Id })
      .from(matches)
      .where(or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)));
    const matchedIds = matchedUserIds.map(m => m.id);
    const matchedUserIds2 = await db
      .select({ id: matches.user2Id })
      .from(matches)
      .where(or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)));
    const allMatchedIds = [...new Set([...matchedIds, ...matchedUserIds2.map(m => m.id)])].filter(id => id !== userId);

    const likedSwipes = await db
      .select()
      .from(swipes)
      .where(and(
        eq(swipes.swipedId, userId),
        eq(swipes.liked, true)
      ))
      .orderBy(desc(swipes.createdAt));

    const excludeIds = [...new Set([...blockedIds, ...allMatchedIds, userId])];
    const likerProfiles: Profile[] = [];

    for (const swipe of likedSwipes) {
      if (excludeIds.includes(swipe.swiperId)) continue;
      const profile = await this.getProfile(swipe.swiperId);
      if (profile) likerProfiles.push(profile);
    }

    return likerProfiles;
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

  async getHiddenUserIds(userId: string): Promise<string[]> {
    const hidden = await db
      .select({ hiddenUserId: hiddenProfiles.hiddenUserId })
      .from(hiddenProfiles)
      .where(eq(hiddenProfiles.userId, userId));
    return hidden.map(h => h.hiddenUserId);
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

  async blockUser(blockerId: string, blockedUserId: string): Promise<Block> {
    const [created] = await db
      .insert(blocks)
      .values({ blockerId, blockedUserId })
      .returning();
    return created;
  }

  async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    await db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedUserId, blockedUserId)));
  }

  async isBlocked(blockerId: string, blockedUserId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedUserId, blockedUserId)));
    return !!existing;
  }

  async isBlockedEither(userId1: string, userId2: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(blocks)
      .where(or(
        and(eq(blocks.blockerId, userId1), eq(blocks.blockedUserId, userId2)),
        and(eq(blocks.blockerId, userId2), eq(blocks.blockedUserId, userId1))
      ));
    return !!existing;
  }

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const blocked = await db
      .select({ blockedUserId: blocks.blockedUserId })
      .from(blocks)
      .where(eq(blocks.blockerId, userId));
    const blockedBy = await db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(eq(blocks.blockedUserId, userId));
    return [...blocked.map(b => b.blockedUserId), ...blockedBy.map(b => b.blockerId)];
  }

  async getBlockedUsers(userId: string): Promise<{ block: Block; profile: Profile }[]> {
    const blockedRows = await db
      .select()
      .from(blocks)
      .where(eq(blocks.blockerId, userId))
      .orderBy(desc(blocks.createdAt));
    
    const results: { block: Block; profile: Profile }[] = [];
    for (const block of blockedRows) {
      const profile = await this.getProfile(block.blockedUserId);
      if (profile) {
        results.push({ block, profile });
      }
    }
    return results;
  }

  async createMicroDate(matchId: number, inviterId: string, inviteeId: string, activities: string): Promise<MicroDate> {
    const [created] = await db
      .insert(microDates)
      .values({ matchId, inviterId, inviteeId, activities, status: "pending" })
      .returning();
    return created;
  }

  async getMicroDate(id: number): Promise<MicroDate | undefined> {
    const [md] = await db.select().from(microDates).where(eq(microDates.id, id));
    return md;
  }

  async getMicroDateByMatch(matchId: number, status?: string): Promise<MicroDate | undefined> {
    if (status) {
      const [md] = await db
        .select()
        .from(microDates)
        .where(and(eq(microDates.matchId, matchId), eq(microDates.status, status)))
        .orderBy(desc(microDates.createdAt))
        .limit(1);
      return md;
    }
    const [md] = await db
      .select()
      .from(microDates)
      .where(and(
        eq(microDates.matchId, matchId),
        or(eq(microDates.status, "pending"), eq(microDates.status, "active"))
      ))
      .orderBy(desc(microDates.createdAt))
      .limit(1);
    return md;
  }

  async updateMicroDateStatus(id: number, status: string, startedAt?: Date, endsAt?: Date): Promise<MicroDate> {
    const updates: Record<string, any> = { status };
    if (startedAt) updates.startedAt = startedAt;
    if (endsAt) updates.endsAt = endsAt;
    const [updated] = await db
      .update(microDates)
      .set(updates)
      .where(eq(microDates.id, id))
      .returning();
    return updated;
  }

  async advanceMicroDateActivity(id: number, newIndex: number): Promise<MicroDate> {
    const [updated] = await db
      .update(microDates)
      .set({ currentActivityIndex: newIndex })
      .where(eq(microDates.id, id))
      .returning();
    return updated;
  }

  async getMicroDateResponses(microDateId: number): Promise<MicroDateResponse[]> {
    return db
      .select()
      .from(microDateResponses)
      .where(eq(microDateResponses.microDateId, microDateId))
      .orderBy(microDateResponses.activityIndex, microDateResponses.createdAt);
  }

  async createMicroDateResponse(microDateId: number, activityIndex: number, userId: string, response: string): Promise<MicroDateResponse> {
    const [existing] = await db
      .select()
      .from(microDateResponses)
      .where(and(
        eq(microDateResponses.microDateId, microDateId),
        eq(microDateResponses.activityIndex, activityIndex),
        eq(microDateResponses.userId, userId)
      ));
    if (existing) {
      const [updated] = await db
        .update(microDateResponses)
        .set({ response })
        .where(eq(microDateResponses.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(microDateResponses)
      .values({ microDateId, activityIndex, userId, response })
      .returning();
    return created;
  }

  async getMicroDatesForUser(userId: string): Promise<MicroDate[]> {
    return db
      .select()
      .from(microDates)
      .where(or(eq(microDates.inviterId, userId), eq(microDates.inviteeId, userId)))
      .orderBy(desc(microDates.createdAt));
  }
}

export const storage = new DatabaseStorage();
