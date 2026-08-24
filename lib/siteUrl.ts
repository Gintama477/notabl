// Single source of truth for the site's canonical public address — used
// everywhere a link needs to be built into an email or a URL that Stripe
// holds onto and redirects back to later (checkout success/cancel, portal
// return), instead of deriving it from the incoming request
// (req.nextUrl.origin / req.url). Deriving from the request meant whatever
// address someone happened to load the site from — including an old
// notabl-xxxxx-yourorg.vercel.app preview deployment URL — got baked
// directly into emailed links and Stripe redirect targets, permanently,
// until that person requested a fresh one.
//
// NOT meant for redirecting the CURRENT request's own browser to a
// relative path right now (e.g. the demo billing provider's local
// redirect) — that should stay tied to whatever origin the request
// actually came from, so testing on a preview deployment doesn't
// force-navigate off it. This is specifically for links that outlive the
// current request: emails, and URLs Stripe stores and uses later.
// Set this to the host that SERVES the site, not the one that redirects to
// it — https://www.trynotabl.com, since the apex 308-redirects to www.
// Pointing it at the apex isn't fatal (og:url, sitemap entries and emailed
// links just aim at a redirect) but it is sloppy for SEO and email, and it
// once broke the alerts cron outright: the cron self-called this URL, and
// fetch DROPS the Authorization header across the apex->www origin change,
// so every dispatch arrived unauthenticated. That path now uses the
// request's own origin instead (app/api/cron/check-reviews/route.ts) and no
// longer depends on this being right — but nothing else has that safety
// net.
//
// GOTCHA: NEXT_PUBLIC_* values are inlined into the bundle at BUILD time,
// not read at runtime. Changing this in Vercel and hitting "Redeploy" with
// "Use existing Build Cache" left the old host baked in and looked like the
// change hadn't saved. A fresh build (a new commit, or redeploy with the
// cache unchecked) is what actually applies it.
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
