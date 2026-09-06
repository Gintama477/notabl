// Pre-send validation for scraped prospect addresses.
//
// WHAT THIS DOES NOT DO: it never confirms a mailbox actually exists.
// That requires SMTP-probing the receiving server, which is what
// ZeroBounce/NeverBounce actually sell, and doing it from our own
// infrastructure would be actively harmful — most large providers are
// accept-all and won't answer truthfully, and repeated probes from one IP
// get that IP blacklisted, making real sending worse rather than better.
// If bounce rates stay high after this, a paid verifier is the right tool.
// Do not "improve" this file by adding SMTP probing.
//
// What it does catch is everything that made the first real batch bounce
// at ~20% (7-8 of 36): malformed scrapes, dead domains, form-handler
// addresses no human reads, the owner's own address, and one address
// scraped onto several different practices.

import { resolveMx } from "dns/promises";
import { hostnameOf } from "./findEmail";

export type EmailValidationStatus = "valid" | "flagged" | "invalid";

export type EmailValidation = {
  status: EmailValidationStatus;
  /** Short, human-readable; shown directly in the outreach queue. */
  reason: string;
};

/** Anything at these domains is us, not a prospect. */
const OWN_DOMAINS = ["trynotabl.com", "notabl.demo"];

/**
 * Addresses that reach a shared inbox rather than a person. These usually
 * DO deliver, so they're flagged rather than blocked — for a small
 * practice, info@ is often the only address published anywhere.
 */
const ROLE_LOCAL_PARTS = new Set([
  "info", "office", "hello", "admin", "administrator", "noreply", "no-reply",
  "donotreply", "webmaster", "postmaster", "contact", "support", "help",
  "appointments", "appointment", "scheduling", "billing", "reception",
  "frontdesk", "front-desk", "team", "mail", "email", "enquiries", "inquiries",
]);

/**
 * Form handlers and routing addresses — machine endpoints that accept mail
 * and drop it somewhere no one reads. "w2cforms@" in the first batch was
 * exactly this.
 */
const NON_HUMAN_PATTERNS = [/forms?/i, /w2c/i, /webform/i, /appt/i, /mailer/i, /bounce/i, /automated/i];

/**
 * Deliberately stricter than the RFC. The RFC permits quoted local parts
 * and leading punctuation that no dental practice has ever used, while
 * scrapers produce exactly that kind of debris — "-b.centraldentalappt@"
 * in the first batch had a leading hyphen. Rejecting valid-but-absurd
 * addresses costs one prospect; sending to malformed ones costs domain
 * reputation.
 */
function isSyntaxValid(email: string): boolean {
  if (!email || email.length > 254) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;

  if (!local || local.length > 64) return false;
  if (!/^[A-Za-z0-9._%+-]+$/.test(local)) return false;
  if (/^[._-]|[._-]$/.test(local)) return false; // no leading/trailing punctuation
  if (/\.\./.test(local)) return false;

  if (!domain || domain.length > 253) return false;
  if (!/^[A-Za-z0-9.-]+$/.test(domain)) return false;
  if (/^[.-]|[.-]$/.test(domain)) return false;
  if (/\.\./.test(domain)) return false;
  if (!domain.includes(".")) return false;

  const tld = domain.split(".").pop() ?? "";
  return /^[A-Za-z]{2,}$/.test(tld);
}

/**
 * Consumer mailbox providers. A small contractor running the business off
 * Gmail is completely normal, so a domain mismatch against one of these
 * says nothing — flagging them would bury the real signal under noise.
 */
const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com",
  "hotmail.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com",
  "mac.com", "mail.com", "protonmail.com", "proton.me", "gmx.com", "zoho.com",
  "comcast.net", "verizon.net", "sbcglobal.net", "att.net", "bellsouth.net",
  "cox.net", "charter.net", "optonline.net",
]);

/** Second-level domains that behave like a TLD, so the registrable name is one label further left. */
const MULTIPART_TLD_SECOND_LEVELS = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);

/**
 * The registrable part of a hostname, minus its suffix: "www.foo.co.uk" and
 * "mail.foo.com" both reduce to "foo". That's the piece worth comparing —
 * subdomains and TLDs differ constantly between a company's website and its
 * mail host without meaning anything.
 */
function registrableName(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) return labels[0] ?? "";
  const last = labels[labels.length - 1];
  const secondLast = labels[labels.length - 2];
  // foo.co.uk -> "foo"; foo.com -> "foo"
  if (labels.length >= 3 && MULTIPART_TLD_SECOND_LEVELS.has(secondLast) && last.length <= 3) {
    return labels[labels.length - 3];
  }
  return secondLast;
}

/** Comparable form: letters and digits only, so hyphens and spacing don't matter. */
function normalizeName(name: string): string {
  return name.replace(/[^a-z0-9]/g, "");
}

