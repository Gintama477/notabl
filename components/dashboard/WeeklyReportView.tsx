"use client";

import { useEffect } from "react";

export function WeeklyReportView({ businessId }: { businessId: string }) {
  useEffect(() => {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "weekly_report_opened", properties: { businessId } }),
    }).catch(() => {});
  }, [businessId]);
  return null;
}
