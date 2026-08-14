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

## The rule that matters more than any of the copy

Nothing below claims to have analyzed any specific practice's actual
reviews, because none have been. Every message talks about the *idea* —
that owners can't spot patterns reading reviews one at a time — never a
specific finding about the specific practice being contacted. Do not add a
line like "I noticed your reviews mention X" unless a real analysis
actually ran on that practice's real reviews and there's a real report to
point to. No spammy phrases ("act now," "limited time," excessive
exclamation points, fake urgency) — this is a personal, honest outreach to
one practice at a time, not a mass campaign.

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

Hi {{first_name}},

I've been looking at how dental practices keep track of what patients say
in reviews — most owners I've talked to only see them one at a time, which
makes it hard to notice when the same complaint starts showing up
repeatedly.

I built a small tool called Notabl that reads through a practice's public
reviews and sends a plain-language weekly summary — what's going well,
what's coming up more often, and what's new — without anyone having to
read every review by hand.

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

If review tracking isn't a priority right now, totally understand. Happy
to check back down the road, or feel free to reach out any time at
{{sender_email}} if it becomes useful.

Wishing you and the practice well either way.

{{sender_name}}

---

## LinkedIn / DM version (use instead of, not in addition to, the email sequence)

Hi {{first_name}} — I build a small tool (Notabl) that turns a dental
practice's patient reviews into a plain-language weekly summary, so you're
not reading them one at a time to catch patterns. Not selling anything
here, just curious if it'd be useful — here's a sample report if you want
to see the format: {{sample_report_link}}

---

## 30-second explanation (for a phone call or in-person conversation)

"Notabl reads through your practice's patient reviews and sends you a
short weekly summary — what patients keep praising, what complaints are
coming up, anything new or getting worse. Instead of reading fifty reviews
one at a time trying to spot a pattern, you get a two-minute read that
tells you what actually changed this week. It's not about your star
rating — it's about catching a problem, like patients complaining about
phone response times, while it's still three reviews instead of thirty."

## 2-sentence explanation (for an email subject line follow-up, a quick text, or when someone asks "what do you do?")

"Notabl reads through your practice's patient reviews and sends you a
plain-language weekly summary of what's going well, what's not, and what's
changing — so you catch a small problem before it becomes a pattern
without reading every review yourself."

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
cost, no obligation to continue. All I'd ask is honest feedback: whether
it's actually useful, what's confusing, and whether it's something you'd
ever pay for. I can set your dashboard up in a couple minutes whenever
you're ready."

Once someone says yes, granting access is a two-minute admin action (see
the "Pilot Access" section of `/admin`) — it creates their account, sends
them a one-click login link, and their dashboard is populated immediately
so there's nothing else for them to set up. See
`marketing/validation/tracker.csv` to log where each conversation stands.
