// Shared by app/dashboard/page.tsx and components/report/ReportBody.tsx —
// both display a weekly report's analysis period. Under the cumulative
// report model (see lib/analysis/runAnalysis.ts), every report's main
// content reflects the business's full review history to date, recalculated
// fresh each time, with trend comparisons measured against the cumulative
// snapshot as it stood one period ago — never a disconnected weekly slice.
// A plain "{periodStart} - {periodEnd}" range would misleadingly imply a
// narrow window, so every report (first or hundredth) gets the same
// "overall picture" framing instead.
//
// Above this many days between periodStart and periodEnd, periodStart is no
// longer a meaningful "one period ago" snapshot — it's a leftover from the
// removed fullBackfill era, where a business's very first report set
// periodStart to its OLDEST review date (sometimes 10+ years back). Printing
// that date as a comparison point ("compared with 10/24/2012") reads as a
// bug, not a feature, to a customer. Normal reporting periods (currently 7
// days) are nowhere near this threshold, so this only ever fires for one of
// those leftover reports.
const COMPARISON_STALE_AFTER_DAYS = 60;

export function formatReportPeriod(
  periodStartISO: string,
  periodEndISO: string,
  formatDate: (iso: string) => string = (iso) => new Date(iso).toLocaleDateString()
): string {
  const spanDays = (new Date(periodEndISO).getTime() - new Date(periodStartISO).getTime()) / (1000 * 60 * 60 * 24);

  if (spanDays > COMPARISON_STALE_AFTER_DAYS) {
    return `Overall picture as of ${formatDate(periodEndISO)}, covering your full review history`;
  }
  return `Overall picture as of ${formatDate(periodEndISO)}, compared with ${formatDate(periodStartISO)}`;
}
