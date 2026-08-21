// Email sending seam, mirroring the AI provider pattern (lib/ai/provider.ts):
// one function the rest of the app calls, two backends behind it. Without
// RESEND_API_KEY set, sendWeeklyReportEmail() logs the send to
// email_deliveries with status "queued" and prints the rendered email to the
// server console instead of actually sending — so the whole pipeline
// (including the email_deliveries audit trail used by the admin panel) is
// exercised in Phase 1 without an account or spending anything.

import { Resend } from "resend";
import { db } from "@/lib/db/client";
import { emailDeliveries } from "@/lib/db/schema.pg";
import {
  buildWeeklyReportEmailHtml,
  buildWeeklyReportEmailText,
  buildWeeklyReportEmailSubject,
  WeeklyReportEmailInput,
} from "./templates/weeklyReportEmail";
import { buildLoginEmailHtml, buildLoginEmailText, buildLoginEmailSubject } from "./templates/loginEmail";
import { buildWelcomeEmailHtml, buildWelcomeEmailText, buildWelcomeEmailSubject, WelcomeEmailInput } from "./templates/welcomeEmail";
import { buildPilotInviteEmailHtml, buildPilotInviteEmailText, buildPilotInviteEmailSubject, PilotInviteEmailInput } from "./templates/pilotInviteEmail";
import { buildReviewAlertEmailHtml, buildReviewAlertEmailText, buildReviewAlertEmailSubject, ReviewAlertEmailInput } from "./templates/reviewAlertEmail";
import {
  buildMonthlySummaryEmailHtml,
  buildMonthlySummaryEmailText,
  buildMonthlySummaryEmailSubject,
  MonthlySummaryEmailInput,
} from "./templates/monthlySummaryEmail";

export async function sendWeeklyReportEmail(opts: {
  businessId: string;
  weeklyReportId: string;
  recipientEmail: string;
  input: WeeklyReportEmailInput;
}) {
  const subject = buildWeeklyReportEmailSubject(opts.input);
  const html = buildWeeklyReportEmailHtml(opts.input);
  const text = buildWeeklyReportEmailText(opts.input);

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "support@trynotabl.com";
  const fromName = process.env.EMAIL_FROM_NAME || "Notabl";
  const replyToAddress = process.env.REPLY_TO_ADDRESS || fromAddress;

  if (!apiKey) {
    console.log(`[demo email] Would send "${subject}" to ${opts.recipientEmail}`);
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      weeklyReportId: opts.weeklyReportId,
      recipientEmail: opts.recipientEmail,
      emailType: "weekly_report",
      status: "queued",
      errorMessage: "RESEND_API_KEY not configured — logged instead of sent (demo mode).",
    });
    return { sent: false, demo: true };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: opts.recipientEmail,
      replyTo: replyToAddress,
      subject,
      html,
      text,
    });

    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      weeklyReportId: opts.weeklyReportId,
      recipientEmail: opts.recipientEmail,
      emailType: "weekly_report",
      status: "sent",
      resendMessageId: result.data?.id ?? null,
      sentAt: new Date().toISOString(),
    });
    return { sent: true, demo: false };
  } catch (err) {
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      weeklyReportId: opts.weeklyReportId,
      recipientEmail: opts.recipientEmail,
      emailType: "weekly_report",
      status: "failed",
      errorMessage: String(err),
    });
    throw err;
  }
}

/**
 * Sends the one-time welcome email right after signup. Same demo-mode
 * fallback as the others (logs + records an email_deliveries row instead of
 * sending when RESEND_API_KEY isn't set) — failure here should never block
 * signup itself, so callers should treat this as fire-and-forget / wrap in
 * try/catch (see app/api/signup/route.ts).
 */
export async function sendWelcomeEmail(opts: {
  businessId: string;
  recipientEmail: string;
  input: WelcomeEmailInput;
}) {
  const subject = buildWelcomeEmailSubject();
  const html = buildWelcomeEmailHtml(opts.input);
  const text = buildWelcomeEmailText(opts.input);

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "support@trynotabl.com";
  const fromName = process.env.EMAIL_FROM_NAME || "Notabl";
  const replyToAddress = process.env.REPLY_TO_ADDRESS || fromAddress;

  if (!apiKey) {
    console.log(`[demo email] Would send "${subject}" to ${opts.recipientEmail}`);
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "welcome",
      status: "queued",
      errorMessage: "RESEND_API_KEY not configured — logged instead of sent (demo mode).",
    });
    return { sent: false, demo: true };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({ from: `${fromName} <${fromAddress}>`, to: opts.recipientEmail, replyTo: replyToAddress, subject, html, text });
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "welcome",
      status: "sent",
      resendMessageId: result.data?.id ?? null,
      sentAt: new Date().toISOString(),
    });
    return { sent: true, demo: false };
  } catch (err) {
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "welcome",
      status: "failed",
      errorMessage: String(err),
    });
    throw err;
  }
}

