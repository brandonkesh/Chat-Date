import { storage } from "./storage";
import type { MembershipTier } from "@shared/schema";

// ---------------------------------------------------------------------------
// Controlled testing: auto-premium allow-list (per-tier)
// ---------------------------------------------------------------------------
// Accounts listed here are automatically upgraded to the tier you assign them
// when they log in (or when they create their profile). This is meant for safe,
// controlled testing with family/friends so you can try EVERY tier. Everyone
// NOT on this list keeps the normal PayPal payment flow untouched.
//
// Matching is case-insensitive and checks the user's Replit username and email
// only (stable identifiers), so use one of those as the key.
// The value is the tier they should get: "basic", "pro", or "elite".
//
// Examples:
//   "uncle": "elite",            // uncle tests the top tier
//   "dad": "pro",                // dad tests Pro
//   "friend1": "basic",          // friend1 tests Basic
//   "aunt@example.com": "elite", // you can also key by email
//
// To stop a tester's premium access, remove their entry. Their premium will be
// cleared the next time they log in. To change a tester's tier, edit the value.
export const TEST_PREMIUM_USERS: Record<string, MembershipTier> = {
  "brandonkeshwani@gmail.com": "elite",
  uncle: "elite",
  dad: "pro",
  friend1: "basic",
};

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// Build a case-insensitive lookup once per call from the configured map.
function buildLookup(): Map<string, MembershipTier> {
  const lookup = new Map<string, MembershipTier>();
  for (const [identifier, tier] of Object.entries(TEST_PREMIUM_USERS)) {
    const key = normalize(identifier);
    if (key) lookup.set(key, tier);
  }
  return lookup;
}

/**
 * Returns the tier a test account should be granted, or null if the account is
 * not on the allow-list. Only matches on stable, unique identifiers (username
 * and email) — never first name, which is non-unique and user-controlled.
 */
export function getTestPremiumTier(claims: any): MembershipTier | null {
  if (!claims) return null;
  const lookup = buildLookup();
  if (lookup.size === 0) return null;

  const candidates = [normalize(claims.username), normalize(claims.email)].filter(
    (c): c is string => c !== null,
  );

  for (const candidate of candidates) {
    const tier = lookup.get(candidate);
    if (tier) return tier;
  }
  return null;
}

/** True if the authenticated user is on the test-premium allow-list. */
export function isTestPremiumUser(claims: any): boolean {
  return getTestPremiumTier(claims) !== null;
}

/**
 * Ensures the test user's profile reflects the correct premium state.
 * - If they ARE on the allow-list: grant the tier assigned to them (idempotent).
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

  const tier = getTestPremiumTier(claims);

  if (tier) {
    const alreadyCorrect = profile.isPremium && profile.membershipTier === tier;
    if (!alreadyCorrect) {
      await storage.setTestPremium(userId, tier);
    }
    return;
  }

  // Not on the allow-list and not a PayPal subscriber. If this account got
  // premium via the test path, revoke it so testing stays controlled.
  if (profile.isPremium) {
    await storage.clearTestPremium(userId);
  }
}
