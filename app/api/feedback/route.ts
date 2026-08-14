import { NextRequest, NextResponse } from "next/server";
import { FeedbackSchema } from "@/lib/validation/feedback";
import { createFeedback } from "@/lib/db/queries";
import { getSessionAccountId } from "@/lib/auth/session";
import { track } from "@/lib/analytics/track";
import { logAutomationError } from "@/lib/monitoring/logError";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Feedback doesn't require being signed in (someone viewing /sample-report
  // without an account can still leave feedback) — accountId is attached
  // when available, null otherwise.
  const accountId = await getSessionAccountId();

  try {
    await createFeedback(accountId, parsed.data);
    await track("feedback_submitted", { accountId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Feedback submission failed:", err);
    await logAutomationError("feedback-submission", `Feedback save failed: ${String(err)}`, null);
    return NextResponse.json({ error: "Could not save feedback. Please try again." }, { status: 500 });
  }
}
