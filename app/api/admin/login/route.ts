import { NextRequest, NextResponse } from "next/server";
import { createAdminSession } from "@/lib/auth/adminSession";
import { logAutomationError } from "@/lib/monitoring/logError";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Fail closed: no ADMIN_SECRET configured means NO admin login succeeds —
// never a fallback to a known, previously-published default (this used to
// be "dev-admin" unconditionally, AND the login page printed that exact
// string to every visitor, authenticated or not — a real incident, not a
// hypothetical one, if ADMIN_SECRET was ever left unset in production).
// Mirrors CRON_SECRET's fail-closed pattern in
// app/api/cron/check-reviews/route.ts. The one exception is local
// development, gated on NODE_ENV !== "production" (Vercel always sets it
// to "production" in a real deploy) — never active there even if
// ADMIN_SECRET is missing by mistake.
function expectedAdminKey(): string | undefined {
  if (process.env.ADMIN_SECRET) return process.env.ADMIN_SECRET;
  return process.env.NODE_ENV !== "production" ? "dev-admin" : undefined;
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
  const expected = expectedAdminKey();
  if (!expected) {
    console.error("ADMIN_SECRET is not set — refusing admin login.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

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
  if (!key || key !== expected) {
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
