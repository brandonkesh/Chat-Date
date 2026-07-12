import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { isTestPremiumUser, applyTestPremiumIfNeeded } from "./testPremiumUsers";
import { isOwner } from "./ownerUsers";
import { sendFeedbackNotification } from "./feedbackEmail";
import {
  sendWelcomeEmail,
  sendNewMemberAlertToOwner,
  sendMatchEmail,
  sendNewMessageEmail,
  sendAppLockBackupCodesEmail,
  sendAppLockChangedEmail,
  sendLoginCodeEmail,
  sendDateCheckinEmail,
} from "./email";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { db } from "./db";
import { matches, profiles, users, swipes, insertDateCheckinSchema, dateFeedbackSchema, insertSuccessStorySchema } from "@shared/schema";
import { eq, or, and, ne, notInArray } from "drizzle-orm";
import {
  ensurePaypalPlans,
  getCachedPlans,
  getPlanByPlanId,
  createSubscription as createPaypalSubscription,
  cancelSubscription as cancelPaypalSubscription,
} from "./paypalService";
import { getPaypalClientId, getPaypalEnvironment, getPaypalBase } from "./paypalClient";
import { WebSocketServer, WebSocket } from "ws";
import { setRealtimeSessionRevoker } from "./realtimeRevocation";
import { ensureCompatibleFormat, speechToText, textToSpeech } from "./replit_integrations/audio/client";
import crypto from "crypto";
import { openai } from "./replit_integrations/image/client";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

// Which 2FA delivery method is active. Legacy users (enabled before this
// feature) have a secret but no explicit method — treat them as 'totp'.
function effectiveTwoFactorMethod(p: any): "totp" | "email" | null {
  if (!p?.twoFactorEnabled) return null;
  if (p.twoFactorMethod) return p.twoFactorMethod;
  return p.twoFactorSecret ? "totp" : null;
}

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "your email";
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

// When true, every user is required to have 2FA. Off by default so it stays
// opt-in for test users; flip REQUIRE_2FA=true to enforce for everyone later.
function twoFactorRequiredForAll(): boolean {
  return process.env.REQUIRE_2FA === "true";
}

// Validate a delivered email one-time code against the stored value.
async function verifyLoginOtp(
  userId: string,
  code: unknown,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!code || typeof code !== "string") {
    return { ok: false, status: 400, message: "Verification code is required." };
  }
  const profile = await storage.getProfile(userId);
  if (!profile?.loginOtpCode || !profile.loginOtpExpiry) {
    return { ok: false, status: 400, message: "No code has been sent. Please request a new one." };
  }
  if (new Date() > new Date(profile.loginOtpExpiry)) {
    await storage.clearLoginOtp(userId);
    return { ok: false, status: 400, message: "Code expired. Please request a new one." };
  }
  if (profile.loginOtpCode !== code.trim()) {
    return { ok: false, status: 400, message: "Invalid verification code. Please try again." };
  }
  return { ok: true };
}

function sanitizeProfile(profile: any) {
  if (!profile) return profile;
  const { twoFactorSecret, emailVerificationCode, emailVerificationExpiry, passwordHash, backupCodes, verificationPhotoUrl, voiceIntroUrl, introVideoUrl, phoneNumber, loginOtpCode, loginOtpExpiry, photoUrl, ...safe } = profile;
  return {
    ...safe,
    hasPassword: !!passwordHash,
    photoUrl: photoUrl ? `/api/media/photo/${profile.userId}` : null,
    voiceIntroUrl: voiceIntroUrl ? `/api/media/voice-intro/${profile.userId}` : null,
    introVideoUrl: introVideoUrl ? `/api/media/intro-video/${profile.userId}` : null,
  };
}

// Allow-list of profile fields that are safe to expose to OTHER members.
// This is a default-deny serializer: anything not listed here (exact location,
// date of birth, PayPal identifiers, account-security state, reward/timezone
// internals, etc.) is never returned on member-to-member surfaces. Any new
// column added to the profiles table stays private unless explicitly added here.
const PUBLIC_PROFILE_FIELDS = [
  "id",
  "userId",
  "displayName",
  "age",
  "bio",
  "gender",
  "interestedIn",
  "interests",
  "isPremium",
  "membershipTier",
  "isVerified",
  "ageVerified",
  "verificationStatus",
  "locationName",
  "drinking",
  "smoking",
  "marijuana",
  "exercise",
  "diet",
  "pets",
  "kids",
  "religion",
  "education",
  "jobTitle",
  "company",
  "relationshipGoal",
  "familyPlans",
  "livingSituation",
  "lookingForDescription",
  "languages",
  "orientation",
  "ethnicity",
  "politicalViews",
  "astrologicalSign",
  "personalityBadges",
  "songOfTheDay",
  "promptQuestion",
  "promptAnswer",
  "weeklyAnswer",
  "weeklyQuestionKey",
  "dreamDateElements",
] as const;

// Serializer for another member's profile. Returns only allow-listed display
// fields and rewrites media to block-aware proxy URLs. Sensitive fields
// (dateOfBirth, latitude/longitude, zipCode, paypal*, twoFactor*, emailVerified,
// phoneNumber, reward timing, timezone, etc.) are dropped entirely.
function sanitizePublicProfile(profile: any) {
  if (!profile) return profile;
  const out: Record<string, any> = {};
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (profile[field] !== undefined) {
      out[field] = profile[field];
    }
  }
  out.photoUrl = profile.photoUrl ? `/api/media/photo/${profile.userId}` : null;
  out.voiceIntroUrl = profile.voiceIntroUrl
    ? `/api/media/voice-intro/${profile.userId}`
    : null;
  out.introVideoUrl = profile.introVideoUrl
    ? `/api/media/intro-video/${profile.userId}`
    : null;
  return out;
}

function sanitizeMessage(message: any) {
  if (!message) return message;
  return {
    ...message,
    voiceNoteUrl: message.voiceNoteUrl ? `/api/media/voice-note/${message.id}` : null,
  };
}

// In-memory tracker for email verification brute-force protection.
// Single-instance deployment; resets on restart. Cleared on successful verify
// or when a new code is requested.
const emailVerifyAttempts = new Map<string, { count: number; lockedUntil: number }>();

// Per-user rate limiter for secondary-auth challenge endpoints (2FA verify,
// app-lock verify). Tracks consecutive failures and temporarily blocks further
// attempts after the configured threshold. Resets on a successful verification
// or after the lockout window expires.
const secondaryAuthAttempts = new Map<string, { failures: number; lockedUntil: number }>();

const SECONDARY_AUTH_MAX_FAILURES = 5;
const SECONDARY_AUTH_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkSecondaryAuthRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = secondaryAuthAttempts.get(key);
  if (!entry) return { allowed: true };
  // If an active lockout is in effect, reject the request.
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }
  // Lockout window has expired — reset the counter so the user gets a fresh
  // budget instead of being immediately re-locked on the next failure.
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    secondaryAuthAttempts.delete(key);
  }
  return { allowed: true };
}

function recordSecondaryAuthFailure(key: string): void {
  const now = Date.now();
  const entry = secondaryAuthAttempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= SECONDARY_AUTH_MAX_FAILURES) {
    entry.lockedUntil = now + SECONDARY_AUTH_LOCKOUT_MS;
  }
  secondaryAuthAttempts.set(key, entry);
}

function resetSecondaryAuthAttempts(key: string): void {
  secondaryAuthAttempts.delete(key);
}

// Per-user endpoint rate limiter backed by a durable, shared store.
// Tracks call counts within a fixed window and rejects requests that exceed
// the configured quota. This prevents abuse of billable OpenAI-backed routes
// and other abuse-prone endpoints, and the limits survive restarts/scaling.
/**
 * Returns true and increments the counter when the call is within quota.
 * Returns false when the user has exceeded the limit for the current window.
 * Backed by a durable, shared store so limits hold across server restarts
 * and multiple instances (see storage.checkRateLimit).
 * @param userId    Authenticated user identifier
 * @param endpoint  Short label used to namespace the key (e.g. "ai-feedback")
 * @param limit     Maximum allowed calls within windowMs
 * @param windowMs  Rolling window duration in milliseconds
 */
async function checkAiRateLimit(userId: string, endpoint: string, limit: number, windowMs: number): Promise<boolean> {
  return storage.checkRateLimit(`${userId}:${endpoint}`, limit, windowMs);
}

// Server-side media upload constraints, enforced against the REAL object
// metadata at bind time (see trySetObjectEntityAclPolicy). The signed upload
// URL cannot carry size/type limits, so these are the authoritative checks.
const IMAGE_UPLOAD_CONSTRAINTS = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB — matches /api/uploads/request-url
  allowedContentTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
};
const AUDIO_UPLOAD_CONSTRAINTS = {
  maxSizeBytes: 10 * 1024 * 1024, // 10MB — short voice recordings
  allowedContentTypes: ["audio/"],
};
const VIDEO_UPLOAD_CONSTRAINTS = {
  maxSizeBytes: 50 * 1024 * 1024, // 50MB — short intro videos
  allowedContentTypes: ["video/"],
};

