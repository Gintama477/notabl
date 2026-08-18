// Signed, single-purpose, short-lived tokens for magic-link login. Separate
// from the session cookie (lib/auth/session.ts) — this token only proves
// "the holder controls this email inbox right now" and is exchanged for a
// real session once at /api/login/verify. Deliberately short expiry (15
// minutes) since it travels over email, a channel we don't otherwise control.
//
// Why this exists: the original /login implementation logged a visitor in
// just by typing an email address that matched an existing account — no
// proof they controlled that inbox. Anyone who knew (or guessed) a dental
// practice's signup email could open their dashboard. This closes that gap
// the same way most passwordless SaaS products do.

import { SignJWT, jwtVerify } from "jose";
import { SESSION_SECRET_KEY as SECRET } from "./secret";

export async function createLoginToken(accountId: string, expiresIn: string = "15m"): Promise<string> {
  return new SignJWT({ accountId, purpose: "login" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SECRET);
}

export async function verifyLoginToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.purpose !== "login" || typeof payload.accountId !== "string") return null;
    return payload.accountId;
  } catch {
    return null;
  }
}
