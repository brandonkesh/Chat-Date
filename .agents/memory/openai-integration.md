---
name: OpenAI via Replit integration
description: This app's OpenAI calls must use the Replit AI integration env vars, not a raw OPENAI_API_KEY.
---

All OpenAI clients in this repo must be constructed with:
`apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY` and `baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL`.

**Why:** the project uses the `javascript_openai_ai_integrations` Replit integration; there is no plain `OPENAI_API_KEY` secret set, so any client built with `process.env.OPENAI_API_KEY` silently fails (auth error) in both dev and prod. The AI Photo Match route had this bug.

**How to apply:** when adding/editing any `new OpenAI({...})`, copy the integration env vars used elsewhere in `server/routes.ts`; never reintroduce `OPENAI_API_KEY`.
