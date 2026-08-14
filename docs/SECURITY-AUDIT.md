# Basic Security Audit — Phase 1

Scope: a practical pass appropriate for a pre-launch prototype with no real
customer data yet, not a formal penetration test — do not represent it as
one. Findings below are grouped by pass; each has either a fix already
applied or a documented "why not now."

## Fixed in the public-beta pass

**Account takeover via login by email alone.** Adding a `/login` page this
pass introduced a real gap: it logged a visitor in as soon as they typed an
email address that matched an existing account — no proof they controlled
that inbox. Anyone who knew or guessed a dental practice's signup email
could open that practice's dashboard. Fixed: `/login` now sends a signed,
single-use, 15-minute magic link to the account's email
(`lib/auth/loginToken.ts`, `lib/email/templates/loginEmail.ts`,
`app/api/login/verify/route.ts`) instead of logging in directly. The
response is identical whether or not the email has an account, so the
endpoint can't be used to check which practices have signed up. In demo
mode (no `RESEND_API_KEY`), the link is handed back once through a
60-second cookie instead of a URL query param — the same "no secrets in
the URL" fix already applied to admin auth below — so local testing still
works with zero email setup. Verified end-to-end via
`scripts/login-flow-test.mjs`: signup → logout → dashboard blocked while
logged out → magic link received and works → a second request for a
nonexistent email produces the identical page with no link → a tampered
token redirects to an error instead of granting access.

## Fixed in the Phase 1 cleanup pass

**Admin auth leaked the shared secret into the URL.** The admin panel was
gated by `?key=...` in the URL, which means the secret ended up in browser
history, shared links/screenshots, and server access logs every time it was
used. Fixed: the key is now submitted once via a POST form
(`app/api/admin/login/route.ts`), which sets a short-lived (12-hour) signed,
httpOnly cookie (`lib/auth/adminSession.ts`). The admin page checks that
cookie instead of a URL parameter. Verified: the old `/admin?key=...`
pattern no longer grants access on its own; wrong keys are rejected and
redirect back with an error; the cookie persists access across requests
without repeating the key.

## Documented, not fixed — with reasoning

- **Admin auth is still a single shared secret**, not real per-operator
  authenticated access with an audit trail of who did what. This is a
  reasonable trade-off for a single-operator Phase 1 prototype (there's
  only you), and was already the documented plan — see
  `docs/PHASE-1-TEST-NOTES.md` and `docs/CREDENTIALS-NEEDED.md` — to
  replace this with a real role check against Supabase Auth before this
  handles real customer data. Not rebuilt now to avoid overbuilding auth
  infrastructure for a prototype with no real users yet.
- **No rate limiting** on `/api/signup` or `/api/analysis/run`. Low risk
  today — with no live `ANTHROPIC_API_KEY` or `RESEND_API_KEY`, repeated
  hits cost nothing and send nothing. It becomes a real cost/abuse vector
  the moment those keys go live (someone could script repeated signups to
  run up your Claude API bill or spam your Resend sending reputation).
  Added to `docs/CREDENTIALS-NEEDED.md` as a **Before Public Beta** item —
  a simple per-IP or per-account request cap is enough, no need for
  anything elaborate.
- **`SESSION_SECRET` and `ADMIN_SECRET` both have insecure, clearly-named
  dev fallbacks** (`dev-only-insecure-secret-change-in-production` and
  `dev-admin`) so the app runs out of the box with zero setup. Both are
  already called out in `.env.example` and `docs/CREDENTIALS-NEEDED.md` as
  required to change before deploying anywhere real — carried forward here,
  not a new finding, but worth restating: **do not deploy this to a public
  URL without setting both to real random values first.**

## Confirmed: no unauthorized scraping anywhere

