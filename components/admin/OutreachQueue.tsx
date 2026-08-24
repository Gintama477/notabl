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
  // Rating/review-count filters. Empty string means "no bound", which is
  // why these are strings rather than numbers — 0 is a meaningful value
  // for the review-count fields and must not be confused with "unset".
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [minReviewCount, setMinReviewCount] = useState("");
  const [maxReviewCount, setMaxReviewCount] = useState("");
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
        body: JSON.stringify({
          city,
          state,
          category: category || undefined,
          limit: limitToSend,
          // undefined (not 0/NaN) when a field is blank, so JSON.stringify
          // drops it and the server treats that bound as unset.
          minRating: optionalNumber(minRating),
          maxRating: optionalNumber(maxRating),
          minReviewCount: optionalNumber(minReviewCount),
          maxReviewCount: optionalNumber(maxReviewCount),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: data.error?.formErrors?.[0] || data.error || "Search failed." });
      } else {
        // Reports searched AND matched when a filter narrowed things, so
        // "this city is small" never gets mistaken for "your filter was
        // too tight" — they need opposite responses.
        const filtered = typeof data.searched === "number" && data.searched !== data.found;
        const base = filtered
          ? `Searched ${data.searched} listing(s), ${data.found} matched your filters — drafted ${data.added} new, ${data.alreadyExisted} already in the queue.`
          : `Found ${data.found} listing(s) — drafted ${data.added} new, ${data.alreadyExisted} already in the queue.`;
        setResult({
          ok: true,
          message:
            data.found === 0 && data.searched > 0
              ? `${base} Try widening the rating range, or raising how many to find.`
              : base,
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
      {/* Filters. Applied after the listings come back (Outscraper can't
          filter by rating server-side), so a narrow range returns fewer
          than the limit — which the result message reports rather than
          hiding. */}
      <div className="grid gap-3 border-t border-slate-100 pt-3 sm:col-span-6 sm:grid-cols-4">
        <NumberField label="Min rating" value={minRating} onChange={setMinRating} placeholder="any" step="0.1" min={0} max={5} />
        <NumberField label="Max rating" value={maxRating} onChange={setMaxRating} placeholder="any" step="0.1" min={0} max={5} />
        <NumberField label="Min reviews" value={minReviewCount} onChange={setMinReviewCount} placeholder="any" min={0} />
        <NumberField label="Max reviews" value={maxReviewCount} onChange={setMaxReviewCount} placeholder="any" min={0} />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-6">
        <span className="text-xs text-slate-400">Preset:</span>
        <button
          type="button"
          onClick={() => {
            // The practices with the most to gain: rated well enough to be
            // a real business, poorly enough that reviews are visibly
            // hurting them, and with enough volume that a rating shift is
            // meaningful rather than one bad review.
            setMinRating("3");
            setMaxRating("4.3");
            setMinReviewCount("20");
            setMaxReviewCount("");
          }}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Most to gain (3.0–4.3★, 20+ reviews)
        </button>
        <button
          type="button"
          onClick={() => {
            setMinRating("");
            setMaxRating("");
            setMinReviewCount("");
            setMaxReviewCount("");
          }}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear filters
        </button>
      </div>
      <p className="text-xs text-slate-400 sm:col-span-6">
        Filters are applied to the listings that come back, so a narrow range returns fewer results per search —
        search a larger number, or more cities, to fill the queue. Rating targeting stays in <em>who</em> you
        email; the email copy itself never mentions their rating.
      </p>
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

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  step,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

/** "" -> undefined so a blank field means "no bound" rather than 0. */
function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
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

/** Rows that can still be acted on — anything sent, demo-sent or skipped is done. */
function isActionable(row: ProspectRow): boolean {
  return row.status !== "sent" && row.status !== "demo_sent" && row.status !== "skipped";
}

/**
 * Runs an async task over items with limited concurrency, reporting after
 * each completion.
 *
 * Used for the bulk email lookup, where each request takes ~45 seconds:
 * fully sequential, forty prospects would take half an hour, and firing
 * all forty at once would hammer Outscraper and hold forty serverless
 * functions open. Three at a time is the compromise.
 */
async function runPool<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>, onDone: () => void) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
      onDone();
    }
  });
  await Promise.all(workers);
}

