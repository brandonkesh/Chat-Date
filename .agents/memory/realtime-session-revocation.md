---
name: Real-time (WebSocket) session revocation
description: How logout tears down live WS access; the rule any new real-time bearer token must follow.
---

# Real-time session revocation on logout

Logout must revoke real-time access, not just the HTTP session. The mechanism:
`server/realtimeRevocation.ts` is a settable-callback bridge — routes.ts
registers a revoker, the logout handler (replitAuth.ts) calls
`revokeRealtimeForSession(req.sessionID)` inside the `session.destroy` callback
(capture sessionID BEFORE destroy). The revoker deletes matching tokens and
closes matching sockets across `notifyWss.clients` + `wss.clients`.

**Rule:** any new WebSocket bearer token (like videoCallTokens / notifyTokens)
MUST store the issuing `req.sessionID`, and on WS auth that server-trusted
sessionId MUST be stamped onto the socket as `__sessionId` (never from client
input). Otherwise logout cannot revoke it and it lingers until expiry.

**Why:** the bridge avoids a circular import between routes.ts and the auth
module. Revocation is keyed by **sessionId, not userId**, on purpose — logging
out on one device must not drop the same user's other active sessions.

**How to apply:** closing a socket relies on its existing `close` handler to
clean notifyConnections/callRooms and emit `user-left` to the peer, so don't
duplicate that teardown in the revoker — just close the socket.
