import { NextRequest, NextResponse } from "next/server";
import { createAdminSession } from "@/lib/auth/adminSession";
import { logAutomationError } from "@/lib/monitoring/logError";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

function isCorrectKey(key: string | undefined) {
  const expected = process.env.ADMIN_SECRET || "dev-admin";
  return !!key && key === expected;
}

// POST so the admin key travels in the request body, not the URL — avoids
// it landing in browser history or server access logs the way a GET
// ?key=... form submission does. See lib/auth/adminSession.ts.
//
// This is the single most important rate limit in the app — before this,
// the ONLY thing protecting the entire admin panel (every account's email,
// MRR, businesses, prospect contact info, support appeal messages) was a
// plain string compare with unlimited attempts.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`admin-login:${ip}`, 10, 15 * 60 * 1000);
  if (!rateLimit.allowed) {
    const url = new URL("/admin", req.url);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, {
      status: 303,
      headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
    });
  }

  const form = await req.formData();
  const key = form.get("key")?.toString();

  const url = new URL("/admin", req.url);
  if (!isCorrectKey(key)) {
    // Wrong admin key — a genuine authentication failure worth surfacing to
    // whoever eventually gets in, as a lightweight signal of repeated
    // unauthorized access attempts. Never logs the attempted key itself.
    await logAutomationError("admin-login", "Failed admin login attempt (incorrect key).");
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  await createAdminSession();
  return NextResponse.redirect(url, { status: 303 });
}
