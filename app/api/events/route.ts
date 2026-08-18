// Client-side analytics capture (page views, CTA clicks) — server-side
// events (signup_completed, analysis_completed, etc.) are tracked directly
// from their API routes instead of round-tripping through here.

import { NextRequest, NextResponse } from "next/server";
import { track } from "@/lib/analytics/track";
import { EVENT_NAMES, EventName } from "@/config/events";
import { getSessionAccountId } from "@/lib/auth/session";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Generous limit — this fires on legitimate normal browsing (page views,
// CTA clicks), not just once per session, so it needs real headroom over
// signup/login-style endpoints while still capping a flood.
const MAX_PROPERTIES_JSON_BYTES = 4000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`events:${ip}`, 60, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds ? { "Retry-After": String(rateLimit.retryAfterSeconds) } : undefined,
      }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.eventName || !EVENT_NAMES.includes(body.eventName)) {
    return NextResponse.json({ error: "Invalid event name" }, { status: 400 });
  }
  if (body.properties !== undefined) {
    let propertiesJsonLength: number;
    try {
      propertiesJsonLength = JSON.stringify(body.properties).length;
    } catch {
      return NextResponse.json({ error: "Invalid properties" }, { status: 400 });
    }
    if (propertiesJsonLength > MAX_PROPERTIES_JSON_BYTES) {
      return NextResponse.json({ error: "properties too large" }, { status: 400 });
    }
  }
  const accountId = await getSessionAccountId();
  await track(body.eventName as EventName, {
    accountId,
    properties: body.properties,
  });
  return NextResponse.json({ ok: true });
}
