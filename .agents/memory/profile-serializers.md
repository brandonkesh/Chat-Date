---
name: Profile serializers (self vs public)
description: Two-serializer rule for returning profile data — never send another member's full profile.
---

# Profile serializers: self vs public

There are two serializers for profile responses in `server/routes.ts`:
- `sanitizeProfile` — for the authenticated user's OWN profile only (denylist;
  keeps most fields, strips true secrets). Used at the ~5 self endpoints
  (`GET/PUT /api/profiles/me`, voice-intro, intro-video, premium cancel-test).
- `sanitizePublicProfile` — for EVERY member-to-member surface (feed, matches,
  likes, saved, blocks, AI-assist, micro-dates, `GET /api/profiles/:id`, etc.).
  It is **default-deny**: returns only `PUBLIC_PROFILE_FIELDS` and rewrites
  photo/voice/video to block-aware `/api/media/*` proxy URLs.

**Why:** The old single denylist serializer leaked dateOfBirth, latitude/
longitude, zipCode, paypal* ids, twoFactor*/emailVerified security state, reward
timing, timezone, and hasPassword to any authenticated user (scrapable via the
sequential integer profile id). An allow-list means any newly added profile
column stays private until explicitly whitelisted.

**How to apply:** When returning a profile that is NOT the caller's own, always
use `sanitizePublicProfile`. When adding a genuinely public display field, add it
to `PUBLIC_PROFILE_FIELDS` — do not switch other-user routes back to
`sanitizeProfile`. Sequential-id enumeration of *public display* data is
acceptable by design (it's a dating feed); the sensitive fields are the risk.
