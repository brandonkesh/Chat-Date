import { storage } from "./storage";
import type { MembershipTier } from "@shared/schema";

// ---------------------------------------------------------------------------
// Private owner/tester grants (NOT the public signup flow).
// ---------------------------------------------------------------------------
// Regular users are NEVER assigned a tier based on their email — they choose
// their own plan during signup and pay through PayPal for paid tiers.
//
// The accounts listed below are a deliberate exception: they get the assigned
// tier directly (no PayPal), for the owner and any trusted testers. Matching is
// case-insensitive on the user's Replit username and email only.
// Value is the tier to grant: "basic", "pro", or "elite" (Elite = everything).
//
// To grant access, add an entry. To revoke it, remove the entry — their premium
// is cleared the next time they log in. Real PayPal subscribers are never
// affected by this list.
export const TEST_PREMIUM_USERS: Record<string, MembershipTier> = {
  "brandonkeshwani@gmail.com": "elite",
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

  // Hands off completely from anyone with an ACTIVE PayPal subscription. We
  // never grant or revoke premium for current paying subscribers, even if they
  // are also on the test list. A leftover subscription id on a non-premium
  // account (cancelled/incomplete checkout) is NOT treated as active, so it
  // won't block testing.
  const hasActivePaypal = Boolean(profile.paypalSubscriptionId) && profile.isPremium;
  if (hasActivePaypal) return;

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
