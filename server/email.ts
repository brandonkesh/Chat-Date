import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { getOwnerNotificationEmail } from "./ownerUsers";

// ---------------------------------------------------------------------------
// Transactional email (Resend)
// ---------------------------------------------------------------------------
// Centralized, best-effort email sending for the app: welcome emails, new-match
// and new-message notifications, and app-lock recovery codes. Every send is
// best-effort — any failure (missing key, network error, unverified domain) is
// logged and swallowed so the user-facing request still succeeds.
//
// IMPORTANT (domain verification): until a sending domain is verified in the
// Resend dashboard, Resend's shared "onboarding@resend.dev" sender will only
// deliver to the Resend account owner's own email. To email all users, verify a
// domain in Resend and set EMAIL_FROM to an address on that domain.

/** Timezone used for all human-readable times in emails (owner is Pacific). */
export const EMAIL_TIMEZONE =
  process.env.EMAIL_TIMEZONE || "America/Los_Angeles";

/** Format a date/time for display in emails, in the app's timezone. */
export function formatEmailTime(
  date: Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleString("en-US", {
    timeZone: EMAIL_TIMEZONE,
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...options,
  });
}

let connectionSettings: any;

/**
 * Resolve a Resend API key. Prefers an explicit RESEND_API_KEY secret, then
 * falls back to the Replit Resend connector proxy. Never throws.
 */
export async function getResendApiKey(): Promise<string | null> {
  if (process.env.RESEND_API_KEY) {
    return process.env.RESEND_API_KEY;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    return null;
  }

  try {
    const response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
      {
        headers: {
          Accept: "application/json",
          X_REPLIT_TOKEN: xReplitToken,
        },
      },
    );
    const data = await response.json();
    connectionSettings = data.items?.[0];
    return connectionSettings?.settings?.api_key ?? null;
  } catch {
    return null;
  }
}

function fromAddress(): string {
  const email =
    process.env.EMAIL_FROM ||
    process.env.FEEDBACK_FROM_EMAIL ||
    "onboarding@resend.dev";
  return `Crush <${email}>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Low-level best-effort send. Returns true if the email was handed off to
 * Resend, false otherwise. Never throws.
 */
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Static, non-PII label used only for logging (subjects can contain names).
  logLabel: string;
}): Promise<boolean> {
  try {
    const apiKey = await getResendApiKey();
    if (!apiKey) {
      console.log(`[email] Resend not configured — skipping ${opts.logLabel}.`);
      return false;
    }
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return true;
  } catch (error: any) {
    // Never log subject/body — they can contain user PII. Log only the label.
    console.error(`[email] Failed to send ${opts.logLabel}:`, error?.message);
    return false;
  }
}

function shell(title: string, bodyHtml: string): string {
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2933">` +
    `<div style="font-size:22px;font-weight:bold;color:#2563eb">🔥 Crush</div>` +
    `<h2 style="margin:16px 0 8px">${title}</h2>` +
    bodyHtml +
    `<p style="margin-top:24px;font-size:12px;color:#9aa5b1">You're receiving this because you have a Crush account.</p>` +
    `</div>`
  );
}

/** Look up a user's email + best display name. Returns null if no email. */
async function getRecipientContact(
  userId: string,
): Promise<{ email: string; name: string } | null> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.email) return null;
    let name = user.firstName || "";
    try {
      const profile = await storage.getProfile(userId);
      if (profile?.displayName) name = profile.displayName;
    } catch {
      // ignore — fall back to firstName
    }
    // Strip CR/LF so a name can't be used to inject email headers (subject etc).
    name = name.replace(/[\r\n]+/g, " ").trim();
    return { email: user.email, name: name || "there" };
  } catch {
    return null;
  }
}

/** Welcome email after a new user finishes creating their profile. */
export async function sendWelcomeEmail(userId: string): Promise<void> {
  const contact = await getRecipientContact(userId);
  if (!contact) return;
  const name = escapeHtml(contact.name);
  await sendEmail({
    logLabel: "welcome",
    to: contact.email,
    subject: "Welcome to Crush! 🔥",
    text:
      `Hi ${contact.name},\n\n` +
      `Welcome to Crush! Your profile is all set. Start swiping to find people near you and strike up a conversation.\n\n` +
      `Have fun,\nThe Crush Team`,
    html: shell(
      `Welcome, ${name}! 🔥`,
      `<p>Your profile is all set. Start swiping to find people near you and strike up a conversation.</p>` +
        `<p>Have fun,<br/>The Crush Team</p>`,
    ),
  });
}

