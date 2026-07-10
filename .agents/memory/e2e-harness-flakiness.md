---
name: e2e testing harness flakiness
description: When the Playwright e2e testing subagent fails with infra errors (EADDRINUSE/502/blank) but the app is actually healthy
---

The `runTest` (Playwright) testing subagent hits the app through the **external preview URL**, not localhost. Under concurrent multi-context load (several browser contexts + parallel test plans at once) it can report failures like `EADDRINUSE 0.0.0.0:5000`, HTTP 502, or a blank white page / empty aria tree — even when the app is completely healthy. These are harness/preview-side instability (port-rebind race during an auto-restart window), not bugs in the app.

**Why:** Observed repeatedly — three parallel test plans all failed on infra, yet direct checks proved the app fine.

**How to apply:** Before trusting an e2e "unable/failure" that cites EADDRINUSE/502/blank, verify app health directly: `curl localhost:5000/` (expect 200), a small parallel curl burst (all 200 = no crash), auth-gated endpoints returning 401 not 500, and an `app_preview` screenshot rendering the real UI. If those pass, the app is fine — do NOT keep re-running the identical expensive test; the harness is flaky. Running fewer/serial test plans (one context at a time) reduces the race.
