// Fixed analytics event-name enum. Every call to track() (lib/analytics/track.ts)
// should use one of these — keeps the admin dashboard's event breakdown
// meaningful instead of accumulating one-off typo'd event names.

export const EVENT_NAMES = [
  "landing_page_visit",
  "main_cta_clicked",
  "sample_report_viewed",
  "signup_started",
  "signup_completed",
  "signup_attempted_existing_email",
  "onboarding_completed",
  "business_added",
  "dashboard_viewed",
  "pricing_viewed",
  "analysis_completed",
  "trial_started",
  "checkout_started",
  "subscription_started",
  "subscription_cancelled",
  "weekly_report_opened",
  "feedback_submitted",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
