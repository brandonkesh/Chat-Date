import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { db } from "./db";
import { matches, profiles, users } from "@shared/schema";
import { eq, or, and, ne, notInArray } from "drizzle-orm";
import { stripeService } from "./stripeService";
import { stripeStorage } from "./stripeStorage";
import { getStripePublishableKey } from "./stripeClient";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import { openai } from "./replit_integrations/image/client";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

function sanitizeProfile(profile: any) {
  if (!profile) return profile;
  const { twoFactorSecret, emailVerificationCode, emailVerificationExpiry, ...safe } = profile;
  return safe;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);
  
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
    res.json(sanitizeProfile(profile));
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
    res.json({ qrCode: qrCodeDataUrl, secret, otpauthUrl });
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
      return res.status(400).json({ message: "Invalid verification code. Please try again." });
    }
    (req.session as any).twoFactorVerified = true;
    res.json({ success: true });
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
    console.log(`[Email Verification] Code for ${user[0].email}: ${code}`);
    res.json({
      success: true,
      message: "Verification code sent to your email.",
      email: user[0].email,
      codePreview: code,
    });
  });

  // Verify email code
  app.post("/api/email-verification/verify", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Verification code is required." });
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
      return res.status(400).json({ message: "Verification code has expired. Please request a new one." });
    }
    if (profile.emailVerificationCode !== code) {
      return res.status(400).json({ message: "Invalid verification code. Please try again." });
    }
    await storage.verifyEmail(userId);
    res.json({ success: true, message: "Email verified successfully." });
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

  // Get daily match
  app.get("/api/matches/daily", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      let dailyMatch = await storage.getDailyMatch(userId);
      
      if (!dailyMatch) {
        // Find a highly compatible profile that isn't already matched/swiped
        const recommendations = await storage.getRecommendedProfiles(userId);
        if (recommendations.length > 0) {
          const target = recommendations[0];
          const matchId = await storage.createMatch(userId, target.userId, true);
          dailyMatch = {
            id: matchId,
            user1Id: userId,
            user2Id: target.userId,
            isDailyMatch: true,
            createdAt: new Date(),
            partnerProfile: target
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

      // Get existing matches to exclude
      const existingMatches = await db
        .select()
        .from(matches)
        .where(or(eq(matches.user1Id, userId), eq(matches.user2Id, userId)));
      
      const matchedUserIds = existingMatches.flatMap(m => 
        [m.user1Id, m.user2Id].filter(id => id !== userId)
      );

      // Get potential matches based on preferences
      let potentialMatchesQuery = db
        .select()
        .from(profiles)
        .where(ne(profiles.userId, userId));
      
      if (matchedUserIds.length > 0) {
        potentialMatchesQuery = db
          .select()
          .from(profiles)
          .where(
            and(
              ne(profiles.userId, userId),
              notInArray(profiles.userId, matchedUserIds)
            )
          );
      }
      
      const potentialMatches = await potentialMatchesQuery.limit(20);

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

      // Enrich AI results with full profile data
      const enrichedMatches = aiResult.topMatches?.map((match: any) => {
        const profile = potentialMatches.find(p => p.id === match.candidateId);
        return {
          profile,
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
    const profile = await storage.getProfileById(Number(req.params.id));
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json(sanitizeProfile(profile));
  });

  // === VERIFICATION ===
  
  // Submit verification photo
  app.post("/api/verification/submit", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const { photoUrl } = req.body;
      if (!photoUrl) {
        return res.status(400).json({ message: "Photo URL is required" });
      }
      
      const profile = await storage.submitVerification(userId, photoUrl);
      
      // For now, auto-approve verification (in production, this would go to admin review)
      // Simulate a brief delay then approve
      setTimeout(async () => {
        try {
          await storage.updateVerificationStatus(userId, 'approved');
        } catch (error) {
          console.error("Failed to auto-approve verification:", error);
        }
      }, 3000);
      
      res.json({ 
        message: "Verification submitted successfully", 
        status: profile.verificationStatus 
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
      const profile = await storage.updateProfile(userId, { voiceIntroUrl });
      res.json(sanitizeProfile(profile));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: err.errors });
      }
      console.error("Voice intro update error:", err);
      res.status(500).json({ message: "Failed to update voice intro" });
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

      await storage.createSwipe({ ...input, swiperId: userId });

      let isMatch = false;
      let matchId: number | undefined;

      if (input.liked) {
        isMatch = await storage.checkMatch(userId, input.swipedId);
        if (isMatch) {
          matchId = await storage.createMatch(userId, input.swipedId);
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

  // === MATCHES ===
  app.get(api.matches.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const results = await storage.getMatches(userId);
    res.json(results);
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
    const partnerProfile = await storage.getProfile(partnerId);

    if (!partnerProfile) {
      return res.status(404).json({ message: "Partner profile not found" });
    }

    res.json({ match, partnerProfile });
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

    const msgs = await storage.getMessages(matchId);
    res.json(msgs);
  });

  app.post(api.messages.create.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const matchId = Number(req.params.id);

    // Check participation
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
      return res.status(404).json({ message: "Match not found" });
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
      const msg = await storage.createMessage({
        matchId,
        senderId: userId,
        content: input.content,
      });
      res.status(201).json(msg);
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

  // === STRIPE / PAYMENTS ===
  
  // Get Stripe publishable key
  app.get("/api/stripe/publishable-key", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get Stripe key" });
    }
  });

  // List products with prices
  app.get("/api/products", async (req, res) => {
    try {
      const rows = await stripeStorage.listProductsWithPrices();
      
      const productsMap = new Map();
      for (const row of rows as any[]) {
        if (!productsMap.has(row.product_id)) {
          productsMap.set(row.product_id, {
            id: row.product_id,
            name: row.product_name,
            description: row.product_description,
            active: row.product_active,
            metadata: row.product_metadata,
            prices: []
          });
        }
        if (row.price_id) {
          productsMap.get(row.product_id).prices.push({
            id: row.price_id,
            unit_amount: row.unit_amount,
            currency: row.currency,
            recurring: row.recurring,
            active: row.price_active,
          });
        }
      }

      res.json({ data: Array.from(productsMap.values()) });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to load products" });
    }
  });

  // Create checkout session
  app.post("/api/checkout", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const userEmail = req.user.claims.email;
    const { priceId } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: "Price ID required" });
    }

    try {
      const profile = await storage.getProfile(userId);
      if (!profile) {
        return res.status(400).json({ error: "Profile required" });
      }

      let customerId = profile.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(userEmail, userId);
        await storage.updateStripeCustomer(userId, customer.id);
        customerId = customer.id;
      }

      const session = await stripeService.createCheckoutSession(
        customerId,
        priceId,
        `${req.protocol}://${req.get('host')}/premium?success=true`,
        `${req.protocol}://${req.get('host')}/premium?canceled=true`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // Create customer portal session
  app.post("/api/customer-portal", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;

    try {
      const profile = await storage.getProfile(userId);
      if (!profile?.stripeCustomerId) {
        return res.status(400).json({ error: "No subscription found" });
      }

      const session = await stripeService.createCustomerPortalSession(
        profile.stripeCustomerId,
        `${req.protocol}://${req.get('host')}/premium`
      );

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Portal error:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  // === VIDEO CALL TOKEN (for WebSocket auth) ===
  // Store temporary video call tokens: token -> { oderId, matchId, expiresAt }
  const videoCallTokens = new Map<string, { userId: string; matchId: number; expiresAt: Date }>();
  
  // Generate video call token (validates match membership)
  app.post("/api/video-call/token", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const { matchId } = req.body;
    
    if (!matchId) {
      return res.status(400).json({ error: "Match ID required" });
    }
    
    // Verify user is part of the match
    const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
    if (!match || (match.user1Id !== userId && match.user2Id !== userId)) {
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

  // === VIDEO CALL SIGNALING (WebSocket) ===
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Track connected users: matchId -> { userId: WebSocket }
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
            
            // Use userId from token, not from client
            currentRoom = message.matchId as string;
            currentUserId = tokenData.userId;
            authenticated = true;
            
            // Consume token (one-time use)
            videoCallTokens.delete(token);
            
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
            
            // Notify other user in room that someone joined
            room.forEach((socket, oderId) => {
              if (oderId !== currentUserId && socket.readyState === WebSocket.OPEN) {
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
            
          case 'leave':
            // User leaving the call
            if (currentRoom && callRooms.has(currentRoom)) {
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
