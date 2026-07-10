---
name: Profile update requires full schema
description: PUT /api/profiles/me validates the complete insert schema, not a partial — every feature toggle must resend all required fields.
---

# Profile update contract

**Rule:** Any client code calling the profile update endpoint must send ALL required profile fields (displayName, age, gender, **interestedIn**) plus the changed fields. There is no partial/PATCH endpoint.

**Why:** The route validates the full insert schema. This bit twice while building feature toggles (voice-first / slow-dating switches and dream-date save): payloads that included displayName/age/gender but omitted `interestedIn` silently 400'd and the settings never persisted.

**How to apply:** When adding any new profile-backed setting or toggle, copy the payload pattern from an existing working save (e.g. the preferences save handler) and confirm `interestedIn` is included — or check the schema's required (notNull, non-omitted) columns. Consider a dedicated partial PATCH endpoint if toggles keep multiplying.
