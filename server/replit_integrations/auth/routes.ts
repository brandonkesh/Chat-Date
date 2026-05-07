import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { storage } from "../../storage";

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user.
  // This route is registered before the global 2FA/app-lock middleware, so we
  // enforce those gates explicitly here to prevent bypass via the /auth/ prefix.
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getProfile(userId);

      if (profile?.twoFactorEnabled && !(req.session as any).twoFactorVerified) {
        return res.status(403).json({ message: "Two-factor authentication required.", twoFactorRequired: true });
      }

      if (profile?.passwordHash && !(req.session as any).appLockVerified) {
        return res.status(423).json({ message: "App is locked. Please enter your password." });
      }

      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
