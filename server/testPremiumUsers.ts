import { storage } from "./storage";
import type { MembershipTier } from "@shared/schema";

// ---------------------------------------------------------------------------
// Private forced-tier overrides (NOT the public signup flow).
// ---------------------------------------------------------------------------
// Everyone now chooses their own plan during signup (or anytime on the Premium
// page) and gets it for free — see POST /api/select-plan. That choice persists
// across logins.
//
// This list is a way to FORCE a specific tier for an account on EVERY login,
// overriding whatever the user picked. It exists only for special testing.
// Add an entry as { "<email-or-username>": "basic" | "pro" | "elite" }.
// Matching is case-insensitive on the user's Replit username and email only.
//
// Leave it EMPTY so that owner/tester accounts can freely switch their own plan
// like any other user and have the choice stick. Real PayPal subscribers are
// never affected by this list.
export const TEST_PREMIUM_USERS: Record<string, MembershipTier> = {};

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

  // Not on the allow-list. We do NOT revoke premium here: users now choose
  // their own plan (granted for free, no PayPal), and that choice must persist
  // across logins. Downgrades happen explicitly via the plan/cancel flow.
}
