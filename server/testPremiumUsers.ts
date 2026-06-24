import { storage } from "./storage";
import type { MembershipTier } from "@shared/schema";

// ---------------------------------------------------------------------------
// Controlled testing: auto-premium allow-list
// ---------------------------------------------------------------------------
// Accounts listed here are automatically upgraded to premium when they log in
// (or when they create their profile). This is meant for safe, controlled
// testing with family/friends. Everyone NOT on this list keeps the normal
// PayPal payment flow untouched.
//
// Matching is case-insensitive and checks the user's Replit username and email
// only (stable identifiers), so list one of those for each tester.
// Examples: "uncle", "dad", "friend1", or "uncle@example.com".
//
// To stop a tester's premium access, remove them from this list. Their stored
// premium flag will then be cleared the next time they log in.
export const TEST_PREMIUM_USERS: string[] = [
  "uncle",
  "dad",
  "friend1",
];

// Tier granted to test users. "elite" unlocks every premium feature
// (video calling, micro-dates, AI advisor, etc.) so testers can try everything.
export const TEST_PREMIUM_TIER: MembershipTier = "elite";

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Returns true if the authenticated user's claims match an entry in the
 * test-premium allow-list.
 */
export function isTestPremiumUser(claims: any): boolean {
  if (!claims) return false;
  const list = new Set(
    TEST_PREMIUM_USERS.map((u) => u.trim().toLowerCase()).filter(Boolean),
  );
  if (list.size === 0) return false;

  // Only match on stable, unique identifiers. Do NOT match on first name, which
  // is non-unique and user-controlled (would allow premium escalation).
  const candidates = [
    normalize(claims.username),
    normalize(claims.email),
  ].filter((c): c is string => c !== null);

  return candidates.some((c) => list.has(c));
}

/**
 * Ensures the test user's profile reflects the correct premium state.
 * - If they ARE on the allow-list: grant premium (idempotent).
 * - If they were previously a test user but were removed from the list:
 *   clear the test premium so access stays controlled.
 *
 * Real PayPal subscribers are NEVER affected here: if a profile has a PayPal
 * subscription, its membership state is left entirely to the PayPal flow.
 */
export async function applyTestPremiumIfNeeded(
  userId: string,
  claims: any,
): Promise<void> {
  const profile = await storage.getProfile(userId);
  // No profile yet (user hasn't finished onboarding) — nothing to update.
  // This will be applied right after the profile is created instead.
  if (!profile) return;

  // Hands off completely from anyone with a real PayPal subscription. We never
  // grant or revoke premium for paying subscribers, even if they are also on
  // the test list.
  if (profile.paypalSubscriptionId) return;

  if (isTestPremiumUser(claims)) {
    const alreadyCorrect =
      profile.isPremium && profile.membershipTier === TEST_PREMIUM_TIER;
    if (!alreadyCorrect) {
      await storage.setTestPremium(userId, TEST_PREMIUM_TIER);
    }
    return;
  }

  // Not on the allow-list and not a PayPal subscriber. If this account got
  // premium via the test path, revoke it so testing stays controlled.
  if (profile.isPremium) {
    await storage.clearTestPremium(userId);
  }
}
