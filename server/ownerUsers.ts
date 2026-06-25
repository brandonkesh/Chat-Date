// ---------------------------------------------------------------------------
// Owner allow-list (admin gating)
// ---------------------------------------------------------------------------
// There is no roles system in the schema. Admin-only routes (e.g. viewing all
// submitted feedback) are gated by a simple allow-list of owner identifiers,
// mirroring the test-premium allow-list approach but configured via an
// environment variable so it is not hard-coded.
//
// Configure OWNER_EMAILS as a comma-separated list of the owner's Replit
// email address(es) and/or username(s). Matching is case-insensitive and only
// checks stable identifiers (email, username) — never display name.
//
// Example:
//   OWNER_EMAILS="owner@example.com, co-owner@example.com"

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse the OWNER_EMAILS env var into a normalized list of identifiers. */
function getOwnerIdentifiers(): string[] {
  const raw = process.env.OWNER_EMAILS ?? "";
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const key = normalize(part);
    if (key && !ids.includes(key)) ids.push(key);
  }
  return ids;
}

/**
 * True if the authenticated user is on the owner allow-list. Checks the user's
 * Replit email and username (stable identifiers) against OWNER_EMAILS.
 */
export function isOwner(claims: any): boolean {
  if (!claims) return false;
  const owners = getOwnerIdentifiers();
  if (owners.length === 0) return false;

  const candidates = [normalize(claims.email), normalize(claims.username)].filter(
    (c): c is string => c !== null,
  );
  return candidates.some((c) => owners.includes(c));
}

/**
 * The destination email address for feedback notifications. Prefers an explicit
 * FEEDBACK_NOTIFICATION_EMAIL, otherwise falls back to the first OWNER_EMAILS
 * entry that looks like an email address. Returns null if none is configured.
 */
export function getOwnerNotificationEmail(): string | null {
  const explicit = normalize(process.env.FEEDBACK_NOTIFICATION_EMAIL);
  if (explicit) return explicit;
  for (const id of getOwnerIdentifiers()) {
    if (id.includes("@")) return id;
  }
  return null;
}
