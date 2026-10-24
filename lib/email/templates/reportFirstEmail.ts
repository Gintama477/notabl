// Report-first outreach emails (Tier 2 — see
// marketing/personalized-outreach-system.md). Both templates are only ever
// rendered for a prospect whose report was actually built from their own
// public Google reviews (prospects.status = "ready"/"sent", report_token
// set), so "I ran it on yours" is literally true. Plain text; the shared
// buildOutreachEmailHtml/Text wrappers in outreachEmail.ts add the chrome.

export type ReportFirstEmailInput = {
  businessName: string;
  firstName?: string | null;
  reviewCount: number;
  reportUrl: string;
  senderName: string;
  /** From the report row — used in the follow-up so it says something specific. */
  topPositiveTheme?: string | null;
  topNegativeTheme?: string | null;
};

function greeting(firstName?: string | null) {
  return firstName ? `Hi ${firstName},` : "Hi,";
}

export function buildReportFirstSubject(i: ReportFirstEmailInput): string {
  return `What your last ${i.reviewCount} Google reviews say about ${i.businessName}`;
}

export function buildReportFirstBody(i: ReportFirstEmailInput): string {
  return [
    greeting(i.firstName),
    "",
    `I'm a business & technology student at Stevens in Hoboken. I built a small tool that reads a business's Google reviews and says, in plain language, what customers keep praising and what keeps coming up as a problem.`,
    "",
    `I ran it on ${i.businessName}'s newest ${i.reviewCount} public Google reviews and put the result on one page:`,
    i.reportUrl,
    "",
    "Nothing to sign up for — the page is private to that link. I'm trying to find out whether this is actually useful to people who run a business, so even a one-line \"useful\" or \"not useful\" would help me a lot.",
    "",
    "If you'd rather I hadn't done this, reply \"remove\" and I'll delete the page the same day.",
    "",
    i.senderName,
    "Stevens Institute of Technology / Notabl",
  ].join("\n");
}

export function buildReportFollowupSubject(i: ReportFirstEmailInput): string {
  return `Re: What your last ${i.reviewCount} Google reviews say about ${i.businessName}`;
}

export function buildReportFollowupBody(i: ReportFirstEmailInput): string {
  const specifics: string[] = [];
  if (i.topPositiveTheme) specifics.push(`what customers praise most: ${i.topPositiveTheme}`);
  if (i.topNegativeTheme) specifics.push(`the complaint that comes up most: ${i.topNegativeTheme}`);
  const middle = specifics.length
    ? [`Two things it found — ${specifics.join("; ")}. The full page:`, i.reportUrl]
    : ["The page is here:", i.reportUrl];
  return [
    greeting(i.firstName),
    "",
    `Quick nudge in case the last one got buried — I ran ${i.businessName}'s newest ${i.reviewCount} Google reviews through the tool I built.`,
    "",
    ...middle,
    "",
    "If it's not useful, a one-word reply saying so is genuinely helpful. If you'd like it gone, reply \"remove\".",
    "",
    i.senderName,
  ].join("\n");
}
