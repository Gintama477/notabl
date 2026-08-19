// Shared by app/dashboard/page.tsx and components/report/ReportBody.tsx —
// both display a weekly report's analysis period. Under the cumulative
// report model (see lib/analysis/runAnalysis.ts), every report's main
// content reflects the business's full review history to date, recalculated
// fresh each time, with trend comparisons measured against the cumulative
// snapshot as it stood one period ago — never a disconnected weekly slice.
// A plain "{periodStart} - {periodEnd}" range would misleadingly imply a
// narrow window, so every report (first or hundredth) gets the same
// "overall picture" framing instead.
export function formatReportPeriod(
  periodStartISO: string,
  periodEndISO: string,
  formatDate: (iso: string) => string = (iso) => new Date(iso).toLocaleDateString()
): string {
  return `Overall picture as of ${formatDate(periodEndISO)}, compared with ${formatDate(periodStartISO)}`;
}
