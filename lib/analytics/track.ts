// Minimal product analytics: every call inserts a row into `events`. No
// external analytics vendor needed at this scale — the admin panel (Phase 1
// basic version, app/admin) reads straight from this table. See
// config/events.ts for the fixed event-name list.

import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema.pg";
import { EventName } from "@/config/events";

export async function track(
  eventName: EventName,
  opts: { accountId?: string | null; businessId?: string | null; properties?: Record<string, unknown> } = {}
) {
  try {
    await db.insert(events).values({
      accountId: opts.accountId ?? null,
      businessId: opts.businessId ?? null,
      eventName,
      propertiesJson: opts.properties ? JSON.stringify(opts.properties) : null,
    });
  } catch (err) {
    // Analytics must never break the user-facing flow.
    console.error("track() failed:", eventName, err);
  }
}
