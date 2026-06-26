// ---------------------------------------------------------------------------
// SMS sending (Twilio)
// ---------------------------------------------------------------------------
// Best-effort SMS delivery used for two-factor login codes. Uses Twilio's REST
// API directly (no SDK dependency). Every send is best-effort — any failure is
// logged (without the message body, which can contain a one-time code) and
// swallowed so the caller can decide how to surface it.
//
// Configure by setting these secrets (from your Twilio account):
//   TWILIO_ACCOUNT_SID    – starts with "AC..."
//   TWILIO_AUTH_TOKEN     – your Twilio auth token
//   TWILIO_PHONE_NUMBER   – a Twilio number in E.164 form, e.g. +14155551234

export function isSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

/** Basic E.164 phone number check, e.g. +14155551234. */
export function isValidPhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

/**
 * Send an SMS. Returns true if Twilio accepted the message, false otherwise.
 * Never throws.
 */
export async function sendSms(opts: {
  to: string;
  body: string;
  // Static, non-PII label used only for logging (body can contain codes).
  logLabel: string;
}): Promise<boolean> {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) {
      console.log(`[sms] Twilio not configured — skipping ${opts.logLabel}.`);
      return false;
    }
    const params = new URLSearchParams({
      To: opts.to,
      From: from,
      Body: opts.body,
    });
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
    if (!response.ok) {
      // Twilio returns an error code/status; log status only, never the body.
      console.error(`[sms] Failed to send ${opts.logLabel}: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error: any) {
    console.error(`[sms] Failed to send ${opts.logLabel}:`, error?.message);
    return false;
  }
}
