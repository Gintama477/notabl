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
export async function validateProspectEmail(
  rawEmail: string | null,
  opts: {
    mx: MxCache;
    blockedAddresses: Set<string>;
    duplicateAddresses?: Set<string>;
  }
): Promise<EmailValidation> {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (!email) return { status: "invalid", reason: "No email address" };

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

  return { status: "valid", reason: "Passed syntax, domain and role checks" };
}
