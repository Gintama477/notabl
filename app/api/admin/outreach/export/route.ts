import { NextRequest, NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { getProspectsForExport } from "@/lib/db/queries";

// Admin-only CSV export of one campaign's prospects.
//
// Invalid rows are excluded by DEFAULT, not as an option: a list that gets
// handed to someone should never contain addresses our own validator
// rejected — that's the difference between a lead list and a bounce
// liability. ?include=all overrides it for auditing what was filtered out.
export const maxDuration = 30;

/**
 * RFC 4180 escaping. Every field is quoted and internal quotes doubled,
 * which is what keeps a review-scraped business name containing a comma,
 * a quote or a newline from silently shifting every later column.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const campaign = req.nextUrl.searchParams.get("campaign");
  if (!campaign) {
    return NextResponse.json({ error: "Pass ?campaign=... to choose which list to export." }, { status: 400 });
  }
  const includeAll = req.nextUrl.searchParams.get("include") === "all";

  const rows = await getProspectsForExport(campaign, includeAll);

  const header = [
    "Business Name", "Contact Email", "Validation Status", "Validation Reason",
    "Phone", "Website", "City", "State", "Google Rating", "Review Count",
  ];
  const body = rows.map((r) =>
    [
      r.businessName,
      r.contactEmail,
      r.emailValidationStatus ?? "not checked",
      r.emailValidationReason,
      r.phone,
      r.website,
      r.city,
      r.state,
      r.googleRating,
      r.googleReviewCount,
    ]
      .map(csvCell)
      .join(",")
  );

  // \r\n and a UTF-8 BOM: without the BOM Excel mangles non-ASCII business
  // names, which are common in the practice names this scrapes.
  const csv = "﻿" + [header.map(csvCell).join(","), ...body].join("\r\n") + "\r\n";
  const safeName = campaign.replace(/[^a-zA-Z0-9._-]/g, "-");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}-prospects.csv"`,
      // Never let a browser or proxy cache a list that changes as rows are
      // verified and sent.
      "Cache-Control": "no-store",
    },
  });
}
