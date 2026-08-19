// Shared by app/dashboard/page.tsx and components/report/ReportBody.tsx —
// both display a weekly report's analysis period. A first-report full
// backfill run (see lib/analysis/runAnalysis.ts's fullBackfill option)
// stores a periodStart as far back as this business's imported reviews
// actually go, which could be years — accurate, but formatted as a plain
// start-end range it reads like a typo (e.g. "3/2/2019 - 8/19/2026")
// rather than "this is your full history." Anything spanning more than
// ~30 days is treated as a backfill and labeled accordingly instead.
const BACKFILL_THRESHOLD_DAYS = 30;

export function formatReportPeriod(
  periodStartISO: string,
  periodEndISO: string,
  formatDate: (iso: string) => string = (iso) => new Date(iso).toLocaleDateString()
): string {
  const start = new Date(periodStartISO);
  const end = new Date(periodEndISO);
  const spanDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

  if (spanDays > BACKFILL_THRESHOLD_DAYS) {
    return `Full review history through ${formatDate(periodEndISO)}`;
  }
  return `${formatDate(periodStartISO)} – ${formatDate(periodEndISO)}`;
}