// ISO week key like "2026-W28" — used for weekly dating tips cache.
function currentWeekKey(): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // === 2FA ENFORCEMENT MIDDLEWARE ===
  // Registered before ALL route and object-storage handler registrations so that
  // no authenticated API endpoint can be reached without completing the 2FA challenge.
  // Exempt paths are ONLY those strictly required for the challenge flow itself:
  //   - /2fa/verify  – submit the TOTP code
  //   - /2fa/status  – let the UI detect whether 2FA is active
  //   - /password/verify  – unlock app-lock (challenge screen dependency)
  //   - /password/recover – backup-code unlock (challenge screen dependency)
  //   - /password/status  – let the UI detect app-lock state
  // Security-sensitive management operations (/password/set, /password/change,
  // /password/remove, /2fa/setup, /2fa/enable, /2fa/disable) are NOT exempted;
  // they require the 2FA challenge to be completed first.
  const twoFAExemptExact = new Set([
    "/2fa/verify", "/2fa/status", "/2fa/challenge/send",
    "/password/verify", "/password/recover", "/password/status",
  ]);
  const twoFAExemptPrefixes = ["/login", "/logout", "/callback"];
  app.use("/api", async (req: any, res: any, next: any) => {
    // Allow GET /profiles/me only (needed for the challenge screen to render).
    // PUT /profiles/me must pass the 2FA gate like any other write endpoint.
    if (
      (req.method === "GET" && req.path === "/profiles/me") ||
      twoFAExemptExact.has(req.path) ||
      twoFAExemptPrefixes.some(p => req.path.startsWith(p))
    ) return next();
    if (!req.user?.claims?.sub) return next();
    const profile = await storage.getProfile(req.user.claims.sub);
    if (profile?.twoFactorEnabled && !(req.session as any).twoFactorVerified) {
      return res.status(403).json({ message: "Two-factor authentication required.", twoFactorRequired: true });
    }
    next();
  });

  // === APP LOCK MIDDLEWARE ===
  // Must be registered here, alongside the 2FA middleware and BEFORE any route
  // registrations, so that every subsequent handler (including PUT /profiles/me)
  // is subject to the app-lock gate.
  // Exempt paths are ONLY those strictly required for the challenge flow:
  //   - /password/verify  – submit the app-lock password
  //   - /password/recover – backup-code unlock
  //   - /password/status  – let the UI detect app-lock state
  //   - /2fa/verify       – submit the TOTP code (challenge screen dependency)
  //   - /2fa/status       – let the UI detect 2FA state
  // Security-sensitive management operations (/2fa/setup, /2fa/enable,
  // /2fa/disable, /password/set, /password/change, /password/remove) are NOT
  // exempted; they require the app-lock to be unlocked first.
  const appLockExemptExact = new Set([
    "/password/verify", "/password/recover", "/password/status",
    "/2fa/verify", "/2fa/status", "/2fa/challenge/send",
  ]);
  const appLockExemptPrefixes = ["/login", "/logout", "/callback"];
  app.use("/api", async (req: any, res: any, next: any) => {
    // Allow GET /profiles/me only; PUT /profiles/me must pass app-lock like any write endpoint.
    if (
      (req.method === "GET" && req.path === "/profiles/me") ||
      appLockExemptExact.has(req.path) ||
      appLockExemptPrefixes.some(p => req.path.startsWith(p))
    ) return next();
    if (!req.user?.claims?.sub) return next();
    const profile = await storage.getProfile(req.user.claims.sub);
    if (profile?.passwordHash && !(req.session as any).appLockVerified) {
      return res.status(423).json({ message: "App is locked. Please enter your password." });
    }
    next();
  });

  // Setup Object Storage for file uploads
  registerObjectStorageRoutes(app);

  // === PROFILES ===
  
  // Get current user profile
  app.get(api.profiles.me.get.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    // When 2FA is enabled but not yet verified in this session, return only the
    // minimum fields required for the challenge/onboarding routing logic. Full
    // profile data must not be served until the 2FA challenge is completed.
    if (profile.twoFactorEnabled && !(req.session as any).twoFactorVerified) {
      return res.json({ userId: profile.userId, twoFactorEnabled: true });
    }
    // When app-lock is active but not yet unlocked in this session, return only
    // the minimum fields required for the lock-screen routing logic. Full profile
    // data must not be served until the app-lock challenge is completed.
    if (profile.passwordHash && !(req.session as any).appLockVerified) {
      return res.json({ userId: profile.userId, appLocked: true });
    }
    res.json({ ...sanitizeProfile(profile), isOwner: isOwner(req.user.claims) });
  });

  // Create/Update current user profile
  app.put(api.profiles.me.update.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const input = api.profiles.me.update.input.parse(req.body);
      const existing = await storage.getProfile(userId);

      // Profile photos uploaded to object storage must be validated and
      // ACL-bound like every other media type. Without this, an attacker
      // could park an arbitrary oversized blob as their photoUrl (making it
      // DB-referenced and immune to the orphan sweep). Photos are bound as
      // "private" so that access is controlled exclusively through the
      // /api/media/photo/:userId proxy, which re-checks block/hide state at
      // read time. Only newly-changed /objects/ paths are validated, so
      // existing profiles keep saving without re-checks.
      if (
        input.photoUrl &&
        input.photoUrl.startsWith("/objects/") &&
        input.photoUrl !== existing?.photoUrl
      ) {
        const { ObjectStorageService, ObjectValidationError } = await import("./replit_integrations/object_storage");
        const objectStorageService = new ObjectStorageService();
        try {
          input.photoUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            input.photoUrl,
            { owner: userId, visibility: "private" },
            userId,
            IMAGE_UPLOAD_CONSTRAINTS,
          );
        } catch (err) {
          if (err instanceof ObjectValidationError) {
            return res.status(400).json({ message: err.message, field: "photoUrl" });
          }
          return res.status(400).json({ message: "Invalid photo reference", field: "photoUrl" });
        }
      }

      let ageVerified = existing?.ageVerified ?? false;
      if (input.dateOfBirth) {
        const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dobRegex.test(input.dateOfBirth)) {
          return res.status(400).json({
            message: "Invalid date format. Use YYYY-MM-DD.",
            field: "dateOfBirth",
          });
        }
        const dob = new Date(input.dateOfBirth + "T00:00:00");
        if (isNaN(dob.getTime())) {
          return res.status(400).json({
            message: "Invalid date of birth.",
            field: "dateOfBirth",
          });
        }
        const today = new Date();
        let calculatedAge = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          calculatedAge--;
        }
        if (calculatedAge < 18) {
          return res.status(400).json({
            message: "You must be at least 18 years old to use this app.",
            field: "dateOfBirth",
          });
        }
        if (calculatedAge > 120) {
          return res.status(400).json({
            message: "Please enter a valid date of birth.",
            field: "dateOfBirth",
          });
        }
        input.age = calculatedAge;
        ageVerified = true;
      } else if (!existing) {
        if (input.age < 18) {
          return res.status(400).json({
            message: "You must be at least 18 years old to use this app.",
            field: "age",
          });
        }
      }

      let profile;
      if (existing) {
        profile = await storage.updateProfile(userId, { ...input, ageVerified });
      } else {
        profile = await storage.createProfile({ ...input, userId, ageVerified });
        // Best-effort emails (never block or fail the request): welcome the new
        // member, and notify the app owner that someone joined.
        void sendWelcomeEmail(userId);
        void sendNewMemberAlertToOwner(userId);
      }
      // Controlled testing: auto-grant premium to allow-listed family/test
      // accounts right after their profile exists. No-op for everyone else.
      if (isTestPremiumUser(req.user.claims)) {
        await applyTestPremiumIfNeeded(userId, req.user.claims);
        profile = (await storage.getProfile(userId)) ?? profile;
      }
      res.json(sanitizeProfile(profile));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Auto-detected timezone sync (fire-and-forget from the client on load).
  // Keeps email timestamps correct for members in other states/countries.
  app.post("/api/profiles/me/timezone", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const parsed = z
      .object({ timezone: z.string().min(1).max(64) })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid timezone" });
    }
    const tz = parsed.data.timezone;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      return res.status(400).json({ message: "Invalid timezone" });
    }
    const existing = await storage.getProfile(userId);
    if (!existing) {
      return res.status(404).json({ message: "Profile not found" });
    }
    if (existing.timezone !== tz) {
      await storage.updateProfile(userId, { timezone: tz });
    }
    res.json({ success: true });
  });

  // === TWO-FACTOR AUTHENTICATION ===

  // Get 2FA status
  app.get("/api/2fa/status", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    const method = effectiveTwoFactorMethod(profile);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    let destination: string | null = null;
    if (method === "email" && user?.email) destination = maskEmail(user.email);
    res.json({
      enabled: profile.twoFactorEnabled ?? false,
      verified: (req.session as any).twoFactorVerified ?? false,
      method,
      destination,
      hasEmail: !!user?.email,
      required: twoFactorRequiredForAll(),
    });
  });

  // Begin 2FA setup - generate secret and QR code
  app.post("/api/2fa/setup", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    if (profile.twoFactorEnabled) {
      return res.status(400).json({ message: "Two-factor authentication is already enabled." });
    }
    const secret = generateSecret();
    const otpauthUrl = generateURI({
      secret,
      issuer: "Crush Dating",
      label: profile.displayName || userId,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    (req.session as any).pendingTwoFactorSecret = secret;
    res.json({ qrCode: qrCodeDataUrl, secret });
  });

  // Verify and enable 2FA
  app.post("/api/2fa/enable", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Verification code is required." });
    }
    const secret = (req.session as any).pendingTwoFactorSecret;
    if (!secret) {
      return res.status(400).json({ message: "Please start 2FA setup first." });
    }
    const result = verifySync({ token: code, secret });
    if (!result.valid) {
      return res.status(400).json({ message: "Invalid verification code. Please try again." });
    }
    await storage.enableTwoFactor(userId, secret);
    delete (req.session as any).pendingTwoFactorSecret;
    (req.session as any).twoFactorVerified = true;
    res.json({ success: true, message: "Two-factor authentication enabled." });
  });

  // --- Email-based 2FA setup ---
  // Send a code to the account email to begin enabling email 2FA.
  app.post("/api/2fa/email/setup", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    if (profile.twoFactorEnabled) {
      return res.status(400).json({ message: "Two-step verification is already enabled." });
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.email) {
      return res.status(400).json({ message: "No email address found on your account." });
    }
    const code = generateOtpCode();
    await storage.setLoginOtp(userId, code, new Date(Date.now() + 10 * 60 * 1000));
    (req.session as any).pendingTwoFactorMethod = "email";
    resetSecondaryAuthAttempts(`2fa:${userId}`);
    void sendLoginCodeEmail(userId, code);
    res.json({ success: true, destination: maskEmail(user.email) });
  });

  // Verify the emailed code and turn on email 2FA.
  app.post("/api/2fa/email/enable", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { code } = req.body;
    const rateLimitKey = `2fa:${userId}`;
    const rateCheck = checkSecondaryAuthRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${retryAfterSec} seconds.` });
    }
    if ((req.session as any).pendingTwoFactorMethod !== "email") {
      return res.status(400).json({ message: "Please start email setup first." });
    }
    const check = await verifyLoginOtp(userId, code);
    if (!check.ok) {
      if (check.status === 400) recordSecondaryAuthFailure(rateLimitKey);
      return res.status(check.status).json({ message: check.message });
    }
    resetSecondaryAuthAttempts(rateLimitKey);
    await storage.enableTwoFactorDelivery(userId, "email");
    delete (req.session as any).pendingTwoFactorMethod;
    (req.session as any).twoFactorVerified = true;
    res.json({ success: true, message: "Email two-step verification enabled." });
  });

  // --- Login challenge: (re)send a code for email users ---
  app.post("/api/2fa/challenge/send", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    // Cap how often a user can request a fresh code to prevent email spam
    // and cost amplification (5 sends per 10 minutes, durable across restarts).
    const withinQuota = await checkAiRateLimit(userId, "2fa-challenge-send", 5, 10 * 60 * 1000);
    if (!withinQuota) {
      return res.status(429).json({ message: "Too many code requests. Please wait a few minutes and try again." });
    }
    const profile = await storage.getProfile(userId);
    const method = effectiveTwoFactorMethod(profile);
    if (method !== "email") {
      return res.status(400).json({ message: "No code-based two-step verification is enabled." });
    }
    const code = generateOtpCode();
    await storage.setLoginOtp(userId, code, new Date(Date.now() + 10 * 60 * 1000));
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.email) return res.status(400).json({ message: "No email address on file." });
    void sendLoginCodeEmail(userId, code);
    res.json({ success: true, method, destination: maskEmail(user.email) });
  });

  // Disable 2FA (method-aware)
  app.post("/api/2fa/disable", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { code } = req.body;
    const rateLimitKey = `2fa:${userId}`;
    const rateCheck = checkSecondaryAuthRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${retryAfterSec} seconds.` });
    }
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Verification code is required to disable two-step verification." });
    }
    const profile = await storage.getProfile(userId);
    const method = effectiveTwoFactorMethod(profile);
    if (!method) {
      return res.status(400).json({ message: "Two-step verification is not enabled." });
    }
    if (method === "totp") {
      const secret = profile!.twoFactorSecret!;
      const result = verifySync({ token: code, secret });
      if (!result.valid) {
        recordSecondaryAuthFailure(rateLimitKey);
        return res.status(400).json({ message: "Invalid verification code." });
      }
    } else {
      const check = await verifyLoginOtp(userId, code);
      if (!check.ok) {
        if (check.status === 400) recordSecondaryAuthFailure(rateLimitKey);
        return res.status(check.status).json({ message: check.message });
      }
    }
    resetSecondaryAuthAttempts(rateLimitKey);
    await storage.disableTwoFactor(userId);
    (req.session as any).twoFactorVerified = false;
    res.json({ success: true, message: "Two-step verification disabled." });
  });

  // Verify 2FA code (for login challenge) — method-aware
  app.post("/api/2fa/verify", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const rateLimitKey = `2fa:${userId}`;
    const rateCheck = checkSecondaryAuthRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${retryAfterSec} seconds.` });
    }
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Verification code is required." });
    }
    const profile = await storage.getProfile(userId);
    const method = effectiveTwoFactorMethod(profile);
    if (!method) {
      return res.status(400).json({ message: "Two-factor authentication is not enabled." });
    }
    if (method === "totp") {
      const result = verifySync({ token: code, secret: profile!.twoFactorSecret! });
      if (!result.valid) {
        recordSecondaryAuthFailure(rateLimitKey);
        return res.status(400).json({ message: "Invalid verification code. Please try again." });
      }
    } else {
      const check = await verifyLoginOtp(userId, code);
      if (!check.ok) {
        if (check.status === 400) recordSecondaryAuthFailure(rateLimitKey);
        return res.status(check.status).json({ message: check.message });
      }
    }
    resetSecondaryAuthAttempts(rateLimitKey);
    await storage.clearLoginOtp(userId);
    (req.session as any).twoFactorVerified = true;
    res.json({ success: true });
  });

  // === APP LOCK PASSWORD ===

  app.post("/api/password/set", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { password } = req.body;
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found." });
    }
    if (profile.passwordHash) {
      return res.status(400).json({ message: "Password already set. Use the change password endpoint." });
    }
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(password, 10);
    const codes = Array.from({ length: 6 }, () => crypto.randomUUID().slice(0, 8).toUpperCase());
    const hashedCodes = await Promise.all(codes.map(c => bcrypt.hash(c, 10)));
    await db.update(profiles).set({ passwordHash: hash, backupCodes: hashedCodes }).where(eq(profiles.userId, userId));
    // Best-effort: email the recovery codes so the user has them off-device.
    void sendAppLockBackupCodesEmail(userId, codes);
    res.json({ success: true, backupCodes: codes, message: "Password set. Save your backup codes in a safe place." });
  });

  app.post("/api/password/change", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }
    const profile = await storage.getProfile(userId);
    if (!profile || !profile.passwordHash) {
      return res.status(400).json({ message: "No password set." });
    }
    const bcrypt = await import("bcryptjs");
    const valid = await bcrypt.compare(currentPassword || "", profile.passwordHash);
    if (!valid) {
      return res.status(403).json({ message: "Current password is incorrect." });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.update(profiles).set({ passwordHash: hash }).where(eq(profiles.userId, userId));
    // Best-effort security alert that the app-lock password changed.
    void sendAppLockChangedEmail(userId);
    res.json({ success: true, message: "Password changed successfully." });
  });

  app.post("/api/password/remove", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { password } = req.body;
    const profile = await storage.getProfile(userId);
    if (!profile || !profile.passwordHash) {
      return res.status(400).json({ message: "No password set." });
    }
    const bcrypt = await import("bcryptjs");
    const valid = await bcrypt.compare(password || "", profile.passwordHash);
    if (!valid) {
      return res.status(403).json({ message: "Password is incorrect." });
    }
    await db.update(profiles).set({ passwordHash: null, backupCodes: null }).where(eq(profiles.userId, userId));
    (req.session as any).appLockVerified = true;
    res.json({ success: true, message: "Password removed." });
  });

  app.post("/api/password/verify", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const rateLimitKey = `applock:${userId}`;
    const rateCheck = checkSecondaryAuthRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      const retryAfterSec = Math.ceil((rateCheck.retryAfterMs ?? 0) / 1000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${retryAfterSec} seconds.` });
    }
    const { password } = req.body;
    const profile = await storage.getProfile(userId);
    if (!profile || !profile.passwordHash) {
      return res.json({ success: true });
    }
    const bcrypt = await import("bcryptjs");
    const valid = await bcrypt.compare(password || "", profile.passwordHash);
    if (!valid) {
      recordSecondaryAuthFailure(rateLimitKey);
      return res.status(403).json({ message: "Incorrect password." });
    }
    resetSecondaryAuthAttempts(rateLimitKey);
    (req.session as any).appLockVerified = true;
    res.json({ success: true });
  });

  app.post("/api/password/recover", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { backupCode } = req.body;
    if (!backupCode || typeof backupCode !== "string") {
      return res.status(400).json({ message: "Backup code is required." });
    }
    const profile = await storage.getProfile(userId);
    if (!profile || !profile.passwordHash || !profile.backupCodes?.length) {
      return res.status(400).json({ message: "No password or backup codes found." });
    }
    const bcrypt = await import("bcryptjs");
    const normalizedCode = backupCode.trim().toUpperCase();
    let matchIndex = -1;
    for (let i = 0; i < profile.backupCodes.length; i++) {
      const match = await bcrypt.compare(normalizedCode, profile.backupCodes[i]);
      if (match) { matchIndex = i; break; }
    }
    if (matchIndex === -1) {
      return res.status(403).json({ message: "Invalid backup code." });
    }
    const remainingCodes = [...profile.backupCodes];
    remainingCodes.splice(matchIndex, 1);
    await db.update(profiles).set({ passwordHash: null, backupCodes: remainingCodes.length > 0 ? remainingCodes : null }).where(eq(profiles.userId, userId));
    (req.session as any).appLockVerified = true;
    res.json({ success: true, message: "Password removed using backup code. You can set a new password.", remainingCodes: remainingCodes.length });
  });

  app.get("/api/password/status", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found." });
    }
    res.json({
      hasPassword: !!profile.passwordHash,
      hasBackupCodes: !!(profile.backupCodes && profile.backupCodes.length > 0),
      backupCodesCount: profile.backupCodes?.length || 0,
      appLockVerified: !!(req.session as any).appLockVerified || !profile.passwordHash,
    });
  });

  // === EMAIL VERIFICATION ===

  // Get email verification status
  app.get("/api/email-verification/status", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    const user = await db.select().from(users).where(eq(users.id, userId));
    res.json({
      emailVerified: profile.emailVerified ?? false,
      email: user[0]?.email ?? null,
      codeSent: !!profile.emailVerificationCode,
      codeExpiry: profile.emailVerificationExpiry,
    });
  });

  // Send email verification code
  app.post("/api/email-verification/send", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    if (profile.emailVerified) {
      return res.status(400).json({ message: "Email is already verified." });
    }
    const user = await db.select().from(users).where(eq(users.id, userId));
    if (!user[0]?.email) {
      return res.status(400).json({ message: "No email address found on your account." });
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await storage.setEmailVerificationCode(userId, code, expiry);
    emailVerifyAttempts.delete(userId);
    res.json({
      success: true,
      message: "Verification code sent to your email.",
      email: user[0].email,
    });
  });

  // Verify email code
  app.post("/api/email-verification/verify", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Verification code is required." });
    }

    // Brute-force protection: limit attempts per code window.
    const now = Date.now();
    const existing = emailVerifyAttempts.get(userId);
    if (existing && existing.lockedUntil > now) {
      return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
    }

    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    if (profile.emailVerified) {
      return res.status(400).json({ message: "Email is already verified." });
    }
    if (!profile.emailVerificationCode || !profile.emailVerificationExpiry) {
      return res.status(400).json({ message: "No verification code has been sent. Please request a new one." });
    }
    if (new Date() > new Date(profile.emailVerificationExpiry)) {
      emailVerifyAttempts.delete(userId);
      return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
    }
    if (profile.emailVerificationCode !== code) {
      const tracker = existing ?? { count: 0, lockedUntil: 0 };
      tracker.count += 1;
      if (tracker.count >= 5) {
        // Invalidate the code so the attacker cannot keep guessing this one.
        await storage.setEmailVerificationCode(userId, "", new Date(0));
        tracker.lockedUntil = now + 10 * 60 * 1000;
        emailVerifyAttempts.set(userId, tracker);
        return res.status(429).json({ message: "Too many incorrect attempts. Please request a new code." });
      }
      emailVerifyAttempts.set(userId, tracker);
      return res.status(400).json({ message: "Invalid verification code. Please try again." });
    }
    emailVerifyAttempts.delete(userId);
    await storage.verifyEmail(userId);
    res.json({ success: true, message: "Email verified successfully." });
  });

  // === FEEDBACK ===

  // Submit feedback (any authenticated user). The submitting user's id is always
  // taken from the session — a client-supplied user id is never trusted.
  app.post(api.feedback.create.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    // Per-user rate limit: cap submissions to prevent spam/abuse and (once email
    // notifications are enabled) avoid triggering a flood of owner emails.
    if (!(await checkAiRateLimit(userId, "feedback-create", 3, 60 * 1000))) {
      return res.status(429).json({
        message: "You're sending feedback too quickly. Please wait a minute and try again.",
      });
    }
    try {
      const input = api.feedback.create.input.parse(req.body);
      const created = await storage.createFeedback({ ...input, userId });

      // Best-effort owner notification. Email failures must NOT fail the request:
      // sendFeedbackNotification never throws, but we also don't await blocking
      // behavior beyond the send itself.
      const user = await db.select().from(users).where(eq(users.id, userId));
      const submitterName = [user[0]?.firstName, user[0]?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      await sendFeedbackNotification(created, {
        email: user[0]?.email ?? null,
        name: submitterName.length > 0 ? submitterName : null,
      });

      res.status(201).json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  // List all feedback (owner-only). Gated by both authentication and the owner
  // allow-list so non-owners cannot read other users' submissions.
  app.get(api.feedback.list.path, isAuthenticated, async (req: any, res) => {
    if (!isOwner(req.user.claims)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const items = await storage.getAllFeedback();
    res.json(items);
  });

  // Update feedback status (owner-only). Lets the owner triage submissions by
  // marking them resolved (or back to new).
  app.patch(api.feedback.updateStatus.path, isAuthenticated, async (req: any, res) => {
    if (!isOwner(req.user.claims)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid feedback id" });
    }
    try {
      const { status } = api.feedback.updateStatus.input.parse(req.body);
      const updated = await storage.updateFeedbackStatus(id, status);
      if (!updated) {
        return res.status(404).json({ message: "Feedback not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  // Get potential matches (Feed)
  app.get(api.profiles.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profiles = await storage.getPotentialMatches(userId);
    res.json(profiles.map(sanitizePublicProfile));
  });

  // Get recommended profiles (based on shared interests)
  app.get(api.profiles.recommended.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profiles = await storage.getRecommendedProfiles(userId);
    res.json(profiles.map(sanitizePublicProfile));
  });

  // Get crush picks (verified & premium users)
  app.get(api.profiles.crushPicks.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profiles = await storage.getCrushPicks(userId);
    res.json(profiles.map(sanitizePublicProfile));
  });

  // === TOP PICKS OF THE DAY ===
  app.get("/api/top-picks", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const [picks, me] = await Promise.all([
      storage.getCrushPicks(userId),
      storage.getProfile(userId),
    ]);
    // Daily reward perk: an extra top pick on days you claimed your reward
    const todayKey = new Date().toISOString().slice(0, 10);
    const claimedToday = me?.lastRewardAt
      ? new Date(me.lastRewardAt).toISOString().slice(0, 10) === todayKey
      : false;
    res.json(picks.slice(0, claimedToday ? 4 : 3).map(sanitizePublicProfile));
  });

  // === DAILY LOGIN REWARD ===
  app.post("/api/daily-reward", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const result = await storage.claimDailyReward(userId);
    if (!result) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json({
      alreadyClaimed: result.alreadyClaimed,
      rewardStreak: result.profile.rewardStreak ?? 0,
      lastRewardAt: result.profile.lastRewardAt,
    });
  });

  // === SECOND CHANCE (review people you passed on) ===
  app.get("/api/second-chance", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const passedProfiles = await storage.getSecondChanceProfiles(userId);
    res.json(passedProfiles.map(sanitizePublicProfile));
  });

  app.post("/api/second-chance/undo", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request" });
    }
    const ok = await storage.undoPass(userId, parsed.data.userId);
    if (!ok) {
      return res.status(404).json({ message: "No pass found for that person" });
    }
    res.json({ success: true });
  });

  // === PROFILE BOOST (Pro/Elite perk) ===
  app.post("/api/boost", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    if (profile.membershipTier !== "pro" && profile.membershipTier !== "elite") {
      return res.status(403).json({ message: "Profile Boost is available on Pro and Elite plans." });
    }
    if (profile.boostedUntil && new Date(profile.boostedUntil) > new Date()) {
      return res.status(409).json({
        message: "You're already boosted!",
        boostedUntil: profile.boostedUntil,
      });
    }
    const until = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    const updated = await storage.setBoost(userId, until);
    res.json({ success: true, boostedUntil: updated.boostedUntil });
  });

  // === DATE CHECK-INS (safety feature) ===
  app.get("/api/date-checkins", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const checkins = await storage.getDateCheckins(userId);
    res.json(checkins);
  });

  app.post("/api/date-checkins", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const parsed = insertDateCheckinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Please fill in all required fields correctly." });
    }
    const checkin = await storage.createDateCheckin(userId, parsed.data);
    // Best-effort email to the trusted friend — never blocks the response.
    sendDateCheckinEmail(userId, checkin).catch(() => {});
    res.status(201).json(checkin);
  });

  app.post("/api/date-checkins/:id/safe", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid check-in" });
    }
    const updated = await storage.markDateCheckinSafe(id, userId);
    if (!updated) {
      return res.status(404).json({ message: "Check-in not found" });
    }
    res.json(updated);
  });

  app.delete("/api/date-checkins/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid check-in" });
    }
    const ok = await storage.deleteDateCheckin(id, userId);
    if (!ok) {
      return res.status(404).json({ message: "Check-in not found" });
    }
    res.json({ success: true });
  });

  // Post-date feedback (private rating + note)
  app.post("/api/date-checkins/:id/feedback", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid check-in" });
    }
    const parsed = dateFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Please provide a rating from 1 to 5." });
    }
    const updated = await storage.setDateCheckinFeedback(id, userId, parsed.data.rating, parsed.data.feedbackNote ?? null);
    if (!updated) {
      return res.status(404).json({ message: "Check-in not found" });
    }
    res.json(updated);
  });

  // === SUCCESS STORIES ===
  app.get("/api/success-stories", isAuthenticated, async (req: any, res) => {
    const stories = await storage.getSuccessStories();
    // Only expose what the page needs — not the author's userId
    res.json(stories.map(s => ({ id: s.id, coupleNames: s.coupleNames, story: s.story, createdAt: s.createdAt })));
  });

  app.post("/api/success-stories", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const parsed = insertSuccessStorySchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || "Please fill in both fields.";
      return res.status(400).json({ message: msg });
    }
    if (!(await checkAiRateLimit(userId, "success-story", 3, 24 * 60 * 60 * 1000))) {
      return res.status(429).json({ message: "You can share up to 3 stories per day." });
    }
    const story = await storage.createSuccessStory(userId, parsed.data);
    res.status(201).json({ id: story.id, coupleNames: story.coupleNames, story: story.story, createdAt: story.createdAt });
  });

  // === WEEKLY DATING TIPS (AI-generated, cached per week) ===
  app.get("/api/dating-tips", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const weekKey = currentWeekKey();
    const cached = await storage.getDatingTipsForWeek(weekKey);
    if (cached) {
      return res.json({ weekKey, tips: cached.tips });
    }
    // Not cached yet — generate once (rate-limit generation attempts)
    if (!(await checkAiRateLimit(userId, "dating-tips-gen", 3, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "Tips are being prepared. Please check back in a bit!" });
    }
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are a warm, practical dating coach. Reply ONLY with a JSON object: {\"tips\": [\"...\"]} containing exactly 5 short, actionable dating tips (each 1-2 sentences, friendly tone, no numbering).",
          },
          { role: "user", content: `Give me this week's 5 best dating tips. Week: ${weekKey}. Make them fresh and varied: conversation, first dates, profiles, confidence, safety.` },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      const tips: string[] = Array.isArray(parsed.tips) ? parsed.tips.map((t: any) => String(t)).slice(0, 5) : [];
      if (tips.length === 0) {
        return res.status(500).json({ message: "Could not generate tips right now. Please try again." });
      }
      const saved = await storage.saveDatingTips(weekKey, tips);
      res.json({ weekKey, tips: saved.tips });
    } catch (err) {
      console.error("dating-tips generation failed:", err);
      res.status(500).json({ message: "Could not generate tips right now. Please try again." });
    }
  });

  // === KUDOS ("Great Vibes" badge) ===
  // Award kudos to a match partner (once per pair). 3+ kudos earns the badge.
  app.post("/api/kudos", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const parsed = z.object({ matchId: z.number().int() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request" });
    }
    const match = await storage.getMatch(parsed.data.matchId);
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ message: "Match not found" });
    }
    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    if (await storage.isBlockedEither(userId, partnerId)) {
      return res.status(403).json({ message: "Action not allowed" });
    }
    const given = await storage.giveKudos(match.id, userId, partnerId);
    const partnerKudos = await storage.getKudosCount(partnerId);
    res.status(201).json({ given, alreadyGiven: !given, partnerKudos, partnerHasBadge: partnerKudos >= 3 });
  });

  // Kudos status for a match: did I already send, and does my partner have the badge?
  app.get("/api/kudos/status/:matchId", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId)) {
      return res.status(400).json({ message: "Invalid match" });
    }
    const match = await storage.getMatch(matchId);
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ message: "Match not found" });
    }
    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    // Blocked pairs get no partner-derived data, even via historical matches.
    if (await storage.isBlockedEither(userId, partnerId)) {
      return res.status(404).json({ message: "Match not found" });
    }
    const [alreadyGiven, partnerKudos] = await Promise.all([
      storage.hasGivenKudos(userId, partnerId),
      storage.getKudosCount(partnerId),
    ]);
    res.json({ alreadyGiven, partnerKudos, partnerHasBadge: partnerKudos >= 3 });
  });

  // === QUESTION OF THE WEEK CLUB ===
  // Everyone's answer to this week's question (block-aware, minimal fields).
  app.get("/api/weekly-answers", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const weekKey = currentWeekKey();
    const answers = await storage.getWeeklyAnswers(userId, weekKey);
    res.json({
      weekKey,
      answers: answers.map((p) => ({
        profileId: p.id,
        isMe: p.userId === userId,
        displayName: p.displayName,
        photoUrl: p.photoUrl ? `/api/media/photo/${p.userId}` : null,
        answer: p.weeklyAnswer,
      })),
    });
  });

  // === LOVE HOROSCOPES (daily, AI-generated, cached per sign+day) ===
  app.get("/api/horoscope", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    const validSigns = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
    const sign = (profile.astrologicalSign || "").toLowerCase();
    if (!validSigns.includes(sign)) {
      return res.json({ needsSign: true });
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    const cached = await storage.getHoroscope(sign, dayKey);
    if (cached) {
      return res.json({ sign, dayKey, content: cached.content });
    }
    if (!(await checkAiRateLimit(userId, "horoscope-gen", 5, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "Your horoscope is being written in the stars. Check back in a bit!" });
    }
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are a playful astrologer writing short daily DATING horoscopes for a dating app. Reply ONLY with JSON: {\"horoscope\": \"...\"} — 2-3 warm, fun sentences about love/dating energy today. Encouraging, lighthearted, no doom.",
          },
          { role: "user", content: `Write today's dating horoscope for ${sign}. Date: ${dayKey}.` },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      const content = typeof parsed.horoscope === "string" ? parsed.horoscope.trim() : "";
      if (!content) {
        return res.status(500).json({ message: "The stars are cloudy right now. Please try again." });
      }
      const saved = await storage.saveHoroscope(sign, dayKey, content);
      res.json({ sign, dayKey, content: saved.content });
    } catch (err) {
      console.error("horoscope generation failed:", err);
      res.status(500).json({ message: "The stars are cloudy right now. Please try again." });
    }
  });

  // === COUPLE LEADERBOARD (most chatty matches this week, first names only) ===
  app.get("/api/leaderboard", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Blocked users (either direction) never appear on the requester's board.
    const blockedIds = await storage.getBlockedUserIds(userId);
    const top = await storage.getChattyMatches(weekAgo, 5, blockedIds);
    res.json(top.map(({ name1, name2, messageCount }, i) => ({ rank: i + 1, name1, name2, messageCount })));
  });

  // === OWNER DASHBOARD ===
  app.get("/api/admin/stats", isAuthenticated, async (req: any, res) => {
    if (!isOwner(req.user.claims)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    const stats = await storage.getAdminStats();
    res.json(stats);
  });

  // === INVITE LINKS ===
  app.get("/api/invites/mine", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const invite = await storage.getOrCreateInvite(userId);
    const redemptions = await storage.getInviteRedemptions(userId);
    res.json({
      code: invite.code,
      joined: redemptions.map((r) => ({
        displayName: r.displayName || "A new member",
        joinedAt: r.redemption.createdAt,
      })),
    });
  });

  app.post("/api/invites/redeem", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const parsed = z.object({ code: z.string().trim().min(4).max(20) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid code" });
    }
    if (!(await checkAiRateLimit(userId, "invite-redeem", 10, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "Too many attempts. Please try later." });
    }
    const redeemed = await storage.redeemInvite(parsed.data.code.toUpperCase(), userId);
    res.json({ redeemed });
  });

  // === BLIND DATE ROULETTE ===
  const BLIND_DATE_DURATION_MS = 5 * 60 * 1000; // 5-minute surprise chat

  // Shape a blind date for the requesting participant. Photos and full
  // profiles stay hidden until the reveal.
  async function blindDateView(bd: any, userId: string) {
    const partnerId = bd.user1Id === userId ? bd.user2Id : bd.user1Id;
    let status = bd.status;
    // Timer expired? Flip active → revealed (persisted lazily on read).
    if (status === "active" && bd.endsAt && new Date() > new Date(bd.endsAt)) {
      await storage.markBlindDateRevealed(bd.id);
      status = "revealed";
    }
    let partner: any = null;
    if (partnerId && status === "active") {
      const p = await storage.getProfile(partnerId);
      partner = p ? { firstName: p.displayName.trim().split(/\s+/)[0] } : null;
    } else if (partnerId && status === "revealed") {
      const p = await storage.getProfile(partnerId);
      partner = p ? sanitizePublicProfile(p) : null;
    }
    return {
      id: bd.id,
      status,
      startedAt: bd.startedAt,
      endsAt: bd.endsAt,
      partner,
    };
  }

  // Join the roulette pool (pairs instantly if someone is waiting).
  app.post("/api/blind-roulette/join", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    if (!(await checkAiRateLimit(userId, "blind-roulette-join", 30, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "Too many attempts. Please try again later." });
    }
    const bd = await storage.joinBlindRoulette(userId, BLIND_DATE_DURATION_MS);
    res.status(201).json(await blindDateView(bd, userId));
  });

  // Poll the current session state.
  app.get("/api/blind-roulette/current", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const bd = await storage.getCurrentBlindDate(userId);
    if (!bd) return res.json(null);
    // A block placed mid-session ends the date immediately — no reveal.
    const partnerId = bd.user1Id === userId ? bd.user2Id : bd.user1Id;
    if (partnerId && (await storage.isBlockedEither(userId, partnerId))) {
      await storage.cancelBlindDate(bd.id, userId);
      return res.json(null);
    }
    res.json(await blindDateView(bd, userId));
  });

  // Leave / end the session (waiting, active, or after the reveal).
  app.post("/api/blind-roulette/leave", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const bd = await storage.getCurrentBlindDate(userId);
    if (bd) {
      await storage.cancelBlindDate(bd.id, userId);
    }
    res.json({ left: true });
  });

  // Chat messages within the blind date (participants only, while active or revealed).
  app.get("/api/blind-roulette/:id/messages", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid session" });
    const bd = await storage.getBlindDate(id);
    if (!bd || (bd.user1Id !== userId && bd.user2Id !== userId)) {
      return res.status(404).json({ message: "Session not found" });
    }
    const msgPartnerId = bd.user1Id === userId ? bd.user2Id : bd.user1Id;
    if (msgPartnerId && (await storage.isBlockedEither(userId, msgPartnerId))) {
      return res.status(404).json({ message: "Session not found" });
    }
    const msgs = await storage.getBlindDateMessages(id);
    res.json(msgs.map((m) => ({
      id: m.id,
      fromMe: m.senderId === userId,
      content: m.content,
      createdAt: m.createdAt,
    })));
  });

  app.post("/api/blind-roulette/:id/messages", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid session" });
    const parsed = z.object({ content: z.string().trim().min(1).max(500) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Message must be 1-500 characters" });
    }
    const bd = await storage.getBlindDate(id);
    if (!bd || (bd.user1Id !== userId && bd.user2Id !== userId)) {
      return res.status(404).json({ message: "Session not found" });
    }
    const sendPartnerId = bd.user1Id === userId ? bd.user2Id : bd.user1Id;
    if (sendPartnerId && (await storage.isBlockedEither(userId, sendPartnerId))) {
      return res.status(404).json({ message: "Session not found" });
    }
    if (bd.status !== "active" || (bd.endsAt && new Date() > new Date(bd.endsAt))) {
      return res.status(400).json({ message: "This blind date chat has ended" });
    }
    if (!(await checkAiRateLimit(userId, "blind-roulette-msg", 60, 5 * 60 * 1000))) {
      return res.status(429).json({ message: "Slow down a little!" });
    }
    const msg = await storage.createBlindDateMessage(id, userId, parsed.data.content);
    res.status(201).json({ id: msg.id, fromMe: true, content: msg.content, createdAt: msg.createdAt });
  });

  // After the reveal: like your blind date partner (mutual like = real match!).
  app.post("/api/blind-roulette/:id/like", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Invalid session" });
    const bd = await storage.getBlindDate(id);
    if (!bd || (bd.user1Id !== userId && bd.user2Id !== userId)) {
      return res.status(404).json({ message: "Session not found" });
    }
    if (bd.status !== "revealed") {
      return res.status(400).json({ message: "Wait for the reveal first!" });
    }
    const partnerId = bd.user1Id === userId ? bd.user2Id : bd.user1Id;
    if (!partnerId) return res.status(400).json({ message: "No partner in this session" });
    if (await storage.isBlockedEither(userId, partnerId)) {
      return res.status(403).json({ message: "Action not allowed" });
    }
    await storage.createSwipe({ swiperId: userId, swipedId: partnerId, liked: true });
    let isMatch = await storage.checkMatch(userId, partnerId);
    let matchId: number | undefined;
    if (isMatch) {
      matchId = await storage.createMatch(userId, partnerId);
      void sendMatchEmail(userId, partnerId);
    }
    res.status(201).json({ match: isMatch, matchId });
  });

  // === AI DATE IDEA GENERATOR ===
  app.post("/api/date-ideas", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const parsed = z.object({ matchId: z.number().int() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request" });
    }
    const match = await storage.getMatch(parsed.data.matchId);
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ message: "Match not found" });
    }
    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    if (await storage.isBlockedEither(userId, partnerId)) {
      return res.status(403).json({ message: "Access not allowed" });
    }
    if (!(await checkAiRateLimit(userId, "date-ideas", 10, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "You've hit the limit for date ideas. Try again in an hour!" });
    }
    const [me, partner] = await Promise.all([
      storage.getProfile(userId),
      storage.getProfile(partnerId),
    ]);
    if (!me || !partner) {
      return res.status(404).json({ message: "Profile not found" });
    }
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are a creative date planner. Reply ONLY with JSON: {\"ideas\": [{\"title\": \"...\", \"description\": \"...\"}]} containing exactly 3 date ideas. Keep each description to 1-2 friendly sentences. Ideas should be realistic and budget-friendly.",
          },
          {
            role: "user",
            content: `Suggest 3 date ideas for two people.\nPerson A interests: ${(me.interests || []).join(", ") || "unknown"}. Location: ${me.locationName || "unknown"}.\nPerson B interests: ${(partner.interests || []).join(", ") || "unknown"}.\nBlend their shared interests where possible.`,
          },
        ],
        response_format: { type: "json_object" },
      });
      const parsedIdeas = JSON.parse(response.choices[0]?.message?.content || "{}");
      const ideas = Array.isArray(parsedIdeas.ideas)
        ? parsedIdeas.ideas.slice(0, 3).map((i: any) => ({ title: String(i.title || ""), description: String(i.description || "") }))
        : [];
      if (ideas.length === 0) {
        return res.status(500).json({ message: "Could not generate ideas right now. Please try again." });
      }
      res.json({ ideas });
    } catch (err) {
      console.error("date-ideas generation failed:", err);
      res.status(500).json({ message: "Could not generate ideas right now. Please try again." });
    }
  });

  // === AI PROFILE FEEDBACK & OPTIMIZER ===
  app.get("/api/profiles/ai-feedback", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Elite-only feature as marketed on the Premium page.
    if (profile.membershipTier !== "elite") {
      return res.status(403).json({ message: "AI Profile Optimizer is available on the Elite plan. Please upgrade." });
    }

    // 5 calls per hour — profile analysis is expensive and results change slowly.
    if (!(await checkAiRateLimit(userId, "ai-feedback", 5, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "You have reached the limit for AI profile analysis. Please try again later." });
    }

    const profileData: Record<string, any> = {};
    if (profile.displayName) profileData.displayName = profile.displayName;
    if (profile.bio) profileData.bio = profile.bio;
    if (profile.age) profileData.age = profile.age;
    if (profile.gender) profileData.gender = profile.gender;
    if (profile.interestedIn) profileData.interestedIn = profile.interestedIn;
    if (profile.photoUrl) profileData.hasPhoto = true; else profileData.hasPhoto = false;
    if (profile.interests && profile.interests.length > 0) profileData.interests = profile.interests;
    if (profile.jobTitle) profileData.jobTitle = profile.jobTitle;
    if (profile.company) profileData.company = profile.company;
    if (profile.education) profileData.education = profile.education;
    if (profile.religion) profileData.religion = profile.religion;
    if (profile.relationshipGoal) profileData.relationshipGoal = profile.relationshipGoal;
    if (profile.drinking) profileData.drinking = profile.drinking;
    if (profile.smoking) profileData.smoking = profile.smoking;
    if (profile.exercise) profileData.exercise = profile.exercise;
    if (profile.diet) profileData.diet = profile.diet;
    if (profile.pets) profileData.pets = profile.pets;
    if (profile.kids) profileData.kids = profile.kids;
    if (profile.languages && profile.languages.length > 0) profileData.languages = profile.languages;
    if (profile.orientation) profileData.orientation = profile.orientation;
    if (profile.locationName) profileData.locationName = profile.locationName;
    if (profile.isVerified) profileData.isVerified = true;
    if (profile.voiceIntroUrl) profileData.hasVoiceIntro = true;
    if (profile.introVideoUrl) profileData.hasIntroVideo = true;
    if (profile.familyPlans) profileData.familyPlans = profile.familyPlans;
    if (profile.livingSituation) profileData.livingSituation = profile.livingSituation;
    if (profile.politicalViews) profileData.politicalViews = profile.politicalViews;
    if (profile.astrologicalSign) profileData.astrologicalSign = profile.astrologicalSign;
    if (profile.ethnicity) profileData.ethnicity = profile.ethnicity;

    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert dating profile consultant. Analyze the user's dating profile and return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "categories": [
    {
      "name": "<category name>",
      "score": <number 0-100>,
      "icon": "<one of: photo, bio, interests, lifestyle, details, verification>",
      "feedback": "<1-2 sentence feedback>",
      "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"]
    }
  ],
  "topTips": ["<most important tip 1>", "<most important tip 2>", "<most important tip 3>"]
}

