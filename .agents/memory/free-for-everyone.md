---
name: Free selectable plans
description: Owner removed all payments; members freely pick Basic/Pro/Elite at $0, downgrades below premium are disabled.
---
Owner's product decision (July 2026): Crush has NO paid checkout. The plan page shows Basic/Pro/Elite with original prices struck through and "FREE"; members self-select any tier via the authenticated select-plan endpoint at $0 (this self-serve tier escalation is intentional, not a vulnerability).

**Why:** Owner first wanted "everything free for everyone", then refined it to "show the plans with pricing so people can pick — but all free."

**How to apply:**
- Tier differentiation is real: picking Basic means Basic features. But `isPremium` must never drop to false — billing webhooks/cancellation paths only clear PayPal bookkeeping, never entitlements.
- A best-effort startup normalization upgrades only legacy rows (non-premium or tier 'free') to elite — it must never overwrite a member's picked tier. This is also how the separate production DB gets unlocked on publish.
- PayPal routes/webhook remain wired but grant nothing; do NOT re-add paid checkout or downgrade logic unless the owner explicitly reverses this decision.
