# Validation Outreach Kit — First 50 Practices

Everything needed to start manual, one-at-a-time outreach to validate
Notabl with real dental practices: the email sequence, a DM version, two
short explanations for different contexts, and the pilot offer itself.
This folder is specifically for that validation push — see
`marketing/outreach-materials.md` for the original version of the email
sequence and `marketing/personalized-outreach-system.md` for the full
reasoning behind the rules below. The two files are consistent with each
other; this one adds the pieces that didn't exist yet (the two short
explanations and an explicit, standalone pilot offer) and is the one to use
going forward.

## What Notabl is, in one sentence

Notabl helps a practice get more patient reviews, and tells them what those
reviews actually say. Both halves matter to the pitch — see
`marketing/core-sales-message.md`.

**Lead with the pairing, never either half alone.** This market is
cold-pitched review-generation software constantly (Podium, Birdeye, NiceJob,
Weave, at $75–$500/month). Opening with "get more reviews" reads as the fifth
such pitch that month and earns "we already use Weave." Opening with "we read
your reviews" is the old analysis-only positioning, which left the owner to
supply the outcome themselves. What's differentiated is both, at $49/month,
no contract, no sales call.

## The rules that matter more than any of the copy

**1. No claimed findings.** Nothing below claims to have analyzed any
specific practice's actual reviews, because none have been. Every message
talks about the *idea* — practices either aren't asking for reviews
consistently, or are getting them and never reading them properly — never a
specific finding about the specific practice being contacted. Do not add a
line like "I noticed your reviews mention X" unless a real analysis actually
ran on that practice's real reviews and there's a real report to point to.
**The review-request feature does not change this rule at all.** No spammy
phrases ("act now," "limited time," excessive exclamation points, fake
urgency) — this is a personal, honest outreach to one practice at a time,
not a mass campaign.

**2. No numeric review lift.** Never "double your reviews," "4x more
reviews," or any multiplier. A QR code makes it easy for a patient to leave
a review; it does not guarantee more of them, and there is zero customer
data to cite yet. Competitors put numbers like that in their copy; we don't
have the evidence, so we don't. Write "makes it easy for patients to leave
one" and "see how many came in."

**3. Never imply Notabl contacts patients.** We deliberately never touch
patient contact data — no names, emails, phone numbers, or patient list
uploads (see the constraint comments on the `patient_feedback` table in
`lib/db/schema.pg.ts`). It's a QR code and a link the practice shares
themselves. A practice signing up expecting us to text or email their
patients would have been sold something we don't do.

**4. Never frame private feedback as heading off bad reviews.** That framing
is review gating, which Google prohibits and the FTC's Consumer Review Rule
creates separate exposure for. Describe it neutrally: patients see both
options together and choose for themselves where their feedback goes. Also
enforced in code — see the no-gating comment in
`app/r/[slug]/ReviewChoiceSection.tsx`.

Sending notes: personalize `{{practice_name}}` / `{{first_name}}` from
public sources only (their own website, a business listing) — never from
review content that hasn't actually been analyzed. Space the two follow-ups
roughly 4–5 business days apart. Stop immediately on any reply, including
"not interested." Send from a real name and a real-looking personal
address, not `team@` or `noreply@`. One practice at a time, sent manually —
see `docs/CREDENTIALS-NEEDED.md` and the product requirements this kit was
built against for why there's no bulk-send tooling here on purpose.

---

## Initial Email

**Subject:** quick question about {{practice_name}}'s reviews

Deliberately low-key. A subject line leading with "get more reviews"
pattern-matches to the vendor spam this market already deletes unopened; the
differentiating pairing goes in the body, where it gets read.

Hi {{first_name}},

Most dental practices I talk to are in one of two spots with reviews: either
they're not really asking for them, or they're coming in steadily and nobody
has time to read through what they actually say.

I built a small tool called Notabl that covers both. You get a QR code for
the front desk that lets a patient leave a Google review in a couple of
taps, and every review that comes in gets turned into a plain-language
alert email — what's going well, what's coming up more often, and what's
new.

