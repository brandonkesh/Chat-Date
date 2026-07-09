import { pgTable, text, serial, integer, boolean, timestamp, varchar, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";
import { relations } from "drizzle-orm";

export * from "./models/auth";

// Membership tiers: free, basic, pro, elite
export type MembershipTier = 'free' | 'basic' | 'pro' | 'elite';

// Verification status: none, pending, approved, rejected
export type VerificationStatus = 'none' | 'pending' | 'approved' | 'rejected';

// === PROFILES ===
export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id).unique(), // One profile per user
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  age: integer("age").notNull(),
  dateOfBirth: text("date_of_birth"),
  ageVerified: boolean("age_verified").default(false),
  gender: text("gender").notNull(), // 'male', 'female', 'other'
  interestedIn: text("interested_in").notNull(), // 'male', 'female', 'everyone'
  photoUrl: text("photo_url"),
  interests: text("interests").array(), // Array of hobbies/interests
  trialEndsAt: timestamp("trial_ends_at").notNull(), // When the free month ends
  paypalSubscriberId: text("paypal_subscriber_id"), // PayPal payer/subscriber id
  paypalSubscriptionId: text("paypal_subscription_id"),
  paypalPlanId: text("paypal_plan_id"), // Track which PayPal plan they subscribed to
  isPremium: boolean("is_premium").default(false),
  membershipTier: text("membership_tier").default("free"), // 'free', 'basic', 'pro', 'elite'
  // Verification fields
  isVerified: boolean("is_verified").default(false),
  verificationPhotoUrl: text("verification_photo_url"),
  verificationStatus: text("verification_status").default("none"), // 'none', 'pending', 'approved', 'rejected'
  // Basic preferences
  minAgePreference: integer("min_age_preference").default(18),
  maxAgePreference: integer("max_age_preference").default(50),
  maxDistance: integer("max_distance").default(50), // in miles
  // Location
  locationName: text("location_name"), // City, State or address display name
  latitude: text("latitude"),
  longitude: text("longitude"),
  zipCode: text("zip_code"),
  // Appearance preferences (what you're looking for)
  looksPreference: text("looks_preference"), // 'any', 'attractive', 'average', 'below_average'
  bodyTypePreference: text("body_type_preference"), // 'any', 'slim', 'athletic', 'average', 'curvy', 'plus_size'
  minHeightPreference: integer("min_height_preference"), // in inches
  maxHeightPreference: integer("max_height_preference"), // in inches
  // Lifestyle fields
  drinking: text("drinking"), // 'never', 'socially', 'regularly'
  smoking: text("smoking"), // 'never', 'socially', 'regularly'
  marijuana: text("marijuana"), // 'never', 'socially', 'regularly'
  exercise: text("exercise"), // 'never', 'sometimes', 'active', 'very_active'
  diet: text("diet"), // 'anything', 'vegetarian', 'vegan', 'pescatarian', 'kosher', 'halal', 'other'
  pets: text("pets"), // 'none', 'have_dog', 'have_cat', 'have_other', 'want_pets'
  kids: text("kids"), // 'have_and_want_more', 'have_and_done', 'want_someday', 'dont_want', 'not_sure'
  religion: text("religion"), // 'not_religious', 'spiritual', 'christian', 'jewish', 'muslim', 'hindu', 'buddhist', 'other'
  education: text("education"), // 'high_school', 'some_college', 'bachelors', 'masters', 'doctorate'
  jobTitle: text("job_title"), // Free text for job title
  company: text("company"), // Free text for company name
  // Family & Relationship fields
  relationshipGoal: text("relationship_goal"), // 'casual', 'serious', 'marriage', 'not_sure'
  familyPlans: text("family_plans"), // 'want_kids', 'dont_want_kids', 'have_kids', 'open_to_kids', 'not_sure'
  livingSituation: text("living_situation"), // 'alone', 'with_roommates', 'with_family', 'with_partner'
  lookingForDescription: text("looking_for_description"), // Free-text: what they're looking for in a partner
  // Background & Identity fields
  languages: text("languages").array(), // Array of languages spoken
  orientation: text("orientation"), // 'straight', 'gay', 'lesbian', 'bisexual', 'pansexual', 'asexual', 'queer', 'other'
  ethnicity: text("ethnicity"), // 'asian', 'black', 'hispanic', 'middle_eastern', 'native_american', 'pacific_islander', 'white', 'mixed', 'other'
  politicalViews: text("political_views"), // 'liberal', 'moderate', 'conservative', 'apolitical', 'other'
  astrologicalSign: text("astrological_sign"), // 'aries', 'taurus', 'gemini', etc.
  // Voice intro
  voiceIntroUrl: text("voice_intro_url"),
  // Intro video
  introVideoUrl: text("intro_video_url"),
  // App lock password
  passwordHash: text("password_hash"),
  backupCodes: text("backup_codes").array(),
  // Two-factor authentication
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: text("two_factor_secret"),
  // Delivery-based 2FA: 'totp' (authenticator app), 'email', or 'sms'
  twoFactorMethod: text("two_factor_method"),
  phoneNumber: text("phone_number"),
  // One-time login code delivered by email/SMS (short-lived)
  loginOtpCode: text("login_otp_code"),
  loginOtpExpiry: timestamp("login_otp_expiry"),
  // Email verification
  emailVerified: boolean("email_verified").default(false),
  emailVerificationCode: text("email_verification_code"),
  emailVerificationExpiry: timestamp("email_verification_expiry"),
  // Profile boost (premium perk): shown first in the feed until this time
  boostedUntil: timestamp("boosted_until"),
  // Question of the week: answer + the week it was answered for (e.g. "2026-W28")
  weeklyAnswer: text("weekly_answer"),
  weeklyQuestionKey: text("weekly_question_key"),
  // Personality badges from the fun quiz (e.g. "Early Bird", "Foodie")
  personalityBadges: text("personality_badges").array(),
  // Song of the day pinned to the profile
  songOfTheDay: text("song_of_the_day"),
  // Profile prompt shown on swipe cards
  promptQuestion: text("prompt_question"),
  promptAnswer: text("prompt_answer"),
  // Daily login rewards
  rewardStreak: integer("reward_streak").default(0),
  lastRewardAt: timestamp("last_reward_at"),
  // IANA timezone auto-detected from the user's device (e.g. "America/Chicago")
  timezone: text("timezone"),
});