/** Alert the app owner whenever a new member finishes creating their profile. */
export async function sendNewMemberAlertToOwner(userId: string): Promise<void> {
  const to = getOwnerNotificationEmail();
  if (!to) {
    console.log("[email] New member joined but no owner email configured (set OWNER_EMAILS).");
    return;
  }
  const contact = await getRecipientContact(userId);
  const name = contact?.name ?? "Someone";
  const memberEmail = contact?.email ?? "unknown";
  await sendEmail({
    logLabel: "new-member-alert",
    to,
    subject: `New Crush member: ${name}`,
    text:
      `Good news — a new member just joined Crush.\n\n` +
      `Name: ${name}\n` +
      `Email: ${memberEmail}\n` +
      `Joined: ${formatEmailTime(new Date())}\n`,
    html: shell(
      `A new member just joined! 🎉`,
      `<p><strong>Name:</strong> ${escapeHtml(name)}</p>` +
        `<p><strong>Email:</strong> ${escapeHtml(memberEmail)}</p>` +
        `<p><strong>Joined:</strong> ${escapeHtml(formatEmailTime(new Date()))}</p>`,
    ),
  });
}

/** Notify both users when they match with each other. */
export async function sendMatchEmail(
  userIdA: string,
  userIdB: string,
): Promise<void> {
  const [a, b] = await Promise.all([
    getRecipientContact(userIdA),
    getRecipientContact(userIdB),
  ]);
  const tasks: Promise<boolean>[] = [];
  if (a && b) {
    tasks.push(
      sendEmail({
        logLabel: "match",
        to: a.email,
        subject: `It's a match on Crush! 💘`,
        text:
          `Hi ${a.name},\n\n` +
          `You and ${b.name} liked each other on Crush. Open the app to say hello!\n\n` +
          `The Crush Team`,
        html: shell(
          `It's a match! 💘`,
          `<p>You and <strong>${escapeHtml(b.name)}</strong> liked each other. Open Crush to say hello!</p>`,
        ),
      }),
    );
    tasks.push(
      sendEmail({
        logLabel: "match",
        to: b.email,
        subject: `It's a match on Crush! 💘`,
        text:
          `Hi ${b.name},\n\n` +
          `You and ${a.name} liked each other on Crush. Open the app to say hello!\n\n` +
          `The Crush Team`,
        html: shell(
          `It's a match! 💘`,
          `<p>You and <strong>${escapeHtml(a.name)}</strong> liked each other. Open Crush to say hello!</p>`,
        ),
      }),
    );
  }
  await Promise.all(tasks);
}

// In-memory throttle so a burst of messages doesn't trigger a flood of emails.
// Keyed by `${recipientId}:${matchId}`; resets on restart, which is acceptable.
const MESSAGE_EMAIL_COOLDOWN_MS = 30 * 60 * 1000;
const lastMessageEmailAt = new Map<string, number>();

/**
 * Notify the recipient of a new message, at most once per conversation per
 * cooldown window.
 */
export async function sendNewMessageEmail(
  recipientId: string,
  senderId: string,
  matchId: number,
): Promise<void> {
  const key = `${recipientId}:${matchId}`;
  const now = Date.now();
  const last = lastMessageEmailAt.get(key) ?? 0;
  if (now - last < MESSAGE_EMAIL_COOLDOWN_MS) return;
  lastMessageEmailAt.set(key, now);

  const [recipient, sender] = await Promise.all([
    getRecipientContact(recipientId),
    getRecipientContact(senderId),
  ]);
  if (!recipient || !sender) return;

  await sendEmail({
    logLabel: "new-message",
    to: recipient.email,
    subject: `New message from ${sender.name} on Crush`,
    text:
      `Hi ${recipient.name},\n\n` +
      `${sender.name} sent you a new message on Crush. Open the app to read and reply.\n\n` +
      `The Crush Team`,
    html: shell(
      `You have a new message 💬`,
      `<p><strong>${escapeHtml(sender.name)}</strong> sent you a new message on Crush. Open the app to read and reply.</p>`,
    ),
  });
}

