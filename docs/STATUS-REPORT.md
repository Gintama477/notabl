# Status Report — Phase 1 Cleanup Pass

Covers the full 20-point cleanup request, in the order it was given.

## COMPLETED

1. **Renamed ReviewPulse → Notabl everywhere** — copy, metadata, page
   titles, emails, dashboard, pricing, reports, code/config (package name,
   plan ID, session cookie name, sample-account email domain), docs, and
   the logo initial. Verified zero leftover mentions across every rendered
   page.
2. **Product audit (10-second clarity test)** — read every page as a
   skeptical practice owner would; fixed what didn't hold up (see Bugs
   below), confirmed the rest already works.
3. **Trust audit** — confirmed no fake claims, testimonials, counts, or
   affiliations anywhere; demo data is clearly labeled everywhere it
   appears (dashboard banner, sample report, legal pages' placeholder
   notice); fixed two copy issues that undermined trust (below).
4. **Full user-flow testing** — real browser (Playwright) walk of
   landing → signup → dashboard → weekly report → pricing → sample report
   → admin. Zero bugs, zero console errors.
5. **Mobile/iPhone responsiveness** — tested at 390×844 (iPhone-size)
   across every major page. No overflow, no broken layout, no fixes
   needed — it was already solid.
6. **Sample report quality** — confirmed every recommendation is
   mechanically derived from the actual demo data rollup (mention counts,
   trend direction), never generic filler; verified this in the
   underlying code, not just the rendered output.
7. **Value proposition rewrite** — mostly already correct (landing page
   never led with "AI," and the marketing docs already had an explicit
   "don't lead with AI" rule). Fixed the one place it wasn't consistent:
   the dashboard said "AI Recommendations" while the full report said
   "Recommended Actions" — now consistent, outcome-framed language
   everywhere.
8. **$49/month pricing audit** — written, no price changed. Short version:
   not yet justified, because there's no live review data, no live email,
   and no live billing yet — see `docs/PRICING-AUDIT.md`.
9. **Analytics event structure** — verified all 12 events are wired to
   real call sites (not just defined and unused); described accurately as
   a self-hosted events table, never claimed as "connected" to any vendor.
10. **Deployment instructions** — written for Vercel, including a
    load-bearing warning: the current local database will not work on
    Vercel as-is. Nothing deployed. See `docs/DEPLOYMENT.md`.
11. **Security audit** — found and fixed one real issue (admin key leaking
    into the URL/history/logs); documented everything else with reasoning.
    See `docs/SECURITY-AUDIT.md`.
12. **Credentials doc** — restructured into Now / Before Public Beta /
    Later. See `docs/CREDENTIALS-NEEDED.md`.
13. **No unauthorized scraping** — confirmed directly (no scraping
    libraries installed, no code fetching google.com/yelp.com anywhere),
    not just assumed.
14. **Stripe test-mode architecture** — built and verified end-to-end
    (checkout, subscription, cancellation, failed payment, portal,
    status). No Stripe account connected, no charges possible. See
    `docs/STRIPE-TEST-MODE.md`.
15. **8-question feedback system** — built and verified end-to-end,
    visible in the admin panel. One caveat — see below.
16. **Outreach materials** — 1 initial email, 2 follow-ups, 1 LinkedIn DM,
    a plain explanation, sample-report link placeholder. No fabricated
    practice-specific analysis. See `marketing/outreach-materials.md`.
17. **Admin view extended** — added feedback visibility, past-due
    subscription count, checkout/subscription funnel stats, average NPS.
18. **Backup checkpoint** — done first, before any other change: a tagged
    git commit (`pre-notabl-rename-checkpoint`) and a delivered zip of the
    working pre-rename code.
19. **No postponed features added** — nothing beyond what was asked for.
20. This report.

## NEEDS MY ACTION (yours, not technical work I can do alone)

- **The feedback questions may not match your original wording.** The
  request said the 8 questions were "exact" / already specified, but that
  literal list wasn't recoverable after the earlier context reset — I
  could only find the abstract description, not the original text. I used
  reasonable judgment to write 8 questions that fit the product (see
  `lib/validation/feedback.ts`). If you had specific wording in mind, tell
  me and I'll swap it in — it's a small, contained edit.
- **Decide if/when to actually deploy.** I wrote instructions and didn't
  deploy anything. Say the word and I'll do the required database swap
  (SQLite → Postgres) and walk you through Vercel setup.
- **Decide if/when to connect real Stripe test-mode keys.** The
  architecture is ready; turning it on is just adding three environment
  variables (`docs/STRIPE-TEST-MODE.md`).
- **Sanity-check the "Notabl" name before investing further in it** — it
  passed the conflict search, but sits close enough to "Notability" (a
  well-known, trademarked note-taking app) that I'd treat it as
  lower-risk-not-zero-risk, not fully cleared. Worth a deliberate gut
  check before a domain purchase or printed materials.
- **Build the actual list of ~50 dental practices** to send the outreach
  materials to. I don't have a way to source real practice contact
  information myself.

## NOT YET IMPLEMENTED (correctly out of scope for this pass)

- Real review data ingestion (Google Business Profile / Yelp APIs) —
  Phase 4, intentionally last.
- Real email sending (Resend) — Phase 2.
- Real per-operator admin authentication (still one shared secret, now at
  least not leaking into the URL).
- Rate limiting on signup/analysis endpoints — fine today, needed before
  any live API key goes live.
- Scheduled/cron automation — the manual "Run Analysis Now" button
  exercises the identical code path a cron job will call later.
- Live Stripe keys / actually charging anyone.

## BUGS / LIMITATIONS

**Found and fixed this pass:**
- Admin key was exposed in the URL (browser history, server logs) — now a
  short-lived signed cookie instead.
- Dashboard said "AI Recommendations," the full report said "Recommended
  Actions" — inconsistent, now unified.
- Sample report's page description called the demo practice "a real
  dental practice" while the page itself correctly calls it fictional —
  fixed the contradiction.
- Pricing page claimed "billing is handled securely" with no live billing
  system to back that claim — replaced with an accurate statement.

**No other functional bugs found** across full user-flow, mobile,
billing-flow, or feedback-flow automated testing (all zero-bug results,
re-verified after every change in this pass).

**Known limitations, not bugs (all documented with reasoning in the docs
above):** the local SQLite database won't work on Vercel without a swap to
Postgres first; there's no rate limiting yet; admin auth is still a single
shared secret; pricing is a single flat tier.

## NEXT 3 ACTIONS FOR ME

1. **Decide if you want to deploy this to a real, working URL** — tell me
   and I'll handle the technical setup (including the required database
   change) and walk you through the rest.
2. **Put together your list of ~50 dental practices to reach out to**
   (name, website, a contact email or two) — once you have it, I can help
   organize and personalize the outreach materials for it.
3. **Take five minutes to gut-check the "Notabl" name** against the
   trademark-closeness note above before spending more on it (domain,
   business cards, etc.) — if you want to reconsider, say so and we'll
   pick this back up.