export const insertProfileSchema = createInsertSchema(profiles).omit({ 
  id: true, 
  userId: true,
  trialEndsAt: true,
  paypalSubscriberId: true,
  paypalSubscriptionId: true,
  paypalPlanId: true,
  isPremium: true,
  membershipTier: true,
  isVerified: true,
  verificationPhotoUrl: true,
  verificationStatus: true,
  ageVerified: true,
  passwordHash: true,
  backupCodes: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  twoFactorMethod: true,
  phoneNumber: true,
  loginOtpCode: true,
  loginOtpExpiry: true,
  emailVerified: true,
  emailVerificationCode: true,
  emailVerificationExpiry: true,
  boostedUntil: true,
  rewardStreak: true,
  lastRewardAt: true,
});

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;

// === SWIPES ===
export const swipes = pgTable("swipes", {
  id: serial("id").primaryKey(),
  swiperId: varchar("swiper_id").notNull().references(() => users.id),
  swipedId: varchar("swiped_id").notNull().references(() => users.id),
  liked: boolean("liked").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSwipeSchema = createInsertSchema(swipes).omit({ id: true, createdAt: true });
export type InsertSwipe = z.infer<typeof insertSwipeSchema>;

// === MATCHES ===
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  user1Id: varchar("user1_id").notNull().references(() => users.id),
  user2Id: varchar("user2_id").notNull().references(() => users.id),
  isDailyMatch: boolean("is_daily_match").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// === MESSAGES ===
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matches.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  voiceNoteUrl: text("voice_note_url"),
  voiceNoteDuration: integer("voice_note_duration"),
  isScam: boolean("is_scam").default(false),
  scamAnalysis: text("scam_analysis"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ 
  id: true, 
  createdAt: true,
  senderId: true // inferred from auth
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// === REPORTS ===
export const reportReasons = [
  'inappropriate_photos',
  'harassment',
  'fake_profile',
  'spam',
  'underage',
  'offensive_content',
  'scam',
  'other',
] as const;

export type ReportReason = typeof reportReasons[number];

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: varchar("reporter_id").notNull().references(() => users.id),
  reportedUserId: varchar("reported_user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReportSchema = createInsertSchema(reports).omit({ id: true, createdAt: true, reporterId: true, status: true });
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

// === BLOCKS ===
export const blocks = pgTable("blocks", {
  id: serial("id").primaryKey(),
  blockerId: varchar("blocker_id").notNull().references(() => users.id),
  blockedUserId: varchar("blocked_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Block = typeof blocks.$inferSelect;

// === SAVED PROFILES ===
export const savedProfiles = pgTable("saved_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  savedUserId: varchar("saved_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedProfileSchema = createInsertSchema(savedProfiles).omit({ id: true, createdAt: true });
export type InsertSavedProfile = z.infer<typeof insertSavedProfileSchema>;
export type SavedProfile = typeof savedProfiles.$inferSelect;

// === HIDDEN PROFILES ===
export const hiddenProfiles = pgTable("hidden_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  hiddenUserId: varchar("hidden_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHiddenProfileSchema = createInsertSchema(hiddenProfiles).omit({ id: true, createdAt: true });
export type InsertHiddenProfile = z.infer<typeof insertHiddenProfileSchema>;
export type HiddenProfile = typeof hiddenProfiles.$inferSelect;

// === DATE CHECK-INS (safety feature) ===
export const dateCheckins = pgTable("date_checkins", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  dateName: text("date_name").notNull(), // Who they're meeting
  location: text("location").notNull(), // Where
  dateTime: timestamp("date_time").notNull(), // When
  notes: text("notes"), // Optional extra details
  friendEmail: text("friend_email").notNull(), // Trusted contact
  checkedIn: boolean("checked_in").default(false), // "I'm safe" pressed
  rating: integer("rating"), // Post-date feedback: 1-5 stars
  feedbackNote: text("feedback_note"), // Post-date private note
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDateCheckinSchema = createInsertSchema(dateCheckins)
  .omit({ id: true, userId: true, checkedIn: true, createdAt: true })
  .extend({
    dateName: z.string().min(1).max(100),
    location: z.string().min(1).max(200),
    notes: z.string().max(500).optional().nullable(),
    friendEmail: z.string().email().max(200),
    dateTime: z.coerce.date(),
  });
export type InsertDateCheckin = z.infer<typeof insertDateCheckinSchema>;
export type DateCheckin = typeof dateCheckins.$inferSelect;

export const dateFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedbackNote: z.string().max(1000).optional().nullable(),
});

// === SUCCESS STORIES ===
export const successStories = pgTable("success_stories", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  coupleNames: text("couple_names").notNull(), // e.g. "Sarah & Mike"
  story: text("story").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSuccessStorySchema = createInsertSchema(successStories)
  .omit({ id: true, userId: true, createdAt: true })
  .extend({
    coupleNames: z.string().min(1).max(100),
    story: z.string().min(20, "Tell us a little more! (at least 20 characters)").max(2000),
  });
export type InsertSuccessStory = z.infer<typeof insertSuccessStorySchema>;
export type SuccessStory = typeof successStories.$inferSelect;

// === DATING TIPS (weekly AI-generated, cached) ===
export const datingTips = pgTable("dating_tips", {
  id: serial("id").primaryKey(),
  weekKey: text("week_key").notNull().unique(), // e.g. "2026-W28"
  tips: text("tips").array().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type DatingTip = typeof datingTips.$inferSelect;

// === FEEDBACK ===
export const feedbackCategories = ['bug', 'suggestion', 'other'] as const;
export type FeedbackCategory = typeof feedbackCategories[number];

export const feedbackStatuses = ['new', 'resolved'] as const;
export type FeedbackStatus = typeof feedbackStatuses[number];

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  category: text("category").notNull().default("other"), // 'bug', 'suggestion', 'other'
  message: text("message").notNull(),
  status: text("status").notNull().default("new"), // 'new', 'resolved'
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedback, {
  category: z.enum(feedbackCategories),
  message: z.string().min(1, "Please enter a message").max(2000, "Message is too long"),
}).omit({ id: true, userId: true, status: true, createdAt: true });

export const updateFeedbackStatusSchema = z.object({
  status: z.enum(feedbackStatuses),
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

// === RATE LIMITS ===
// Durable, shared fixed-window rate limiting so limits survive server
// restarts and hold across multiple instances (in-memory counters do not).
// `key` is `${userId}:${endpoint}`; `windowStart` is epoch milliseconds.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
});

export type RateLimit = typeof rateLimits.$inferSelect;

// === MICRO DATES ===
export type MicroDateStatus = 'pending' | 'active' | 'completed' | 'expired' | 'declined';

export const microDates = pgTable("micro_dates", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matches.id),
  inviterId: varchar("inviter_id").notNull().references(() => users.id),
  inviteeId: varchar("invitee_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  activities: text("activities").notNull(), // JSON string of activity lineup
  currentActivityIndex: integer("current_activity_index").default(0),
  startedAt: timestamp("started_at"),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type MicroDate = typeof microDates.$inferSelect;

export const microDateResponses = pgTable("micro_date_responses", {
  id: serial("id").primaryKey(),
  microDateId: integer("micro_date_id").notNull().references(() => microDates.id),
  activityIndex: integer("activity_index").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id),
  response: text("response").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type MicroDateResponse = typeof microDateResponses.$inferSelect;

export interface MicroDateActivity {
  type: 'icebreaker' | 'would_you_rather' | 'this_or_that' | 'rapid_fire' | 'word_association' | 'hot_take';
  prompt: string;
  options?: string[];
  timeLimit: number; // seconds per activity
}

// === RELATIONS ===
export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const matchesRelations = relations(matches, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  match: one(matches, {
    fields: [messages.matchId],
    references: [matches.id],
  }),
}));
