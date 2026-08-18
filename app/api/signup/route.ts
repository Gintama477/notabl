import { NextRequest, NextResponse } from "next/server";
import { SignupSchema } from "@/lib/validation/signup";
import { createAccountWithDemoBusiness, findDuplicateBusiness } from "@/lib/db/queries";
import { createSession } from "@/lib/auth/session";
import { track } from "@/lib/analytics/track";
import { runAnalysisForBusiness } from "@/lib/analysis/runAnalysis";
import { sendWelcomeEmail } from "@/lib/email/send";
import { logAutomationError } from "@/lib/monitoring/logError";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  // 5 signups per 30 minutes per IP — generous for a real user (who signs up
  // once) while stopping a scripted client from flooding the pipeline that
  // creates a demo business + runs analysis on every call. See
  // lib/rateLimit.ts for why this is in-memory rather than distributed.
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`signup:${ip}`, 5, 30 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts. Please try again later." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await track("signup_started", { properties: { email: parsed.data.email } });

  try {
    const { account, business, reused } = await createAccountWithDemoBusiness(parsed.data);
    if (!business) {
      return NextResponse.json({ error: "Could not create business" }, { status: 500 });
    }

    await createSession(account.id);
    await track("signup_completed", { accountId: account.id, businessId: business.id });

    // Soft, non-blocking heads-up — see findDuplicateBusiness's doc comment
    // in lib/db/queries.ts. Never stops the signup itself; the real
    // enforcement is the trial-denial checks at checkout time (#1/#2).
    // Only meaningful for a genuinely new signup, not the "reused" path
    // (same email signing in again), which is just this same account.
    const possibleDuplicate = reused
      ? null
      : await findDuplicateBusiness({
          name: business.name,
          city: business.city,
          state: business.state,
          excludeAccountId: account.id,
        });

    if (!reused) {
      await track("business_added", { accountId: account.id, businessId: business.id });
      await track("trial_started", { accountId: account.id, businessId: business.id });
      // "Onboarding" in this product IS the signup form — there's no separate
      // wizard step, the dashboard is populated immediately after this. See
      // docs/ARCHITECTURE.md for why that's intentional (no manual setup
      // required beyond the one form).
      await track("onboarding_completed", { accountId: account.id, businessId: business.id });

      // Fire-and-forget: a failed welcome email should never block signup.
      try {
        await sendWelcomeEmail({
          businessId: business.id,
          recipientEmail: parsed.data.email,
          input: { businessName: business.name, dashboardUrl: new URL("/dashboard", req.url).toString() },
        });
      } catch (emailErr) {
        console.error("Welcome email failed:", emailErr);
      }

      // Run the analysis pipeline immediately so the dashboard is populated
      // the moment the user lands on it — no manual "analyze" step required,
      // per the core promise ("the customer should NOT need to do any manual
      // analysis"). Cheap here because the DemoProvider makes no external
      // API calls; with a live Claude key this still runs once per signup.
      try {
        const result = await runAnalysisForBusiness(business.id, business.name, new Date().toISOString());
        await track("analysis_completed", {
          accountId: account.id,
          businessId: business.id,
          properties: { reviewsAnalyzed: result.reviewsNewlyAnalyzed },
        });
      } catch (analysisErr) {
        // Signup should still succeed even if analysis fails — the dashboard
        // will show an empty/error state and a retry button.
        console.error("Initial analysis failed:", analysisErr);
      }
    }

    return NextResponse.json({ ok: true, businessId: business.id, possibleDuplicate: Boolean(possibleDuplicate) });
  } catch (err) {
    console.error("Signup failed:", err);
    await logAutomationError("signup", `Signup failed for ${parsed.data.email}: ${String(err)}`);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
