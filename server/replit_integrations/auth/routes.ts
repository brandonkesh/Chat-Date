import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user.
  // This returns only the caller's OWN basic identity (id, name, email, photo).
  // It deliberately does NOT enforce the 2FA / app-lock gates: the single-page
  // app needs this endpoint to bootstrap and know who is logged in so it can
  // render the 2FA challenge or app-lock screen. Those gates are still flagged
  // here (twoFactorRequired / appLockRequired) and are fully enforced on every
  // sensitive /api route by the global middleware in routes.ts, so withholding
  // the user's own identity here would only break the challenge UI without
  // adding protection.
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getProfile(userId);
      const user = await authStorage.getUser(userId);
      res.json({
        ...user,
        twoFactorRequired: !!(profile?.twoFactorEnabled && !(req.session as any).twoFactorVerified),
        appLockRequired: !!(profile?.passwordHash && !(req.session as any).appLockVerified),
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
