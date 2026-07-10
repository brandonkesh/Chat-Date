import { db } from "./db";
import {
  users,
  sessions,
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
  feedback,
  rateLimits,
  pendingUploads,
  type PendingUpload,
  type Feedback,
  type InsertFeedback,
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
  dateCheckins,
  type DateCheckin,
  type InsertDateCheckin,
  successStories,
  type SuccessStory,
  type InsertSuccessStory,
  datingTips,
  type DatingTip,
  kudosTable,
  type Kudos,
  horoscopes,
  type Horoscope,
  blindDates,
  type BlindDate,
  blindDateMessages,
  type BlindDateMessage,
  invites,
  type Invite,
  inviteRedemptions,
  type InviteRedemption,
} from "@shared/schema";
import { eq, and, ne, notInArray, inArray, like, desc, or, sql, gte, isNull, isNotNull, asc } from "drizzle-orm";
import { randomBytes } from "crypto";
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
  updateProfile(userId: string, profile: Partial<InsertProfile> & { ageVerified?: boolean; voiceIntroUrl?: string | null; introVideoUrl?: string | null }): Promise<Profile>;
  getPotentialMatches(userId: string): Promise<Profile[]>;
  getRecommendedProfiles(userId: string): Promise<Profile[]>;
  getCrushPicks(userId: string): Promise<Profile[]>;
  getSecondChanceProfiles(userId: string): Promise<Profile[]>;
  undoPass(userId: string, swipedId: string): Promise<boolean>;
  setBoost(userId: string, until: Date): Promise<Profile>;
  getMatchmakingProfiles(userId: string): Promise<MatchmakingResult[]>;
  updatePaypalSubscription(userId: string, subscriptionId: string, isPremium: boolean, membershipTier?: MembershipTier, planId?: string, subscriberId?: string): Promise<void>;
  setTestPremium(userId: string, membershipTier: MembershipTier): Promise<void>;
  clearTestPremium(userId: string): Promise<void>;
  getProfileByPaypalSubscriptionId(subscriptionId: string): Promise<Profile | undefined>;
  
  // Swipes & Matches
  createSwipe(swipe: InsertSwipe): Promise<void>;
  checkMatch(user1Id: string, user2Id: string): Promise<boolean>;
  createMatch(user1Id: string, user2Id: string, isDailyMatch?: boolean): Promise<number>;
  getDailyMatch(userId: string): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile }) | undefined>;
  getMatch(matchId: number): Promise<typeof matches.$inferSelect | undefined>;
  deleteMatch(matchId: number, userId: string): Promise<boolean>;
  /**
   * Permanently delete a user and all of their data. Returns the object-storage
   * paths (`/objects/...`) of media the caller should remove from storage.
   */
  deleteAccount(userId: string): Promise<string[]>;
  getLikesReceived(userId: string): Promise<Profile[]>;
  
  // Messages
  getMessages(matchId: number): Promise<Message[]>;
  getMessage(messageId: number): Promise<Message | undefined>;
  createMessage(message: InsertMessage & { senderId: string }): Promise<Message>;
  
  // Verification
  submitVerification(userId: string, photoUrl: string): Promise<Profile>;
  updateVerificationStatus(userId: string, status: VerificationStatus): Promise<Profile>;

  // Two-factor authentication
  enableTwoFactor(userId: string, secret: string): Promise<Profile>;
  disableTwoFactor(userId: string): Promise<Profile>;
  getTwoFactorSecret(userId: string): Promise<string | null>;
  enableTwoFactorDelivery(userId: string, method: "email"): Promise<Profile>;
  setLoginOtp(userId: string, code: string, expiry: Date): Promise<Profile>;
  clearLoginOtp(userId: string): Promise<Profile>;

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
  isHiddenEither(userId1: string, userId2: string): Promise<boolean>;
  getHiddenUserIds(userId: string): Promise<string[]>;

  // Date Check-ins (safety)
  createDateCheckin(userId: string, checkin: InsertDateCheckin): Promise<DateCheckin>;
  getDateCheckins(userId: string): Promise<DateCheckin[]>;
  markDateCheckinSafe(id: number, userId: string): Promise<DateCheckin | undefined>;
  deleteDateCheckin(id: number, userId: string): Promise<boolean>;
  setDateCheckinFeedback(id: number, userId: string, rating: number, feedbackNote: string | null): Promise<DateCheckin | undefined>;

  // Daily rewards
  claimDailyReward(userId: string): Promise<{ alreadyClaimed: boolean; profile: Profile } | undefined>;

  // Success stories
  getSuccessStories(): Promise<SuccessStory[]>;
  createSuccessStory(userId: string, story: InsertSuccessStory): Promise<SuccessStory>;

  // Dating tips (weekly cache)
  getDatingTipsForWeek(weekKey: string): Promise<DatingTip | undefined>;
  saveDatingTips(weekKey: string, tips: string[]): Promise<DatingTip>;

  // Micro Dates
  createMicroDate(matchId: number, inviterId: string, inviteeId: string, activities: string): Promise<MicroDate>;
  getMicroDate(id: number): Promise<MicroDate | undefined>;
  getMicroDateByMatch(matchId: number, status?: string): Promise<MicroDate | undefined>;
  updateMicroDateStatus(id: number, status: string, startedAt?: Date, endsAt?: Date): Promise<MicroDate>;
  advanceMicroDateActivity(id: number, newIndex: number): Promise<MicroDate>;
  getMicroDateResponses(microDateId: number): Promise<MicroDateResponse[]>;
  createMicroDateResponse(microDateId: number, activityIndex: number, userId: string, response: string): Promise<MicroDateResponse>;
  getMicroDatesForUser(userId: string): Promise<MicroDate[]>;

  // Feedback
  createFeedback(feedback: InsertFeedback & { userId: string }): Promise<Feedback>;
  getAllFeedback(): Promise<(Feedback & { submitterEmail: string | null; submitterName: string | null })[]>;
  updateFeedbackStatus(id: number, status: string): Promise<Feedback | undefined>;

  // Rate limiting (durable, shared fixed-window)
  checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean>;
  // Byte-level quota tracking (same table as checkRateLimit; `incrementBytes` is
  // added to the window total and checked against `limitBytes`). Returns true
  // when the request is within quota (i.e. the new total does not exceed the limit).
  checkBytesQuota(key: string, incrementBytes: number, limitBytes: number, windowMs: number): Promise<boolean>;

  // Pending upload tracking: record signed upload URLs issued to users so that
  // post-upload verification can confirm ownership and enforce type/size limits
  // against the REAL stored object metadata immediately after the PUT.
  createPendingUpload(objectPath: string, userId: string, allowedTypePrefix: string, maxSizeBytes: number): Promise<void>;
  getPendingUpload(objectPath: string): Promise<import("@shared/schema").PendingUpload | undefined>;
  deletePendingUpload(objectPath: string): Promise<void>;
  // Deletes all pending upload records older than `maxAgeMs` and returns their
  // object paths so the caller can delete the corresponding GCS objects.
  deleteExpiredPendingUploads(maxAgeMs: number): Promise<string[]>;

  // Kudos ("Great Vibes" badge)
  giveKudos(matchId: number, fromUserId: string, toUserId: string): Promise<boolean>;
  hasGivenKudos(fromUserId: string, toUserId: string): Promise<boolean>;
  getKudosCount(userId: string): Promise<number>;

  // Question of the Week club
  getWeeklyAnswers(userId: string, weekKey: string): Promise<Profile[]>;

  // Slow dating mode
  countLikesToday(userId: string): Promise<number>;

  // Blind date roulette
  joinBlindRoulette(userId: string, durationMs: number): Promise<BlindDate>;
  getCurrentBlindDate(userId: string): Promise<BlindDate | undefined>;
  getBlindDate(id: number): Promise<BlindDate | undefined>;
  markBlindDateRevealed(id: number): Promise<void>;
  cancelBlindDate(id: number, userId: string): Promise<void>;
  getBlindDateMessages(blindDateId: number): Promise<BlindDateMessage[]>;
  createBlindDateMessage(blindDateId: number, senderId: string, content: string): Promise<BlindDateMessage>;

  // Love horoscopes (daily cache)
  getHoroscope(sign: string, dayKey: string): Promise<Horoscope | undefined>;
  saveHoroscope(sign: string, dayKey: string, content: string): Promise<Horoscope>;

  // Couple leaderboard: most chatty matches since a date
  getChattyMatches(since: Date, limit: number): Promise<{ matchId: number; name1: string; name2: string; messageCount: number }[]>;

  // Owner dashboard stats
  getAdminStats(): Promise<{
    totalMembers: number;
    newMembersThisWeek: number;
    totalMatches: number;
    matchesThisWeek: number;
    totalMessages: number;
    messagesThisWeek: number;
  }>;

  // Invite links
  getOrCreateInvite(userId: string): Promise<Invite>;
  getInviteByCode(code: string): Promise<Invite | undefined>;
  redeemInvite(code: string, redeemedByUserId: string): Promise<boolean>;
  getInviteRedemptions(inviterUserId: string): Promise<{ redemption: InviteRedemption; displayName: string | null }[]>;
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

  async updateProfile(userId: string, updates: Partial<InsertProfile> & { ageVerified?: boolean; voiceIntroUrl?: string | null; introVideoUrl?: string | null }): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async updatePaypalSubscription(
    userId: string,
    subscriptionId: string,
    isPremium: boolean,
    membershipTier?: MembershipTier,
    planId?: string,
    subscriberId?: string,
  ): Promise<void> {
    const updates: Record<string, any> = {
      paypalSubscriptionId: subscriptionId,
      isPremium,
    };
    if (membershipTier) {
      updates.membershipTier = membershipTier;
    }
    if (planId) {
      updates.paypalPlanId = planId;
    }
    if (subscriberId) {
      updates.paypalSubscriberId = subscriberId;
    }
    if (!isPremium) {
      updates.membershipTier = 'free';
      updates.paypalPlanId = null;
    }
    await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.userId, userId));
  }

  async setTestPremium(userId: string, membershipTier: MembershipTier): Promise<void> {
    // Grants premium to allow-listed test/family accounts. We also clear any
    // stale PayPal identifiers here: this method is only ever called for accounts
    // that are NOT active paying subscribers, so any leftover subscription id is
    // from a cancelled/incomplete checkout and would otherwise block testing.
    await db
      .update(profiles)
      .set({
        isPremium: true,
        membershipTier,
        paypalSubscriptionId: null,
        paypalPlanId: null,
        paypalSubscriberId: null,
      })
      .where(eq(profiles.userId, userId));
  }

  async clearTestPremium(userId: string): Promise<void> {
    // Revokes a test-granted premium WITHOUT touching any PayPal fields. Only
    // ever called for accounts that never had a PayPal subscription.
    await db
      .update(profiles)
      .set({ isPremium: false, membershipTier: "free" })
      .where(eq(profiles.userId, userId));
  }

  async getProfileByPaypalSubscriptionId(subscriptionId: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.paypalSubscriptionId, subscriptionId));
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
      potentialProfiles = [...sameZip, ...otherZip];
    }

    // Boosted profiles float to the front of the feed (stable within groups)
    const now = new Date();
    const isBoosted = (p: Profile) => !!p.boostedUntil && p.boostedUntil > now;
    const boosted = potentialProfiles.filter(isBoosted);
    const regular = potentialProfiles.filter(p => !isBoosted(p));
    return [...boosted, ...regular];
  }

  async getSecondChanceProfiles(userId: string): Promise<Profile[]> {
    // People this user passed on (swiped left)
    const passed = await db
      .select({ swipedId: swipes.swipedId, createdAt: swipes.createdAt })
      .from(swipes)
      .where(and(eq(swipes.swiperId, userId), eq(swipes.liked, false)))
      .orderBy(desc(swipes.createdAt));

    if (passed.length === 0) return [];

    const blockedIds = new Set(await this.getBlockedUserIds(userId));
    const hiddenIds = new Set(await this.getHiddenUserIds(userId));
    const passedIds = passed
      .map(p => p.swipedId)
      .filter(id => !blockedIds.has(id) && !hiddenIds.has(id));
    if (passedIds.length === 0) return [];

    const passedProfiles = await db
      .select()
      .from(profiles)
      .where(inArray(profiles.userId, passedIds));

    // Keep the most-recently-passed first
    const order = new Map(passedIds.map((id, i) => [id, i]));
    return passedProfiles.sort(
      (a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0),
    );
  }

  async undoPass(userId: string, swipedId: string): Promise<boolean> {
    const result = await db
      .delete(swipes)
      .where(and(
        eq(swipes.swiperId, userId),
        eq(swipes.swipedId, swipedId),
        eq(swipes.liked, false),
      ))
      .returning({ id: swipes.id });
    return result.length > 0;
  }

  async setBoost(userId: string, until: Date): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({ boostedUntil: until })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
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

  async getMatches(userId: string): Promise<(typeof matches.$inferSelect & { partnerProfile: Profile; lastMessageAt: Date | null; lastMessageSenderId: string | null })[]> {
    const userMatches = await db
      .select()
      .from(matches)
      .where(and(
        or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)),
        eq(matches.isDailyMatch, false)
      ));

    // Latest message (time + sender) per match, one query for all
    const matchIds = userMatches.map(m => m.id);
    const lastMessageByMatch = new Map<number, { at: Date; senderId: string }>();
    if (matchIds.length > 0) {
      const result = await db.execute(
        sql`SELECT DISTINCT ON (match_id) match_id, sender_id, created_at
            FROM messages
            WHERE match_id IN (${sql.join(matchIds.map(id => sql`${id}`), sql`, `)})
            ORDER BY match_id, created_at DESC`
      );
      for (const row of result.rows as any[]) {
        if (row.created_at) {
          lastMessageByMatch.set(Number(row.match_id), {
            at: new Date(row.created_at),
            senderId: String(row.sender_id),
          });
        }
      }
    }

    const results = [];
    for (const match of userMatches) {
      const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
      const blocked = await this.isBlockedEither(userId, partnerId);
      if (blocked) continue;
      const partnerProfile = await this.getProfile(partnerId);
      if (partnerProfile) {
        const last = lastMessageByMatch.get(match.id);
        results.push({
          ...match,
          partnerProfile,
          lastMessageAt: last?.at ?? null,
          lastMessageSenderId: last?.senderId ?? null,
        });
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

  async deleteAccount(userId: string): Promise<string[]> {
    const mediaPaths: string[] = [];
    const collectMedia = (value: string | null | undefined) => {
      if (value && value.startsWith("/objects/")) mediaPaths.push(value);
    };
    await db.transaction(async (tx) => {
      // 0. Collect uploaded media paths before the rows disappear.
      const [profileRow] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId));
      if (profileRow) {
        collectMedia(profileRow.photoUrl);
        collectMedia(profileRow.verificationPhotoUrl);
        collectMedia(profileRow.voiceIntroUrl);
        collectMedia(profileRow.introVideoUrl);
      }
      const voiceNotes = await tx
        .select({ voiceNoteUrl: messages.voiceNoteUrl })
        .from(messages)
        .where(and(eq(messages.senderId, userId), sql`${messages.voiceNoteUrl} IS NOT NULL`));
      for (const vn of voiceNotes) collectMedia(vn.voiceNoteUrl);
      // 1. Matches involving the user (and everything hanging off them).
      const userMatches = await tx
        .select({ id: matches.id })
        .from(matches)
        .where(or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)));
      const matchIds = userMatches.map((m) => m.id);
      if (matchIds.length > 0) {
        const relatedMicroDates = await tx
          .select({ id: microDates.id })
          .from(microDates)
          .where(inArray(microDates.matchId, matchIds));
        const microDateIds = relatedMicroDates.map((md) => md.id);
        if (microDateIds.length > 0) {
          await tx
            .delete(microDateResponses)
            .where(inArray(microDateResponses.microDateId, microDateIds));
        }
        await tx.delete(microDates).where(inArray(microDates.matchId, matchIds));
        await tx.delete(messages).where(inArray(messages.matchId, matchIds));
        await tx.delete(matches).where(inArray(matches.id, matchIds));
      }
      // 2. Swipes in either direction.
      await tx
        .delete(swipes)
        .where(or(eq(swipes.swiperId, userId), eq(swipes.swipedId, userId)));
      // 3. Reports filed by or about the user.
      await tx
        .delete(reports)
        .where(or(eq(reports.reporterId, userId), eq(reports.reportedUserId, userId)));
      // 4. Blocks in either direction.
      await tx
        .delete(blocks)
        .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedUserId, userId)));
      // 5. Saved / hidden profile links in either direction.
      await tx
        .delete(savedProfiles)
        .where(or(eq(savedProfiles.userId, userId), eq(savedProfiles.savedUserId, userId)));
      await tx
        .delete(hiddenProfiles)
        .where(or(eq(hiddenProfiles.userId, userId), eq(hiddenProfiles.hiddenUserId, userId)));
      // 6. Feedback and rate-limit counters.
      await tx.delete(feedback).where(eq(feedback.userId, userId));
      await tx.delete(rateLimits).where(like(rateLimits.key, `${userId}:%`));
      // 7. Revoke every login session for this user (all devices/browsers).
      await tx
        .delete(sessions)
        .where(sql`${sessions.sess} -> 'passport' -> 'user' -> 'claims' ->> 'sub' = ${userId}`);
      // 8. The profile itself, then the user row.
      await tx.delete(profiles).where(eq(profiles.userId, userId));
      await tx.delete(users).where(eq(users.id, userId));
    });
    return mediaPaths;
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

  async getMessage(messageId: number): Promise<Message | undefined> {
    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
    return msg || undefined;
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
      .set({ twoFactorEnabled: true, twoFactorSecret: secret, twoFactorMethod: "totp" })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async disableTwoFactor(userId: string): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorMethod: null,
        phoneNumber: null,
        loginOtpCode: null,
        loginOtpExpiry: null,
      })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async getTwoFactorSecret(userId: string): Promise<string | null> {
    const profile = await this.getProfile(userId);
    return profile?.twoFactorSecret ?? null;
  }

  async enableTwoFactorDelivery(userId: string, method: "email"): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({
        twoFactorEnabled: true,
        twoFactorMethod: method,
        twoFactorSecret: null,
        phoneNumber: null,
        loginOtpCode: null,
        loginOtpExpiry: null,
      })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async setLoginOtp(userId: string, code: string, expiry: Date): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({ loginOtpCode: code, loginOtpExpiry: expiry })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
  }

  async clearLoginOtp(userId: string): Promise<Profile> {
    const [updated] = await db
      .update(profiles)
      .set({ loginOtpCode: null, loginOtpExpiry: null })
      .where(eq(profiles.userId, userId))
      .returning();
    return updated;
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

  async hideProfile(userId: string, hiddenUserId: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(hiddenProfiles)
      .where(and(eq(hiddenProfiles.userId, userId), eq(hiddenProfiles.hiddenUserId, hiddenUserId)));
    if (!existing) {
      await db.insert(hiddenProfiles).values({ userId, hiddenUserId });
    }
  }

  async unhideProfile(userId: string, hiddenUserId: string): Promise<void> {
    await db
      .delete(hiddenProfiles)
      .where(and(eq(hiddenProfiles.userId, userId), eq(hiddenProfiles.hiddenUserId, hiddenUserId)));
  }

  async isHidden(userId: string, hiddenUserId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(hiddenProfiles)
      .where(and(eq(hiddenProfiles.userId, userId), eq(hiddenProfiles.hiddenUserId, hiddenUserId)));
    return !!existing;
  }

  async isHiddenEither(userId1: string, userId2: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(hiddenProfiles)
      .where(or(
        and(eq(hiddenProfiles.userId, userId1), eq(hiddenProfiles.hiddenUserId, userId2)),
        and(eq(hiddenProfiles.userId, userId2), eq(hiddenProfiles.hiddenUserId, userId1)),
      ));
    return !!existing;
  }

  async saveProfile(userId: string, savedUserId: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(savedProfiles)
      .where(and(eq(savedProfiles.userId, userId), eq(savedProfiles.savedUserId, savedUserId)));
    if (!existing) {
      await db.insert(savedProfiles).values({ userId, savedUserId });
    }
  }

  async unsaveProfile(userId: string, savedUserId: string): Promise<void> {
    await db
      .delete(savedProfiles)
      .where(and(eq(savedProfiles.userId, userId), eq(savedProfiles.savedUserId, savedUserId)));
  }

  async isSaved(userId: string, savedUserId: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(savedProfiles)
      .where(and(eq(savedProfiles.userId, userId), eq(savedProfiles.savedUserId, savedUserId)));
    return !!existing;
  }

  async getSavedProfiles(userId: string): Promise<Profile[]> {
    const saved = await db
      .select({ savedUserId: savedProfiles.savedUserId })
      .from(savedProfiles)
      .where(eq(savedProfiles.userId, userId));
    const profiles: Profile[] = [];
    for (const s of saved) {
      // Enforce blocks at read time: profiles saved before a block (in either
      // direction) must no longer be visible through the saved list.
      if (await this.isBlockedEither(userId, s.savedUserId)) continue;
      const profile = await this.getProfile(s.savedUserId);
      if (profile) profiles.push(profile);
    }
    return profiles;
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

  async createDateCheckin(userId: string, checkin: InsertDateCheckin): Promise<DateCheckin> {
    const [created] = await db
      .insert(dateCheckins)
      .values({ ...checkin, userId })
      .returning();
    return created;
  }

  async getDateCheckins(userId: string): Promise<DateCheckin[]> {
    return db
      .select()
      .from(dateCheckins)
      .where(eq(dateCheckins.userId, userId))
      .orderBy(desc(dateCheckins.dateTime));
  }

  async markDateCheckinSafe(id: number, userId: string): Promise<DateCheckin | undefined> {
    const [updated] = await db
      .update(dateCheckins)
      .set({ checkedIn: true })
      .where(and(eq(dateCheckins.id, id), eq(dateCheckins.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteDateCheckin(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(dateCheckins)
      .where(and(eq(dateCheckins.id, id), eq(dateCheckins.userId, userId)))
      .returning({ id: dateCheckins.id });
    return result.length > 0;
  }

  async setDateCheckinFeedback(id: number, userId: string, rating: number, feedbackNote: string | null): Promise<DateCheckin | undefined> {
    const [updated] = await db
      .update(dateCheckins)
      .set({ rating, feedbackNote })
      .where(and(eq(dateCheckins.id, id), eq(dateCheckins.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async claimDailyReward(userId: string): Promise<{ alreadyClaimed: boolean; profile: Profile } | undefined> {
    const profile = await this.getProfile(userId);
    if (!profile) return undefined;

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const lastAt = profile.lastRewardAt ? new Date(profile.lastRewardAt) : null;
    const lastKey = lastAt ? lastAt.toISOString().slice(0, 10) : null;

    if (lastKey === todayKey) {
      return { alreadyClaimed: true, profile };
    }

    const yesterdayKey = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const newStreak = lastKey === yesterdayKey ? (profile.rewardStreak ?? 0) + 1 : 1;

    const [updated] = await db
      .update(profiles)
      .set({ rewardStreak: newStreak, lastRewardAt: now })
      .where(eq(profiles.userId, userId))
      .returning();
    return { alreadyClaimed: false, profile: updated };
  }

  async getSuccessStories(): Promise<SuccessStory[]> {
    return db
      .select()
      .from(successStories)
      .orderBy(desc(successStories.createdAt))
      .limit(50);
  }

  async createSuccessStory(userId: string, story: InsertSuccessStory): Promise<SuccessStory> {
    const [created] = await db
      .insert(successStories)
      .values({ ...story, userId })
      .returning();
    return created;
  }

  async getDatingTipsForWeek(weekKey: string): Promise<DatingTip | undefined> {
    const [row] = await db.select().from(datingTips).where(eq(datingTips.weekKey, weekKey));
    return row || undefined;
  }

  async saveDatingTips(weekKey: string, tips: string[]): Promise<DatingTip> {
    const [created] = await db
      .insert(datingTips)
      .values({ weekKey, tips })
      .onConflictDoUpdate({ target: datingTips.weekKey, set: { tips } })
      .returning();
    return created;
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

  async createFeedback(feedbackData: InsertFeedback & { userId: string }): Promise<Feedback> {
    const [created] = await db
      .insert(feedback)
      .values(feedbackData)
      .returning();
    return created;
  }

  async getAllFeedback(): Promise<(Feedback & { submitterEmail: string | null; submitterName: string | null })[]> {
    const rows = await db
      .select({
        id: feedback.id,
        userId: feedback.userId,
        category: feedback.category,
        message: feedback.message,
        status: feedback.status,
        createdAt: feedback.createdAt,
        submitterEmail: users.email,
        submitterFirstName: users.firstName,
        submitterLastName: users.lastName,
      })
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.id))
      .orderBy(desc(feedback.createdAt));

    return rows.map((r) => {
      const name = [r.submitterFirstName, r.submitterLastName].filter(Boolean).join(" ").trim();
      return {
        id: r.id,
        userId: r.userId,
        category: r.category,
        message: r.message,
        status: r.status,
        createdAt: r.createdAt,
        submitterEmail: r.submitterEmail ?? null,
        submitterName: name.length > 0 ? name : null,
      };
    });
  }

  async updateFeedbackStatus(id: number, status: string): Promise<Feedback | undefined> {
    const [updated] = await db
      .update(feedback)
      .set({ status })
      .where(eq(feedback.id, id))
      .returning();
    return updated;
  }

  async checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    // Atomic fixed-window upsert: on conflict, reset the window when it has
    // expired, otherwise increment. Returns the resulting count so we can
    // decide whether this request is within quota. Running this in a single
    // statement keeps it correct across restarts and multiple instances.
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, windowStart: now })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`CASE WHEN ${now} - ${rateLimits.windowStart} >= ${windowMs} THEN 1 ELSE ${rateLimits.count} + 1 END`,
          windowStart: sql`CASE WHEN ${now} - ${rateLimits.windowStart} >= ${windowMs} THEN ${now} ELSE ${rateLimits.windowStart} END`,
        },
      })
      .returning({ count: rateLimits.count });
    return row.count <= limit;
  }

  async checkBytesQuota(key: string, incrementBytes: number, limitBytes: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    // Same fixed-window pattern as checkRateLimit but accumulates bytes
    // instead of request counts. Uses the same rate_limits table with the
    // bytes total stored in the `count` column.
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: incrementBytes, windowStart: now })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`CASE WHEN ${now} - ${rateLimits.windowStart} >= ${windowMs} THEN ${incrementBytes} ELSE ${rateLimits.count} + ${incrementBytes} END`,
          windowStart: sql`CASE WHEN ${now} - ${rateLimits.windowStart} >= ${windowMs} THEN ${now} ELSE ${rateLimits.windowStart} END`,
        },
      })
      .returning({ count: rateLimits.count });
    return row.count <= limitBytes;
  }

  async createPendingUpload(objectPath: string, userId: string, allowedTypePrefix: string, maxSizeBytes: number): Promise<void> {
    await db
      .insert(pendingUploads)
      .values({ objectPath, userId, allowedTypePrefix, maxSizeBytes, issuedAt: Date.now() })
      .onConflictDoUpdate({
        target: pendingUploads.objectPath,
        set: { userId, allowedTypePrefix, maxSizeBytes, issuedAt: Date.now() },
      });
  }

  async getPendingUpload(objectPath: string): Promise<PendingUpload | undefined> {
    const [row] = await db
      .select()
      .from(pendingUploads)
      .where(eq(pendingUploads.objectPath, objectPath));
    return row;
  }

  async deletePendingUpload(objectPath: string): Promise<void> {
    await db.delete(pendingUploads).where(eq(pendingUploads.objectPath, objectPath));
  }

  async deleteExpiredPendingUploads(maxAgeMs: number): Promise<string[]> {
    const cutoff = Date.now() - maxAgeMs;
    const rows = await db
      .delete(pendingUploads)
      .where(sql`${pendingUploads.issuedAt} < ${cutoff}`)
      .returning({ objectPath: pendingUploads.objectPath });
    return rows.map((r) => r.objectPath);
  }

  // === KUDOS ===

  async giveKudos(matchId: number, fromUserId: string, toUserId: string): Promise<boolean> {
    // The unique (from,to) constraint makes this idempotent: a second attempt
    // inserts nothing and we report that kudos was already given.
    const rows = await db
      .insert(kudosTable)
      .values({ matchId, fromUserId, toUserId })
      .onConflictDoNothing()
      .returning({ id: kudosTable.id });
    return rows.length > 0;
  }

  async hasGivenKudos(fromUserId: string, toUserId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: kudosTable.id })
      .from(kudosTable)
      .where(and(eq(kudosTable.fromUserId, fromUserId), eq(kudosTable.toUserId, toUserId)));
    return !!row;
  }

  async getKudosCount(userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(kudosTable)
      .where(eq(kudosTable.toUserId, userId));
    return row?.count ?? 0;
  }

  // === QUESTION OF THE WEEK CLUB ===

  async getWeeklyAnswers(userId: string, weekKey: string): Promise<Profile[]> {
    // Exclude anyone with a block in either direction — the club must not
    // become a side-channel around profile hiding.
    const blockRows = await db
      .select()
      .from(blocks)
      .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedUserId, userId)));
    const excluded = new Set<string>();
    for (const b of blockRows) {
      excluded.add(b.blockerId === userId ? b.blockedUserId : b.blockerId);
    }

    const rows = await db
      .select()
      .from(profiles)
      .where(and(
        eq(profiles.weeklyQuestionKey, weekKey),
        isNotNull(profiles.weeklyAnswer),
        ne(profiles.weeklyAnswer, ""),
      ))
      .orderBy(desc(profiles.id));

    return rows.filter((p) => !excluded.has(p.userId));
  }

  // === SLOW DATING MODE ===

  async countLikesToday(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(swipes)
      .where(and(
        eq(swipes.swiperId, userId),
        eq(swipes.liked, true),
        gte(swipes.createdAt, startOfDay),
      ));
    return row?.count ?? 0;
  }

  // === BLIND DATE ROULETTE ===

  async joinBlindRoulette(userId: string, durationMs: number): Promise<BlindDate> {
    // Already in a session? Return it instead of double-joining.
    const existing = await this.getCurrentBlindDate(userId);
    if (existing) return existing;

    // Users blocked in either direction must never be paired.
    const blockRows = await db
      .select()
      .from(blocks)
      .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedUserId, userId)));
    const excluded = new Set<string>();
    for (const b of blockRows) {
      excluded.add(b.blockerId === userId ? b.blockedUserId : b.blockerId);
    }

    // Find the oldest compatible waiting session from someone else.
    const waiting = await db
      .select()
      .from(blindDates)
      .where(and(
        eq(blindDates.status, "waiting"),
        ne(blindDates.user1Id, userId),
        isNull(blindDates.user2Id),
      ))
      .orderBy(asc(blindDates.createdAt));

    const candidate = waiting.find((w) => !excluded.has(w.user1Id));
    if (candidate) {
      const now = new Date();
      const endsAt = new Date(now.getTime() + durationMs);
      // Guard the update on status still being 'waiting' so two joiners can't
      // both claim the same session.
      const [claimed] = await db
        .update(blindDates)
        .set({ user2Id: userId, status: "active", startedAt: now, endsAt })
        .where(and(eq(blindDates.id, candidate.id), eq(blindDates.status, "waiting")))
        .returning();
      if (claimed) return claimed;
    }

    const [created] = await db
      .insert(blindDates)
      .values({ user1Id: userId, status: "waiting" })
      .returning();
    return created;
  }

  async getCurrentBlindDate(userId: string): Promise<BlindDate | undefined> {
    const [row] = await db
      .select()
      .from(blindDates)
      .where(and(
        or(eq(blindDates.user1Id, userId), eq(blindDates.user2Id, userId)),
        inArray(blindDates.status, ["waiting", "active", "revealed"]),
      ))
      .orderBy(desc(blindDates.createdAt))
      .limit(1);
    return row;
  }

  async getBlindDate(id: number): Promise<BlindDate | undefined> {
    const [row] = await db.select().from(blindDates).where(eq(blindDates.id, id));
    return row;
  }

  async markBlindDateRevealed(id: number): Promise<void> {
    await db.update(blindDates).set({ status: "revealed" }).where(eq(blindDates.id, id));
  }

  async cancelBlindDate(id: number, userId: string): Promise<void> {
    // Only a participant can end the session.
    await db
      .update(blindDates)
      .set({ status: "cancelled" })
      .where(and(
        eq(blindDates.id, id),
        or(eq(blindDates.user1Id, userId), eq(blindDates.user2Id, userId)),
      ));
  }

  async getBlindDateMessages(blindDateId: number): Promise<BlindDateMessage[]> {
    return db
      .select()
      .from(blindDateMessages)
      .where(eq(blindDateMessages.blindDateId, blindDateId))
      .orderBy(asc(blindDateMessages.createdAt));
  }

  async createBlindDateMessage(blindDateId: number, senderId: string, content: string): Promise<BlindDateMessage> {
    const [row] = await db
      .insert(blindDateMessages)
      .values({ blindDateId, senderId, content })
      .returning();
    return row;
  }

  // === LOVE HOROSCOPES ===

  async getHoroscope(sign: string, dayKey: string): Promise<Horoscope | undefined> {
    const [row] = await db
      .select()
      .from(horoscopes)
      .where(and(eq(horoscopes.sign, sign), eq(horoscopes.dayKey, dayKey)));
    return row;
  }

  async saveHoroscope(sign: string, dayKey: string, content: string): Promise<Horoscope> {
    const [row] = await db
      .insert(horoscopes)
      .values({ sign, dayKey, content })
      .onConflictDoUpdate({
        target: [horoscopes.sign, horoscopes.dayKey],
        set: { content },
      })
      .returning();
    return row;
  }

  // === COUPLE LEADERBOARD ===

  async getChattyMatches(since: Date, limit: number): Promise<{ matchId: number; name1: string; name2: string; messageCount: number }[]> {
    const counts = await db
      .select({ matchId: messages.matchId, messageCount: sql<number>`count(*)::int` })
      .from(messages)
      .where(gte(messages.createdAt, since))
      .groupBy(messages.matchId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);

    const results: { matchId: number; name1: string; name2: string; messageCount: number }[] = [];
    for (const c of counts) {
      const [match] = await db.select().from(matches).where(eq(matches.id, c.matchId));
      if (!match) continue;
      const [p1] = await db.select().from(profiles).where(eq(profiles.userId, match.user1Id));
      const [p2] = await db.select().from(profiles).where(eq(profiles.userId, match.user2Id));
      if (!p1 || !p2) continue;
      // First names only — this is a public-ish, playful board.
      const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Someone";
      results.push({
        matchId: c.matchId,
        name1: firstName(p1.displayName),
        name2: firstName(p2.displayName),
        messageCount: c.messageCount,
      });
    }
    return results;
  }

  // === OWNER DASHBOARD STATS ===

  async getAdminStats() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [members] = await db.select({ count: sql<number>`count(*)::int` }).from(profiles);
    const [newMembers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(gte(users.createdAt, weekAgo));
    const [totalMatches] = await db.select({ count: sql<number>`count(*)::int` }).from(matches);
    const [weekMatches] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(matches)
      .where(gte(matches.createdAt, weekAgo));
    const [totalMessages] = await db.select({ count: sql<number>`count(*)::int` }).from(messages);
    const [weekMessages] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(gte(messages.createdAt, weekAgo));
    return {
      totalMembers: members?.count ?? 0,
      newMembersThisWeek: newMembers?.count ?? 0,
      totalMatches: totalMatches?.count ?? 0,
      matchesThisWeek: weekMatches?.count ?? 0,
      totalMessages: totalMessages?.count ?? 0,
      messagesThisWeek: weekMessages?.count ?? 0,
    };
  }

  // === INVITE LINKS ===

  async getOrCreateInvite(userId: string): Promise<Invite> {
    const [existing] = await db.select().from(invites).where(eq(invites.userId, userId));
    if (existing) return existing;

    // Short, unambiguous code (no 0/O/1/I confusion).
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 5; attempt++) {
      let code = "";
      const bytes = randomBytes(8);
      for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
      const rows = await db
        .insert(invites)
        .values({ userId, code })
        .onConflictDoNothing()
        .returning();
      if (rows.length > 0) return rows[0];
      // Conflict: either the code collided (retry) or another request created
      // this user's invite concurrently (return it).
      const [race] = await db.select().from(invites).where(eq(invites.userId, userId));
      if (race) return race;
    }
    throw new Error("Could not generate a unique invite code");
  }

  async getInviteByCode(code: string): Promise<Invite | undefined> {
    const [row] = await db.select().from(invites).where(eq(invites.code, code));
    return row;
  }

  async redeemInvite(code: string, redeemedByUserId: string): Promise<boolean> {
    const invite = await this.getInviteByCode(code);
    if (!invite) return false;
    if (invite.userId === redeemedByUserId) return false; // can't invite yourself
    const rows = await db
      .insert(inviteRedemptions)
      .values({ inviteCode: invite.code, inviterUserId: invite.userId, redeemedByUserId })
      .onConflictDoNothing() // each user can only be invited once
      .returning({ id: inviteRedemptions.id });
    return rows.length > 0;
  }

  async getInviteRedemptions(inviterUserId: string): Promise<{ redemption: InviteRedemption; displayName: string | null }[]> {
    const rows = await db
      .select({ redemption: inviteRedemptions, displayName: profiles.displayName })
      .from(inviteRedemptions)
      .leftJoin(profiles, eq(profiles.userId, inviteRedemptions.redeemedByUserId))
      .where(eq(inviteRedemptions.inviterUserId, inviterUserId))
      .orderBy(desc(inviteRedemptions.createdAt));
    return rows.map((r) => ({ redemption: r.redemption, displayName: r.displayName ?? null }));
  }
}

export const storage = new DatabaseStorage();
