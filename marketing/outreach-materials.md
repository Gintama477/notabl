# Outreach Materials — ~50 Dental Practices

## Explanation (read this before sending anything)

This is a cold-outreach sequence for reaching independent dental practices
about Notabl: one initial email, two follow-ups, and a LinkedIn DM
version, meant to be sent personally (from you, not "the team") to a
hand-built list of ~50 practices.

**The one rule that matters more than the copy itself:** none of this
claims to have analyzed any specific practice's actual reviews, because
none have been. Every message below talks about the *idea* — owners can't
spot patterns reading reviews one at a time — never a specific finding
about the specific practice being emailed. That distinction is deliberate
and load-bearing; see `marketing/personalized-outreach-system.md` for the
full reasoning and the rule for when (if ever) that changes. Do not add a
line like "I noticed your reviews mention X" unless a real analysis
actually ran on that practice's real reviews and you can point to the
report that proves it.

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

I've been looking at how dental practices keep track of what patients say
in reviews — most owners I've talked to only see them one at a time, which
makes it hard to notice when the same complaint starts showing up
repeatedly.

I built a small tool called Notabl that reads through a practice's
public reviews and sends a plain-language weekly summary — what's going
well, what's coming up more often, and what's new.

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

If review tracking isn't a priority right now, totally understand. Happy
to check back down the road, or feel free to reach out any time at
{{sender_email}} if it becomes useful.

Wishing you and the practice well either way.

{{sender_name}}

---

## LinkedIn DM (send instead of, not in addition to, the email sequence — pick one channel per practice)

Hi {{first_name}} — I build a small tool (Notabl) that turns a dental
practice's patient reviews into a plain-language weekly summary, so you're
not reading them one at a time to catch patterns. Not selling anything
here, just curious if it'd be useful — here's a sample report if you want
to see the format: {{sample_report_link}}
