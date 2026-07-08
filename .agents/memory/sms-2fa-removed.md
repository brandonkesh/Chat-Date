---
name: SMS 2FA removed
description: Owner decided to drop text-message login codes; email + authenticator app are the supported 2FA methods.
---

SMS/text-message 2FA was fully removed (July 2026) at the owner's request.

**Why:** Twilio setup (trial limits, buying a number, verifying each recipient, ongoing cost) was too burdensome for the owner. No user ever had SMS enabled (Twilio was never fully configured, so enabling was impossible).

**How to apply:** Don't re-suggest SMS codes unless the owner asks. Email codes (Resend, free) and authenticator apps are the supported 2FA methods. TWILIO_* secrets may still exist but are unused and can be deleted. The `profiles.phone_number` column remains in the schema but is always null.