/** Email the user their app-lock recovery (backup) codes when they set a lock. */
export async function sendAppLockBackupCodesEmail(
  userId: string,
  codes: string[],
): Promise<void> {
  const contact = await getRecipientContact(userId);
  if (!contact) return;
  const codesText = codes.join("\n");
  const codesHtml = codes
    .map(
      (c) =>
        `<li style="font-family:monospace;font-size:16px;letter-spacing:1px">${escapeHtml(c)}</li>`,
    )
    .join("");
  await sendEmail({
    logLabel: "app-lock-codes",
    to: contact.email,
    subject: "Your Crush app-lock recovery codes",
    text:
      `Hi ${contact.name},\n\n` +
      `You just set an app-lock password on Crush. Keep these backup codes somewhere safe — ` +
      `each one can be used once to unlock the app if you forget your password:\n\n` +
      `${codesText}\n\n` +
      `If you did not set this, please change your app-lock password right away.\n\n` +
      `The Crush Team`,
    html: shell(
      `Your app-lock recovery codes`,
      `<p>You just set an app-lock password on Crush. Keep these backup codes somewhere safe — each one can be used once to unlock the app if you forget your password:</p>` +
        `<ul>${codesHtml}</ul>` +
        `<p style="color:#9aa5b1;font-size:13px">If you did not set this, please change your app-lock password right away.</p>`,
    ),
  });
}

/** Security alert when the app-lock password is changed. */
export async function sendAppLockChangedEmail(userId: string): Promise<void> {
  const contact = await getRecipientContact(userId);
  if (!contact) return;
  await sendEmail({
    logLabel: "app-lock-changed",
    to: contact.email,
    subject: "Your Crush app-lock password was changed",
    text:
      `Hi ${contact.name},\n\n` +
      `This is a confirmation that your app-lock password on Crush was just changed. ` +
      `If this was you, no action is needed. If it wasn't, use one of your backup recovery ` +
      `codes to unlock the app and reset it.\n\n` +
      `The Crush Team`,
    html: shell(
      `Your app-lock password was changed`,
      `<p>This is a confirmation that your app-lock password on Crush was just changed.</p>` +
        `<p>If this was you, no action is needed. If it wasn't, use one of your backup recovery codes to unlock the app and reset it.</p>`,
    ),
  });
}

/**
 * Date check-in safety email: lets a trusted friend know about an upcoming
 * date. Best-effort — errors are logged and swallowed by sendEmail.
 */
export async function sendDateCheckinEmail(
  userId: string,
  checkin: {
    friendEmail: string;
    dateName: string;
    location: string;
    dateTime: Date;
    notes?: string | null;
  },
): Promise<void> {
  const contact = await getRecipientContact(userId);
  const senderName = contact?.name || "A Crush member";
  const when = formatEmailTime(new Date(checkin.dateTime), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: undefined,
  });
  const safeName = escapeHtml(senderName);
  const safeDateName = escapeHtml(checkin.dateName);
  const safeLocation = escapeHtml(checkin.location);
  const safeWhen = escapeHtml(when);
  const safeNotes = checkin.notes ? escapeHtml(checkin.notes) : "";
  await sendEmail({
    logLabel: "date-checkin",
    to: checkin.friendEmail,
    subject: `${senderName} shared their date plans with you 🛡️`,
    text:
      `Hi,\n\n` +
      `${senderName} is using Crush's date check-in safety feature and chose you as their trusted contact.\n\n` +
      `Who: ${checkin.dateName}\n` +
      `Where: ${checkin.location}\n` +
      `When: ${when}\n` +
      (checkin.notes ? `Notes: ${checkin.notes}\n` : "") +
      `\nIf you don't hear from them after the date, consider checking in on them.\n\n` +
      `The Crush Team`,
    html: shell(
      `${safeName} shared their date plans 🛡️`,
      `<p><strong>${safeName}</strong> is using Crush's date check-in safety feature and chose you as their trusted contact.</p>` +
        `<p><strong>Who:</strong> ${safeDateName}<br/>` +
        `<strong>Where:</strong> ${safeLocation}<br/>` +
        `<strong>When:</strong> ${safeWhen}</p>` +
        (safeNotes ? `<p><strong>Notes:</strong> ${safeNotes}</p>` : "") +
        `<p>If you don't hear from them after the date, consider checking in on them.</p>`,
    ),
  });
}

/**
 * Two-factor login code email. Returns true if Resend accepted it. Used for
 * both enabling email 2FA and the login challenge.
 */
export async function sendLoginCodeEmail(
  userId: string,
  code: string,
): Promise<boolean> {
  const contact = await getRecipientContact(userId);
  if (!contact) return false;
  const safeCode = escapeHtml(code);
  return sendEmail({
    logLabel: "login-2fa-code",
    to: contact.email,
    subject: "Your Crush verification code",
    text:
      `Hi ${contact.name},\n\n` +
      `Your Crush verification code is: ${code}\n\n` +
      `It expires in 10 minutes. If you didn't request this, you can ignore this email.\n\n` +
      `The Crush Team`,
    html: shell(
      `Your verification code`,
      `<p>Use this code to finish signing in to Crush:</p>` +
        `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#2563eb;margin:16px 0">${safeCode}</p>` +
        `<p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    ),
  });
}
