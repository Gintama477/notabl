import { NextRequest, NextResponse } from "next/server";
import { SignupSchema } from "@/lib/validation/signup";
import { createAccountWithDemoBusiness, findDuplicateBusiness } from "@/lib/db/queries";
import { createSession } from "@/lib/auth/session";
import { sendMagicLoginLink, DEMO_LINK_COOKIE } from "@/lib/auth/sendMagicLink";
import { track } from "@/lib/analytics/track";
import { sendWelcomeEmail } from "@/lib/email/send";
import { logAutomationError } from "@/lib/monitoring/logError";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { getSiteUrl } from "@/lib/siteUrl";

// A MISSING maxDuration IS NOT "no limit" — it is a silent 10-second one,
// which is the trap that broke this route. It used to run a full
// runAnalysisForBusiness pass inside those 10 seconds; once real Claude
// was configured that alone blew past them, so Vercel killed the function
// and the signup form sat on "Setting up your dashboard…" forever. The
// account, business, demo reviews and welcome email were all created —
// they happen before the analysis — so it failed in the most confusing
// possible way: everything worked except the response.
//
// Same defect as the analysis runs (75fe802) and the connect routes
// (a3b9c33). The rule those established applies here: one request does
// one expensive thing. 30s is ample for account creation plus one email.
export const maxDuration = 30;

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

    // The email already had an account — do NOT log the caller in. Typing
    // in an email you don't own is not proof you own it; that's exactly
    // the account-takeover gap /api/login's magic-link flow exists to
    // close (see lib/auth/loginToken.ts's header comment), which this path
    // was quietly reopening by calling createSession unconditionally.
    // Route through the same "prove you control this inbox" flow instead.
    if (reused) {
      await track("signup_attempted_existing_email", { accountId: account.id, businessId: business.id });
      // Fixed site address — same reasoning as /api/login/route.ts. Not in
      // the original bug report's list, but the exact same class of issue
      // (found while fixing the listed ones): this magic link goes into an
      // email too, and shouldn't point at whatever URL the visitor
      // happened to sign up from.
      const { demoLoginUrl } = await sendMagicLoginLink({
        accountId: account.id,
        businessId: business.id,
        recipientEmail: parsed.data.email,
        origin: getSiteUrl(),
      });

      const res = NextResponse.json({ ok: true, redirectTo: "/login/check-email" });
      if (demoLoginUrl) {
        res.cookies.set(DEMO_LINK_COOKIE, demoLoginUrl, {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 60,
          path: "/login/check-email",
        });
      }
      return res;
    }

    await createSession(account.id);
    await track("signup_completed", { accountId: account.id, businessId: business.id });

    // Soft, non-blocking heads-up — see findDuplicateBusiness's doc comment
    // in lib/db/queries.ts. Never stops the signup itself; the real
    // enforcement is the trial-denial checks at checkout time (#1/#2).
    const possibleDuplicate = await findDuplicateBusiness({
      name: business.name,
      city: business.city,
      state: business.state,
      excludeAccountId: account.id,
    });

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
        input: { businessName: business.name, dashboardUrl: new URL("/dashboard", getSiteUrl()).toString() },
      });
    } catch (emailErr) {
      console.error("Welcome email failed:", emailErr);
    }

    // NO analysis pass here — see the maxDuration comment above. The
    // dashboard starts it on first load instead
    // (components/dashboard/FirstRunAnalysis.tsx), which gives the new
    // customer visible progress and a time estimate rather than a signup
    // form frozen on "Setting up your dashboard…". The core promise still
    // holds: they never click anything to make analysis happen.
    return NextResponse.json({ ok: true, businessId: business.id, possibleDuplicate: Boolean(possibleDuplicate) });
  } catch (err) {
    console.error("Signup failed:", err);
    await logAutomationError("signup", `Signup failed for ${parsed.data.email}: ${String(err)}`);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
