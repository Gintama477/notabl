import { NextRequest, NextResponse } from "next/server";

/**
 * Bearer-token gate shared by every cron route. Shared rather than copied
 * because there are now two of them (the daily dispatcher and the
 * per-business sync worker it fans out to) and a second copy is a second
 * thing to forget to harden.
 *
 * Fails closed: no CRON_SECRET configured means the route refuses to run
 * at all rather than silently trusting every caller. Vercel's own cron
 * invocations send `Authorization: Bearer ${CRON_SECRET}` automatically.
 *
 * Returns a response to send back when the caller is NOT authorized, or
 * null when it is — so a route reads `const denied = ...; if (denied)
 * return denied;`.
 */
export function denyUnauthorizedCron(req: NextRequest, routeName: string): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`${routeName}: CRON_SECRET is not configured — refusing to run.`);
    return NextResponse.json({ error: "Not configured" }, { status: 401 });
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
