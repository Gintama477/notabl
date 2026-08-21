// Replaces the deleted formatPeriodLabel.ts. Under the cumulative report
// model there IS no reporting period — every report covers the business's
// entire review history, recalculated fresh each run. A helper that took a
// start and an end existed only to make that non-existent concept sound
// less confusing, which is the wrong fix: the concept itself is gone.
//
// The only date a customer ever sees about a report is when it was last
// updated. periodStart/periodEnd remain as internal comparison anchors for
// the trend math (see the comment on those columns in lib/db/schema.pg.ts)
// and must never be rendered.
export function formatLastUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
