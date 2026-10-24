// Report-first outreach autosend — the logic behind
// app/api/cron/outreach-autosend (daily) and the worker's run-autosend /
// send-test actions. See the cron route for the authorisation history.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prospects, weeklyReports, automationLogs } from "@/lib/db/schema.pg";
import { sendOutreachEmail } from "@/lib/email/send";
import { buildOutreachEmailHtml, buildOutreachEmailText } from "@/lib/email/templates/outreachEmail";
import {
  buildReportFirstSubject,
  buildReportFirstBody,
  buildReportFollowupSubject,
  buildReportFollowupBody,
  type ReportFirstEmailInput,
} from "@/lib/email/templates/reportFirstEmail";
import { getReadyProspects, getFollowupDueProspects, countSendsLast24h, prospectReportUrl } from "@/lib/outreach/prospectReport";

// Hard ceiling of 15/day for report-first sends regardless of the shared
// OUTREACH_DAILY_SEND_CAP (which is set higher for the manual queue): the
// 24 Oct plan is 40 businesses over ~3 weekdays, not a blast.
export const DAILY_CAP = Math.min(Number(process.env.OUTREACH_DAILY_SEND_CAP) || 15, 15);
export const FOLLOWUP_AFTER_DAYS = Number(process.env.OUTREACH_FOLLOWUP_AFTER_DAYS) || 4;
export const SENDER_NAME = process.env.OUTREACH_SENDER_NAME || "Murat Emre Yesilsirt";

export async function topThemes(businessId: string | null) {
  if (!businessId) return { pos: null, neg: null };
  const [r] = await db
    .select({ pos: weeklyReports.topPositiveThemesJson, neg: weeklyReports.topNegativeThemesJson })
    .from(weeklyReports)
    .where(eq(weeklyReports.businessId, businessId))
    .limit(1);
  const first = (json: string | undefined) => {
    try {
      const arr = JSON.parse(json ?? "[]");
      const t = arr[0];
      if (!t) return null;
      return typeof t === "string" ? t : t.theme ?? t.name ?? t.title ?? null;
    } catch {
      return null;
    }
  };
  return { pos: first(r?.pos), neg: first(r?.neg) };
}

export type AutosendResult = { id: string; kind: "first" | "followup"; to: string; sent: boolean; demo: boolean; error?: string };

/** Renders the first email for a prospect (used by send-test and the real send). */
export function renderFirstEmail(p: typeof prospects.$inferSelect) {
  const input: ReportFirstEmailInput = {
    businessName: p.businessName,
    firstName: p.contactFirstName,
    reviewCount: p.reportReviewCount ?? 0,
    reportUrl: prospectReportUrl(p.reportToken ?? ""),
    senderName: SENDER_NAME,
  };
  return { subject: buildReportFirstSubject(input), body: buildReportFirstBody(input) };
}

export async function runAutosend(opts: { dryRun?: boolean } = {}) {
  const alreadySent = await countSendsLast24h();
  let budget = Math.max(0, DAILY_CAP - alreadySent);
  const results: AutosendResult[] = [];

  const followups = budget > 0 ? await getFollowupDueProspects(FOLLOWUP_AFTER_DAYS, budget) : [];
  for (const p of followups) {
    if (budget <= 0) break;
    if (!p.contactEmail || !p.reportToken) continue;
    const { pos, neg } = await topThemes(p.reportBusinessId);
    const input: ReportFirstEmailInput = {
      businessName: p.businessName,
      firstName: p.contactFirstName,
      reviewCount: p.reportReviewCount ?? 0,
      reportUrl: prospectReportUrl(p.reportToken),
      senderName: SENDER_NAME,
      topPositiveTheme: pos,
      topNegativeTheme: neg,
    };
    const subject = buildReportFollowupSubject(input);
    const body = buildReportFollowupBody(input);
    if (opts.dryRun) {
      results.push({ id: p.id, kind: "followup", to: p.contactEmail, sent: false, demo: true });
      continue;
    }
    try {
      const r = await sendOutreachEmail({ recipientEmail: p.contactEmail, subject, html: buildOutreachEmailHtml(body), text: buildOutreachEmailText(body) });
      await db
        .update(prospects)
        .set({ followupSentAt: new Date().toISOString(), status: r.sent ? "followed_up" : p.status })
        .where(eq(prospects.id, p.id));
      results.push({ id: p.id, kind: "followup", to: p.contactEmail, sent: r.sent, demo: r.demo });
      if (r.sent) budget--;
    } catch (e) {
      results.push({ id: p.id, kind: "followup", to: p.contactEmail, sent: false, demo: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const ready = budget > 0 ? await getReadyProspects(budget) : [];
  for (const p of ready) {
    if (budget <= 0) break;
    if (!p.contactEmail || !p.reportToken) continue;
    if (p.emailValidationStatus === "invalid") {
      if (!opts.dryRun) await db.update(prospects).set({ status: "skipped", skipReason: "invalid email at autosend" }).where(eq(prospects.id, p.id));
      continue;
    }
    const { subject, body } = renderFirstEmail(p);
    if (opts.dryRun) {
      results.push({ id: p.id, kind: "first", to: p.contactEmail, sent: false, demo: true });
      continue;
    }
    try {
      const r = await sendOutreachEmail({ recipientEmail: p.contactEmail, subject, html: buildOutreachEmailHtml(body), text: buildOutreachEmailText(body) });
      await db
        .update(prospects)
        .set({ emailSubject: subject, emailBody: body, status: r.sent ? "sent" : "demo_sent", sentAt: new Date().toISOString() })
        .where(eq(prospects.id, p.id));
      results.push({ id: p.id, kind: "first", to: p.contactEmail, sent: r.sent, demo: r.demo });
      if (r.sent) budget--;
    } catch (e) {
      results.push({ id: p.id, kind: "first", to: p.contactEmail, sent: false, demo: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const sentCount = results.filter((r) => r.sent).length;
  if (!opts.dryRun) {
    await db.insert(automationLogs).values({
      jobName: "outreach-autosend",
      status: results.some((r) => r.error) ? "failed" : "success",
      detail: `cap ${DAILY_CAP}, already ${alreadySent}, sent ${sentCount} (${results.filter((r) => r.kind === "followup" && r.sent).length} follow-ups), errors ${results.filter((r) => r.error).length}`,
      finishedAt: new Date().toISOString(),
    });
  }
  return { cap: DAILY_CAP, alreadySent, sent: sentCount, dryRun: !!opts.dryRun, results };
}
