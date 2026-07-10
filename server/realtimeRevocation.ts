// Bridge that lets the logout handler (in the auth module) tear down real-time
// access that was established under a now-destroyed HTTP session.
//
// The WebSocket state (notification/call sockets and their bearer tokens) lives
// inside registerRoutes() in routes.ts, but logout runs in the auth module. To
// avoid a circular import between those two files, routes.ts registers a single
// revoker callback here at startup and the logout handler invokes it by session
// id. Revocation is scoped to the session that logged out so a user's other
// active devices/sessions are left untouched.

type SessionRevoker = (sessionId: string) => void;

let revoker: SessionRevoker | null = null;

export function setRealtimeSessionRevoker(fn: SessionRevoker): void {
  revoker = fn;
}

export function revokeRealtimeForSession(sessionId: string | undefined | null): void {
  if (!sessionId || !revoker) return;
  try {
    revoker(sessionId);
  } catch {
    // Revocation is best-effort; never let it break the logout response.
  }
}
