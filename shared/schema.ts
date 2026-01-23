import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";
import { relations } from "drizzle-orm";

export * from "./models/auth";

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
  trialEndsAt: timestamp("trial_ends_at").notNull(), // When the free month ends
});

export const insertProfileSchema = createInsertSchema(profiles).omit({ 
  id: true, 
  userId: true,
  trialEndsAt: true 
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
