# Outreach Materials — ~50 Dental Practices

## Explanation (read this before sending anything)

This is a cold-outreach sequence for reaching independent dental practices
about Notabl: one initial email, two follow-ups, and a LinkedIn DM
version, meant to be sent personally (from you, not "the team") to a
hand-built list of ~50 practices.

**The one rule that matters more than the copy itself:** none of this
claims to have analyzed any specific practice's actual reviews, because
none have been. Every message below talks about the *idea* — practices
either aren't asking for reviews consistently, or are getting them and never
reading them properly — never a specific finding about the specific practice
being emailed. That distinction is deliberate and load-bearing; see
`marketing/personalized-outreach-system.md` for the full reasoning and the
rule for when (if ever) that changes. Do not add a line like "I noticed your
reviews mention X" unless a real analysis actually ran on that practice's
real reviews and you can point to the report that proves it. **The
review-request feature does not change this rule at all.**

**Lead with the pairing, not either half.** This market is cold-pitched
review-generation software constantly (Podium, Birdeye, NiceJob, Weave, at
$75–$500/month). An email that opens with "get more reviews" reads as the
fifth such pitch that month and earns "we already use Weave." What's
differentiated is doing both halves — making the ask easy *and* telling the
owner what the reviews say — at $49/month with no contract and no sales
call. See `marketing/core-sales-message.md`.

**Three things the copy must never do** (same list as
`marketing/core-sales-message.md`, repeated here because this is the file
someone edits under time pressure):

1. **No numeric review lift.** No "double your reviews," no multipliers. A
   QR code makes it easy for a patient to leave a review; it doesn't
   guarantee more of them, and we have no customer data to cite. Write
   "makes it easy for patients to leave one" and "see how many came in."
2. **Never imply we contact patients.** We never touch patient contact data
   — it's a QR code and a link the practice shares themselves. A practice
   expecting us to text their patients would have been mis-sold.
3. **Never frame private feedback as heading off bad reviews.** That's review
   gating, which Google prohibits. Patients see both options together and
   choose for themselves.

**The sample-report link** (`{{sample_report_link}}`) should point at your
deployed `/sample-report` page — the one place you can honestly say "here's
exactly what you'd get," because it's a real, working report, just built on
labeled demo data for a fictional practice. That honesty is the whole pitch
at this stage: not "trust me," but "look at the actual thing."

Practical sending notes: personalize `{{practice_name}}` and `{{first_name}}`
from public sources only (their own website, a business listing) — never
from review content you haven't actually analyzed. Space the three emails
roughly 4–5 business days apart. Stop immediately on any reply, including
"not interested." Send from a real name and a real-looking personal
address, not `team@` or `noreply@`.

---

## Email 1 — Initial Outreach

**Subject:** quick question about {{practice_name}}'s reviews

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

## Email 2 — Follow-up #1 (send ~4-5 business days later)

**Subject:** re: {{practice_name}}'s reviews

Hi {{first_name}},

Following up in case this got buried — no worries if now isn't a good time.

If it's useful, I'm happy to just tell you what I'd look for on your public
review profile ({{review_profile_note}}) — takes me a few minutes, no
obligation either way.

{{sender_name}}

---

## Email 3 — Follow-up #2 (send ~4-5 business days after that; last one)

**Subject:** closing the loop on this

Hi {{first_name}},

Last note from me — here's that sample report again in case it's useful:
{{sample_report_link}}. It's the exact format your practice would get, just
built on example data so you can see it without signing up for anything.

The short version of the whole thing: a QR code that makes it easy for
patients to leave a review, and an alert the moment one needs your attention.
If neither is a priority right now, totally understand. Happy to check back
down the road, or feel free to reach out any time at {{sender_email}} if it
becomes useful.

Wishing you and the practice well either way.

{{sender_name}}

---

## LinkedIn DM (send instead of, not in addition to, the email sequence — pick one channel per practice)

Hi {{first_name}} — I build a small tool (Notabl) for dental practices that
does two things: a QR code for the front desk so patients can leave a Google
review in a couple of taps, and a plain-language alert email of what all
those reviews actually say, so they're not just piling up unread. Not
selling anything here, just curious if it'd be useful — here's a sample
report if you want to see the format: {{sample_report_link}}
