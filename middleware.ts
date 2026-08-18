import { NextResponse } from "next/server";

// Session-gated pages (dashboard, billing, admin, and their subpaths) must
// never be served from the browser's local cache. Without this, logging out and
// then hitting the browser's Back button can restore a stale, still-
// logged-in-looking snapshot of one of these pages straight from the
// back/forward cache, without the browser ever asking the server again —
// the server-side getSessionAccountId() check on these pages is correct
// and would redirect to /signup on any real request; this closes the
// separate "a frozen cached page still looks logged in" visual gap.
// Cache-Control: no-store makes modern browsers (Chrome, Firefox, Safari)
// exclude the page from bfcache by spec. See components/BfcacheGuard.tsx
// for the client-side defense in depth, for browsers/versions that don't
// honor this consistently.
export function middleware() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/billing", "/billing/:path*", "/admin", "/admin/:path*"],
};
