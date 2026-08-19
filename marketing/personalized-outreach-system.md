# Notabl — Personalized Outreach System (Design)

## The core constraint

Real personalization ("I noticed several recent reviews mentioning
appointment delays…") is only allowed when Notabl has actually run a
real analysis on that practice's real, publicly available reviews. We do
not scrape review sites whose terms prohibit it, we do not fabricate
observations, and we never present a demo/synthetic finding as if it came
from a real analysis. This document exists specifically to keep those two
failure modes from happening as outreach gets more automated.

## Two tiers of outreach personalization

### Tier 1 — Cold outreach (no prior analysis run)

At this stage we have no authorized review data for the prospect. Personalization
is limited to information that's genuinely public and doesn't require reading
review content:

- Practice name, city/state (from their own website or business listing)
- Approximate review count / star rating **only if displayed as a simple
  public badge/summary number** the way a search result or Business Profile
  preview shows it — not by reading or quoting individual review text,
  which is where scraping-terms issues start
- Something specific about their website or public info (e.g. "I saw you
  offer Saturday appointments" from their own site) — never invented, and
  always sourced from something the sender actually looked at

What NOT to do at this tier: never write "I noticed reviews mentioning X"
unless X came from an actual Notabl analysis run. If no analysis has
been run, the outreach email should not reference specific complaint
themes at all — see Email 1 in `outreach-materials.md`, which references the
*concept* (owners can't see patterns from individual reviews) rather than
claiming a specific finding about that specific practice.

### Tier 2 — Warm personalization (after a free sample analysis has run)

Once a prospect has entered their public review profile link and
Notabl has run a real analysis on their actual reviews (either the demo
dataset a new signup starts on, or — now that self-serve Google connection
has shipped — their real Google reviews), the system has genuine, sourced
findings it can reference. Note the demo dataset is NOT a valid source for a
personalized claim: it's synthetic data about a fictional practice, so a
"finding" from it says nothing about the prospect. With a real connected
source, a follow-up can honestly say something like:

> "Your Notabl sample showed 4 recent mentions of appointment wait
> times — here's the full report: {{link}}"

This is safe specifically because it's true and traceable to a stored
`analysis_runs` row, not because it sounds compelling.

## Workflow (once wired up in Phase 5)

```
1. Prospect list built from public business directories (name, website,
   city/state only — no review content).
2. Tier 1 cold outreach sent (generic, no fabricated specifics).
3. IF prospect signs up / starts a trial:
     -> Real (or demo-labeled) analysis runs on their entered data
     -> Tier 2 follow-up can reference the actual output
   ELSE:
     -> Standard follow-up sequence continues (outreach-emails.md),
        never adding fabricated specifics at any step
4. All outreach sends and replies logged to `events` (see database schema)
   so response rates can be measured per message tier/variant.
```

## Validation rule (this is the part that must never be skipped)

Any personalized line in an outreach email that references review content
must be programmatically traceable to a specific `analysis_runs.id` for
that exact business — if there's no run id to point to, the line doesn't
get generated, full stop. This is the same "don't allow AI to invent
information" principle used in the core product (see
`docs/ARCHITECTURE.md` §5 and `lib/ai/validate.ts`), applied to outreach
copy instead of dashboard copy.
