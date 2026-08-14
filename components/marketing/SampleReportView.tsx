"use client";

import { useEffect } from "react";

export function SampleReportView() {
  useEffect(() => {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "sample_report_viewed" }),
    }).catch(() => {});
  }, []);
  return null;
}
