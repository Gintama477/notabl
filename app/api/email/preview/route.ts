// Renders the weekly report email as HTML in the browser — useful for
// reviewing the template's appearance without needing RESEND_API_KEY. Not
// linked from the public UI; visit /api/email/preview while signed in (or
// add ?sample=1 to preview the public sample business's email).

import { NextRequest, NextResponse } from "next/server";
import { getSessionAccountId } from "@/lib/auth/session";
import { getBusinessForAccount, getLatestWeeklyReport, getThemeRollupsForRun, getSampleBusiness } from "@/lib/db/queries";
import { buildWeeklyReportEmailHtml } from "@/lib/email/templates/weeklyReportEmail";
import { buildEmailInputFromReport } from "@/lib/email/buildEmailInput";

export async function GET(req: NextRequest) {
  const useSample = req.nextUrl.searchParams.get("sample") === "1";

  const business = useSample ? await getSampleBusiness() : await getBusinessForAccount((await getSessionAccountId()) || "");
  if (!business) {
    return NextResponse.json({ error: "No business found. Try /api/email/preview?sample=1" }, { status: 404 });
  }

  const report = await getLatestWeeklyReport(business.id);
  if (!report) return NextResponse.json({ error: "No weekly report yet for this business" }, { status: 404 });

  const rollups = await getThemeRollupsForRun(report.analysisRunId);
  const input = buildEmailInputFromReport(business.name, `${req.nextUrl.origin}/dashboard`, report, rollups);
  const html = buildWeeklyReportEmailHtml(input);

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
