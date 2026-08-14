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
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "reports@notabl.example";

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
      from: fromAddress,
      to: opts.recipientEmail,
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
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "reports@notabl.example";

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
    const result = await resend.emails.send({ from: fromAddress, to: opts.recipientEmail, subject, html, text });
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
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "reports@notabl.example";

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
    const result = await resend.emails.send({ from: fromAddress, to: opts.recipientEmail, subject, html, text });
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
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || "reports@notabl.example";

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
      from: fromAddress,
      to: opts.recipientEmail,
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