Checked directly rather than assumed: no scraping library is installed
(no Cheerio, Puppeteer, or similar in `package.json`), no code anywhere in
`app/`, `lib/`, or `scripts/` fetches from `google.com` or `yelp.com`, and
no scraping/crawling logic exists in the codebase at all. Review data in
Phase 1 is 100% synthetic demo data generated locally
(`scripts/generate-demo-reviews.mjs`). The only planned path to real review
data is Phase 4's authorized API integration (Google Business Profile API
and/or Yelp Fusion API, or a licensed provider) — see
`docs/ARCHITECTURE.md` and `docs/CREDENTIALS-NEEDED.md` — and the Terms of
Service already commit to this (`app/legal/terms/page.tsx`, "Acceptable
Use": no collecting or processing review data obtained in violation of a
platform's terms of service).

## Checked and already fine — no action needed

- **No XSS surface found.** No `dangerouslySetInnerHTML` anywhere in the
  codebase; all review text and user-entered content renders through
  React's default output escaping.
- **No SQL injection surface found.** All database access goes through
  Drizzle ORM's parameterized query builder. The only raw-SQL usage in the
  codebase is a static schema-level default value
  (`` sql`(current_timestamp)` `` in `lib/db/schema.ts`) — not user input.
- **Signup and feedback input are validated server-side**, not just in the
  browser (`lib/validation/signup.ts`, `lib/validation/feedback.ts` — Zod
  schemas enforcing types, max lengths, and enum values on every field).
- **No secrets committed to the repository.** `.env` is gitignored; a scan
  for hardcoded API-key-shaped strings (`sk-ant-`, `sk_live`, `sk_test`,
  `whsec_`, Resend keys) across the codebase found none — only key
  *prefixes* mentioned in docs for identification purposes.
- **Session cookies follow standard hygiene**: httpOnly (not readable by
  client-side JS), `sameSite: "lax"`, and `secure` in production — the user
  session (`lib/auth/session.ts`), admin session
  (`lib/auth/adminSession.ts`), and now the magic-link login token above.
- **Stripe webhook signature is verified** (`app/api/billing/webhook/route.ts`)
  before any event is trusted — requests without a valid `stripe-signature`
  header are rejected, so the endpoint can't be spoofed to fake a payment.
- **The `/api/events` analytics endpoint whitelists event names** against
  the fixed `EVENT_NAMES` enum — a client can't write arbitrary event types
  into the database.
- **No client component reads `process.env` directly** — a scan confirmed
  every server-only credential stays server-side; nothing but
  `NEXT_PUBLIC_`-prefixed values (there are none in use) could ever reach
  the browser bundle.

## Re-verified for the public-beta pass, no new issues

Re-ran the checks above against every route added or changed this pass
(`/login`, `/api/login`, `/api/login/verify`, `/api/logout`,
`/api/feedback`, `/api/events`, the rewritten `/admin`) — all still hold:
parameterized queries only, server-side validation on every form, no new
`process.env` leaks, no new hardcoded secrets.

## Should eventually get a professional security review

This audit is a careful pass by the person building the product, not a
substitute for one. Before handling real patient-adjacent business data at
scale, get an actual security professional to look at, at minimum:

1. **Auth model** — the magic-link login and the single-shared-secret admin
   panel are reasonable for an early pilot with a handful of practices, not
   for scale. A professional review should confirm the token/session design
   holds up and recommend when to move to a managed auth provider.
2. **Rate limiting / abuse controls** — none exist yet on `/api/signup`,
   `/api/login`, or `/api/analysis/run`. Low-cost today (no live AI/email
   keys), but becomes a real cost and abuse vector once those keys go live.
3. **Stripe webhook and billing code path** — the code follows Stripe's
   documented pattern, but a second set of eyes on the actual money-movement
   path before real charges are enabled is worth the cost.
4. **Dependency audit** — run `npm audit` (or a tool like Snyk) against the
   full dependency tree before public launch; this pass didn't do a
   package-level vulnerability scan.
5. **Production infrastructure hardening** — once deployed, review actual
   HTTPS/header configuration, CORS, and hosting-provider-specific settings
   (Vercel security headers, environment variable scoping) rather than just
   the application code reviewed here.