Categories to evaluate:
1. "Photos" (icon: photo) - Whether they have a profile photo
2. "Bio & About" (icon: bio) - Quality and completeness of bio text
3. "Interests & Hobbies" (icon: interests) - Whether they've listed interests
4. "Lifestyle Details" (icon: lifestyle) - Drinking, smoking, exercise, diet preferences
5. "Profile Completeness" (icon: details) - Job, education, location, relationship goals, languages
6. "Trust & Verification" (icon: verification) - Photo verification, voice intro

Be encouraging but honest. Give specific, actionable suggestions. Score fairly based on what's filled vs. what's missing. A profile with all fields filled gets closer to 100. Missing photo is a major penalty. Missing bio is a significant penalty.`
          },
          {
            role: "user",
            content: `Here is my dating profile data:\n${JSON.stringify(profileData, null, 2)}`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "No response from AI" });
      }

      let feedback: any;
      try {
        feedback = JSON.parse(content);
      } catch {
        return res.status(500).json({ message: "Invalid AI response format" });
      }

      const result = {
        overallScore: typeof feedback.overallScore === "number" ? Math.max(0, Math.min(100, feedback.overallScore)) : 50,
        summary: typeof feedback.summary === "string" ? feedback.summary : "We analyzed your profile. Check the categories below for details.",
        categories: Array.isArray(feedback.categories)
          ? feedback.categories.map((c: any) => ({
              name: typeof c.name === "string" ? c.name : "Unknown",
              score: typeof c.score === "number" ? Math.max(0, Math.min(100, c.score)) : 50,
              icon: typeof c.icon === "string" ? c.icon : "details",
              feedback: typeof c.feedback === "string" ? c.feedback : "",
              suggestions: Array.isArray(c.suggestions) ? c.suggestions.filter((s: any) => typeof s === "string") : [],
            }))
          : [],
        topTips: Array.isArray(feedback.topTips) ? feedback.topTips.filter((t: any) => typeof t === "string") : [],
      };
      res.json(result);
    } catch (error: any) {
      console.error("AI profile feedback error:", error);
      res.status(500).json({ message: "Failed to generate profile feedback" });
    }
  });

  // === AI CONVERSATION COACH ===
  app.post("/api/chat/coach", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { matchId, recentMessages } = req.body;

    if (!matchId || !Array.isArray(recentMessages)) {
      return res.status(400).json({ message: "matchId and recentMessages are required" });
    }

    // AI conversation coach is a paid feature (Basic/Pro/Elite).
    const coachProfile = await storage.getProfile(userId);
    if (!coachProfile || !coachProfile.isPremium) {
      return res.status(403).json({ message: "AI Conversation Coach is available on paid plans. Please upgrade." });
    }

    // 20 calls per hour — coaching is used frequently during active conversations.
    if (!(await checkAiRateLimit(userId, "chat-coach", 20, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "You have reached the limit for AI coaching. Please try again later." });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, Number(matchId)));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ message: "Match not found" });
    }

    const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;

    // Blocked users must not keep deriving data from each other's profiles,
    // even through AI features on a historical match.
    const coachBlocked = await storage.isBlockedEither(userId, otherUserId);
    if (coachBlocked) {
      return res.status(403).json({ message: "Access not allowed" });
    }

    const otherProfile = await storage.getProfile(otherUserId);

    if (!coachProfile || !otherProfile) {
      return res.status(400).json({ message: "Profile not found" });
    }

    const context: Record<string, any> = {
      myName: coachProfile.displayName,
      partnerName: otherProfile.displayName,
      partnerInterests: otherProfile.interests || [],
      partnerBio: otherProfile.bio || "",
      conversationLength: recentMessages.length,
    };

    const chatHistory = recentMessages.slice(-10).map((m: any) => ({
      from: m.senderId === userId ? "me" : "them",
      text: typeof m.content === "string" ? m.content.slice(0, 500) : "",
    }));

    try {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are a friendly dating conversation coach. Analyze the recent chat messages and provide helpful, encouraging advice. Return a JSON object with this exact structure:
{
  "tone": "<one of: great, good, needs_work>",
  "toneLabel": "<short label like 'Great energy!' or 'Keep it going' or 'Try something new'>",
  "suggestions": ["<short, specific suggestion 1>", "<short suggestion 2>", "<short suggestion 3>"],
  "nextMessage": "<a natural, ready-to-send message suggestion that fits the conversation>"
}

Guidelines:
- Keep suggestions SHORT (under 15 words each), actionable, and positive
- The nextMessage should feel natural and conversational, not generic
- If conversation is empty or just starting, suggest ice-breakers based on partner info
- Consider partner's interests and bio for personalized tips
- Never be creepy, pushy, or suggest manipulation tactics
- Focus on genuine connection and authentic conversation`
          },
          {
            role: "user",
            content: `Context: ${JSON.stringify(context)}\n\nRecent messages:\n${JSON.stringify(chatHistory)}`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 512,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "No response from AI" });
      }

      let coaching: any;
      try {
        coaching = JSON.parse(content);
      } catch {
        return res.status(500).json({ message: "Invalid AI response" });
      }

      const result = {
        tone: ["great", "good", "needs_work"].includes(coaching.tone) ? coaching.tone : "good",
        toneLabel: typeof coaching.toneLabel === "string" ? coaching.toneLabel : "Keep chatting!",
        suggestions: Array.isArray(coaching.suggestions)
          ? coaching.suggestions.filter((s: any) => typeof s === "string").slice(0, 3)
          : ["Ask about their interests", "Share something about yourself", "Keep the conversation light and fun"],
        nextMessage: typeof coaching.nextMessage === "string" ? coaching.nextMessage : "",
      };
      res.json(result);
    } catch (error: any) {
      console.error("AI conversation coach error:", error);
      res.status(500).json({ message: "Failed to generate coaching tips" });
    }
  });

  app.get("/api/profiles/matchmaking", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const results = await storage.getMatchmakingProfiles(userId);
    res.json(results.map(r => ({
      ...r,
      profile: sanitizePublicProfile(r.profile),
    })));
  });

  // Get daily match
  app.get("/api/matches/daily", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      let dailyMatch = await storage.getDailyMatch(userId);
      
      if (!dailyMatch) {
        const recommendations = await storage.getRecommendedProfiles(userId);
        if (recommendations.length > 0) {
          const target = recommendations[0];
          dailyMatch = {
            id: null,
            user1Id: userId,
            user2Id: target.userId,
            isDailyMatch: true,
            createdAt: new Date(),
            partnerProfile: sanitizePublicProfile(target)
          };
        }
      }
      
      res.json(dailyMatch || null);
    } catch (error) {
      console.error("Daily match error:", error);
      res.status(500).json({ error: "Failed to get daily match" });
    }
  });

  // === AI MATCH ===
  // Get AI-powered match suggestions
  app.get("/api/ai-matches", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    
    try {
      // Get user's profile
      const userProfile = await storage.getProfile(userId);
      if (!userProfile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      // AI match suggestions are a paid feature (Basic/Pro/Elite).
      if (!userProfile.isPremium) {
        return res.status(403).json({ error: "AI Match is available on paid plans. Please upgrade." });
      }

      // 10 calls per hour — each call fans out across up to 20 candidate profiles.
      if (!(await checkAiRateLimit(userId, "ai-matches", 10, 60 * 60 * 1000))) {
        return res.status(429).json({ error: "You have reached the limit for AI match suggestions. Please try again later." });
      }

      // Get existing matches to exclude
      const existingMatches = await db
        .select()
        .from(matches)
        .where(or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)));
      
      const matchedUserIds = existingMatches.flatMap(m => 
        [m.user1Id, m.user2Id].filter(id => id !== userId)
      );

      const allPotential = await storage.getPotentialMatches(userId);
      const potentialMatches = allPotential
        .filter(p => !matchedUserIds.includes(p.userId))
        .slice(0, 20);

      if (potentialMatches.length === 0) {
        return res.json({ matches: [], analysis: "No potential matches found yet. Keep swiping!" });
      }

      // Prepare profile summaries for AI analysis
      const userSummary = `
        Name: ${userProfile.displayName}, Age: ${userProfile.age}
        Gender: ${userProfile.gender}, Looking for: ${userProfile.interestedIn}
        Bio: ${userProfile.bio || 'No bio'}
        Interests: ${userProfile.interests?.join(', ') || 'Not specified'}
      `;

      const candidateSummaries = potentialMatches.map((p, i) => `
        Candidate ${i + 1} (ID: ${p.id}):
        Name: ${p.displayName}, Age: ${p.age}
        Gender: ${p.gender}, Looking for: ${p.interestedIn}
        Bio: ${p.bio || 'No bio'}
        Interests: ${p.interests?.join(', ') || 'Not specified'}
        Verified: ${p.isVerified ? 'Yes' : 'No'}
        Premium: ${p.isPremium ? 'Yes' : 'No'}
      `).join('\n');

      // Use AI to analyze compatibility
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a dating matchmaker AI. Analyze the user's profile and the candidate profiles to find the best matches based on compatibility.
            
            Consider:
            - Shared interests and hobbies
            - Age compatibility
            - Gender preferences matching
            - Bio compatibility and personality hints
            - Verified and premium status (slight preference)
            
            Return a JSON response with:
            {
              "topMatches": [
                {
                  "candidateId": number,
                  "compatibilityScore": number (0-100),
                  "reason": "Brief explanation of why they're a good match"
                }
              ],
              "overallAnalysis": "A brief, friendly summary of the matching results"
            }
            
            Return up to 5 best matches, sorted by compatibility score.`
          },
          {
            role: "user",
            content: `User Profile:\n${userSummary}\n\nCandidate Profiles:\n${candidateSummaries}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
      });

      const aiResult = JSON.parse(response.choices[0]?.message?.content || '{"topMatches":[],"overallAnalysis":"Unable to analyze"}');

      const enrichedMatches = aiResult.topMatches?.map((match: any) => {
        const profile = potentialMatches.find(p => p.id === match.candidateId);
        return {
          profile: sanitizePublicProfile(profile),
          compatibilityScore: match.compatibilityScore,
          reason: match.reason
        };
      }).filter((m: any) => m.profile) || [];

      res.json({
        matches: enrichedMatches,
        analysis: aiResult.overallAnalysis
      });
    } catch (error) {
      console.error("AI match error:", error);
      res.status(500).json({ error: "Failed to get AI matches" });
    }
  });

  // Get specific profile
  app.get(api.profiles.get.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfileById(Number(req.params.id));
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    const blockedIds = await storage.getBlockedUserIds(userId);
    if (blockedIds.includes(profile.userId)) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json(sanitizePublicProfile(profile));
  });

  // === REPORTS ===

  app.post("/api/reports", isAuthenticated, async (req: any, res) => {
    const reporterId = req.user.claims.sub;
    try {
      const schema = z.object({
        reportedUserId: z.string().min(1),
        reason: z.enum(['inappropriate_photos', 'harassment', 'fake_profile', 'spam', 'underage', 'offensive_content', 'scam', 'other']),
        details: z.string().max(1000).optional(),
      });
      const { reportedUserId, reason, details } = schema.parse(req.body);

      if (reportedUserId === reporterId) {
        return res.status(400).json({ message: "You cannot report yourself." });
      }

      const alreadyReported = await storage.hasReported(reporterId, reportedUserId);
      if (alreadyReported) {
        return res.status(409).json({ message: "You have already reported this user." });
      }

      const reportedProfile = await storage.getProfile(reportedUserId);
      if (!reportedProfile) {
        return res.status(404).json({ message: "User not found." });
      }

      const report = await storage.createReport(reporterId, {
        reportedUserId,
        reason,
        details: details || null,
      });

      res.status(201).json({ success: true, message: "Report submitted. Our team will review it shortly." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to submit report." });
    }
  });

  app.get("/api/reports/check/:userId", isAuthenticated, async (req: any, res) => {
    const reporterId = req.user.claims.sub;
    const reportedUserId = req.params.userId;
    const reported = await storage.hasReported(reporterId, reportedUserId);
    res.json({ reported });
  });

  // === BLOCKS ===

  app.post("/api/blocks", isAuthenticated, async (req: any, res) => {
    const blockerId = req.user.claims.sub;
    try {
      const schema = z.object({ blockedUserId: z.string().min(1) });
      const { blockedUserId } = schema.parse(req.body);

      if (blockedUserId === blockerId) {
        return res.status(400).json({ message: "You cannot block yourself." });
      }

      const already = await storage.isBlocked(blockerId, blockedUserId);
      if (already) {
        return res.status(409).json({ message: "User is already blocked." });
      }

      const blockedProfile = await storage.getProfile(blockedUserId);
      if (!blockedProfile) {
        return res.status(404).json({ message: "User not found." });
      }

      await storage.blockUser(blockerId, blockedUserId);

      // Evict any active video call between these two users
      for (const [roomId, room] of callRooms.entries()) {
        if (room.has(blockerId) && room.has(blockedUserId)) {
          room.forEach((socket) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'call-ended', reason: 'blocked' }));
              socket.close();
            }
          });
          callRooms.delete(roomId);
          activeCallInvites.delete(parseInt(roomId));
          break;
        }
      }
      // Revoke pending video call tokens for either user
      videoCallTokens.forEach((data, token) => {
        if (data.userId === blockerId || data.userId === blockedUserId) {
          videoCallTokens.delete(token);
        }
      });

      res.status(201).json({ success: true, message: "User blocked successfully." });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to block user." });
    }
  });

  app.delete("/api/blocks/:userId", isAuthenticated, async (req: any, res) => {
    const blockerId = req.user.claims.sub;
    const blockedUserId = req.params.userId;
    await storage.unblockUser(blockerId, blockedUserId);
    res.json({ success: true, message: "User unblocked." });
  });

  // Permanently delete the signed-in user's account and all of their data.
  app.delete("/api/account", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mediaPaths = await storage.deleteAccount(userId);
      // Best-effort: remove the user's uploaded files (photos, voice notes,
      // videos) from object storage. Failures are logged but don't block.
      if (mediaPaths.length > 0) {
        void (async () => {
          try {
            const { ObjectStorageService } = await import("./replit_integrations/object_storage");
            const objectStorageService = new ObjectStorageService();
            for (const path of mediaPaths) {
              try {
                const objectFile = await objectStorageService.getObjectEntityFile(path);
                await objectFile.delete();
              } catch {
                // Object already gone or path invalid — nothing to clean up.
              }
            }
          } catch (cleanupErr: any) {
            console.error("[account-delete] Media cleanup failed:", cleanupErr?.message);
          }
        })();
      }
      // End the current session so the deleted user is fully signed out
      // (all other sessions were already revoked in deleteAccount).
      req.logout(() => {
        req.session.destroy(() => {
          res.json({ success: true, message: "Your profile has been deleted." });
        });
      });
    } catch (err) {
      console.error("Failed to delete account:", err);
      res.status(500).json({ message: "Failed to delete your profile. Please try again." });
    }
  });

  app.get("/api/blocks", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const blockedUsers = await storage.getBlockedUsers(userId);
    const sanitized = blockedUsers.map(({ block, profile }) => ({
      block,
      profile: sanitizePublicProfile(profile),
    }));
    res.json(sanitized);
  });

  app.get("/api/blocks/check/:userId", isAuthenticated, async (req: any, res) => {
    const blockerId = req.user.claims.sub;
    const blockedUserId = req.params.userId;
    const blocked = await storage.isBlocked(blockerId, blockedUserId);
    res.json({ blocked });
  });

  // === VERIFICATION ===
  
  // Submit verification photo
  app.post("/api/verification/submit", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const { photoUrl } = req.body;
      if (!photoUrl || typeof photoUrl !== "string") {
        return res.status(400).json({ message: "Photo URL is required" });
      }

      // Only accept object paths from our own object storage (uploaded by an
      // authenticated user), not arbitrary external URLs. Setting an ACL with
      // the requesting user as owner both confirms the object exists in our
      // bucket and binds it to the submitter.
      const { ObjectStorageService, ObjectValidationError } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      // Enforce server-issued origin: first-time binds require a pending upload record.
      // Re-binds where the user already owns the object (existing ACL) are allowed.
      const normalizedForCheck = objectStorageService.normalizeObjectEntityPath(photoUrl);
      if (normalizedForCheck.startsWith("/objects/")) {
        const pendingRec = await storage.getPendingUpload(normalizedForCheck);
        if (!pendingRec || pendingRec.userId !== userId) {
          const { getObjectAclPolicy: checkAcl } = await import("./replit_integrations/object_storage/objectAcl");
          const existingFile = await objectStorageService.getObjectEntityFile(normalizedForCheck).catch(() => null);
          const existingAcl = existingFile ? await checkAcl(existingFile).catch(() => null) : null;
          if (!existingAcl || existingAcl.owner !== userId) {
            return res.status(400).json({ message: "Upload was not issued through the app's secure upload flow" });
          }
        }
      }
      let normalizedPath: string;
      try {
        normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
          photoUrl,
          { owner: userId, visibility: "private" },
          userId,
          IMAGE_UPLOAD_CONSTRAINTS,
        );
      } catch (err) {
        if (err instanceof ObjectValidationError) {
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: "Invalid verification photo reference" });
      }
      if (!normalizedPath.startsWith("/objects/")) {
        return res.status(400).json({ message: "Verification photo must be uploaded through the app" });
      }
      // Delete pending record after successful bind.
      await storage.deletePendingUpload(normalizedForCheck).catch(() => {});

      // Submit for review. Verification stays in 'pending' until reviewed by a
      // trusted operator — the verified badge is a trust signal that other
      // users rely on, so it must never be self-issued.
      const profile = await storage.submitVerification(userId, normalizedPath);

      res.json({
        message: "Verification submitted. Your photo is pending review.",
        status: profile.verificationStatus,
      });
    } catch (err) {
      console.error("Verification submission error:", err);
      res.status(500).json({ message: "Failed to submit verification" });
    }
  });

  // === VOICE INTRO ===

  app.post("/api/uploads/voice-intro", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      if (!(await checkAiRateLimit(userId, "upload-voice-intro", 10, 60 * 60 * 1000))) {
        return res.status(429).json({ error: "Too many uploads. Please try again later." });
      }

      const { size, contentType } = req.body;
      if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
        return res.status(400).json({ error: "Missing or invalid required field: size" });
      }
      if (size > AUDIO_UPLOAD_CONSTRAINTS.maxSizeBytes) {
        return res.status(400).json({ error: `File too large. Maximum size is ${AUDIO_UPLOAD_CONSTRAINTS.maxSizeBytes / (1024 * 1024)}MB.` });
      }
      if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("audio/")) {
        return res.status(400).json({ error: "Invalid file type. Only audio files are allowed." });
      }

      // Per-user byte quota: cap total declared upload bytes in this window
      // so a malicious client cannot request many URLs each claiming a small
      // size and then PUT much larger blobs to each one.
      const withinBytesQuota = await storage.checkBytesQuota(
        `${userId}:upload-voice-intro-bytes`,
        size,
        50 * 1024 * 1024, // 50MB per hour
        60 * 60 * 1000,
      );
      if (!withinBytesQuota) {
        return res.status(429).json({ error: "Upload quota exceeded. Please try again later." });
      }

      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      // Allocate a server-controlled upload slot. The client PUTs to our own
      // proxy endpoint (/api/uploads/media/:uuid) instead of a GCS signed URL,
      // so the server can enforce content-type and byte limits at ingest time.
      const objectPath = objectStorageService.createObjectEntityPath();
      const uuid = objectPath.split("/").pop()!;
      const uploadURL = `/api/uploads/media/${uuid}`;
      await storage.createPendingUpload(objectPath, userId, "audio/", AUDIO_UPLOAD_CONSTRAINTS.maxSizeBytes);
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error generating voice upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.put("/api/profiles/voice-intro", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const schema = z.object({ voiceIntroUrl: z.string().nullable() });
      const { voiceIntroUrl } = schema.parse(req.body);

      let resolvedUrl = voiceIntroUrl;
      if (voiceIntroUrl) {
        const { ObjectStorageService, ObjectValidationError } = await import("./replit_integrations/object_storage");
        const objectStorageService = new ObjectStorageService();
        // Enforce server-issued origin: first-time binds require a pending upload record
        // (proof the path was issued by our server to this user). Re-binds where the user
        // already owns the object (existing ACL) are allowed without a pending record.
        const normalizedForCheck = objectStorageService.normalizeObjectEntityPath(voiceIntroUrl);
        if (normalizedForCheck.startsWith("/objects/")) {
          const pendingRec = await storage.getPendingUpload(normalizedForCheck);
          if (!pendingRec || pendingRec.userId !== userId) {
            const { getObjectAclPolicy: checkAcl } = await import("./replit_integrations/object_storage/objectAcl");
            const existingFile = await objectStorageService.getObjectEntityFile(normalizedForCheck).catch(() => null);
            const existingAcl = existingFile ? await checkAcl(existingFile).catch(() => null) : null;
            if (!existingAcl || existingAcl.owner !== userId) {
              return res.status(400).json({ message: "Upload was not issued through the app's secure upload flow" });
            }
          }
        }
        try {
          resolvedUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            voiceIntroUrl,
            { owner: userId, visibility: "private" },
            userId,
            AUDIO_UPLOAD_CONSTRAINTS,
          );
        } catch (err) {
          if (err instanceof ObjectValidationError) {
            return res.status(400).json({ message: err.message });
          }
          return res.status(400).json({ message: "Invalid voice intro reference" });
        }
        if (!resolvedUrl.startsWith("/objects/")) {
          return res.status(400).json({ message: "Voice intro must be uploaded through the app" });
        }
        // Delete pending record after successful bind (record is no longer needed).
        await storage.deletePendingUpload(normalizedForCheck).catch(() => {});
      }

      const profile = await storage.updateProfile(userId, { voiceIntroUrl: resolvedUrl });
      res.json(sanitizeProfile(profile));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("Voice intro update error:", err);
      res.status(500).json({ message: "Failed to update voice intro" });
    }
  });

  // === INTRO VIDEO UPLOAD ===
  app.post("/api/uploads/intro-video", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      if (!(await checkAiRateLimit(userId, "upload-intro-video", 10, 60 * 60 * 1000))) {
        return res.status(429).json({ error: "Too many uploads. Please try again later." });
      }

      const { size, contentType } = req.body;
      if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
        return res.status(400).json({ error: "Missing or invalid required field: size" });
      }
      if (size > VIDEO_UPLOAD_CONSTRAINTS.maxSizeBytes) {
        return res.status(400).json({ error: `File too large. Maximum size is ${VIDEO_UPLOAD_CONSTRAINTS.maxSizeBytes / (1024 * 1024)}MB.` });
      }
      if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("video/")) {
        return res.status(400).json({ error: "Invalid file type. Only video files are allowed." });
      }

      const withinBytesQuota = await storage.checkBytesQuota(
        `${userId}:upload-intro-video-bytes`,
        size,
        200 * 1024 * 1024, // 200MB per hour
        60 * 60 * 1000,
      );
      if (!withinBytesQuota) {
        return res.status(429).json({ error: "Upload quota exceeded. Please try again later." });
      }

      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.createObjectEntityPath();
      const uuid = objectPath.split("/").pop()!;
      const uploadURL = `/api/uploads/media/${uuid}`;
      await storage.createPendingUpload(objectPath, userId, "video/", VIDEO_UPLOAD_CONSTRAINTS.maxSizeBytes);
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error generating intro video upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.put("/api/profiles/intro-video", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const schema = z.object({ introVideoUrl: z.string().nullable() });
      const { introVideoUrl } = schema.parse(req.body);

      let resolvedUrl = introVideoUrl;
      if (introVideoUrl) {
        const { ObjectStorageService, ObjectValidationError } = await import("./replit_integrations/object_storage");
        const objectStorageService = new ObjectStorageService();
        // Enforce server-issued origin: first-time binds require a pending upload record.
        // Re-binds where the user already owns the object (existing ACL) are allowed.
        const normalizedForCheck = objectStorageService.normalizeObjectEntityPath(introVideoUrl);
        if (normalizedForCheck.startsWith("/objects/")) {
          const pendingRec = await storage.getPendingUpload(normalizedForCheck);
          if (!pendingRec || pendingRec.userId !== userId) {
            const { getObjectAclPolicy: checkAcl } = await import("./replit_integrations/object_storage/objectAcl");
            const existingFile = await objectStorageService.getObjectEntityFile(normalizedForCheck).catch(() => null);
            const existingAcl = existingFile ? await checkAcl(existingFile).catch(() => null) : null;
            if (!existingAcl || existingAcl.owner !== userId) {
              return res.status(400).json({ message: "Upload was not issued through the app's secure upload flow" });
            }
          }
        }
        try {
          resolvedUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            introVideoUrl,
            { owner: userId, visibility: "private" },
            userId,
            VIDEO_UPLOAD_CONSTRAINTS,
          );
        } catch (err) {
          if (err instanceof ObjectValidationError) {
            return res.status(400).json({ message: err.message });
          }
          return res.status(400).json({ message: "Invalid intro video reference" });
        }
        if (!resolvedUrl.startsWith("/objects/")) {
          return res.status(400).json({ message: "Intro video must be uploaded through the app" });
        }
        // Delete pending record after successful bind.
        await storage.deletePendingUpload(normalizedForCheck).catch(() => {});
      }

      const profile = await storage.updateProfile(userId, { introVideoUrl: resolvedUrl });
      res.json(sanitizeProfile(profile));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("Intro video update error:", err);
      res.status(500).json({ message: "Failed to update intro video" });
    }
  });

  // === VOICE NOTE UPLOAD (for chat messages) ===
  app.post("/api/uploads/voice-note", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      if (!(await checkAiRateLimit(userId, "upload-voice-note", 60, 60 * 60 * 1000))) {
        return res.status(429).json({ error: "Too many uploads. Please try again later." });
      }

      const { size, contentType } = req.body;
      if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
        return res.status(400).json({ error: "Missing or invalid required field: size" });
      }
      if (size > AUDIO_UPLOAD_CONSTRAINTS.maxSizeBytes) {
        return res.status(400).json({ error: `File too large. Maximum size is ${AUDIO_UPLOAD_CONSTRAINTS.maxSizeBytes / (1024 * 1024)}MB.` });
      }
      if (typeof contentType !== "string" || !contentType.toLowerCase().startsWith("audio/")) {
        return res.status(400).json({ error: "Invalid file type. Only audio files are allowed." });
      }

      const withinBytesQuota = await storage.checkBytesQuota(
        `${userId}:upload-voice-note-bytes`,
        size,
        100 * 1024 * 1024, // 100MB per hour
        60 * 60 * 1000,
      );
      if (!withinBytesQuota) {
        return res.status(429).json({ error: "Upload quota exceeded. Please try again later." });
      }

      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.createObjectEntityPath();
      const uuid = objectPath.split("/").pop()!;
      const uploadURL = `/api/uploads/media/${uuid}`;
      await storage.createPendingUpload(objectPath, userId, "audio/", AUDIO_UPLOAD_CONSTRAINTS.maxSizeBytes);
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error generating voice note upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // === POST-UPLOAD VERIFICATION ===
  // Called by the client immediately after the signed PUT completes. Reads the
  // REAL stored object metadata from GCS and deletes the object right away if
  // it violates size or content-type constraints. This closes the gap between
  // URL issuance (where only declared metadata is available) and binding (where
  // authoritative enforcement also happens via trySetObjectEntityAclPolicy).
  app.post("/api/uploads/verify", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { objectPath } = req.body;

    if (!objectPath || typeof objectPath !== "string") {
      return res.status(400).json({ error: "Missing required field: objectPath" });
    }

    // Look up the pending upload record to confirm:
    //  1. The path was actually issued by the server (not injected by the client)
    //  2. The requesting user is the one who requested the upload URL
    const pending = await storage.getPendingUpload(objectPath);
    if (!pending) {
      return res.status(404).json({ error: "No pending upload record for this path" });
    }
    if (pending.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();

      let objectFile;
      try {
        objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      } catch {
        // Object was never uploaded — clean up the pending record.
        await storage.deletePendingUpload(objectPath);
        return res.status(400).json({ error: "Object not found in storage; upload may have failed" });
      }

      // Read the REAL metadata from GCS (not client-declared).
      const [metadata] = await objectFile.getMetadata();
      const actualSize = Number(metadata.size ?? 0);
      const rawType = String(metadata.contentType ?? "");
      const actualType = rawType.toLowerCase().split(";")[0].trim();

      let violation: string | null = null;
      if (!Number.isFinite(actualSize) || actualSize <= 0) {
        violation = "Uploaded file is empty or has an unreadable size";
      } else if (actualSize > pending.maxSizeBytes) {
        const maxMb = Math.round(pending.maxSizeBytes / (1024 * 1024));
        violation = `Uploaded file is too large (maximum ${maxMb}MB)`;
      } else if (!actualType.startsWith(pending.allowedTypePrefix)) {
        violation = `Uploaded file has an unsupported type (expected ${pending.allowedTypePrefix}*)`;
      }

      if (violation) {
        // Delete the non-compliant object immediately — do not wait for the sweep.
        try { await objectFile.delete(); } catch (err) {
          console.error(`Failed to delete non-compliant upload ${objectPath}:`, err);
        }
        await storage.deletePendingUpload(objectPath);
        return res.status(400).json({ error: violation });
      }

      // Object is valid. Keep the pending record so the bind endpoint can verify
      // server-issued origin. The bind endpoint deletes the record after success.
      res.json({ verified: true, size: actualSize, contentType: actualType });
    } catch (error) {
      console.error("Upload verify error:", error);
      res.status(500).json({ error: "Failed to verify upload" });
    }
  });

  // === SERVER-MEDIATED UPLOAD PROXY ===
  // The client PUTs the raw file body directly to this endpoint instead of a
  // GCS signed URL. Unlike a signed PUT URL, this endpoint can enforce
  // content-type and byte-count constraints at ingest time — before any bytes
  // are written to the bucket — solving the core signed-URL limitation.
  //
  // Auth: the pending_uploads record proves this UUID was issued by the server
  // to the requesting user, so the proxy doubles as an origin check.
  app.put("/api/uploads/media/:uuid", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { uuid } = req.params;

    // Validate UUID format defensively (must be a server-generated v4 UUID).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
      return res.status(400).json({ error: "Invalid upload ID" });
    }

    const objectPath = `/objects/uploads/${uuid}`;

    // Verify ownership: the pending record is proof this slot was issued by
    // the server to this exact user.
    const pending = await storage.getPendingUpload(objectPath);
    if (!pending || pending.userId !== userId) {
      req.resume(); // drain body to avoid connection hang
      return res.status(404).json({ error: "Invalid or expired upload slot" });
    }

    // Validate Content-Type header before reading any body bytes.
    const rawContentType = (req.headers["content-type"] || "").toLowerCase().split(";")[0].trim();
    if (!rawContentType || !rawContentType.startsWith(pending.allowedTypePrefix)) {
      req.resume();
      return res.status(400).json({
        error: `Invalid content type. Expected ${pending.allowedTypePrefix}* file`,
      });
    }

    // Early size rejection from Content-Length header when present.
    const declaredLength = Number(req.headers["content-length"] || 0);
    if (declaredLength > 0 && declaredLength > pending.maxSizeBytes) {
      req.resume();
      return res.status(413).json({
        error: `File too large. Maximum is ${Math.round(pending.maxSizeBytes / (1024 * 1024))}MB`,
      });
    }

    try {
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();

      // Read body into memory with a hard byte cap.
      // Bounds: audio ≤10MB, video ≤50MB, image ≤5MB — manageable in-process.
      const maxBytes = pending.maxSizeBytes;
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let tooLarge = false;

      await new Promise<void>((resolve, reject) => {
        req.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            tooLarge = true;
            req.destroy(); // stop reading — triggers 'close' or 'error'
            resolve();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", resolve);
        req.on("error", (err: Error) => {
          if (tooLarge) resolve(); // expected destroy, not a real error
          else reject(err);
        });
        req.on("close", () => { if (tooLarge) resolve(); });
      });

      if (tooLarge) {
        return res.status(413).json({
          error: `File too large. Maximum is ${Math.round(maxBytes / (1024 * 1024))}MB`,
        });
      }
      if (totalBytes === 0) {
        return res.status(400).json({ error: "File is empty" });
      }

      // Write validated bytes to GCS via the SDK — no signed URL involved.
      const body = Buffer.concat(chunks);
      const gcsFile = objectStorageService.getObjectEntitySlotFile(objectPath);
      await gcsFile.save(body, {
        metadata: { contentType: rawContentType },
        resumable: false,
      });

      res.json({ objectPath, verified: true, size: totalBytes, contentType: rawContentType });
    } catch (error) {
      console.error("Proxy upload error:", error);
      res.status(500).json({ error: "Failed to write upload to storage" });
    }
  });

  // === MEDIA PROXY ROUTES ===
  // These routes enforce app-level authorization (block state, match membership)
  // before streaming private media objects. Raw object paths are never exposed
  // to clients; all media is accessed exclusively through these proxies.

  app.get("/api/media/photo/:targetUserId", isAuthenticated, async (req: any, res) => {
    const requesterId = req.user.claims.sub;
    const targetUserId = req.params.targetUserId;
    try {
      if (requesterId !== targetUserId) {
        const blocked = await storage.isBlockedEither(requesterId, targetUserId);
        if (blocked) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const hidden = await storage.isHiddenEither(requesterId, targetUserId);
        if (hidden) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const profile = await storage.getProfile(targetUserId);
      if (!profile?.photoUrl) {
        return res.status(404).json({ error: "Not found" });
      }
      // Externally-hosted fallback avatars (seeded demo profiles use Dicebear).
      // Only redirect to the known trusted avatar host; anything else external
      // is rejected so this proxy can't be used to bounce users to arbitrary URLs.
      if (/^https?:\/\//i.test(profile.photoUrl)) {
        try {
          const u = new URL(profile.photoUrl);
          if (u.protocol === "https:" && u.hostname === "api.dicebear.com") {
            return res.redirect(profile.photoUrl);
          }
        } catch {}
        return res.status(404).json({ error: "Not found" });
      }
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(profile.photoUrl);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Not found" });
      }
      console.error("Photo proxy error:", error);
      res.status(500).json({ error: "Failed to serve photo" });
    }
  });

  app.get("/api/media/voice-intro/:targetUserId", isAuthenticated, async (req: any, res) => {
    const requesterId = req.user.claims.sub;
    const targetUserId = req.params.targetUserId;
    try {
      if (requesterId !== targetUserId) {
        const blocked = await storage.isBlockedEither(requesterId, targetUserId);
        if (blocked) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const hidden = await storage.isHiddenEither(requesterId, targetUserId);
        if (hidden) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const profile = await storage.getProfile(targetUserId);
      if (!profile?.voiceIntroUrl) {
        return res.status(404).json({ error: "Not found" });
      }
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(profile.voiceIntroUrl);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Not found" });
      }
      console.error("Voice intro proxy error:", error);
      res.status(500).json({ error: "Failed to serve voice intro" });
    }
  });

  app.get("/api/media/intro-video/:targetUserId", isAuthenticated, async (req: any, res) => {
    const requesterId = req.user.claims.sub;
    const targetUserId = req.params.targetUserId;
    try {
      if (requesterId !== targetUserId) {
        const blocked = await storage.isBlockedEither(requesterId, targetUserId);
        if (blocked) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const hidden = await storage.isHiddenEither(requesterId, targetUserId);
        if (hidden) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const profile = await storage.getProfile(targetUserId);
      if (!profile?.introVideoUrl) {
        return res.status(404).json({ error: "Not found" });
      }
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(profile.introVideoUrl);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Not found" });
      }
      console.error("Intro video proxy error:", error);
      res.status(500).json({ error: "Failed to serve intro video" });
    }
  });

  app.get("/api/media/voice-note/:messageId", isAuthenticated, async (req: any, res) => {
    const requesterId = req.user.claims.sub;
    const messageId = Number(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).json({ error: "Invalid message ID" });
    }
    try {
      const message = await storage.getMessage(messageId);
      if (!message?.voiceNoteUrl) {
        return res.status(404).json({ error: "Not found" });
      }
      const match = await storage.getMatch(message.matchId);
      if (!match || (match.user1Id !== requesterId && match.user2Id !== requesterId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const otherUserId = match.user1Id === requesterId ? match.user2Id : match.user1Id;
      const blocked = await storage.isBlockedEither(requesterId, otherUserId);
      if (blocked) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(message.voiceNoteUrl);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Not found" });
      }
      console.error("Voice note proxy error:", error);
      res.status(500).json({ error: "Failed to serve voice note" });
    }
  });

  // === SWIPES ===
  app.post(api.swipes.create.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const input = api.swipes.create.input.parse(req.body);
      
      // Check if trying to swipe self
      if (input.swipedId === userId) {
        return res.status(400).json({ message: "Cannot swipe yourself" });
      }

      // Prevent swiping or matching across a block relationship
      const swipeBlocked = await storage.isBlockedEither(userId, input.swipedId);
      if (swipeBlocked) {
        return res.status(403).json({ message: "Action not allowed" });
      }

      // Slow dating mode: cap likes at 5 per day (server-enforced)
      if (input.liked) {
        const myProfile = await storage.getProfile(userId);
        if (myProfile?.slowDatingMode) {
          const likesToday = await storage.countLikesToday(userId);
          if (likesToday >= 5) {
            return res.status(429).json({
              message: "Slow dating mode: you've used all 5 likes for today. Come back tomorrow!",
              slowModeLimit: true,
            });
          }
        }
      }

      await storage.createSwipe({ ...input, swiperId: userId });

      let isMatch = false;
      let matchId: number | undefined;

      if (input.liked) {
        isMatch = await storage.checkMatch(userId, input.swipedId);
        if (isMatch) {
          matchId = await storage.createMatch(userId, input.swipedId);
          // Best-effort "it's a match" emails to both users.
          void sendMatchEmail(userId, input.swipedId);
        }
      }

      res.status(201).json({ match: isMatch, matchId });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.swipes.likesReceived.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const likers = await storage.getLikesReceived(userId);
    res.json(likers.map(sanitizePublicProfile));
  });

  // === MATCHES ===
  app.get(api.matches.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const results = await storage.getMatches(userId);
    res.json(results.map(({ partnerProfile, lastMessageAt, lastMessageSenderId, ...match }: any) => ({
      ...match,
      match,
      partnerProfile: sanitizePublicProfile(partnerProfile),
      lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
      lastMessageSenderId: lastMessageSenderId ?? null,
    })));
  });

  app.get(api.matches.get.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = Number(req.params.id);
    
    // Manual fetch to check ownership
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    if (match.user1Id !== userId && match.user2Id !== userId) {
      return res.status(404).json({ message: "Match not found" });
    }

    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;

    const matchBlocked = await storage.isBlockedEither(userId, partnerId);
    if (matchBlocked) {
      return res.status(403).json({ message: "Access not allowed" });
    }

    const partnerProfile = await storage.getProfile(partnerId);

    if (!partnerProfile) {
      return res.status(404).json({ message: "Partner profile not found" });
    }

    res.json({ match, partnerProfile: sanitizePublicProfile(partnerProfile) });
  });

  // === UNMATCH / END CONVERSATION ===
  app.delete("/api/matches/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = Number(req.params.id);
    try {
      const deleted = await storage.deleteMatch(matchId, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Match not found" });
      }

      // Evict any active video call for this match
      const unmatchRoomId = matchId.toString();
      if (callRooms.has(unmatchRoomId)) {
        callRooms.get(unmatchRoomId)!.forEach((socket) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'call-ended', reason: 'unmatched' }));
            socket.close();
          }
        });
        callRooms.delete(unmatchRoomId);
      }
      activeCallInvites.delete(matchId);
      // Revoke any pending video call tokens for this match
      videoCallTokens.forEach((data, token) => {
        if (data.matchId === matchId) {
          videoCallTokens.delete(token);
        }
      });

      res.json({ message: "Conversation ended successfully" });
    } catch (err) {
      console.error("Unmatch error:", err);
      res.status(500).json({ message: "Failed to end conversation" });
    }
  });

  // === MESSAGES ===
  app.get(api.messages.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = Number(req.params.id);
    
    // Check participation
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ message: "Match not found" });
    }

    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const msgBlocked = await storage.isBlockedEither(userId, partnerId);
    if (msgBlocked) {
      return res.status(403).json({ message: "Access not allowed" });
    }

    const msgs = await storage.getMessages(matchId);
    res.json(msgs.map(sanitizeMessage));
  });

  app.post(api.messages.create.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = Number(req.params.id);

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ message: "Match not found" });
    }

    const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const blockedEither = await storage.isBlockedEither(userId, otherUserId);
    if (blockedEither) {
      return res.status(403).json({ message: "You cannot message this user." });
    }

    // Check Trial/Premium Status
    const myProfile = await storage.getProfile(userId);
    if (!myProfile) {
      return res.status(400).json({ message: "Profile missing" });
    }

    const isPremium = myProfile.isPremium;
    const trialActive = new Date() <= myProfile.trialEndsAt;

    if (!isPremium && !trialActive) {
      return res.status(402).json({ 
        message: "Free trial expired. Please subscribe to continue messaging.",
        trialEndsAt: myProfile.trialEndsAt.toISOString()
      });
    }

    try {
      const input = api.messages.create.input.parse(req.body);

      // AI Scam Detection
      // Rate-limited to 60 scans per hour per user to avoid cost amplification
      // from automated high-frequency message sends.
      let isScam = false;
      let scamAnalysis = null;
      const scamRateLimitOk = await checkAiRateLimit(userId, "scam-detect", 60, 60 * 60 * 1000);
      if (scamRateLimitOk) {
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });

        const response = await openai.chat.completions.create({
          model: "gpt-5-mini",
          messages: [
            {
              role: "system",
              content: "You are an AI scam detector for a dating app. Analyze the message content for signs of common scams: requests for money, suspicious external links, crypto investment pitches, or phishing attempts. Return a JSON object: { \"isScam\": boolean, \"analysis\": \"brief reason if scam, else null\" }"
            },
            {
              role: "user",
              content: input.content
            }
          ],
          response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0]?.message?.content || "{}");
        isScam = !!result.isScam;
        scamAnalysis = result.analysis;
      } catch (err) {
        console.error("AI Scam Detection Error:", err);
      }
      } // end if (scamRateLimitOk)

      // If a voice note is attached, bind it to the sending user with an ACL
      // policy before persisting. This ensures the object has an explicit
      // access-control decision and cannot be served to unauthenticated callers
      // or denied by the no-ACL-equals-forbidden fallback on the serve route.
      // Voice notes are stored as private objects; access is controlled by the
      // /api/media/voice-note/:messageId proxy route which re-checks current
      // match membership and block state before serving the object.
      let resolvedVoiceNoteUrl = input.voiceNoteUrl || null;
      if (resolvedVoiceNoteUrl) {
        const { ObjectStorageService, ObjectValidationError } = await import("./replit_integrations/object_storage");
        const objectStorageService = new ObjectStorageService();
        // Enforce server-issued origin: first-time binds require a pending upload record.
        // Re-binds where the user already owns the object (existing ACL) are allowed.
        const normalizedForCheck = objectStorageService.normalizeObjectEntityPath(resolvedVoiceNoteUrl);
        if (normalizedForCheck.startsWith("/objects/")) {
          const pendingRec = await storage.getPendingUpload(normalizedForCheck);
          if (!pendingRec || pendingRec.userId !== userId) {
            const { getObjectAclPolicy: checkAcl } = await import("./replit_integrations/object_storage/objectAcl");
            const existingFile = await objectStorageService.getObjectEntityFile(normalizedForCheck).catch(() => null);
            const existingAcl = existingFile ? await checkAcl(existingFile).catch(() => null) : null;
            if (!existingAcl || existingAcl.owner !== userId) {
              return res.status(400).json({ message: "Upload was not issued through the app's secure upload flow" });
            }
          }
        }
        try {
          resolvedVoiceNoteUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            resolvedVoiceNoteUrl,
            { owner: userId, visibility: "private" },
            userId,
            AUDIO_UPLOAD_CONSTRAINTS,
          );
        } catch (err) {
          if (err instanceof ObjectValidationError) {
            return res.status(400).json({ message: err.message });
          }
          return res.status(400).json({ message: "Invalid voice note reference" });
        }
        if (!resolvedVoiceNoteUrl.startsWith("/objects/")) {
          return res.status(400).json({ message: "Voice note must be uploaded through the app" });
        }
        // Delete pending record after successful bind.
        await storage.deletePendingUpload(normalizedForCheck).catch(() => {});
      }

      const msg = await storage.createMessage({
        matchId,
        senderId: userId,
        content: input.content,
        voiceNoteUrl: resolvedVoiceNoteUrl,
        voiceNoteDuration: input.voiceNoteDuration || null,
        isScam,
        scamAnalysis,
      });
      // Best-effort new-message email to the recipient (throttled per convo).
      void sendNewMessageEmail(otherUserId, userId, matchId);
      res.status(201).json(sanitizeMessage(msg));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // === SAVED & HIDDEN PROFILES ===

  app.get("/api/profiles/saved", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profiles = await storage.getSavedProfiles(userId);
    res.json(profiles.map(sanitizePublicProfile));
  });

  app.post("/api/profiles/save/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const savedUserId = req.params.id;
    // Never allow saving a profile across a block relationship.
    const saveBlocked = await storage.isBlockedEither(userId, savedUserId);
    if (saveBlocked) {
      return res.status(403).json({ message: "Access not allowed" });
    }
    await storage.saveProfile(userId, savedUserId);
    res.json({ success: true });
  });

  app.delete("/api/profiles/save/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const savedUserId = req.params.id;
    await storage.unsaveProfile(userId, savedUserId);
    res.json({ success: true });
  });

  app.post("/api/profiles/hide/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const hiddenUserId = req.params.id;
    await storage.hideProfile(userId, hiddenUserId);
    res.json({ success: true });
  });

  // === PAYPAL / PAYMENTS ===

  // Get PayPal public client config (used for client SDK if needed)
  app.get("/api/paypal/config", async (_req, res) => {
    try {
      res.json({
        clientId: getPaypalClientId(),
        environment: getPaypalEnvironment(),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get PayPal config" });
    }
  });

  // List products with prices (shape: {data:[{id,name,prices:[{id,unit_amount,recurring}]}]})
  app.get("/api/products", async (_req, res) => {
    try {
      const plans = getCachedPlans();
      if (plans.length === 0) {
        // Lazy seed if startup didn't run yet
        await ensurePaypalPlans();
      }
      const data = getCachedPlans().map((p) => ({
        id: p.productId,
        name: p.name,
        description: p.description,
        active: true,
        metadata: { app: 'crush', tier: p.tier },
        prices: [
          {
            id: p.planId,
            unit_amount: Math.round(p.amount * 100),
            currency: p.currency.toLowerCase(),
            recurring: { interval: 'month' },
            active: true,
          },
        ],
      }));
      res.json({ data });
    } catch (error: any) {
      console.error("Products error:", error);
      res.status(500).json({ error: "Failed to load products" });
    }
  });

  // Create a PayPal subscription and return approval URL
  app.post("/api/checkout", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const userEmail = req.user.claims.email;
    const { priceId } = req.body; // priceId is the PayPal plan_id

    if (!priceId) {
      return res.status(400).json({ error: "Plan ID required" });
    }

    try {
      const profile = await storage.getProfile(userId);
      if (!profile) {
        return res.status(400).json({ error: "Profile required" });
      }

      const plan = getPlanByPlanId(priceId);
      if (!plan) {
        return res.status(400).json({ error: "Unknown plan" });
      }

      if (profile.isPremium && profile.paypalSubscriptionId) {
        return res.status(400).json({
          error: "You already have an active subscription. Please cancel it before subscribing to another plan.",
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const { subscriptionId, approvalUrl } = await createPaypalSubscription(
        priceId,
        userEmail || `user-${userId}@crush.local`,
        `${baseUrl}/premium?success=true`,
        `${baseUrl}/premium?canceled=true`,
        userId,
      );

      // Optimistically store the pending subscription id so webhooks can correlate
      await storage.updatePaypalSubscription(
        userId,
        subscriptionId,
        false,
        undefined,
        priceId,
      );

      res.json({ url: approvalUrl });
    } catch (error: any) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: "Failed to create subscription" });
    }
  });

  // Cancel the current subscription
  app.post("/api/customer-portal", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    try {
      const profile = await storage.getProfile(userId);

      if (!profile?.paypalSubscriptionId || !profile.isPremium) {
        // Idempotent: already canceled or never subscribed — clear local state and return success
        if (profile?.paypalSubscriptionId) {
          await storage.updatePaypalSubscription(userId, profile.paypalSubscriptionId, false);
        } else if (profile?.isPremium) {
          // Free-granted plan (no PayPal) — downgrade to free.
          await storage.clearTestPremium(userId);
        }
        return res.json({
          url: `${baseUrl}/premium?canceled=true`,
          canceled: true,
          alreadyCanceled: true,
        });
      }

      try {
        await cancelPaypalSubscription(profile.paypalSubscriptionId);
      } catch (cancelErr: any) {
        // If PayPal says the subscription is already inactive/canceled, treat as success
        const msg = String(cancelErr?.message || '');
        const alreadyDone = /SUBSCRIPTION_STATUS_INVALID|already|cancelled|RESOURCE_NOT_FOUND/i.test(msg);
        if (!alreadyDone) throw cancelErr;
      }

      await storage.updatePaypalSubscription(
        userId,
        profile.paypalSubscriptionId,
        false,
      );

      res.json({ url: `${baseUrl}/premium?canceled=true`, canceled: true });
    } catch (error: any) {
      console.error("Cancel error:", error);
      res.status(500).json({ error: "Failed to cancel subscription" });
    }
  });

  // ALL PLANS ARE FREE: members can pick any plan (Basic/Pro/Elite) at no
  // cost, or cancel back to "free" (no plan). No PayPal checkout is required —
  // the chosen tier is applied directly and isPremium is always kept true.
  app.post("/api/select-plan", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const { tier } = z
        .object({ tier: z.enum(["free", "basic", "pro", "elite"]) })
        .parse(req.body);

      const profile = await storage.getProfile(userId);
      if (!profile) {
        return res.status(400).json({ message: "Profile required" });
      }

      await storage.setTestPremium(userId, tier);

      const updated = (await storage.getProfile(userId)) ?? profile;
      res.json(sanitizeProfile(updated));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // === MICRO DATES ===

  // Invite a match to a micro-date
  app.post("/api/micro-dates/invite", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const schema = z.object({ matchId: z.number() });
      const { matchId } = schema.parse(req.body);

      const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
      if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
        return res.status(404).json({ message: "Match not found" });
      }

      const inviteeId = match.user1Id === userId ? match.user2Id : match.user1Id;

      const blockedEither = await storage.isBlockedEither(userId, inviteeId);
      if (blockedEither) {
        return res.status(403).json({ message: "Cannot start a micro-date with this user." });
      }

      const existing = await storage.getMicroDateByMatch(matchId);
      if (existing) {
        return res.status(409).json({ message: "A micro-date is already active or pending for this match.", microDate: existing });
      }

      const { generateMicroDateLineup } = await import("./microDateActivities");
      const lineup = generateMicroDateLineup();

      const microDate = await storage.createMicroDate(matchId, userId, inviteeId, JSON.stringify(lineup));
      res.status(201).json(microDate);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Micro-date invite error:", err);
      res.status(500).json({ message: "Failed to create micro-date invitation." });
    }
  });

  // Accept a micro-date invitation
  app.post("/api/micro-dates/:id/accept", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const microDateId = parseInt(req.params.id);

    const microDate = await storage.getMicroDate(microDateId);
    if (!microDate) {
      return res.status(404).json({ message: "Micro-date not found" });
    }
    if (microDate.inviteeId !== userId) {
      return res.status(403).json({ message: "Only the invited user can accept this invitation." });
    }

    const acceptPartnerId = microDate.inviterId;
    const acceptBlocked = await storage.isBlockedEither(userId, acceptPartnerId);
    if (acceptBlocked) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (microDate.status !== "pending") {
      return res.status(400).json({ message: "This invitation is no longer pending." });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + 5 * 60 * 1000);
    const updated = await storage.updateMicroDateStatus(microDateId, "active", now, endsAt);
    res.json(updated);
  });

  // Decline a micro-date invitation
  app.post("/api/micro-dates/:id/decline", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const microDateId = parseInt(req.params.id);

    const microDate = await storage.getMicroDate(microDateId);
    if (!microDate) {
      return res.status(404).json({ message: "Micro-date not found" });
    }
    if (microDate.inviteeId !== userId && microDate.inviterId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const declinePartnerId = microDate.inviterId === userId ? microDate.inviteeId : microDate.inviterId;
    const declineBlocked = await storage.isBlockedEither(userId, declinePartnerId);
    if (declineBlocked) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updated = await storage.updateMicroDateStatus(microDateId, "declined");
    res.json(updated);
  });

  // Get micro-date session state
  app.get("/api/micro-dates/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const microDateId = parseInt(req.params.id);

    const microDate = await storage.getMicroDate(microDateId);
    if (!microDate) {
      return res.status(404).json({ message: "Micro-date not found" });
    }
    if (microDate.inviterId !== userId && microDate.inviteeId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const microDatePartnerId = microDate.inviterId === userId ? microDate.inviteeId : microDate.inviterId;
    const microDateBlocked = await storage.isBlockedEither(userId, microDatePartnerId);
    if (microDateBlocked) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (microDate.status === "active" && microDate.endsAt && new Date() > microDate.endsAt) {
      const updated = await storage.updateMicroDateStatus(microDateId, "completed");
      const responses = await storage.getMicroDateResponses(microDateId);
      const inviterProfile = await storage.getProfile(microDate.inviterId);
      const inviteeProfile = await storage.getProfile(microDate.inviteeId);
      return res.json({
        ...updated,
        responses,
        inviterProfile: sanitizePublicProfile(inviterProfile),
        inviteeProfile: sanitizePublicProfile(inviteeProfile),
      });
    }

    const responses = await storage.getMicroDateResponses(microDateId);
    const inviterProfile = await storage.getProfile(microDate.inviterId);
    const inviteeProfile = await storage.getProfile(microDate.inviteeId);
    res.json({
      ...microDate,
      responses,
      inviterProfile: sanitizePublicProfile(inviterProfile),
      inviteeProfile: sanitizePublicProfile(inviteeProfile),
    });
  });

  // Submit a response to a micro-date activity
  app.post("/api/micro-dates/:id/respond", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const microDateId = parseInt(req.params.id);

    const microDate = await storage.getMicroDate(microDateId);
    if (!microDate) {
      return res.status(404).json({ message: "Micro-date not found" });
    }
    if (microDate.inviterId !== userId && microDate.inviteeId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const respondPartnerId = microDate.inviterId === userId ? microDate.inviteeId : microDate.inviterId;
    const respondBlocked = await storage.isBlockedEither(userId, respondPartnerId);
    if (respondBlocked) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (microDate.status !== "active") {
      return res.status(400).json({ message: "Micro-date is not active." });
    }

    try {
      const schema = z.object({
        activityIndex: z.number().min(0),
        response: z.string().min(1).max(500),
      });
      const { activityIndex, response } = schema.parse(req.body);

      const created = await storage.createMicroDateResponse(microDateId, activityIndex, userId, response);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to submit response." });
    }
  });

  // Complete a micro-date manually
  app.post("/api/micro-dates/:id/complete", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const microDateId = parseInt(req.params.id);

    const microDate = await storage.getMicroDate(microDateId);
    if (!microDate) {
      return res.status(404).json({ message: "Micro-date not found" });
    }
    if (microDate.inviterId !== userId && microDate.inviteeId !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const completePartnerId = microDate.inviterId === userId ? microDate.inviteeId : microDate.inviterId;
    const completeBlocked = await storage.isBlockedEither(userId, completePartnerId);
    if (completeBlocked) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const updated = await storage.updateMicroDateStatus(microDateId, "completed");
    res.json(updated);
  });

  // Get active/pending micro-date for a match
  app.get("/api/micro-dates/match/:matchId", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = parseInt(req.params.matchId);

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ message: "Match not found" });
    }

    const microMatchPartnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const microMatchBlocked = await storage.isBlockedEither(userId, microMatchPartnerId);
    if (microMatchBlocked) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const microDate = await storage.getMicroDateByMatch(matchId);
    if (!microDate) {
      return res.json(null);
    }

    const responses = await storage.getMicroDateResponses(microDate.id);
    const inviterProfile = await storage.getProfile(microDate.inviterId);
    const inviteeProfile = await storage.getProfile(microDate.inviteeId);
    res.json({
      ...microDate,
      responses,
      inviterProfile: sanitizePublicProfile(inviterProfile),
      inviteeProfile: sanitizePublicProfile(inviteeProfile),
    });
  });

  // === AI DATING ADVISOR ===
  app.post("/api/ai-advisor/chat", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { text, audio, history, generateAudio, voice, language } = req.body;

    // AI Dating Advisor is a paid feature (Basic/Pro/Elite).
    const advisorProfile = await storage.getProfile(userId);
    if (!advisorProfile || !advisorProfile.isPremium) {
      return res.status(403).json({ message: "AI Dating Advisor is available on paid plans. Please upgrade." });
    }

    // 30 calls per hour — chat is conversational and users may send many turns.
    if (!(await checkAiRateLimit(userId, "ai-advisor", 30, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "You have reached the limit for AI advisor messages. Please try again later." });
    }

    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
    const selectedVoice = validVoices.includes(voice) ? voice as typeof validVoices[number] : "nova";

    const languageMap: Record<string, string> = {
      english: "English",
      spanish: "Spanish",
      french: "French",
      german: "German",
      italian: "Italian",
      portuguese: "Portuguese",
      japanese: "Japanese",
      korean: "Korean",
      chinese: "Chinese (Mandarin)",
      arabic: "Arabic",
      hindi: "Hindi",
      russian: "Russian",
    };
    const selectedLanguage = languageMap[language] || "English";

    if (!text && !audio) {
      return res.status(400).json({ message: "Please provide text or audio input." });
    }

    // Reject excessively long text inputs before calling any AI.
    if (typeof text === "string" && text.length > 2000) {
      return res.status(400).json({ message: "Message is too long. Please keep it under 2000 characters." });
    }

    // Reject suspiciously large audio payloads (base64 of ~5 MB raw ≈ 6.7 MB base64).
    if (typeof audio === "string" && audio.length > 7_000_000) {
      return res.status(400).json({ message: "Audio file is too large." });
    }

    try {
      let userText = text;

      if (audio && !text) {
        const audioBuffer = Buffer.from(audio, "base64");
        const { buffer: compatibleBuffer, format } = await ensureCompatibleFormat(audioBuffer);
        userText = await speechToText(compatibleBuffer, format);
      }

      if (!userText || !userText.trim()) {
        return res.status(400).json({ message: "Could not understand the audio. Please try again." });
      }

      const profile = advisorProfile;

      const languageInstruction = selectedLanguage !== "English"
        ? `\n\nIMPORTANT: You MUST respond entirely in ${selectedLanguage}. All your text output must be in ${selectedLanguage}.`
        : "";

      const conversationMessages: any[] = [
        {
          role: "system",
          content: `You are a warm, supportive AI dating advisor named "Crush AI". You help users with dating advice, conversation tips, first date ideas, profile optimization, relationship guidance, and handling tricky dating situations.

Your personality:
- Friendly, encouraging, and non-judgmental
- Give practical, actionable advice
- Use a conversational tone (not too formal)
- Be concise — keep responses under 150 words unless the user asks for detail
- When relevant, personalize advice based on what you know about the user

${profile ? `About the user: Their name is ${profile.displayName}, they are ${profile.age} years old, ${profile.gender}, interested in ${profile.interestedIn}.${profile.bio ? ` Their bio: "${profile.bio}"` : ""}${profile.interests?.length ? ` Their interests: ${profile.interests.join(", ")}` : ""}${profile.relationshipGoal ? ` Looking for: ${profile.relationshipGoal}` : ""}` : ""}

Topics you can help with:
- First date ideas and planning
- Opening messages and conversation starters
- Profile tips (photos, bio, etc.)
- How to keep conversations interesting
- Reading signals and body language
- Handling rejection or ghosting
- Building confidence
- Red flags to watch for
- Long-distance relationship tips
- When/how to ask someone out${languageInstruction}`
        },
      ];

      if (Array.isArray(history)) {
        for (const msg of history.slice(-20)) {
          if (msg.role === "user" || msg.role === "assistant") {
            conversationMessages.push({
              role: msg.role,
              content: typeof msg.content === "string" ? msg.content.slice(0, 1000) : "",
            });
          }
        }
      }

      conversationMessages.push({ role: "user", content: userText });

      const OpenAI = (await import("openai")).default;
      const aiClient = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const chatResponse = await aiClient.chat.completions.create({
        model: "gpt-5-mini",
        messages: conversationMessages,
        max_completion_tokens: 1024,
      });

      const responseText = chatResponse.choices[0]?.message?.content || "Sorry, I couldn't generate a response. Please try again.";

      let audioBase64: string | undefined;
      if (generateAudio) {
        try {
          const audioBuffer = await textToSpeech(responseText, selectedVoice, "mp3");
          if (audioBuffer.length > 0) {
            audioBase64 = audioBuffer.toString("base64");
          }
        } catch (ttsErr) {
          console.error("TTS error (non-fatal):", ttsErr);
        }
      }

      res.json({
        text: responseText,
        userTranscript: audio ? userText : undefined,
        audio: audioBase64,
      });
    } catch (err: any) {
      console.error("AI Advisor error:", err);
      res.status(500).json({ message: "Failed to process your request. Please try again." });
    }
  });

  // === AI PHOTO MATCH ===
  app.post("/api/ai/photo-match", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ message: "Image data is required." });
    }

    const userProfile = await storage.getProfile(userId);
    if (!userProfile || (userProfile.membershipTier !== 'pro' && userProfile.membershipTier !== 'elite')) {
      return res.status(403).json({ error: "AI Photo Match is available on Pro and Elite plans. Please upgrade." });
    }

    // 10 calls per hour — vision model invocations are costly.
    if (!(await checkAiRateLimit(userId, "photo-match", 10, 60 * 60 * 1000))) {
      return res.status(429).json({ message: "You have reached the limit for AI photo match. Please try again later." });
    }

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // Use vision model to detect interests from the photo
      const visionResponse = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this photo and identify any interests, hobbies, activities, or lifestyle clues visible.
