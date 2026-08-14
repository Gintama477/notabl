// Shared helper for the "give admin visibility into serious failures"
// requirement (point 26) — writes to the same automation_logs table the
// analysis pipeline already uses, so every failure category shows up in one
// place in the admin panel ("Automation Errors" / "Recent Automation Log")
// instead of only existing in server console output nobody in-app can see.
// Deliberately just this — no external error-tracking service, no
// dashboards beyond what's already in /admin, per "do NOT create an
// expensive enterprise monitoring system."

import { db } from "@/lib/db/client";
import { automationLogs } from "@/lib/db/schema.pg";

export async function logAutomationError(jobName: string, detail: string, businessId?: string | null) {
  try {
    await db.insert(automationLogs).values({
      jobName,
      businessId: businessId ?? null,
      status: "failed",
      detail: detail.slice(0, 2000),
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    // If logging the failure itself fails (e.g. the DB is genuinely down),
    // fall back to console — never let error logging throw and mask the
    // original error.
    console.error("logAutomationError itself failed:", err);
  }
}
