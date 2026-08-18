"use client";

import { useEffect } from "react";

/**
 * Client-side defense in depth for the bfcache-logout bug — see
 * middleware.ts (Cache-Control: no-store) for the server-side half, which
 * this backs up for browsers/versions that don't consistently honor that
 * header for back/forward-cache exclusion. The `pageshow` event's
 * `persisted` flag is true only when this render came from bfcache rather
 * than a fresh navigation or reload; in that case, reload immediately —
 * that hits the server fresh, which correctly redirects to /signup if the
 * session was cleared in the meantime (e.g. logged out, then Back). A
 * no-op on every normal load: the listener simply never fires with
 * persisted=true.
 *
 * Render once per session-gated page — currently app/dashboard/page.tsx,
 * app/billing/page.tsx, and app/dashboard/weekly-report/[id]/page.tsx.
 */
export function BfcacheGuard() {
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return null;
}
