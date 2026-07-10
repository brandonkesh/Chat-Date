---
name: Profile updates are full-schema, not partial
description: The profile save endpoint validates the complete insert schema — settings toggles that resend only some fields silently fail.
---

# Profile updates are full-schema

**Rule:** There is no partial-update path for profiles. Any client feature that saves a single new setting must resend every schema-required profile field, or the save is rejected with a validation error the UI may not surface.

**Why:** Two separate feature toggles shipped broken because their payloads omitted one required field — the request 400'd and the setting never persisted, with no visible error.

**How to apply:** When adding a profile-backed setting, reuse the payload from an existing working save handler and verify against the schema's required (notNull, non-omitted) columns. If toggles keep multiplying, add a dedicated strict PATCH endpoint for settings instead.
