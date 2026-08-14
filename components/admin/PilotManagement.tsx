"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PilotRow = {
  accountId: string;
  email: string;
  businessName: string;
  isPilot: boolean;
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

export function PilotToggleTable({ rows }: { rows: PilotRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(accountId: string, enabled: boolean) {
    setPending(accountId);
    try {
      await fetch("/api/admin/pilot/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, enabled }),
      });
      router.refresh();
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
          <th className="px-4 py-2 font-medium">Pilot</th>
          <th className="px-4 py-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.accountId} className="border-b border-slate-100 last:border-0">
            <td className="px-4 py-2 text-slate-700">{r.businessName}</td>
            <td className="px-4 py-2 text-slate-700">{r.email}</td>
            <td className="px-4 py-2 text-slate-700">{r.isPilot ? "Yes" : "No"}</td>
            <td className="px-4 py-2">
              <button
                onClick={() => toggle(r.accountId, !r.isPilot)}
                disabled={pending === r.accountId}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {r.isPilot ? "Revoke Pilot" : "Grant Pilot"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
