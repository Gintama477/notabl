// Lightweight in-memory rate limiter — defense against basic abuse on public
// POST endpoints (signup, manual analysis run) now that the app is publicly
// live at a real URL. Not distributed: each serverless instance/region has
// its own memory, so this is a soft limit rather than a hard guarantee
// across Vercel's infrastructure. That's an acceptable trade-off for an
// early-stage app with no paid traffic yet — it stops a single scripted
// client from hammering either endpoint in a loop, which is the actual risk
// flagged in docs/CREDENTIALS-NEEDED.md (a live Anthropic key + no rate
// limit + a public signup form is a real cost-abuse vector). If real abuse
// shows up in practice, the next step is a distributed limiter (Vercel KV /
// Upstash) — this in-memory version is deliberately simple until that's
// actually needed.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Bound memory in a long-lived warm serverless instance — without this, an
// attacker cycling through many fake IPs/keys could grow this Map forever.
const MAX_BUCKETS = 5000;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey) buckets.delete(oldestKey);
    }
    return { allowed: true };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { allowed: true };
}

// Best-effort client identifier from standard proxy headers (Vercel sets
// x-forwarded-for on every request). Falls back to a shared "unknown"
// bucket rather than skipping the limit entirely if neither header is
// present, so the limiter fails closed, not open.
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
