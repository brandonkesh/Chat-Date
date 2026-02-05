import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
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
  gender: text("gender").notNull(), // 'male', 'female', 'other'
  interestedIn: text("interested_in").notNull(), // 'male', 'female', 'everyone'
  photoUrl: text("photo_url"),
  interests: text("interests").array(), // Array of hobbies/interests
  trialEndsAt: timestamp("trial_ends_at").notNull(), // When the free month ends
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"), // Track which price they subscribed to
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
  // Appearance preferences (what you're looking for)
  looksPreference: text("looks_preference"), // 'any', 'attractive', 'average', 'below_average'
  bodyTypePreference: text("body_type_preference"), // 'any', 'slim', 'athletic', 'average', 'curvy', 'plus_size'
  minHeightPreference: integer("min_height_preference"), // in inches
  maxHeightPreference: integer("max_height_preference"), // in inches
  // Lifestyle fields
  drinking: text("drinking"), // 'never', 'socially', 'regularly'
  smoking: text("smoking"), // 'never', 'socially', 'regularly'
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
});

export const insertProfileSchema = createInsertSchema(profiles).omit({ 
  id: true, 
  userId: true,
  trialEndsAt: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  isPremium: true,
  isVerified: true,
  verificationPhotoUrl: true,
  verificationStatus: true,
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
  createdAt: timestamp("created_at").defaultNow(),
});

// === MESSAGES ===
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matches.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ 
  id: true, 
  createdAt: true,
  senderId: true // inferred from auth
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

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
