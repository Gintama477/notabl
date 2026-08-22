"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/LoadingDots";

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
  // How many listings to pull for this city. Held as a string so the field
  // can be cleared while typing; parsed on submit, where an empty or
  // unparseable value falls back to the server's own default of 20.
  const [limit, setLimit] = useState("20");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const parsedLimit = Number(limit);
    const limitToSend = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.trunc(parsedLimit), 100) : undefined;
    try {
      const res = await fetch("/api/admin/outreach/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // limit was the whole bug here: findProspects() and the route's
        // schema have always accepted one, but this body never sent it, so
        // every search silently used the default of 20.
        body: JSON.stringify({ city, state, category: category || undefined, limit: limitToSend }),
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
      // A search killed by the route's 60s ceiling lands here as a bare
      // network failure with no response body to quote, so say what almost
      // certainly happened instead of a generic "try again" — a large
      // limit is the usual cause and the actionable fix is a smaller one.
      setResult({
        ok: false,
        message:
          `Search failed — no response from the server${limitToSend && limitToSend > 50 ? ` (you asked for ${limitToSend})` : ""}. ` +
          "A large search can exceed the 60-second limit; try 50 or fewer, or a more specific city.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-6">
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
      <input
        type="number"
        min={1}
        max={100}
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        placeholder="How many"
        title="How many listings to find for this city (1-100)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-1"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 sm:col-span-1"
      >
        {submitting ? (
          <>
            Searching…
            <LoadingDots />
          </>
        ) : (
          "Find Prospects"
        )}
      </button>
      <p className="text-xs text-slate-400 sm:col-span-6">
        How many listings to pull for this city, 1-100 (default 20). Larger searches take longer and can time out
        past the 60-second limit — if 100 fails, try 50. Outscraper may also return fewer than you ask for if the
        city genuinely has fewer listings; that&apos;s normal, not an error.
      </p>
      {result && (
        <div className={`sm:col-span-6 text-xs ${result.ok ? "text-teal-800" : "text-red-700"}`}>
          <p>{result.message}</p>
        </div>
      )}
    </form>
  );
}

/**
 * Rewrites every still-"drafted" prospect with the current email template.
 * Needed because emailSubject/emailBody are frozen into the row when the
 * prospect is first found, so changing the copy in
 * lib/email/templates/outreachEmail.ts does nothing to what's already
 * queued — the alternative is deleting the rows and re-running a billed
 * Outscraper search just to pick up new wording.
 *
 * Confirms first, because this legitimately discards hand-edits: a body
 * customized in the queue below gets replaced by the fresh template.
 * Contact emails are left alone (looked-up data, not template output).
 */
function RedraftDraftsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function redraft() {
    if (
      !confirm(
        "Rewrite all drafted prospects with the current email template?\n\nThis replaces any hand-edited draft text (contact emails are kept). Already-sent and skipped prospects are not touched."
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/outreach/redraft", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error || "Re-draft failed.");
      } else {
        setMessage(`Re-drafted ${data.redrafted} prospect(s) with the current template.`);
        router.refresh();
      }
    } catch {
      setMessage("Re-draft failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={redraft}
        disabled={busy}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? "Re-drafting…" : "Re-draft all with current template"}
      </button>
      <span className="text-xs text-slate-400">
        Drafts keep the wording they were created with — use this after the email copy changes.
      </span>
      {message && <span className="text-xs text-slate-600">{message}</span>}
    </div>
  );
}

export function OutreachControls() {
  return (
    <>
      <FindProspectsForm />
      <RedraftDraftsButton />
    </>
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

const UNKNOWN_LOCATION = "Unknown location";

// Short form of statusLabel above, for the per-city summary line — the long
// labels ("Drafted — needs review") don't fit a header. Same status values,
// no new ones invented.
function shortStatusLabel(status: string): string {
  switch (status) {
    case "drafted":
      return "drafted";
    case "sent":
      return "sent";
    case "demo_sent":
      return "demo-sent";
    case "skipped":
      return "skipped";
    default:
      return status;
  }
}

/**
 * Splits the flat prospect list into one group per "City, ST". Searching
 * two cities used to produce one undifferentiated list of 40 rows with no
 * way to tell where a practice was without reading every line.
 *
 * Row order within a group is left exactly as it arrives (newest-first from
 * getProspects) — grouping is presentational and shouldn't reshuffle what's
 * inside a city. Groups themselves are ordered biggest-first so the cities
 * with the most queued work come first, with "Unknown location" pinned last
 * since it's a should-never-happen bucket (the type allows a null city) and
 * doesn't deserve top billing if it ever fills up.
 */
function groupProspectsByCity(rows: ProspectRow[]) {
  const byCity = new Map<string, ProspectRow[]>();
  for (const row of rows) {
    const label = row.city ? [row.city, row.state].filter(Boolean).join(", ") : UNKNOWN_LOCATION;
    const existing = byCity.get(label);
    if (existing) existing.push(row);
    else byCity.set(label, [row]);
  }

  return [...byCity.entries()]
    .map(([label, groupRows]) => {
      const statusCounts = new Map<string, number>();
      for (const r of groupRows) statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
      const summary = [
        `${groupRows.length} prospect${groupRows.length === 1 ? "" : "s"}`,
        ...[...statusCounts.entries()].map(([status, n]) => `${n} ${shortStatusLabel(status)}`),
      ].join(" · ");
      return { label, rows: groupRows, summary };
    })
    .sort((a, b) => {
      const aUnknown = a.label === UNKNOWN_LOCATION;
      const bUnknown = b.label === UNKNOWN_LOCATION;
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      return b.rows.length - a.rows.length || a.label.localeCompare(b.label);
    });
}

export function OutreachQueueTable({ rows }: { rows: ProspectRow[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No prospects yet — use the form above to find some.</p>;
  }

  const groups = groupProspectsByCity(rows);

  return (
    <div>
      {groups.map((group) => (
        <div key={group.label}>
          {/* Sticky so the city stays visible while scrolling a long group —
              the whole point is never having to wonder which city a row
              belongs to. */}
          <div className="sticky top-0 z-10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-y border-slate-200 bg-slate-50 px-4 py-2">
            <p className="text-sm font-semibold text-slate-800">{group.label}</p>
            <p className="text-xs text-slate-500">{group.summary}</p>
          </div>
          <div className="divide-y divide-slate-100">
            {group.rows.map((r) => (
              <ProspectRowItem
                key={r.id}
                row={r}
                expanded={expandedId === r.id}
                onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onChanged={() => router.refresh()}
              />
            ))}
          </div>
        </div>
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
          {/* No city here anymore — the group header directly above every
              row already says it, and repeating it on all 40 rows was
              noise. Rating leads instead: it's the signal for who's
              actually worth contacting. */}
          <p className="text-xs text-slate-500">
            {row.googleRating != null
              ? `${row.googleRating.toFixed(1)} ★ · ${row.googleReviewCount ?? 0} reviews · `
              : "No rating · "}
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
