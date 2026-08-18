import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findAccountByEmail, getBusinessForAccount } from "@/lib/db/queries";
import { sendMagicLoginLink, DEMO_LINK_COOKIE } from "@/lib/auth/sendMagicLink";
import { checkRateLimit } from "@/lib/rateLimit";

const LoginSchema = z.object({ email: z.string().email() });

// Sends a magic login link instead of logging the visitor straight in — see
// lib/auth/loginToken.ts for why (typing a known email used to be enough to
// open someone else's dashboard). Always responds the same way whether or
// not the email has an account, so this endpoint can't be used to check
// which practices have signed up.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parsed = LoginSchema.safeParse({ email: form.get("email")?.toString() });
  const url = new URL("/login", req.url);

  if (!parsed.success) {
    url.searchParams.set("error", "invalid");
    return NextResponse.redirect(url, { status: 303 });
  }

  // Keyed by email, not IP — the risk is mail-bombing one target inbox (or
  // running up Resend volume) regardless of which IP(s) it comes from. Rate
  // limited here means the send is silently skipped below (account stays
  // null-equivalent for this request) but the response is identical either
  // way, preserving the "can't be used to enumerate accounts" property.
  const emailRateLimit = checkRateLimit(`login:${parsed.data.email.toLowerCase()}`, 5, 30 * 60 * 1000);

  const account = emailRateLimit.allowed ? await findAccountByEmail(parsed.data.email) : null;
  let demoLoginUrl: string | undefined;

  if (account) {
    const business = await getBusinessForAccount(account.id);
    if (business) {
      const result = await sendMagicLoginLink({
        accountId: account.id,
        businessId: business.id,
        recipientEmail: parsed.data.email,
        origin: req.nextUrl.origin,
      });
      demoLoginUrl = result.demoLoginUrl;
    }
  }

  const checkEmailUrl = new URL("/login/check-email", req.url);
  const res = NextResponse.redirect(checkEmailUrl, { status: 303 });

  // Demo-mode-only convenience: carry the link through a one-shot, very
  // short-lived cookie rather than a URL query param, so the token doesn't
  // sit in the browser address bar / history / any Referer header the way
  // the old admin ?key= param used to (see docs/SECURITY-AUDIT.md). This
  // path is unreachable once RESEND_API_KEY is set, i.e. never in a real
  // deployment — demoLoginUrl is only ever populated by sendLoginEmail's
  // demo-mode branch.
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
