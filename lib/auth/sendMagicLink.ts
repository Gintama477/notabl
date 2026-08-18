// Shared by app/api/login (typing your own email to log back in) and
// app/api/signup's "reused" path (typing an email that already has an
// account — which must never silently log the caller in; that was exactly
// the account-takeover bug loginToken.ts's own header comment describes
// login itself as having fixed, and signup was quietly reopening it).
// Sending a real magic link either way means getting into an existing
// account always requires proving you control that inbox.

import { createLoginToken } from "./loginToken";
import { sendLoginEmail } from "@/lib/email/send";

// One-shot, very short-lived cookie carrying the demo-mode login link
// through to /login/check-email, instead of it sitting in the URL/history —
// see app/api/login/route.ts's original comment on why. Only ever
// populated when RESEND_API_KEY isn't set, i.e. never in a real deployment.
export const DEMO_LINK_COOKIE = "notabl_demo_login_link";

export async function sendMagicLoginLink(opts: {
  accountId: string;
  businessId: string;
  recipientEmail: string;
  origin: string;
}): Promise<{ demoLoginUrl?: string }> {
  const token = await createLoginToken(opts.accountId);
  const loginUrl = `${opts.origin}/api/login/verify?token=${token}`;
  const result = await sendLoginEmail({
    businessId: opts.businessId,
    recipientEmail: opts.recipientEmail,
    loginUrl,
    expiresInMinutes: 15,
  });
  return { demoLoginUrl: result.demoLoginUrl };
}
