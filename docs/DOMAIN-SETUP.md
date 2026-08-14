# Domain Name (point 21)

No domain has been purchased on your behalf, and nothing here needs one to
work. A temporary `*.vercel.app` URL from deployment is completely fine for
early validation — showing the product to the first few dental practices,
collecting feedback, running the pilot flow — don't wait on buying a domain
before you start testing with real people. Connect a custom domain later,
whenever it's convenient; it's a low-effort step you can do at any point
after deployment without touching any code.

## What format to use

A short, easy-to-say, easy-to-spell name works best for outreach emails and
verbal mentions ("just go to notabl.com"). Avoid hyphens and numbers if you
can — they're easy to mishear or mistype. The current working product name
is "Notabl" (see the naming/trademark note in `docs/CREDENTIALS-NEEDED.md`
before committing to it long-term for a paid product).

## Is `.com` worth it over a cheaper alternative?

For a B2B SaaS product being pitched to small business owners (dental
practices, in this case) by cold email or DM, `.com` is worth the modest
premium if it's available for a reasonable price. It's the extension people
type by default and the one that reads as "a real, established company"
to someone deciding whether to trust an unfamiliar product with their
business data — exactly the skeptical-practice-owner audience this product
is for. `.io` and `.co` are common and acceptable substitutes if the
`.com` is taken or expensive, and neither will meaningfully hurt signups at
this stage. What matters much more than the extension is that the name
itself is short and easy to say out loud — optimize for that first.

Don't overspend chasing a premium/aftermarket `.com` (i.e. one already
registered and being resold for hundreds or thousands of dollars) for an
unvalidated product — a solid `.io`/`.co`/alternate name at normal
registration price is a completely reasonable choice until you know the
product has real traction.

## How to connect a domain after deployment

Once the app is deployed to Vercel and you own a domain (from any
registrar — Namecheap, Google Domains/Squarespace, Cloudflare, GoDaddy, all
work the same way here):

1. In the Vercel project, go to **Settings → Domains**.
2. Enter the domain you own and click **Add**.
3. Vercel shows you either an **A record** or a **CNAME record** to add at
   your domain registrar (exact values are shown in Vercel's UI at the
   time — they can change, so use what Vercel actually displays rather than
   values written down here).
4. Log into your domain registrar, find DNS settings, and add the record
   Vercel showed you.
5. Wait for DNS to propagate (usually a few minutes, occasionally up to a
   few hours) — Vercel's dashboard shows a checkmark once it detects the
   domain is correctly pointed and has issued an HTTPS certificate for it
   automatically, no extra step needed for HTTPS.

No code changes are needed for this step — every URL the app generates
already resolves relative to whatever domain it's actually running on (see
`docs/DEPLOYMENT.md`), so pointing a custom domain at the same deployment
just works.
