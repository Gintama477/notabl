"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type DeletableBusinessRow = {
  businessId: string;
  name: string;
  email: string;
  reviewCount: number;
  /** Owns the public /sample-report page — excluded from deletion entirely. */
  isSampleBusiness: boolean;
  /** Has a real (non-demo_) Stripe subscription id — refused server-side. */
  hasRealStripeSubscription: boolean;
};

/**
 * Per-business "delete everything" control. The server
 * (deleteBusinessAndAllData) is the authority on every rule here — this UI
 * mirrors them so an admin sees why something is blocked before clicking,
 * rather than only after.
 *
 * Requires typing the exact business name to arm the button. That's
 * deliberate friction: this is irreversible, there is no undo, and the
 * only record afterwards is an automation_logs row.
 */
function DeleteBusinessRow({ row }: { row: DeletableBusinessRow }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const blockedReason = row.isSampleBusiness
    ? "Public sample-report business — deleting it would break the live /sample-report page."
    : row.hasRealStripeSubscription
      ? "Has a real Stripe subscription. Cancel it in Stripe first."
      : null;

  const armed = !blockedReason && typed === row.name && !busy;

  async function handleDelete() {
    if (!armed) return;
    if (!confirm(`Permanently delete "${row.name}" and ALL of its data?\n\nThis cannot be undone.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/business/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: row.businessId, confirmName: typed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error?.formErrors?.[0] || data?.error || "Delete failed.");
      } else {
        const total = Object.values(data.counts as Record<string, number>).reduce((a, b) => a + b, 0);
        setMessage(`Deleted "${data.businessName}" (${data.accountEmail}) — ${total} rows removed.`);
        router.refresh();
      }
    } catch {
      setMessage("Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">{row.name}</p>
          <p className="text-xs text-slate-500">
            {row.email} · {row.reviewCount} review{row.reviewCount === 1 ? "" : "s"}
          </p>
        </div>
        {blockedReason ? (
          <p className="max-w-md text-xs text-slate-500">Protected: {blockedReason}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={`Type "${row.name}" to enable`}
              className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={handleDelete}
              disabled={!armed}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete business and all its data"}
            </button>
          </div>
        )}
      </div>
      {message && <p className="mt-2 text-xs text-slate-600">{message}</p>}
    </div>
  );
}

export function DeleteBusinessTable({ rows }: { rows: DeletableBusinessRow[] }) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No businesses.</p>;
  }
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((r) => (
        <DeleteBusinessRow key={r.businessId} row={r} />
      ))}
    </div>
  );
}
