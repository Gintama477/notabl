"use client";

import { useState } from "react";

/**
 * Shared "Contact Support" flow for the two "someone else may already have
 * this business" situations — a blocked self-serve Google connect
 * (components/dashboard/ConnectReviewsCard.tsx) and a duplicate-business
 * notice at signup (components/dashboard/DuplicateBusinessNotice.tsx).
 * Starts as a single button; clicking it reveals a text box so this never
 * reads as a general-purpose contact form sitting on the dashboard.
 * Submits to /api/support/appeal, which just files it for a human to
 * review in /admin — nothing here is auto-resolved.
 */
export function AppealForm({ appealType }: { appealType: "business_already_claimed" | "duplicate_business_signup" }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (result?.ok) {
    return <p className="text-sm font-medium text-teal-800">{result.message}</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Contact Support
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/support/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealType, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error?.formErrors?.[0] || data.error || "Could not submit. Please try again." });
        return;
      }
      setResult({ ok: true, message: "Thanks — we've received your message and will follow up by email." });
    } catch {
      setResult({ ok: false, message: "Could not submit. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        rows={4}
        placeholder="Describe your situation — e.g. you recently took over this practice, or believe someone else connected it without authorization…"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Submit"}
      </button>
      {result && !result.ok && <p className="text-sm text-red-700">{result.message}</p>}
    </form>
  );
}
