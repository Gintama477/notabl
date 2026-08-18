// Admin session cookie — set once the shared ADMIN_SECRET key is submitted
// via the login form (see app/api/admin/login/route.ts), so the key itself
// doesn't have to sit in the URL (and therefore browser history, server
// access logs, and any Referer header) on every subsequent admin page load.
// This is still a shared-secret gate, not real per-operator authenticated
// access — see docs/SECURITY-AUDIT.md for the documented upgrade path
// (swap for a real admin role check against Supabase Auth) before this
// handles real customer data.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { SESSION_SECRET_KEY as SECRET } from "./secret";

const COOKIE_NAME = "notabl_admin_session";

export async function createAdminSession() {
  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
}

export async function hasValidAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
