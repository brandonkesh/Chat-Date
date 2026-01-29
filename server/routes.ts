import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { db } from "./db";
import { matches } from "@shared/schema";
import { eq, or, and } from "drizzle-orm";
import { stripeService } from "./stripeService";
import { stripeStorage } from "./stripeStorage";
import { getStripePublishableKey } from "./stripeClient";

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
    res.json(profile);
  });

  // Create/Update current user profile
  app.put(api.profiles.me.update.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    try {
      const input = api.profiles.me.update.input.parse(req.body);
      const existing = await storage.getProfile(userId);
      
      let profile;
      if (existing) {
        profile = await storage.updateProfile(userId, input);
      } else {
        profile = await storage.createProfile({ ...input, userId });
      }
      res.json(profile);
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

  // Get potential matches (Feed)
  app.get(api.profiles.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const profiles = await storage.getPotentialMatches(userId);
    res.json(profiles);
  });

  // Get specific profile
  app.get(api.profiles.get.path, isAuthenticated, async (req: any, res) => {
    const profile = await storage.getProfileById(Number(req.params.id));
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    res.json(profile);
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

  return httpServer;
}
