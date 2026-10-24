import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prospects, weeklyReports, automationLogs } from "@/lib/db/schema.pg";
import { denyUnauthorizedCron } from "@/lib/auth/cronAuth";
import { sendOutreachEmail } from "@/lib/email/send";
import { buildOutreachEmailHtml, buildOutreachEmailText } from "@/lib/email/templates/outreachEmail";
import {
  buildReportFirstSubject,
  buildReportFirstBody,
  buildReportFollowupSubject,
  buildReportFollowupBody,
  type ReportFirstEmailInput,
} from "@/lib/email/templates/reportFirstEmail";
import {
  getReadyProspects,
  getFollowupDueProspects,
  countSendsLast24h,
  prospectReportUrl,
} from "@/lib/outreach/prospectReport";

// Report-first outreach autosend. Explicitly authorised by the business
// owner on 24 Oct 2026 ("autosend"), superseding the one-click-per-email
// rule in docs/OUTREACH-AUTOMATION.md for THIS flow only — the old Tier-1
// queue keeps its review step. Only prospects whose report was actually
// built (status "ready", report_token set) are ever emailed here.
//
// Runs once a day (vercel.json). Each run: follow-ups first (older
// commitments), then first emails, under one global cap shared with the
// manual queue. A recorded reply_status stops follow-ups for that prospect.
export const maxDuration = 60;

const DAILY_CAP = Number(process.env.OUTREACH_DAILY_SEND_CAP) || 15;
const FOLLOWUP_AFTER_DAYS = Number(process.env.OUTREACH_FOLLOWUP_AFTER_DAYS) || 4;
const SENDER_NAME = process.env.OUTREACH_SENDER_NAME || "Murat Emre Yesilsirt";

async function topThemes(businessId: string | null) {
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

export async function GET(req: NextRequest) {
  const denied = denyUnauthorizedCron(req, "outreach-autosend");
  if (denied) return denied;

  const alreadySent = await countSendsLast24h();
  let budget = Math.max(0, DAILY_CAP - alreadySent);
  const results: Array<{ id: string; kind: "first" | "followup"; to: string; sent: boolean; demo: boolean; error?: string }> = [];

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
      await db.update(prospects).set({ status: "skipped", skipReason: "invalid email at autosend" }).where(eq(prospects.id, p.id));
      continue;
    }
    const input: ReportFirstEmailInput = {
      businessName: p.businessName,
      firstName: p.contactFirstName,
      reviewCount: p.reportReviewCount ?? 0,
      reportUrl: prospectReportUrl(p.reportToken),
      senderName: SENDER_NAME,
    };
    const subject = buildReportFirstSubject(input);
    const body = buildReportFirstBody(input);
    try {
      const r = await sendOutreachEmail({ recipientEmail: p.contactEmail, subject, html: buildOutreachEmailHtml(body), text: buildOutreachEmailText(body) });
      await db
        .update(prospects)
        .set({
          emailSubject: subject,
          emailBody: body,
          status: r.sent ? "sent" : "demo_sent",
          sentAt: new Date().toISOString(),
        })
        .where(eq(prospects.id, p.id));
      results.push({ id: p.id, kind: "first", to: p.contactEmail, sent: r.sent, demo: r.demo });
      if (r.sent) budget--;
    } catch (e) {
      results.push({ id: p.id, kind: "first", to: p.contactEmail, sent: false, demo: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const sentCount = results.filter((r) => r.sent).length;
  await db.insert(automationLogs).values({
    jobName: "outreach-autosend",
    status: results.some((r) => r.error) ? "failed" : "success",
    detail: `cap ${DAILY_CAP}, already ${alreadySent}, sent ${sentCount} (${results.filter((r) => r.kind === "followup" && r.sent).length} follow-ups), errors ${results.filter((r) => r.error).length}`,
    finishedAt: new Date().toISOString(),
  });

  return NextResponse.json({ cap: DAILY_CAP, alreadySent, sent: sentCount, results });
}