export function OutreachQueueTable({ rows }: { rows: ProspectRow[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "finding" | "sending">(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No prospects yet — use the form above to find some.</p>;
  }

  const groups = groupProspectsByCity(rows);
  const actionable = rows.filter(isActionable);
  const selectedRows = actionable.filter((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function findEmailsForSelected() {
    const targets = selectedRows.filter((r) => r.website);
    if (targets.length === 0) {
      setSummary("None of the selected prospects have a website to look up an email from.");
      return;
    }
    setBusy("finding");
    setSummary(null);
    setProgress({ done: 0, total: targets.length });
    let found = 0;
    let missed = 0;
    let done = 0;

    await runPool(
      targets,
      3,
      async (row) => {
        try {
          const res = await fetch("/api/admin/outreach/find-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // save: the whole point of bulk — clicking Save on forty rows
            // by hand is the work being removed.
            body: JSON.stringify({ prospectId: row.id, save: true }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.email) found++;
          else missed++;
        } catch {
          missed++;
        }
      },
      () => setProgress({ done: ++done, total: targets.length })
    );

    setBusy(null);
    setProgress(null);
    const noSite = selectedRows.length - targets.length;
    setSummary(
      `Found ${found} email${found === 1 ? "" : "s"}, ${missed} not found${noSite > 0 ? `, ${noSite} skipped (no website)` : ""}. Review them below before sending.`
    );
    router.refresh();
  }

  async function sendSelected() {
    const sendable = selectedRows.filter((r) => r.contactEmail);
    const missingEmail = selectedRows.length - sendable.length;
    if (sendable.length === 0) {
      setSummary("None of the selected prospects have a contact email yet — find their emails first.");
      return;
    }
    if (
      !confirm(
        `Send ${sendable.length} separate email${sendable.length === 1 ? "" : "s"}?\n\n` +
          `Each prospect receives their own individual email — nobody is CC'd or BCC'd, and no recipient can see any other.\n\n` +
          `This can't be undone.`
      )
    ) {
      return;
    }

    setBusy("sending");
    setSummary(null);
    setProgress({ done: 0, total: sendable.length });
    let sent = 0;
    let failed = 0;
    let stoppedReason: string | null = null;

    // Strictly sequential, one request per prospect. Each POST calls
    // sendProspectEmail for a single id, which issues one Resend send with
    // a single `to:` — there is no code path that batches recipients. It
    // also lets the daily send cap stop the run at the exact right point
    // rather than after a burst of parallel sends has already gone out.
    for (const row of sendable) {
      try {
        const res = await fetch("/api/admin/outreach/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prospectId: row.id }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
          sent++;
        } else {
          failed++;
          const message: string = data?.error || "";
          // The daily cap is a deliberate stop, not a failure to retry
          // past — every remaining send would hit it too.
          if (message.toLowerCase().includes("cap")) {
            stoppedReason = message;
            break;
          }
        }
      } catch {
        failed++;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    setBusy(null);
    setProgress(null);
    setSelected(new Set());
    setSummary(
      [
        `Sent ${sent} individual email${sent === 1 ? "" : "s"}.`,
        failed > 0 ? `${failed} failed.` : "",
        missingEmail > 0 ? `${missingEmail} skipped (no contact email).` : "",
        stoppedReason ? `Stopped early: ${stoppedReason}` : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
    router.refresh();
  }

  return (
    <div>
      {/* Bulk bar. Sticky above the groups so the selection count and the
          actions stay reachable while scrolling a long queue. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={actionable.length > 0 && selectedRows.length === actionable.length}
            // Indeterminate isn't expressible in JSX, so a partial
            // selection just shows unchecked; the count beside it is the
            // real signal.
            onChange={(e) => setSelected(e.target.checked ? new Set(actionable.map((r) => r.id)) : new Set())}
            disabled={busy !== null}
            className="h-4 w-4"
          />
          Select all unsent ({actionable.length})
        </label>

        <span className="text-sm font-medium text-slate-900">{selectedRows.length} selected</span>

        <button
          type="button"
          onClick={findEmailsForSelected}
          disabled={busy !== null || selectedRows.length === 0}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "finding" ? "Finding emails…" : `Find emails (${selectedRows.length})`}
        </button>

        <button
          type="button"
          onClick={sendSelected}
          disabled={busy !== null || selectedRows.length === 0}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {busy === "sending" ? "Sending…" : `Send ${selectedRows.length} separate emails`}
        </button>

        {progress && (
          <span className="text-xs text-slate-500">
            {progress.done} of {progress.total}
            {busy === "finding" ? " looked up (~45s each, 3 at a time)" : " sent"}
          </span>
        )}
        {summary && <span className="text-xs text-slate-600">{summary}</span>}
        <span className="w-full text-xs text-slate-400">
          Every prospect gets their own individual email — never CC&apos;d or BCC&apos;d together. Sends stop
          automatically at the daily cap.
        </span>
      </div>

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
                // Key includes the editable values, not just the id, so a
                // row REMOUNTS when the server sends different ones.
                // ProspectRowItem seeds its inputs with useState(row.…),
                // which runs only on first mount — after router.refresh()
                // React reused the instance and the fields kept their old
                // values. That's why bulk "Find emails" saved addresses
                // correctly but left the field looking empty, and it hid
                // re-drafted subject/body text the same way.
                key={`${r.id}:${r.contactEmail ?? ""}:${r.emailSubject ?? ""}:${r.emailBody ?? ""}`}
                row={r}
                expanded={expandedId === r.id}
                onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onChanged={() => router.refresh()}
                selectable={isActionable(r)}
                selected={selected.has(r.id)}
                onSelectChange={() => toggle(r.id)}
                disabled={busy !== null}
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
  selectable,
  selected,
  onSelectChange,
  disabled,
}: {
  row: ProspectRow;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
  /** False for sent/demo-sent/skipped rows — nothing left to do to them. */
  selectable: boolean;
  selected: boolean;
  onSelectChange: () => void;
  /** True while a bulk run is in flight, so rows can't be re-selected mid-run. */
  disabled: boolean;
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
        <div className="flex items-start gap-3">
          {/* Only on rows still awaiting a send. A checkbox beside an
              already-sent prospect would imply it could be sent again. */}
          {selectable ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelectChange}
              disabled={disabled}
              aria-label={`Select ${row.businessName}`}
              className="mt-1 h-4 w-4 shrink-0"
            />
          ) : (
            <span aria-hidden className="mt-1 h-4 w-4 shrink-0" />
          )}
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
          {/* Shown on the collapsed row, not only inside the editor. After
              a bulk lookup over forty prospects, having to expand each one
              to find out whether it worked defeats the point of doing them
              in bulk — and an address is also the one thing that decides
              whether a row can be sent at all. */}
          <p className="mt-0.5 text-xs">
            {row.contactEmail ? (
              <span className="text-slate-600">{row.contactEmail}</span>
            ) : (
              <span className="text-amber-700">
                No contact email yet{row.website ? "" : " — and no website to look one up from"}
              </span>
            )}
          </p>
          {row.skipReason && row.status === "skipped" && (
            <p className="mt-0.5 text-xs text-slate-400">Reason: {row.skipReason}</p>
          )}
        </div>
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
