// Shared by app/dashboard/page.tsx and app/dashboard/weekly-report/[id]/page.tsx —
// both render the "your real data is hidden until you reactivate" block
// for a subscriptionInactive account (real reviews connected, but not
// currently active/trialing). Real data is kept, never deleted, once
// access lapses — showing sample data again instead would look like the
// account's real data got wiped, which is worse than a clear "you're
// locked out, here's why" message. Specific to what actually happened
// rather than one generic "inactive" sentence for every case.
export function inactiveSubscriptionMessage(status: string | undefined): string {
  if (status === "canceled") {
    return "Your trial or subscription has ended. Subscribe to see your real report again.";
  }
  if (status === "past_due") {
    return "We couldn't process your last payment. Update your payment method to see your real report again.";
  }
  return "Your subscription is inactive. Reactivate to see your real report.";
}
