"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

export type PilotRow = {
  accountId: string;
  email: string;
  businessName: string;
  isPilot: boolean;
  subscriptionStatus: string;
  // True only when there's a real, live Stripe subscription to actually
  // cancel (stripeSubscriptionId set, status not already "none"/"canceled").
  // A record stuck with a live-looking status but no stripeSubscriptionId
  // (an incomplete reconciliation) has to be fixed via /billing's "Resync
  // with Stripe" button first — the admin cancel button intentionally
  // doesn't try to work around that here.
  canCancel: boolean;
};

export function PilotInviteForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; demoLoginUrl?: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/pilot/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, email, recipientName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error?.formErrors?.[0] || "Invite failed." });
      } else {
        setResult({
          ok: true,
          message: data.reused
            ? "That email already had an account — granted pilot access to it."
            : "Pilot account created and invite sent.",
          demoLoginUrl: data.demoLoginUrl,
        });
        setBusinessName("");
        setEmail("");
        setRecipientName("");
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Invite failed. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <input
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        placeholder="Practice name"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-1"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        type="email"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-1"
      />
      <input
        value={recipientName}
        onChange={(e) => setRecipientName(e.target.value)}
        placeholder="Contact name (optional)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-1"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 sm:col-span-1"
      >
        {submitting ? "Sending…" : "Invite to Pilot"}
      </button>
      {result && (
        <div className={`sm:col-span-4 text-xs ${result.ok ? "text-teal-800" : "text-red-700"}`}>
          <p>{result.message}</p>
          {result.demoLoginUrl && (
            <p className="mt-1 break-all">
              Demo mode — no email service configured, share this link directly:{" "}
              <a href={result.demoLoginUrl} className="underline">
                {result.demoLoginUrl}
              </a>
            </p>
          )}
        </div>
      )}
    </form>
  );
}

export type ConnectableBusiness = { id: string; name: string };

/**
 * Connects a practice's real Google reviews via the temporary
 * Outscraper-backed provider (see docs/REVIEW-DATA-PROVIDERS.md) — paste in
 * a business and its Google Place ID, and their dashboard switches from
 * demo data to their own real reviews within moments. Safe to run again
 * later on the same business to pick up new reviews since the last sync.
 */
export function ConnectGoogleReviewsForm({ businesses }: { businesses: ConnectableBusiness[] }) {
  const router = useRouter();
  const [businessId, setBusinessId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/reviews/connect-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, placeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error?.formErrors?.[0] || data.error || "Connection failed." });
      } else {
        setResult({ ok: true, message: `Imported ${data.imported} new review(s), skipped ${data.skipped} already-synced.` });
        setPlaceId("");
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Connection failed. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4">
      <select
        value={businessId}
        onChange={(e) => setBusinessId(e.target.value)}
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-1"
      >
        <option value="">Select a business…</option>
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <input
        value={placeId}
        onChange={(e) => setPlaceId(e.target.value)}
        placeholder="Google Place ID (e.g. ChIJ…)"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 sm:col-span-1"
      >
        {submitting ? "Connecting…" : "Connect Google Reviews"}
      </button>
      {result && (
        <div className={`sm:col-span-4 text-xs ${result.ok ? "text-teal-800" : "text-red-700"}`}>
          <p>{result.message}</p>
        </div>
      )}
    </form>
  );
}

export function PilotToggleTable({ rows }: { rows: PilotRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ accountId: string; ok: boolean; text: string } | null>(null);

  async function toggle(accountId: string, enabled: boolean) {
    setPending(accountId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/pilot/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, enabled }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ accountId, ok: false, text: data?.error?.formErrors?.[0] || data?.error || "Pilot toggle failed." });
      } else {
        router.refresh();
      }
    } catch {
      setMessage({ accountId, ok: false, text: "Pilot toggle failed. Please try again." });
    } finally {
      setPending(null);
    }
  }

  /**
   * Cancels at the end of the current billing period (see
   * app/api/admin/subscription/cancel — it deliberately never sets status
   * to "canceled" itself), so the account keeps working right up until
   * Stripe's own customer.subscription.deleted event flips it for real.
   */
  async function cancelSubscription(accountId: string, businessName: string) {
    if (
      !confirm(
        `Cancel ${businessName}'s subscription at the end of their current billing period? They'll keep access until then, then it turns off automatically — this is not immediate.`
      )
    ) {
      return;
    }
    setPending(accountId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ accountId, ok: false, text: data.error?.formErrors?.[0] || data.error || "Cancel failed." });
      } else {
        setMessage({ accountId, ok: true, text: "Cancellation scheduled for the end of the billing period." });
        router.refresh();
      }
    } catch {
      setMessage({ accountId, ok: false, text: "Cancel failed. Please try again." });
    } finally {
      setPending(null);
    }
  }

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No accounts yet.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-2 font-medium">Practice</th>
          <th className="px-4 py-2 font-medium">Email</th>
          <th className="px-4 py-2 font-medium">Subscription</th>
          <th className="px-4 py-2 font-medium">Pilot</th>
          <th className="px-4 py-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Fragment key={r.accountId}>
            <tr className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2 text-slate-700">{r.businessName}</td>
              <td className="px-4 py-2 text-slate-700">{r.email}</td>
              <td className="px-4 py-2 text-slate-700">{r.subscriptionStatus}</td>
              <td className="px-4 py-2 text-slate-700">{r.isPilot ? "Yes" : "No"}</td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => toggle(r.accountId, !r.isPilot)}
                    disabled={pending === r.accountId}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {r.isPilot ? "Revoke Pilot" : "Grant Pilot"}
                  </button>
                  {r.canCancel && (
                    <button
                      onClick={() => cancelSubscription(r.accountId, r.businessName)}
                      disabled={pending === r.accountId}
                      className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Cancel Subscription
                    </button>
                  )}
                </div>
              </td>
            </tr>
            {message?.accountId === r.accountId && (
              <tr className="border-b border-slate-100 last:border-0">
                <td colSpan={5} className={`px-4 pb-2 text-xs ${message.ok ? "text-teal-800" : "text-red-700"}`}>
                  {message.text}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