Return ONLY a JSON object with these fields:
- "detectedInterests": array of 3-8 concise interest keywords (e.g. "hiking", "cooking", "travel", "fitness", "music", "photography", "yoga", "art", "gaming", "surfing")
- "description": a friendly 1-2 sentence summary of what the photo reveals about the person's interests
- "confidence": "high", "medium", or "low" based on how clearly interests are visible
Focus on dating-relevant hobbies: sports, arts, food, travel, music, nature, fitness, tech, etc.
Return ONLY valid JSON — no markdown, no code blocks.`
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` }
            }
          ]
        }],
        max_completion_tokens: 500,
      });

      const content = visionResponse.choices[0]?.message?.content || "{}";
      let analysis: { detectedInterests?: string[]; description?: string; confidence?: string } = {};
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        analysis = {};
      }

      const detectedInterests: string[] = Array.isArray(analysis.detectedInterests)
        ? analysis.detectedInterests.slice(0, 8)
        : [];

      // Find profiles with overlapping interests (exclude self and blocked users)
      const blockedIds = await storage.getBlockedUserIds(userId);
      const excludedIds = [userId, ...blockedIds];
      const allProfiles = await db.select().from(profiles).where(notInArray(profiles.userId, excludedIds)).limit(300);

      const scoredProfiles = allProfiles
        .filter(p => p.interests && p.interests.length > 0)
        .map(p => {
          const profileInterests = (p.interests || []).map((i: string) => i.toLowerCase());
          const detectedLower = detectedInterests.map(i => i.toLowerCase());
          let score = 0;
          const shared: string[] = [];
          for (const detected of detectedLower) {
            for (const pi of profileInterests) {
              if (pi.includes(detected) || detected.includes(pi)) {
                score++;
                if (!shared.includes(p.interests![profileInterests.indexOf(pi)])) {
                  shared.push(p.interests![profileInterests.indexOf(pi)]);
                }
                break;
              }
            }
          }
          return { profile: p, score, sharedInterests: shared };
        })
        .filter(sp => sp.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map(sp => ({
          ...sanitizePublicProfile(sp.profile),
          matchScore: sp.score,
          sharedInterests: sp.sharedInterests,
        }));

      res.json({
        detectedInterests,
        description: analysis.description || "Interests detected from your photo.",
        confidence: analysis.confidence || "medium",
        matches: scoredProfiles,
      });
    } catch (err: any) {
      console.error("Photo match error:", err);
      res.status(500).json({ message: "Failed to analyze photo. Please try again." });
    }
  });

  // === VIDEO CALL INVITATIONS ===
  const activeCallInvites = new Map<number, { callerId: string; callerName: string; callerPhoto: string | null; createdAt: Date }>();
  const declinedCallInvites = new Set<number>();

  app.post("/api/video-call/invite", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: "Match ID required" });
    }

    const userProfile = await storage.getProfile(userId);
    if (!userProfile) {
      return res.status(403).json({ error: "Profile not found." });
    }
    if (userProfile.membershipTier !== 'pro' && userProfile.membershipTier !== 'elite') {
      return res.status(403).json({ error: "Video calls are available on Pro and Elite plans. Please upgrade." });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(403).json({ error: "Not authorized for this call" });
    }

    const callInvitePartnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const callInviteBlocked = await storage.isBlockedEither(userId, callInvitePartnerId);
    if (callInviteBlocked) {
      return res.status(403).json({ error: "Not authorized for this call" });
    }

    const callerPhotoProxyUrl = userProfile.photoUrl ? `/api/media/photo/${userId}` : null;
    activeCallInvites.set(matchId, {
      callerId: userId,
      callerName: userProfile.displayName,
      callerPhoto: callerPhotoProxyUrl,
      createdAt: new Date(),
    });

    const targetUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
    broadcastCallNotification(targetUserId, matchId, userProfile.displayName, callerPhotoProxyUrl);

    setTimeout(() => {
      const invite = activeCallInvites.get(matchId);
      if (invite && invite.callerId === userId) {
        activeCallInvites.delete(matchId);
      }
    }, 60000);

    res.json({ success: true });
  });

  app.get("/api/video-call/active/:matchId", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = parseInt(req.params.matchId);

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const activePartnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const activeCallBlocked = await storage.isBlockedEither(userId, activePartnerId);
    if (activeCallBlocked) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const invite = activeCallInvites.get(matchId);
    if (!invite || invite.callerId === userId) {
      return res.json({ active: false });
    }

    if (new Date().getTime() - invite.createdAt.getTime() > 60000) {
      activeCallInvites.delete(matchId);
      return res.json({ active: false });
    }

    res.json({
      active: true,
      callerName: invite.callerName,
      callerPhoto: invite.callerPhoto,
    });
  });

  app.post("/api/video-call/decline", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { matchId } = req.body;
    if (!matchId) {
      return res.status(400).json({ error: "Match ID required" });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const invite = activeCallInvites.get(matchId);
    if (invite && invite.callerId !== userId) {
      activeCallInvites.delete(matchId);
      declinedCallInvites.add(matchId);
      setTimeout(() => declinedCallInvites.delete(matchId), 120000);
    }
    res.json({ success: true });
  });

  app.get("/api/video-call/invite-status/:matchId", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = parseInt(req.params.matchId);

    const [statusMatch] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!statusMatch || (statusMatch.user1Id !== userId && statusMatch.user2Id !== userId)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const statusPartnerId = statusMatch.user1Id === userId ? statusMatch.user2Id : statusMatch.user1Id;
    const statusBlocked = await storage.isBlockedEither(userId, statusPartnerId);
    if (statusBlocked) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (declinedCallInvites.has(matchId)) {
      return res.json({ status: "declined" });
    }

    const invite = activeCallInvites.get(matchId);
    if (!invite || invite.callerId !== userId) {
      return res.json({ status: "gone" });
    }

    if (new Date().getTime() - invite.createdAt.getTime() > 60000) {
      activeCallInvites.delete(matchId);
      return res.json({ status: "expired" });
    }

    res.json({ status: "pending" });
  });

  app.post("/api/video-call/cancel", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { matchId } = req.body;
    if (matchId) {
      const invite = activeCallInvites.get(matchId);
      if (invite && invite.callerId === userId) {
        activeCallInvites.delete(matchId);
      }
    }
    res.json({ success: true });
  });

  // === VIDEO CALL TOKEN (for WebSocket auth) ===
  const videoCallTokens = new Map<string, { userId: string; matchId: number; sessionId: string; expiresAt: Date }>();
  
  app.post("/api/video-call/token", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { matchId } = req.body;
    
    if (!matchId) {
      return res.status(400).json({ error: "Match ID required" });
    }
    
    const userProfile = await storage.getProfile(userId);
    if (!userProfile) {
      return res.status(403).json({ error: "Profile not found." });
    }
    if (userProfile.membershipTier !== 'pro' && userProfile.membershipTier !== 'elite') {
      return res.status(403).json({ error: "Video calls are available on Pro and Elite plans. Please upgrade." });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(403).json({ error: "Not authorized for this call" });
    }

    const callTokenPartnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const callTokenBlocked = await storage.isBlockedEither(userId, callTokenPartnerId);
    if (callTokenBlocked) {
      return res.status(403).json({ error: "Not authorized for this call" });
    }
    
    // Generate token
    const token = crypto.randomUUID();
    videoCallTokens.set(token, {
      userId,
      matchId,
      sessionId: req.sessionID,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    });
    
    // Clean up expired tokens
    const now = new Date();
    videoCallTokens.forEach((data, t) => {
      if (data.expiresAt < now) {
        videoCallTokens.delete(t);
      }
    });
    
    res.json({ token });
  });

  // === CALL NOTIFICATION WebSocket ===
  const notifyTokens = new Map<string, { userId: string; sessionId: string; expiresAt: Date }>();
  const notifyConnections = new Map<string, Set<WebSocket>>();

  app.post("/api/video-call/notify-token", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;

    // Sweep expired tokens so unused entries can never accumulate forever.
    // (Successful WS auth is otherwise the only deletion path.)
    const now = new Date();
    notifyTokens.forEach((data, t) => {
      if (data.expiresAt < now) {
        notifyTokens.delete(t);
      }
    });

    // Bound each user to a single outstanding notify token. A client only ever
    // needs its latest token, so drop any prior ones for this user before
    // issuing a new one. This caps the map at ~one entry per user and blocks
    // the memory-exhaustion abuse of requesting tokens in a tight loop.
    notifyTokens.forEach((data, t) => {
      if (data.userId === userId) {
        notifyTokens.delete(t);
      }
    });

    const token = crypto.randomUUID();
    notifyTokens.set(token, { userId, sessionId: req.sessionID, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    res.json({ token });
  });

  const notifyWss = new WebSocketServer({ server: httpServer, path: '/ws/notifications' });

  notifyWss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth') {
          const td = notifyTokens.get(msg.token);
          if (td && td.expiresAt > new Date()) {
            userId = td.userId;
            (ws as any).__sessionId = td.sessionId;
            notifyTokens.delete(msg.token);
            if (!notifyConnections.has(userId)) {
              notifyConnections.set(userId, new Set());
            }
            notifyConnections.get(userId)!.add(ws);
            ws.send(JSON.stringify({ type: 'authenticated' }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
            ws.close();
          }
        } else if (msg.type === 'decline-call' && userId && msg.matchId) {
          const match = await storage.getMatch(msg.matchId);
          if (match && (match.user1Id === userId || match.user2Id === userId)) {
            activeCallInvites.delete(msg.matchId);
            declinedCallInvites.add(msg.matchId);
            setTimeout(() => declinedCallInvites.delete(msg.matchId), 120000);
            const roomId = msg.matchId.toString();
            if (callRooms.has(roomId)) {
              callRooms.get(roomId)!.forEach((socket) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ type: 'call-declined', userId }));
                }
              });
            }
          }
        }
      } catch {}
    });

    ws.on('close', () => {
      if (userId && notifyConnections.has(userId)) {
        notifyConnections.get(userId)!.delete(ws);
        if (notifyConnections.get(userId)!.size === 0) {
          notifyConnections.delete(userId);
        }
      }
    });
  });

  function broadcastCallNotification(targetUserId: string, matchId: number, callerName: string, callerPhoto: string | null) {
    const sockets = notifyConnections.get(targetUserId);
    if (sockets) {
      const payload = JSON.stringify({
        type: 'incoming-call',
        matchId,
        callerName,
        callerPhoto,
      });
      sockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      });
    }
  }

  // === VIDEO CALL SIGNALING (WebSocket) ===
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const callRooms = new Map<string, Map<string, WebSocket>>();
  
  wss.on('connection', (ws: WebSocket) => {
    let currentRoom: string | null = null;
    let currentUserId: string | null = null;
    let authenticated = false;
    
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join':
            // Validate token
            const token = message.token;
            if (!token) {
              ws.send(JSON.stringify({ type: 'error', message: 'Token required' }));
              ws.close();
              return;
            }
            
            const tokenData = videoCallTokens.get(token);
            if (!tokenData || tokenData.expiresAt < new Date()) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
              ws.close();
              videoCallTokens.delete(token);
              return;
            }
            
            // Verify matchId matches token
            if (tokenData.matchId.toString() !== message.matchId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Token mismatch' }));
              ws.close();
              return;
            }
            
            // Consume token (one-time use)
            videoCallTokens.delete(token);

            // Re-verify match still exists and users are not blocked
            const wsMatchId = tokenData.matchId;
            const [liveMatch] = await db.select().from(matches).where(eq(matches.id, wsMatchId));
            if (!liveMatch || (liveMatch.user1Id !== tokenData.userId && liveMatch.user2Id !== tokenData.userId)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Match no longer valid' }));
              ws.close();
              return;
            }
            const wsPartnerId = liveMatch.user1Id === tokenData.userId ? liveMatch.user2Id : liveMatch.user1Id;
            const wsBlocked = await storage.isBlockedEither(tokenData.userId, wsPartnerId);
            if (wsBlocked) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authorized for this call' }));
              ws.close();
              return;
            }

            // Use userId from token, not from client
            currentRoom = message.matchId as string;
            currentUserId = tokenData.userId;
            (ws as any).__sessionId = tokenData.sessionId;
            authenticated = true;
            
            const roomId = currentRoom;
            const oderId = currentUserId;
            
            if (!callRooms.has(roomId)) {
              callRooms.set(roomId, new Map());
            }
            
            const room = callRooms.get(roomId)!;
            
            // Limit room to 2 participants
            if (room.size >= 2) {
              ws.send(JSON.stringify({ type: 'error', message: 'Call room is full' }));
              ws.close();
              return;
            }
            
            room.set(oderId, ws);

            if (room.size === 2) {
              activeCallInvites.delete(parseInt(roomId));
            }

            const callerProfile = await storage.getProfile(currentUserId!);
            room.forEach((socket, oderId) => {
              if (oderId !== currentUserId && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                  type: 'incoming-call',
                  userId: currentUserId,
                  callerName: callerProfile?.displayName || 'Someone',
                  callerPhoto: callerProfile?.photoUrl ? `/api/media/photo/${currentUserId}` : null,
                }));
                socket.send(JSON.stringify({ type: 'user-joined', userId: currentUserId }));
              }
            });
            break;
            
          case 'offer':
          case 'answer':
          case 'ice-candidate':
            // Only allow signaling if authenticated
            if (!authenticated || !currentRoom) {
              ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
              return;
            }
            
            // Forward signaling messages to the other user in the room
            if (callRooms.has(currentRoom)) {
              callRooms.get(currentRoom)!.forEach((socket, oderId) => {
                if (oderId !== currentUserId && socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify(message));
                }
              });
            }
            break;
            
          case 'call-declined':
            if (currentRoom && callRooms.has(currentRoom)) {
              activeCallInvites.delete(parseInt(currentRoom));
              callRooms.get(currentRoom)!.forEach((socket, oderId) => {
                if (oderId !== currentUserId && socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ type: 'call-declined', userId: currentUserId }));
                }
              });
            }
            break;

          case 'leave':
            if (currentRoom && callRooms.has(currentRoom)) {
              activeCallInvites.delete(parseInt(currentRoom));
              callRooms.get(currentRoom)!.delete(currentUserId!);
              callRooms.get(currentRoom)!.forEach((socket) => {
                if (socket.readyState === WebSocket.OPEN) {
                  socket.send(JSON.stringify({ type: 'user-left', userId: currentUserId }));
                }
              });
              if (callRooms.get(currentRoom)!.size === 0) {
                callRooms.delete(currentRoom);
              }
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      // Clean up on disconnect
      if (currentRoom && currentUserId && callRooms.has(currentRoom)) {
        callRooms.get(currentRoom)!.delete(currentUserId);
        callRooms.get(currentRoom)!.forEach((socket) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'user-left', userId: currentUserId }));
          }
        });
        if (callRooms.get(currentRoom)!.size === 0) {
          callRooms.delete(currentRoom);
        }
      }
    });
  });

  // === LOGOUT-DRIVEN REAL-TIME REVOCATION ===
  // When an HTTP session is destroyed on logout, immediately tear down any
  // real-time access established under that same session: drop its unconsumed
  // bearer tokens and close its live notification/call sockets. Scoping by
  // sessionId (not userId) means a user's other logged-in devices keep working.
  // Closing a socket triggers its existing 'close' handler, which removes it
  // from notifyConnections/callRooms and notifies the call peer with 'user-left'.
  setRealtimeSessionRevoker((sessionId: string) => {
    videoCallTokens.forEach((data, t) => {
      if (data.sessionId === sessionId) videoCallTokens.delete(t);
    });
    notifyTokens.forEach((data, t) => {
      if (data.sessionId === sessionId) notifyTokens.delete(t);
    });

    const closeMatching = (server: WebSocketServer) => {
      server.clients.forEach((client) => {
        if ((client as any).__sessionId === sessionId) {
          try {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'session-revoked' }));
            }
          } catch {}
          try {
            client.close(4001, 'session ended');
          } catch {}
        }
      });
    };
    closeMatching(notifyWss);
    closeMatching(wss);
  });

  return httpServer;
}
