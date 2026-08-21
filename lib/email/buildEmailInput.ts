import { THEME_LABELS, ThemeCategory } from "@/config/themes";
import { WeeklyReportEmailInput } from "./templates/weeklyReportEmail";
import { formatLastUpdated } from "@/lib/reports/formatLastUpdated";

type ThemeRef = { category: ThemeCategory; summary: string };
type ReportRow = {
  // periodStart/periodEnd deliberately absent — internal comparison
  // anchors, never rendered (see lib/db/schema.pg.ts).
  createdAt: string;
  topPositiveThemesJson: string;
  topNegativeThemesJson: string;
};
type RollupRow = { themeCategory: string; trendDirection: string; negativeCount: number };

export function buildEmailInputFromReport(
  businessName: string,
  dashboardUrl: string,
  report: ReportRow,
  rollups: RollupRow[]
): WeeklyReportEmailInput {
  const positive: ThemeRef[] = JSON.parse(report.topPositiveThemesJson);
  const negative: ThemeRef[] = JSON.parse(report.topNegativeThemesJson);

  const issuesNeedingAttentionCount = rollups.filter(
    (r) => (r.trendDirection === "increasing" || r.trendDirection === "new") && r.negativeCount > 0
  ).length;

  return {
    businessName,
    dashboardUrl,
    lastUpdated: formatLastUpdated(report.createdAt),
    topPositiveThemeLabel: positive[0] ? THEME_LABELS[positive[0].category] : null,
    topPositiveThemeSummary: positive[0]?.summary ?? null,
    topComplaintLabel: negative[0] ? THEME_LABELS[negative[0].category] : null,
    topComplaintSummary: negative[0]?.summary ?? null,
    issuesNeedingAttentionCount,
  };
}
