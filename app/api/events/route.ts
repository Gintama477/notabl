// Client-side analytics capture (page views, CTA clicks) — server-side
// events (signup_completed, analysis_completed, etc.) are tracked directly
// from their API routes instead of round-tripping through here.

import { NextRequest, NextResponse } from "next/server";
import { track } from "@/lib/analytics/track";
import { EVENT_NAMES, EventName } from "@/config/events";
import { getSessionAccountId } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.eventName || !EVENT_NAMES.includes(body.eventName)) {
    return NextResponse.json({ error: "Invalid event name" }, { status: 400 });
  }
  const accountId = await getSessionAccountId();
  await track(body.eventName as EventName, {
    accountId,
    properties: body.properties,
  });
  return NextResponse.json({ ok: true });
}
