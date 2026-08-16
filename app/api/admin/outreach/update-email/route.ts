import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { updateProspectDraft } from "@/lib/db/queries";

const UpdateSchema = z.object({
  prospectId: z.string().min(1),
  contactEmail: z.string().email().optional().or(z.literal("")),
  emailSubject: z.string().min(1).max(200).optional(),
  emailBody: z.string().min(1).max(5000).optional(),
});

// Admin-only — lets the human reviewer fix up the contact email and/or the
// auto-drafted subject/body (e.g. add a real first-name greeting if they
// happen to know one — see the deviation note in
// lib/email/templates/outreachEmail.ts) before sending. See
// components/admin/OutreachQueue.tsx.
export async function POST(req: NextRequest) {
  const authorized = await hasValidAdminSession();
  if (!authorized) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await updateProspectDraft(parsed.data.prospectId, {
    contactEmail: parsed.data.contactEmail,
    emailSubject: parsed.data.emailSubject,
    emailBody: parsed.data.emailBody,
  });

  return NextResponse.json({ ok: true });
}
