# Threat Model

## Project Overview

Crush is a dating app with a React frontend and an Express/TypeScript backend backed by PostgreSQL. It stores user profiles, private messages, matches, uploaded media, account security settings, and subscription state. Production authentication is handled through Replit OIDC sessions, while the app adds its own 2FA, app-lock, verification, object-storage, PayPal, and AI-powered features on top.

## Assets

- **User accounts and sessions** -- Replit-authenticated sessions, refresh tokens in session state, and any app-level security state such as 2FA/app-lock verification flags. Compromise allows account access.
- **Private user data** -- profile details, location data, relationship preferences, messages, reports, and saved/hidden/block relationships. This is sensitive dating-app data with direct privacy and safety impact.
- **User-uploaded media** -- profile photos, verification photos, voice intros, intro videos, and voice notes. Some of these are highly sensitive and should not be public by default.
- **Trust and safety signals** -- verified badges, email verification state, age-related trust indicators, block/report state, and scam-detection outputs. If attackers can forge or bypass these, users may trust the wrong people.
- **Payment and subscription state** -- PayPal subscription IDs, plan IDs, membership tiers, and trial status. Incorrect state can grant paid features or create billing confusion.
- **Application secrets and third-party credentials** -- database URL, session secret, PayPal credentials, and OpenAI credentials. Leakage would impact the whole service.

## Trust Boundaries

- **Browser to API** -- every client request is untrusted and must be authenticated, authorized, and validated server-side.
- **Authenticated session to app-level security gates** -- Replit login is not the same as app-level 2FA, app-lock, or verification state. Those controls must be enforced on the server if they are intended to protect server resources.
- **API to PostgreSQL** -- the backend can read and write all profile, messaging, payment, and safety data.
- **API to object storage** -- uploaded media crosses into storage and later back out through media-serving routes. Ownership and ACL checks matter here.
- **API to third parties** -- the server calls PayPal and OpenAI and must not trust client-controlled values when making those calls or processing callbacks.
- **Public to authenticated media/resources** -- public pages and static assets are separate from private user media, verification artifacts, and account-management APIs.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/replit_integrations/auth/replitAuth.ts`, `server/replit_integrations/object_storage/routes.ts`, `server/paypalWebhookHandler.ts`
- **Highest-risk areas:** auth/session enforcement, path-based `/api` gate exemptions, profile/media ACL binding, shared profile write schemas in `shared/schema.ts` / `shared/routes.ts`, payment/subscription routes, WebSocket signaling, and any route returning private user data
- **Public vs authenticated:** most app APIs are authenticated; PayPal webhook and object-serving paths are special boundaries that need explicit review; match-scoped APIs must still enforce block and ownership rules after authentication
- **Dev-only / usually ignore unless proven reachable:** unregistered integration route files under `server/replit_integrations/chat`, `audio/routes.ts`, and `image/routes.ts`; Vite/dev tooling; mockup sandbox assumptions

## Threat Categories

### Spoofing

Crush lets users present themselves as real, trustworthy people through verified badges, email verification, and account security settings. The server must ensure these states cannot be self-issued or bypassed through client-only logic. Replit OIDC proves who signed in, but any app-level second-factor or verification control must also be enforced server-side.

Required guarantees:
- All protected APIs MUST require a valid server-side session.
- Any enabled 2FA or app-lock control MUST be enforced on the server for the routes it claims to protect.
- Verification badges MUST only be granted after real server-side validation or trusted review.

### Tampering

The client can send profile fields, media references, match actions, and payment-related inputs. The server must treat all of these as attacker-controlled. Features like subscription state, verification, and media attachment must not be driven by untrusted client values alone.

Required guarantees:
- Sensitive account state MUST be derived or confirmed server-side, not trusted from the client.
- Uploaded media references MUST be tied to the authenticated user before being attached to profiles or verification records.
- Payment and subscription state MUST only change based on trusted server-side events.

### Information Disclosure

This app handles especially sensitive dating and safety data. Private uploads, messages, blocked-user relationships, verification artifacts, backup codes, and 2FA secrets must not leak through APIs, logs, or publicly served objects.

Required guarantees:
- Private media MUST not be retrievable without appropriate authentication and authorization.
- Blocked users MUST stay excluded from any API that exposes profile data if the product promises profile hiding.
- Secrets and sensitive account-recovery material MUST NOT be written to logs or returned to unnecessary clients.
- API responses SHOULD be sanitized to the minimum needed by the client.

### Denial of Service

Several routes trigger expensive work: AI analysis, media handling, and external API calls. These can become abuse points if they are broadly reachable or unbounded.

Required guarantees:
- Expensive AI and media endpoints SHOULD be rate-limited and bounded by request size.
- Upload and transcription paths MUST validate size and type limits before processing.
- External-service calls SHOULD fail safely and avoid unbounded retries.

### Elevation of Privilege

Users should only access their own account data, allowed counterparties, and features included in their plan. Missing per-route authorization can turn a valid login into broader access than intended, especially around blocked users, private media, and app-level security controls.

Required guarantees:
- Authorization checks MUST be applied per route, not assumed from frontend navigation.
- Block, match, and ownership rules MUST be enforced consistently across alternate APIs, including AI-assisted features.
- Session-based controls like 2FA/app-lock MUST protect server resources, not just UI routes.
