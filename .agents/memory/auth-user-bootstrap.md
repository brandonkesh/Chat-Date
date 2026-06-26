---
name: auth/user must not be gated by 2FA / app-lock
description: Why GET /api/auth/user has to return the caller's identity even before 2FA/app-lock is satisfied.
---

# /api/auth/user is the SPA bootstrap endpoint — never hard-gate it

The React app decides whether to show the 2FA challenge or the app-lock screen
inside `ProtectedRoute`, which only mounts when `useAuth()` reports a logged-in
user. `useAuth` (`client/src/hooks/use-auth.ts`) treats **only HTTP 401** as
"logged out"; any other non-OK status (e.g. 403/423) **throws**, leaving `user`
undefined and rendering the Landing page.

**Rule:** `GET /api/auth/user` must return the caller's own basic identity even
when 2FA or app-lock is still pending. Surface the pending state as flags on the
response (`twoFactorRequired`, `appLockRequired`), not as a 403/423.

**Why:** A past change added explicit 2FA/app-lock gates to `/api/auth/user`
"to prevent bypass via the /auth/ prefix." That 403/423 made the challenge UI
unreachable on a fresh login for BOTH TOTP and email/SMS 2FA — the user got
stuck on Landing. The endpoint only ever returns the user's *own* identity, and
every sensitive `/api` route is still gated by the global middleware in
`server/routes.ts`, so withholding identity here adds no protection and only
breaks the challenge bootstrap.

**How to apply:** If you re-add auth gating, gate sensitive *data* routes, not
the identity-bootstrap endpoint. If the challenge/app-lock screen ever stops
rendering after login, check whether `/api/auth/user` is returning a non-401
error and whether `fetchUser` swallows it.
