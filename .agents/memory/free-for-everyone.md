---
name: Free-for-everyone entitlements
description: Owner made all premium features free; downgrades are disabled by design.
---
The owner decided (July 2026) that Crush has NO paid plans: every profile is permanently `isPremium=true`, `membershipTier='elite'`.

**Why:** Owner chose "make everything free for everyone — no paying, no plan selection" over keeping the PayPal tier system.

**How to apply:**
- Enforcement lives at the storage layer: the subscription-update and premium-clear methods always re-assert elite and never write `isPremium=false` / tier `'free'` — even for PayPal cancel/expire/suspend webhooks (bookkeeping fields still update).
- Schema defaults are premium/elite; a best-effort startup normalization in the server bootstrap upgrades any non-elite rows (this is how the separate production DB gets unlocked on publish — dev SQL updates don't reach prod).
- The Premium page is a static "everything's included" page with no checkout. PayPal routes/webhook remain wired but grant nothing extra.
- Do NOT re-add downgrade logic or plan selection unless the owner explicitly reverses this decision.
