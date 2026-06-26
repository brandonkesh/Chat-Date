import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { isTestPremiumUser, applyTestPremiumIfNeeded } from "./testPremiumUsers";
import { isOwner } from "./ownerUsers";
import { sendFeedbackNotification } from "./feedbackEmail";
import {
  sendWelcomeEmail,
  sendMatchEmail,
  sendNewMessageEmail,
  sendAppLockBackupCodesEmail,
  sendAppLockChangedEmail,
} from "./email";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { db } from "./db";
import { matches, profiles, users, swipes } from "@shared/schema";
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
import { ensureCompatibleFormat, speechToText, textToSpeech } from "./replit_integrations/audio/client";
import crypto from "crypto";
import { openai } from "./replit_integrations/image/client";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

function sanitizeProfile(profile: any) {
  if (!profile) return profile;
  const { twoFactorSecret, emailVerificationCode, emailVerificationExpiry, passwordHash, backupCodes, verificationPhotoUrl, voiceIntroUrl, introVideoUrl, ...safe } = profile;
  return {
    ...safe,
    hasPassword: !!passwordHash,
    voiceIntroUrl: voiceIntroUrl ? `/api/media/voice-intro/${profile.userId}` : null,
    introVideoUrl: introVideoUrl ? `/api/media/intro-video/${profile.userId}` : null,
  };
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
    "/2fa/verify", "/2fa/status",
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
    "/2fa/verify", "/2fa/status",
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
        // Best-effort welcome email (never blocks or fails the request).
        void sendWelcomeEmail(userId);
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

  // === TWO-FACTOR AUTHENTICATION ===

  // Get 2FA status
  app.get("/api/2fa/status", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json({
      enabled: profile.twoFactorEnabled ?? false,
      verified: (req.session as any).twoFactorVerified ?? false,
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

  // Disable 2FA
  app.post("/api/2fa/disable", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Verification code is required to disable 2FA." });
    }
    const secret = await storage.getTwoFactorSecret(userId);
    if (!secret) {
      return res.status(400).json({ message: "Two-factor authentication is not enabled." });
    }
    const result = verifySync({ token: code, secret });
    if (!result.valid) {
      return res.status(400).json({ message: "Invalid verification code." });
    }
    await storage.disableTwoFactor(userId);
    (req.session as any).twoFactorVerified = false;
    res.json({ success: true, message: "Two-factor authentication disabled." });
  });

  // Verify 2FA code (for login challenge)
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
    if (!profile?.twoFactorEnabled || !profile.twoFactorSecret) {
      return res.status(400).json({ message: "Two-factor authentication is not enabled." });
    }
    const result = verifySync({ token: code, secret: profile.twoFactorSecret });
    if (!result.valid) {
      recordSecondaryAuthFailure(rateLimitKey);
      return res.status(400).json({ message: "Invalid verification code. Please try again." });
    }
    resetSecondaryAuthAttempts(rateLimitKey);
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
    res.json(profiles.map(sanitizeProfile));
  });

  // Get recommended profiles (based on shared interests)
  app.get(api.profiles.recommended.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profiles = await storage.getRecommendedProfiles(userId);
    res.json(profiles.map(sanitizeProfile));
  });

  // Get crush picks (verified & premium users)
  app.get(api.profiles.crushPicks.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profiles = await storage.getCrushPicks(userId);
    res.json(profiles.map(sanitizeProfile));
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
      profile: sanitizeProfile(r.profile),
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
            partnerProfile: sanitizeProfile(target)
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
          profile: sanitizeProfile(profile),
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
    res.json(sanitizeProfile(profile));
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

  app.get("/api/blocks", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const blockedUsers = await storage.getBlockedUsers(userId);
    const sanitized = blockedUsers.map(({ block, profile }) => ({
      block,
      profile: sanitizeProfile(profile),
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
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      let normalizedPath: string;
      try {
        normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
          photoUrl,
          { owner: userId, visibility: "private" },
          userId,
        );
      } catch {
        return res.status(400).json({ message: "Invalid verification photo reference" });
      }
      if (!normalizedPath.startsWith("/objects/")) {
        return res.status(400).json({ message: "Verification photo must be uploaded through the app" });
      }

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
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
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
        const { ObjectStorageService } = await import("./replit_integrations/object_storage");
        const objectStorageService = new ObjectStorageService();
        try {
          resolvedUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            voiceIntroUrl,
            { owner: userId, visibility: "private" },
            userId,
          );
        } catch {
          return res.status(400).json({ message: "Invalid voice intro reference" });
        }
        if (!resolvedUrl.startsWith("/objects/")) {
          return res.status(400).json({ message: "Voice intro must be uploaded through the app" });
        }
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
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
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
        const { ObjectStorageService } = await import("./replit_integrations/object_storage");
        const objectStorageService = new ObjectStorageService();
        try {
          resolvedUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            introVideoUrl,
            { owner: userId, visibility: "private" },
            userId,
          );
        } catch {
          return res.status(400).json({ message: "Invalid intro video reference" });
        }
        if (!resolvedUrl.startsWith("/objects/")) {
          return res.status(400).json({ message: "Intro video must be uploaded through the app" });
        }
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
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error generating voice note upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // === MEDIA PROXY ROUTES ===
  // These routes enforce app-level authorization (block state, match membership)
  // before streaming private media objects. Raw object paths are never exposed
  // to clients; all media is accessed exclusively through these proxies.

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
    res.json(likers.map(sanitizeProfile));
  });

  // === MATCHES ===
  app.get(api.matches.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const results = await storage.getMatches(userId);
    res.json(results.map((r: any) => ({
      ...r,
      partnerProfile: sanitizeProfile(r.partnerProfile),
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

    res.json({ match, partnerProfile: sanitizeProfile(partnerProfile) });
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
        const { ObjectStorageService } = await import("./replit_integrations/object_storage");
        const objectStorageService = new ObjectStorageService();
        try {
          resolvedVoiceNoteUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            resolvedVoiceNoteUrl,
            { owner: userId, visibility: "private" },
            userId,
          );
        } catch {
          return res.status(400).json({ message: "Invalid voice note reference" });
        }
        if (!resolvedVoiceNoteUrl.startsWith("/objects/")) {
          return res.status(400).json({ message: "Voice note must be uploaded through the app" });
        }
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
    res.json(profiles.map(sanitizeProfile));
  });

  app.post("/api/profiles/save/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const savedUserId = req.params.id;
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

  // Select a plan for free (no PayPal). Users choose their own tier and get it
  // granted directly. Real PayPal subscribers manage their plan via PayPal.
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

      if (profile.paypalSubscriptionId && profile.isPremium) {
        return res.status(400).json({
          message:
            "You have an active PayPal subscription. Manage it from the subscription page.",
        });
      }

      if (tier === "free") {
        await storage.clearTestPremium(userId);
      } else {
        await storage.setTestPremium(userId, tier);
      }

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
        inviterProfile: sanitizeProfile(inviterProfile),
        inviteeProfile: sanitizeProfile(inviteeProfile),
      });
    }

    const responses = await storage.getMicroDateResponses(microDateId);
    const inviterProfile = await storage.getProfile(microDate.inviterId);
    const inviteeProfile = await storage.getProfile(microDate.inviteeId);
    res.json({
      ...microDate,
      responses,
      inviterProfile: sanitizeProfile(inviterProfile),
      inviteeProfile: sanitizeProfile(inviteeProfile),
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
      inviterProfile: sanitizeProfile(inviterProfile),
      inviteeProfile: sanitizeProfile(inviteeProfile),
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
          ...sanitizeProfile(sp.profile),
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

    activeCallInvites.set(matchId, {
      callerId: userId,
      callerName: userProfile.displayName,
      callerPhoto: userProfile.photoUrl,
      createdAt: new Date(),
    });

    const targetUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
    broadcastCallNotification(targetUserId, matchId, userProfile.displayName, userProfile.photoUrl);

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
  const videoCallTokens = new Map<string, { userId: string; matchId: number; expiresAt: Date }>();
  
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
  const notifyTokens = new Map<string, { userId: string; expiresAt: Date }>();
  const notifyConnections = new Map<string, Set<WebSocket>>();

  app.post("/api/video-call/notify-token", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const token = crypto.randomUUID();
    notifyTokens.set(token, { userId, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
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
                  callerPhoto: callerProfile?.photoUrl || null,
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

  return httpServer;
}
