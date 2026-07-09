import { log } from "./index";
import { getOwnerNotificationEmail } from "./ownerUsers";
import { getResendApiKey, formatEmailTimeDual } from "./email";
import { storage } from "./storage";
import type { Feedback } from "@shared/schema";

// ---------------------------------------------------------------------------
// Feedback email notifications (Resend)
// ---------------------------------------------------------------------------
// Sends the owner an email whenever new in-app feedback is submitted. This is
// strictly best-effort: any failure (missing connection, network error, etc.)
// is logged and swallowed so feedback is still saved and the API still returns
// success. Credentials come from the Replit Resend connector at runtime — never
// cache the client because the access token expires.

async function formatSubmittedTime(
  createdAt: Feedback["createdAt"],
  userId: string,
): Promise<string> {
  if (!createdAt) return "just now";
  let submitterTimezone: string | null = null;
  try {
    submitterTimezone = (await storage.getProfile(userId))?.timezone ?? null;
  } catch {
    // best-effort — fall back to app timezone only
  }
  return formatEmailTimeDual(new Date(createdAt), submitterTimezone);
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

    const escapeHtml = (v: string) =>
      v
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const safeMessage = escapeHtml(item.message);
    const safeWho = escapeHtml(who);
    const safeEmail = submitter.email ? escapeHtml(submitter.email) : "";
    const submittedAt = await formatSubmittedTime(item.createdAt, item.userId);

    await resend.emails.send({
      from: `Crush Feedback <${fromEmail}>`,
      to,
      subject: `New Crush feedback: ${label}`,
      text:
        `New feedback submitted on Crush.\n\n` +
        `Category: ${label}\n` +
        `From: ${who}${submitter.email ? ` (${submitter.email})` : ""}\n` +
        `Submitted: ${submittedAt}\n\n` +
        `Message:\n${item.message}\n`,
      html:
        `<h2>New feedback submitted on Crush</h2>` +
        `<p><strong>Category:</strong> ${label}</p>` +
        `<p><strong>From:</strong> ${safeWho}${safeEmail ? ` (${safeEmail})` : ""}</p>` +
        `<p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>` +
        `<p><strong>Message:</strong></p>` +
        `<p style="white-space:pre-wrap">${safeMessage}</p>`,
    });

    log(`Feedback notification email sent to ${to}.`, "feedback");
  } catch (error: any) {
    // Fail safe: feedback is already saved; never let email failures bubble up.
    log(`Failed to send feedback notification email: ${error?.message}`, "feedback");
  }
}
