// Single source of truth for the JWT signing secret shared by session
// cookies, admin sessions, and magic login tokens (lib/auth/session.ts,
// adminSession.ts, loginToken.ts) — all three used to independently fall
// back to a hardcoded, publicly-readable-in-this-repo default string, with
// no check anywhere that blocked starting up in production without a real
// secret set. Anyone who read the fallback string here could forge a
// valid session for any account id.
//
// Same "refuse to build/boot without it" pattern already used for
// DATABASE_URL in lib/db/client.ts — checked at module-load time, gated on
// NODE_ENV so local dev (and `npm run dev`) still works with zero setup.
// `next build` always runs with NODE_ENV=production (even for a Vercel
// Preview deployment), so a real SESSION_SECRET has to be present at build
// time too, not just at runtime — matching how DATABASE_URL already works.

const FALLBACK_SECRET = "dev-only-insecure-secret-change-in-production";

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is not set in production. Generate a real random value " +
      "(e.g. `openssl rand -base64 32`) and set it in Vercel's Environment Variables — refusing to " +
      "start with the hardcoded fallback secret, which is public in this repo's source and would let " +
      "anyone forge a valid session for any account."
  );
}

export const SESSION_SECRET_KEY = new TextEncoder().encode(process.env.SESSION_SECRET || FALLBACK_SECRET);
