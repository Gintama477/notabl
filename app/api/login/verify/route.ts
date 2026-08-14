import { NextRequest, NextResponse } from "next/server";
import { verifyLoginToken } from "@/lib/auth/loginToken";
import { createSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url), { status: 303 });
  }

  const accountId = await verifyLoginToken(token);
  if (!accountId) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url), { status: 303 });
  }

  await createSession(accountId);
  return NextResponse.redirect(new URL("/dashboard", req.url), { status: 303 });
}
