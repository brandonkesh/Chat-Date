const SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const LIVE_BASE = 'https://api-m.paypal.com';

let detectedEnv: 'sandbox' | 'live' | null = null;

function getExplicitMode(): 'sandbox' | 'live' | null {
  if (process.env.PAYPAL_LIVE_MODE === 'true') return 'live';
  if (process.env.PAYPAL_LIVE_MODE === 'false') return 'sandbox';
  return null;
}

export function getPaypalBase(): string {
  const explicit = getExplicitMode();
  if (explicit) return explicit === 'live' ? LIVE_BASE : SANDBOX_BASE;
  return detectedEnv === 'live' ? LIVE_BASE : SANDBOX_BASE;
}

export function getPaypalEnvironment(): 'sandbox' | 'live' {
  const explicit = getExplicitMode();
  if (explicit) return explicit;
  return detectedEnv || 'sandbox';
}

export function getPaypalClientId(): string {
  const id = process.env.PAYPAL_CLIENT_ID;
  if (!id) throw new Error('PAYPAL_CLIENT_ID is not set');
  return id;
}

function getPaypalClientSecret(): string {
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!secret) throw new Error('PAYPAL_CLIENT_SECRET is not set');
  return secret;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function tryAuth(base: string): Promise<{ token: string; expiresIn: number } | { error: string }> {
  const clientId = getPaypalClientId();
  const secret = getPaypalClientSecret();
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    return { error: `${res.status} ${text}` };
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { token: data.access_token, expiresIn: data.expires_in };
}

export async function getPaypalAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const explicit = getExplicitMode();
  const tryOrder: Array<'sandbox' | 'live'> = explicit
    ? [explicit]
    : detectedEnv
      ? [detectedEnv]
      : ['sandbox', 'live'];

  let lastError = '';
  for (const env of tryOrder) {
    const base = env === 'live' ? LIVE_BASE : SANDBOX_BASE;
    const result = await tryAuth(base);
    if ('token' in result) {
      detectedEnv = env;
      cachedToken = {
        token: result.token,
        expiresAt: Date.now() + result.expiresIn * 1000,
      };
      return result.token;
    }
    lastError = result.error;
  }
  throw new Error(`PayPal auth failed in all environments: ${lastError}`);
}

export async function paypalFetch(
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const token = await getPaypalAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${getPaypalBase()}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(
      `PayPal ${init.method || 'GET'} ${path} failed: ${res.status} ${text}`,
    );
  }

  return body;
}
