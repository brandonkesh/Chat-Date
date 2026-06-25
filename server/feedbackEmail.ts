import { log } from "./index";
import { getOwnerNotificationEmail } from "./ownerUsers";
import type { Feedback } from "@shared/schema";

// ---------------------------------------------------------------------------
// Feedback email notifications (Resend)
// ---------------------------------------------------------------------------
// Sends the owner an email whenever new in-app feedback is submitted. This is
// strictly best-effort: any failure (missing connection, network error, etc.)
// is logged and swallowed so feedback is still saved and the API still returns
// success. Credentials come from the Replit Resend connector at runtime — never
// cache the client because the access token expires.

let connectionSettings: any;

async function getResendApiKey(): Promise<string | null> {
  // Prefer an explicitly provided API key secret if present, otherwise fall back
  // to the Replit Resend connector proxy.
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
  const apiKey = connectionSettings?.settings?.api_key;
  return apiKey ?? null;
}

function categoryLabel(category: string): string {
  switch (category) {
    case "bug":
      return "Bug report";
    case "suggestion":
      return "Suggestion";
    default:
      return "Other";
  }
}

/**
 * Best-effort email notification for a new feedback submission. Never throws.
 * @param item       The persisted feedback row.
 * @param submitter  Display info about who submitted it (email / name).
 */
export async function sendFeedbackNotification(
  item: Feedback,
  submitter: { email: string | null; name: string | null },
): Promise<void> {
  try {
    const to = getOwnerNotificationEmail();
    if (!to) {
      log(
        "Feedback received but no owner notification email configured (set FEEDBACK_NOTIFICATION_EMAIL or OWNER_EMAILS).",
        "feedback",
      );
      return;
    }

    const apiKey = await getResendApiKey();
    if (!apiKey) {
      log("Feedback received but Resend is not connected — skipping email.", "feedback");
      return;
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const fromEmail = process.env.FEEDBACK_FROM_EMAIL || "onboarding@resend.dev";
    const who = submitter.name || submitter.email || item.userId;
    const label = categoryLabel(item.category);

    const safeMessage = item.message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    await resend.emails.send({
      from: `Crush Feedback <${fromEmail}>`,
      to,
      subject: `New Crush feedback: ${label}`,
      text:
        `New feedback submitted on Crush.\n\n` +
        `Category: ${label}\n` +
        `From: ${who}${submitter.email ? ` (${submitter.email})` : ""}\n` +
        `Submitted: ${item.createdAt ? new Date(item.createdAt).toLocaleString() : "just now"}\n\n` +
        `Message:\n${item.message}\n`,
      html:
        `<h2>New feedback submitted on Crush</h2>` +
        `<p><strong>Category:</strong> ${label}</p>` +
        `<p><strong>From:</strong> ${who}${submitter.email ? ` (${submitter.email})` : ""}</p>` +
        `<p><strong>Submitted:</strong> ${item.createdAt ? new Date(item.createdAt).toLocaleString() : "just now"}</p>` +
        `<p><strong>Message:</strong></p>` +
        `<p style="white-space:pre-wrap">${safeMessage}</p>`,
    });

    log(`Feedback notification email sent to ${to}.`, "feedback");
  } catch (error: any) {
    // Fail safe: feedback is already saved; never let email failures bubble up.
    log(`Failed to send feedback notification email: ${error?.message}`, "feedback");
  }
}