It's $49/month, no contract and no sales call — less than most tools in this
space charge for just one of those two things.

Worth a 10-minute look? Here's a sample report so you can see the format
before we talk: {{sample_report_link}}

{{sender_name}}

---

## Follow-up #1 (send ~4–5 business days later)

**Subject:** re: {{practice_name}}'s reviews

Hi {{first_name}},

Following up in case this got buried — no worries if now isn't a good
time.

If it's useful, I'm happy to just tell you what I'd look for on your
public review profile ({{review_profile_note}}) — takes me a few minutes,
no obligation either way.

{{sender_name}}

---

## Follow-up #2 (send ~4–5 business days after that; last one)

**Subject:** closing the loop on this

Hi {{first_name}},

Last note from me — here's that sample report again in case it's useful:
{{sample_report_link}}. It's the exact format your practice would get,
just built on example data so you can see it without signing up for
anything.

The short version of the whole thing: a QR code that makes it easy for
patients to leave a review, and an alert the moment one needs your attention.
If neither is a priority right now, totally understand. Happy to check back
down the road, or feel free to reach out any time at {{sender_email}} if it
becomes useful.

Wishing you and the practice well either way.

{{sender_name}}

---

## LinkedIn / DM version (use instead of, not in addition to, the email sequence)

Hi {{first_name}} — I build a small tool (Notabl) for dental practices that
does two things: a QR code for the front desk so patients can leave a Google
review in a couple of taps, and a plain-language alert email of what all
those reviews actually say, so they're not just piling up unread. Not
selling anything here, just curious if it'd be useful — here's a sample
report if you want to see the format: {{sample_report_link}}

---

## 30-second explanation (for a phone call or in-person conversation)

"Notabl does two things. First, you get a QR code for the front desk or
checkout counter — a patient scans it and can leave a Google review in a
couple of taps, or send you private feedback instead; they pick. Second,
every review that comes in gets read and turned into a short alert email:
what patients keep praising, what complaints are coming up, anything new or
getting worse. Most practices buy those two things separately, if they buy
the second one at all — this is $49 a month for both, no contract. It's not
about your star rating; it's about catching a problem, like patients
complaining about phone response times, while it's still three reviews
instead of thirty."

## 2-sentence explanation (for an email subject line follow-up, a quick text, or when someone asks "what do you do?")

"Notabl gives your practice a QR code that makes it easy for patients to
leave a review, then reads every review that comes in and sends you a
plain-language alert email of what's going well, what's not, and what's
changing. So you're not just collecting reviews nobody reads, and you catch
a small problem before it becomes a pattern."

---

## The Pilot Offer

Use this when a practice responds with interest, or when reaching out to
someone already warm (e.g. someone you know personally). It's a distinct,
lower-friction ask than "try the product" — it's specifically an
invitation to a free pilot, and it should sound like one.

**What it communicates, every time:**
- This is an early, still-being-tested product — not a finished, polished
  SaaS with thousands of users.
- Access is completely free during the pilot. No payment, no card, no
  trial-that-auto-converts.
- The main thing being asked for in return is honest feedback — what's
  useful, what's confusing, whether they'd ever pay for something like
  this.
- There's no obligation to keep using it or to become a paying customer
  afterward. Saying "this isn't useful" is a completely fine outcome.

**Suggested wording (email or in conversation):**

"I'm testing this with a small number of practices before opening it up
more broadly, and I'd like to give {{practice_name}} free access — no
cost, no obligation to continue. You'd get the review-request QR code and
ongoing analysis, both. All I'd ask is honest feedback: whether it's
actually useful, what's confusing, and whether it's something you'd ever
pay for. I can set your dashboard up in a couple minutes whenever you're
ready."

Once someone says yes, granting access is a two-minute admin action (see
the "Pilot Access" section of `/admin`) — it creates their account, sends
them a one-click login link, and their dashboard is populated immediately
so there's nothing else for them to set up. See
`marketing/validation/tracker.csv` to log where each conversation stands.
