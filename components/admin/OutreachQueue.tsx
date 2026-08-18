"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ProspectRow = {
  id: string;
  businessName: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  contactEmail: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  status: string;
  sentAt: string | null;
  skipReason: string | null;
};

/**
 * "Find Prospects" form — hits /api/admin/outreach/find, which only ever
 * drafts rows (see lib/db/queries.ts's findAndDraftProspects). Nothing is
 * sent from here.
 */
export function FindProspectsForm() {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/outreach/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, state, category: category || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error?.formErrors?.[0] || data.error || "Search failed." });
      } else {
        setResult({
          ok: true,
          message: `Found ${data.found} listing(s) — drafted ${data.added} new, ${data.alreadyExisted} already in the queue.`,
        });
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Search failed. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5">
      <input
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="City"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-1"
      />
      <input
        value={state}
        onChange={(e) => setState(e.target.value)}
        placeholder="State (e.g. MA)"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-1"
      />
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Category (default: Dentist)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 sm:col-span-1"
      >
        {submitting ? "Searching…" : "Find Prospects"}
      </button>
      {result && (
        <div className={`sm:col-span-5 text-xs ${result.ok ? "text-teal-800" : "text-red-700"}`}>
          <p>{result.message}</p>
        </div>
      )}
    </form>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "drafted":
      return "Drafted — needs review";
    case "sent":
      return "Sent";
    case "demo_sent":
      return "Marked sent (demo mode — Resend not configured, nothing actually emailed)";
    case "skipped":
      return "Skipped";
    default:
      return status;
  }
}

export function OutreachQueueTable({ rows }: { rows: ProspectRow[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No prospects yet — use the form above to find some.</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {rows.map((r) => (
        <ProspectRowItem
          key={r.id}
          row={r}
          expanded={expandedId === r.id}
          onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
          onChanged={() => router.refresh()}
        />
      ))}
    </div>
  );
}

function ProspectRowItem({
  row,
  expanded,
  onToggle,
  onChanged,
}: {
  row: ProspectRow;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [contactEmail, setContactEmail] = useState(row.contactEmail ?? "");
  const [subject, setSubject] = useState(row.emailSubject ?? "");
  const [body, setBody] = useState(row.emailBody ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [findingEmail, setFindingEmail] = useState(false);
  const [emailLookupMessage, setEmailLookupMessage] = useState<string | null>(null);

  const isFinal = row.status === "sent" || row.status === "demo_sent" || row.status === "skipped";

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/outreach/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: row.id, contactEmail, emailSubject: subject, emailBody: body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error?.formErrors?.[0] || data.error || "Save failed.");
      } else {
        setMessage("Draft saved.");
        onChanged();
      }
    } catch {
      setMessage("Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!confirm(`Send this email to ${contactEmail || "(no contact email set)"}? This can't be undone.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      // Save whatever's currently in the editor first, so Send always goes
      // out with the admin's latest edits, not a stale saved draft. If this
      // fails, stop here rather than silently sending whatever was last
      // saved (which could be an outdated email address or body).
      const saveRes = await fetch("/api/admin/outreach/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: row.id, contactEmail, emailSubject: subject, emailBody: body }),
      });
      if (!saveRes.ok) {
        const saveData = await saveRes.json().catch(() => null);
        setMessage(saveData?.error?.formErrors?.[0] || saveData?.error || "Could not save your edits — send cancelled.");
        return;
      }
      const res = await fetch("/api/admin/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: row.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Send failed.");
      } else {
        setMessage(
          data.demo
            ? "Logged (demo mode — Resend isn't configured yet, so nothing was actually emailed)."
            : "Sent."
        );
        onChanged();
      }
    } catch {
      setMessage("Send failed.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Looks up an email for this one prospect's website via
   * /api/admin/outreach/find-email — a deliberate per-click action, never
   * run automatically (see that route's doc comment for why). Only fills
   * the field on a hit; a miss or an error leaves whatever's already typed
   * there untouched and just reports what happened.
   */
  async function findEmail() {
    setFindingEmail(true);
    setEmailLookupMessage(null);
    try {
      const res = await fetch("/api/admin/outreach/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: row.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailLookupMessage(data.error?.formErrors?.[0] || data.error || "Email lookup failed.");
      } else if (data.email) {
        setContactEmail(data.email);
        setEmailLookupMessage(
          data.totalFound > 1 ? `Found: ${data.email} (${data.totalFound} email(s) found total)` : `Found: ${data.email}`
        );
      } else {
        setEmailLookupMessage("No email found for this domain.");
      }
    } catch {
      setEmailLookupMessage("Email lookup failed.");
    } finally {
      setFindingEmail(false);
    }
  }

  async function skip() {
    const reason = prompt("Reason for skipping (optional):") || "";
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/outreach/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: row.id, reason }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error?.formErrors?.[0] || data?.error || "Skip failed.");
      } else {
        onChanged();
      }
    } catch {
      setMessage("Skip failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">{row.businessName}</p>
          <p className="text-xs text-slate-500">
            {[row.city, row.state].filter(Boolean).join(", ") || "—"}
            {row.googleRating != null && ` · ${row.googleRating}★ (${row.googleReviewCount ?? 0} reviews)`}
            {" · "}
            {statusLabel(row.status)}
          </p>
          {row.skipReason && row.status === "skipped" && (
            <p className="mt-0.5 text-xs text-slate-400">Reason: {row.skipReason}</p>
          )}
        </div>
        {!isFinal && (
          <button
            onClick={onToggle}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {expanded ? "Close" : "Review"}
          </button>
        )}
      </div>

      {expanded && !isFinal && (
        <div className="mt-3 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex gap-2">
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Contact email (required to send)"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={findEmail}
              disabled={busy || findingEmail || !row.website}
              title={row.website ? "Look up an email for this prospect's website domain" : "This prospect has no website on file"}
              className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {findingEmail ? "Looking up… (~45s)" : "Find Email"}
            </button>
          </div>
          {emailLookupMessage && <p className="text-xs text-slate-500">{emailLookupMessage}</p>}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={busy || findingEmail}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Save Draft
            </button>
            <button
              onClick={send}
              disabled={busy || findingEmail || !contactEmail}
              className="rounded-md bg-teal-700 px-3 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60"
            >
              Send
            </button>
            <button
              onClick={skip}
              disabled={busy || findingEmail}
              className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Skip
            </button>
          </div>
          {message && <p className="text-xs text-slate-600">{message}</p>}
        </div>
      )}
    </div>
  );
}
