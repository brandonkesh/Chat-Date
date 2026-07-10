---
name: PayPal webhook ownership binding
description: How a PayPal subscription webhook must resolve which Crush account it affects (never from custom_id).
---

# PayPal webhook ownership binding

Subscription webhook events (`BILLING.SUBSCRIPTION.*`) must resolve the owning
Crush `userId` **only** from the server-issued mapping
`storage.getProfileByPaypalSubscriptionId(subscriptionId)`. If no mapping exists,
ignore the event. Never trust `resource.custom_id` to select the account. When
`custom_id` is present it may be used as a defense-in-depth equality check against
the resolved owner (mismatch = refuse), never as the source of truth.

**Why:** `custom_id` is attacker-controllable. PayPal's client-side subscription
flow only needs the public merchant client id (`/api/paypal/config`) and a plan id
(`/api/products`), and accepts a caller-supplied `custom_id`. Trusting it let an
attacker create a subscription with `custom_id = victimUserId` and, via the signed
webhook, activate/replace/cancel the victim's premium.

**How to apply:** The legitimate path (`POST /api/checkout`) creates the PayPal
subscription and immediately stores its `subscriptionId` on the authenticated
user's profile *before* returning the approval URL — so the mapping always exists
before any ACTIVATED webhook can fire. Do not reintroduce `custom_id` as the owner
selector. If legacy/manual subscriptions ever need linking, add an explicit
admin-only re-link path instead.
