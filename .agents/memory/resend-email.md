---
name: Resend transactional email
description: How Crush sends app emails and the domain-verification delivery limit
---

# Resend transactional email

Crush sends transactional email through Resend. Shared helper + senders live in
`server/email.ts` (`getResendApiKey` is reused by `feedbackEmail.ts`).

**Key delivery limit (non-obvious):** until a sending domain is verified in the
Resend dashboard, Resend's shared `onboarding@resend.dev` sender only delivers to
the Resend **account owner's own email**. Emails to other users silently don't
arrive even though the API call succeeds.

**Why:** Resend blocks sending to arbitrary recipients from the shared onboarding
domain to prevent spam. This is a Resend-side rule, not visible in our code.

**How to apply:** To reach all users, the owner must verify a domain in Resend and
set `EMAIL_FROM` to an address on that domain. API key comes from `RESEND_API_KEY`
secret or the Replit Resend connector.

Conventions for any new app email: HTML-escape all user-derived strings, strip
CR/LF from names used in subjects (header-injection safety), and make every send
best-effort (never throw, fire-and-forget with `void` from routes) so it can't
block or fail the user request.