/**
 * Whether two registrable names plausibly denote the same business.
 *
 * Exact and substring matches are the easy cases. The common-prefix rule
 * exists because real variants aren't substrings of each other:
 * "jacksonscontractinghvac" vs "jacksonscontractingandhvac" differ by an
 * inserted word, so neither contains the other, yet they're obviously the
 * same company. They share a 19-character prefix, which is the signal.
 */
function looksLikeSameBusiness(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;

  let shared = 0;
  const shorter = Math.min(x.length, y.length);
  while (shared < shorter && x[shared] === y[shared]) shared++;
  // Long enough in absolute terms AND relative to the shorter name, so
  // two unrelated companies that merely start with the same few letters
  // don't get treated as one.
  return shared >= 6 && shared >= shorter * 0.6;
}

/**
 * Per-run MX cache. Twenty prospects sharing one practice-group domain
 * should cost one DNS lookup, not twenty — and a verify pass over the
 * whole queue hits the same domains repeatedly.
 */
export function createMxCache() {
  const cache = new Map<string, Promise<boolean>>();
  return {
    hasMx(domain: string): Promise<boolean> {
      const key = domain.toLowerCase();
      let hit = cache.get(key);
      if (!hit) {
        hit = resolveMx(key)
          .then((records) => records.length > 0)
          // ENOTFOUND/ENODATA both mean "can't receive mail here", which is
          // the answer we want; any other DNS failure is also treated as
          // unusable rather than optimistically letting a send through.
          .catch(() => false);
        cache.set(key, hit);
      }
      return hit;
    },
    get size() {
      return cache.size;
    },
  };
}

export type MxCache = ReturnType<typeof createMxCache>;

/**
 * blockedAddresses: every Notabl account email plus the configured
 * sender/reply-to addresses. A prospect matching one of those is either us
 * or an existing customer — cold-emailing either is a plain bug.
 *
 * duplicateAddresses: addresses attached to more than one prospect.
 * Usually a shared agency, vendor or directory address the scraper picked
 * up from several practice sites.
 */
/**
 * Returns null when there is NOTHING TO CHECK — the row has no address
 * discovered yet. That is not the same as "this address is bad", and
 * conflating the two was a bug bad enough to strand a whole batch:
 * verifying a fresh 50-row campaign before running Find emails marked all
 * 50 "invalid — No email address", the queue then refused to select
 * invalid rows for Find emails, and the only way out was manual SQL.
 *
 * A row with no address is UNCHECKED. Callers must store null, not a
 * verdict, so it stays eligible for the very operation that would fix it.
 */
export async function validateProspectEmail(
  rawEmail: string | null,
  opts: {
    mx: MxCache;
    blockedAddresses: Set<string>;
    duplicateAddresses?: Set<string>;
    /** The prospect's own website, for the domain-ownership check below. */
    website?: string | null;
  }
): Promise<EmailValidation | null> {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (!email) return null;

  if (!isSyntaxValid(email)) return { status: "invalid", reason: "Malformed address" };

  const [local, domain] = email.split("@");

  if (OWN_DOMAINS.includes(domain)) return { status: "invalid", reason: "Our own domain" };
  if (opts.blockedAddresses.has(email)) {
    return { status: "invalid", reason: "Belongs to us or an existing account" };
  }

  if (!(await opts.mx.hasMx(domain))) {
    return { status: "invalid", reason: "Domain can't receive mail (no MX)" };
  }

  if (opts.duplicateAddresses?.has(email)) {
    return { status: "flagged", reason: "Same address on multiple prospects" };
  }

  if (NON_HUMAN_PATTERNS.some((p) => p.test(local))) {
    return { status: "flagged", reason: "Looks like a form handler, not a person" };
  }

  if (ROLE_LOCAL_PARTS.has(local)) {
    return { status: "flagged", reason: `Shared inbox (${local}@), not a named person` };
  }

  // Does the address actually belong to this business?
  //
  // Syntax and MX cannot catch this: pixelspread.com is a perfectly real,
  // mail-receiving domain — it just belongs to the web designer whose
  // address was scraped out of the client's site footer. Live batch had
  // matt@pixelspread.com sitting on F & O HVAC (fomechanical.com) and a
  // billleary.net address on All Week Mechanical, both passing as valid.
  //
  // FLAGGED, never invalid: a company with two domains, or one emailing
  // from a parent company's domain, is legitimate. This means "a human
  // should glance at this", which is the correct strength of claim.
  const siteHost = opts.website ? hostnameOf(opts.website) : null;
  if (siteHost && !CONSUMER_EMAIL_DOMAINS.has(domain)) {
    const emailName = registrableName(domain);
    const siteName = registrableName(siteHost);
    if (siteName && emailName && !looksLikeSameBusiness(emailName, siteName)) {
      return {
        status: "flagged",
        reason: `Email domain (${domain}) doesn't match the business website (${siteHost.replace(/^www\./, "")}) — may belong to a third party.`,
      };
    }
  }

  return { status: "valid", reason: "Passed syntax, domain and role checks" };
}
