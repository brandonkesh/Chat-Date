---
name: Deployment type mismatch (Autoscale vs Reserved VM)
description: Why this app's Autoscale deployment causes intermittent real-time outages, and the recommended fix.
---

# Deployment: Autoscale vs Reserved VM

The production deployment (crushmatchup.com) runs as **Autoscale**, but the app
is stateful and real-time: WebSocket signaling (`/ws`, `/ws/notifications`) and
in-memory maps (notifyTokens, videoCallTokens, notifyConnections, callRooms,
call-signaling state).

**Why this causes outages:**
- Autoscale scales to zero when idle. Each cold start has a ~2s window where the
  health check on `/` returns 500 before Express is listening (visible in deploy
  logs as `healthcheck / returned status 500` then `serving on port 5000`). An
  uptime monitor pinging during a cold start records it as downtime.
- Autoscale can run multiple instances. WebSocket connections and the in-memory
  maps are per-instance, so two users in a call can land on different instances
  that can't reach each other — intermittent "degraded" real-time behavior.

**Recommended fix:** switch deployConfig deploymentTarget to `vm` (Reserved VM) —
always-on, no cold starts, stable sockets/in-memory state. Tradeoff: fixed
monthly cost vs Autoscale pay-per-use.

**Status:** owner was offered the switch (Jul 2026) and declined / is
cost-sensitive (wants to minimize charges). Do NOT switch without explicit
consent — it changes their billing. Startup was already optimized (PayPal
seeding moved to after listen), so that part is not the bottleneck.