/**
 * Sends the admin-triggered pilot invite email. In demo mode, also hands
 * back the raw login URL (same pattern as sendLoginEmail) so the admin can
 * copy/paste it directly to the practice while no email provider is
 * configured, instead of the invite silently going nowhere.
 */
export async function sendPilotInviteEmail(opts: {
  businessId: string;
  recipientEmail: string;
  input: PilotInviteEmailInput;
}): Promise<{ sent: boolean; demo: boolean; demoLoginUrl?: string }> {
  const subject = buildPilotInviteEmailSubject(opts.input);
  const html = buildPilotInviteEmailHtml(opts.input);
  const text = buildPilotInviteEmailText(opts.input);

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "support@trynotabl.com";
  const fromName = process.env.EMAIL_FROM_NAME || "Notabl";
  const replyToAddress = process.env.REPLY_TO_ADDRESS || fromAddress;

  if (!apiKey) {
    console.log(`[demo email] Would send "${subject}" to ${opts.recipientEmail}: ${opts.input.loginUrl}`);
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "pilot_invite",
      status: "queued",
      errorMessage: "RESEND_API_KEY not configured — logged instead of sent (demo mode).",
    });
    return { sent: false, demo: true, demoLoginUrl: opts.input.loginUrl };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({ from: `${fromName} <${fromAddress}>`, to: opts.recipientEmail, replyTo: replyToAddress, subject, html, text });
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "pilot_invite",
      status: "sent",
      resendMessageId: result.data?.id ?? null,
      sentAt: new Date().toISOString(),
    });
    return { sent: true, demo: false };
  } catch (err) {
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "pilot_invite",
      status: "failed",
      errorMessage: String(err),
    });
    throw err;
  }
}

/**
 * Sends a single cold-outreach email to a prospective (not-yet-customer)
 * dental practice. Deliberately separate from the senders above: there's no
 * businesses row for a prospect yet (they haven't signed up), so this
 * doesn't write to email_deliveries (which requires a real business_id FK)
 * — the prospects table itself (status/sentAt, see lib/db/schema.pg.ts and
 * sendProspectEmail in lib/db/queries.ts) is this feature's audit trail
 * instead. Same demo-mode fallback as every sender above: without
 * RESEND_API_KEY, logs to the console and reports back { sent: false, demo:
 * true } instead of failing, so the whole outreach queue is testable with
 * zero real-world risk (and zero real dental practice ever emailed) until
 * Resend is actually configured.
 */
export async function sendOutreachEmail(opts: {
  recipientEmail: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; demo: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  // Per marketing/outreach-materials.md's explicit rule — "send from a real
  // name and a real-looking personal address, not team@ or noreply@" — this
  // is deliberately a separate env var from EMAIL_FROM_ADDRESS (used for
  // the product's transactional emails, where a generic address is fine).
  // Falls back to EMAIL_FROM_ADDRESS if unset so this never crashes, but
  // set OUTREACH_FROM_ADDRESS for real sends — see docs/OUTREACH-AUTOMATION.md.
  const fromAddress = process.env.OUTREACH_FROM_ADDRESS || process.env.EMAIL_FROM_ADDRESS || "support@trynotabl.com";
  // Same "real name, not a generic brand address" rule from
  // marketing/outreach-materials.md applies to the display name, not just
  // the address — deliberately a separate env var from EMAIL_FROM_NAME
  // (used by the other four senders below).
  const fromName = process.env.OUTREACH_SENDER_NAME || "Notabl";
  // Same REPLY_TO_ADDRESS as every other sender below (falls back to
  // EMAIL_FROM_ADDRESS, not OUTREACH_FROM_ADDRESS) — replies from a prospect
  // should land in the same real inbox as replies to product emails, not
  // get split across two addresses.
  const replyToAddress = process.env.REPLY_TO_ADDRESS || process.env.EMAIL_FROM_ADDRESS || "support@trynotabl.com";

  if (!apiKey) {
    console.log(`[demo email] Would send outreach "${opts.subject}" to ${opts.recipientEmail}`);
    return { sent: false, demo: true };
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({ from: `${fromName} <${fromAddress}>`, to: opts.recipientEmail, replyTo: replyToAddress, subject: opts.subject, html: opts.html, text: opts.text });
  return { sent: true, demo: false };
}

/**
 * Sends the magic-link login email. Same demo-mode fallback as
 * sendWeeklyReportEmail (logs + records an email_deliveries row instead of
 * sending when RESEND_API_KEY isn't set), but ALSO returns the raw login URL
 * in demo mode so the login flow stays fully testable — including by you,
 * right now — without a configured email account. In live mode (a real
 * RESEND_API_KEY) the URL is never returned to the caller; it only reaches
 * the user via the email itself.
 */
export async function sendLoginEmail(opts: {
  businessId: string;
  recipientEmail: string;
  loginUrl: string;
  expiresInMinutes: number;
}): Promise<{ sent: boolean; demo: boolean; demoLoginUrl?: string }> {
  const subject = buildLoginEmailSubject();
  const input = { loginUrl: opts.loginUrl, expiresInMinutes: opts.expiresInMinutes };
  const html = buildLoginEmailHtml(input);
  const text = buildLoginEmailText(input);

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "support@trynotabl.com";
  const fromName = process.env.EMAIL_FROM_NAME || "Notabl";
  const replyToAddress = process.env.REPLY_TO_ADDRESS || fromAddress;

  if (!apiKey) {
    console.log(`[demo email] Would send "${subject}" to ${opts.recipientEmail}: ${opts.loginUrl}`);
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "login",
      status: "queued",
      errorMessage: "RESEND_API_KEY not configured — logged instead of sent (demo mode).",
    });
    return { sent: false, demo: true, demoLoginUrl: opts.loginUrl };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: opts.recipientEmail,
      replyTo: replyToAddress,
      subject,
      html,
      text,
    });

    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "login",
      status: "sent",
      resendMessageId: result.data?.id ?? null,
      sentAt: new Date().toISOString(),
    });
    return { sent: true, demo: false };
  } catch (err) {
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "login",
      status: "failed",
      errorMessage: String(err),
    });
    throw err;
  }
}

