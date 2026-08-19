// Pure slug-generation logic for a business's public review-request page
// (app/r/[slug]) — DB-uniqueness handling (checking for a collision and
// appending a random suffix) lives in lib/db/queries.ts's
// generateUniqueBusinessSlug, the one place with a database handle to check
// against. Kept separate so the slug shape itself is easy to unit-reason
// about and reuse (e.g. from the one-off backfill script) without pulling
// in the db client.
const MAX_BASE_LENGTH = 40;

// Matches combining diacritical marks (U+0300-U+036F) left behind after
// NFKD normalization splits an accented character into its base letter +
// mark — e.g. "Café".normalize("NFKD") becomes "Café", and this strips
// the trailing ́ so the slug ends up as plain "cafe".
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugifyBusinessName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/g, ""); // slice() can leave a trailing hyphen mid-word
  return base || "practice";
}

// Short, unambiguous random suffix (excludes 0/O/1/I, easy to read off a
// printed QR card if anyone ever needs to type the link by hand) appended
// only on a slug collision — two businesses named the same thing.
const SUFFIX_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

export function randomSlugSuffix(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return out;
}
