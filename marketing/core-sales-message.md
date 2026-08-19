# Notabl — Core Sales Message

## The message, in one sentence

Notabl helps you get more patient reviews, and tells you what they actually
say.

## The trap to avoid, before anything else

Dental practice owners are cold-pitched review-generation software
constantly — Podium, Birdeye, NiceJob, Weave and others all sell into this
exact market at $75–$500/month. **If we lead with "get more reviews" on its
own, we sound like the fifth vendor that month and the reply is "we already
use Weave."** Review generation is table stakes in this market, not a
differentiator.

What's actually differentiated is the *combination*, at this price:
practices using those tools collect reviews and then never read them
properly. Notabl does both halves — it makes the ask easy, then tells the
owner what the reviews add up to — for $49/month with no contract and no
sales call.

**Lead with the pairing. Never with either half alone.** "We read your
reviews" alone is the old analysis-only positioning, which asked the owner
to supply the outcome themselves. "We get you reviews" alone is a
commodity.

## What to lead with (in priority order)

1. **Both halves, together.** Getting reviews in and understanding them are
   usually two separate purchases. This is one, at a price below what either
   is normally sold for alone.
2. **An outcome they already want, without new work.** More reviews means
   more new patients finding the practice — an owner doesn't need that
   explained. The QR code makes the ask easy for the front desk and easy for
   the patient; nobody has to remember a script or chase anyone down.
3. **Catching complaints early.** A single bad review is a data point. Four
   reviews mentioning the same thing in three weeks is a pattern. Most
   owners only see the individual data points — Notabl shows the pattern.
   This is the half that stays valuable after the review count goes up.
4. **Trends over individual reviews.** The value isn't "read this one
   review" — they can already do that. It's "here's what's increasing,
   here's what's new, here's what's worth your attention this week."
5. **No contract, no sales call, no onboarding project.** A real
   differentiator against enterprise-priced competitors in this space, and
   it removes the main reason an owner delays a decision.

## What NOT to lead with

- **"AI."** It's the mechanism, not the benefit. Practice owners don't buy
  AI; they buy "get more reviews and know what's going wrong." If AI comes
  up, it's in service of explaining how the report is possible, not why they
  should want it.
- **Vanity metrics.** "Sentiment score" and "NPS-style dashboards" sound
  like something built for a marketing team, not a solo practice owner
  between patients. Speak in plain language: "more patients mentioned wait
  times this week."
- **Fear-based messaging about reputation damage.** True, but overused in
  this space and reads as generic scare-copy. Calm and useful beats
  alarming.
- **"Get more reviews" as the opening line.** See the trap section above.
  It's the single fastest way to get filed as vendor spam.

## Honesty limits (these are not stylistic preferences)

1. **Never claim to have analyzed a specific practice's reviews unless an
   analysis genuinely ran.** Unchanged by the review-request feature — it
   creates no new license to claim specific findings. See
   `marketing/personalized-outreach-system.md` for the full rule.
2. **Never promise a numeric review lift.** No "double your reviews," no
   "4x more reviews," no multipliers. A QR code makes it easy for a patient
   to leave a review; it does not guarantee more of them, and there is zero
   customer data to cite yet. Competitors print numbers like that; we don't
   have the evidence, so we don't. Say "makes it easy for patients to leave
   one" and "see how many came in."
3. **Never imply Notabl contacts patients.** We deliberately never touch
   patient contact data — no names, no emails, no phone numbers, no patient
   list upload (see the constraint comments on the `patient_feedback` table
   in `lib/db/schema.pg.ts`). It's a QR code and a link the practice shares
   themselves. A practice signing up expecting us to text their patients
   would have been sold something we don't do, and it's the exact capability
   we chose not to build.
4. **Never frame private feedback as a way to head off bad reviews.** That
   framing is review gating, which Google prohibits and the FTC's Consumer
   Review Rule creates separate exposure for. Describe it neutrally:
   patients see both options together and choose for themselves where their
   feedback goes. This is also enforced in code — see the no-gating comment
   in `app/r/[slug]/ReviewChoiceSection.tsx`.

## One-line elevator pitches (situational)

- **Cold outreach subject line:** "quick question about {practice}'s
  reviews" — deliberately low-key. A subject line leading with "get more
  reviews" pattern-matches to the vendor spam this market already deletes
  unopened; the differentiating pairing goes in the body, where it gets read.
- **Landing page hero:** "Get more patient reviews — and know what they're
  actually telling you."
- **In-person / phone:** "Two things, really. You get a QR code for the
  front desk so patients can leave a review in a couple of taps, and then we
  read everything that comes in and tell you what it adds up to each week.
  Most practices buy those separately, if at all."
- **Pricing objection response:** "It's $49 a month for both halves — the
  review requests and the analysis. Most tools in this space start around
  $75 and only do the first one, and they'll want a contract and a demo
  call. There's no contract here and you can cancel from your own dashboard.
  It's also less than one missed appointment slot a month, and the analysis
  side is aimed squarely at the small operational issues — scheduling
  delays, phone response — that cause those missed slots in the first
  place."
- **"We already use Podium/Birdeye/Weave" response:** "Then you're probably
  getting reviews in fine. The question I'd ask is who's actually reading
  them — most practices I talk to have a growing pile nobody has time to go
  through, so the complaints only register once one of them is bad enough to
  sting. That reading half is what we do, and the request side comes with
  it rather than being a second bill."
