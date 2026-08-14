"use client";

import { useEffect } from "react";

export function LandingPageView() {
  useEffect(() => {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "landing_page_visit" }),
    }).catch(() => {});
  }, []);
  return null;
}