/**
 * Triggered alert — replaces the old calendar-scheduled weekly report (see
 * lib/alerts/reviewAlerts.ts for what decides whether/when to call this;
 * this function only sends and records, it never decides). Same demo-mode
 * fallback as every sender above.
 */
export async function sendReviewAlertEmail(opts: {
  businessId: string;
  recipientEmail: string;
  input: ReviewAlertEmailInput;
}) {
  const subject = buildReviewAlertEmailSubject(opts.input);
  const html = buildReviewAlertEmailHtml(opts.input);
  const text = buildReviewAlertEmailText(opts.input);

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "support@trynotabl.com";
  const fromName = process.env.EMAIL_FROM_NAME || "Notabl";
  const replyToAddress = process.env.REPLY_TO_ADDRESS || fromAddress;

  if (!apiKey) {
    console.log(`[demo email] Would send "${subject}" to ${opts.recipientEmail}`);
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "review_alert",
      status: "queued",
      errorMessage: "RESEND_API_KEY not configured — logged instead of sent (demo mode).",
    });
    return { sent: false, demo: true };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({ from: `${fromName} <${fromAddress}>`, to: opts.recipientEmail, replyTo: replyToAddress, subject, html, text });
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "review_alert",
      status: "sent",
      resendMessageId: result.data?.id ?? null,
      sentAt: new Date().toISOString(),
    });
    return { sent: true, demo: false };
  } catch (err) {
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "review_alert",
      status: "failed",
      errorMessage: String(err),
    });
    throw err;
  }
}

/**
 * The 30-day-silence fallback (see lib/alerts/reviewAlerts.ts) — recorded
 * as emailType "monthly_summary" so the 30-day check keys off any email to
 * the business, not just alerts specifically. Same demo-mode fallback as
 * every sender above.
 */
export async function sendMonthlySummaryEmail(opts: {
  businessId: string;
  recipientEmail: string;
  input: MonthlySummaryEmailInput;
}) {
  const subject = buildMonthlySummaryEmailSubject(opts.input);
  const html = buildMonthlySummaryEmailHtml(opts.input);
  const text = buildMonthlySummaryEmailText(opts.input);

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "support@trynotabl.com";
  const fromName = process.env.EMAIL_FROM_NAME || "Notabl";
  const replyToAddress = process.env.REPLY_TO_ADDRESS || fromAddress;

  if (!apiKey) {
    console.log(`[demo email] Would send "${subject}" to ${opts.recipientEmail}`);
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "monthly_summary",
      status: "queued",
      errorMessage: "RESEND_API_KEY not configured — logged instead of sent (demo mode).",
    });
    return { sent: false, demo: true };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({ from: `${fromName} <${fromAddress}>`, to: opts.recipientEmail, replyTo: replyToAddress, subject, html, text });
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "monthly_summary",
      status: "sent",
      resendMessageId: result.data?.id ?? null,
      sentAt: new Date().toISOString(),
    });
    return { sent: true, demo: false };
  } catch (err) {
    await db.insert(emailDeliveries).values({
      businessId: opts.businessId,
      recipientEmail: opts.recipientEmail,
      emailType: "monthly_summary",
      status: "failed",
      errorMessage: String(err),
    });
    throw err;
  }
}
