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
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
