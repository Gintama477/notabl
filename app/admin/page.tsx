import { getAdminOverview } from "@/lib/db/queries";
import { formatPrice } from "@/config/pricing";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { PilotInviteForm, PilotToggleTable, PilotRow } from "@/components/admin/PilotManagement";

// Intentionally minimal per the development rule ("do NOT overbuild the
// admin dashboard") — raw numbers, no charts library, no pagination.
// Gated by a shared-secret key, submitted once via POST and then held as a
// short-lived signed cookie (lib/auth/adminSession.ts) rather than a
// ?key=... query param on every request — avoids the secret sitting in
// browser history, shared links, and server access logs. Still not real
// per-operator authenticated access — see docs/SECURITY-AUDIT.md for the
// documented upgrade path (a role check against Supabase Auth) before this
// handles real customer data.

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const authorized = await hasValidAdminSession();

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <form className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6" method="post" action="/api/admin/login">
          <h1 className="font-serif text-lg font-semibold text-slate-900">Admin Access</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the admin key to continue.</p>
          <input
            name="key"
            type="password"
            className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Admin key"
          />
          {error && <p className="mt-2 text-xs text-red-600">Incorrect key. Try again.</p>}
          <button className="mt-3 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Enter
          </button>
          <p className="mt-3 text-xs text-slate-400">
            Default dev key is <code>dev-admin</code>. Set ADMIN_SECRET in your environment for production.
            Session lasts 12 hours.
          </p>
        </form>
      </main>
    );
  }

  const data = await getAdminOverview();

  const pilotRows: PilotRow[] = data.accounts.map((a) => {
    const business = data.businesses.find((b) => b.accountId === a.id);
    const subscription = data.subscriptions.find((s) => s.accountId === a.id);
    return {
      accountId: a.id,
      email: a.email,
      businessName: business?.name ?? "—",
      isPilot: subscription?.isPilot ?? false,
    };
  });

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-serif text-2xl font-semibold text-slate-900">Notabl Admin</h1>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Accounts" value={String(data.accountCount)} />
          <Stat label="Businesses" value={String(data.businesses.length)} />
          <Stat label="Trialing/Active" value={String(data.activeOrTrialingCount)} />
          <Stat label="Paid (Active)" value={String(data.activePaidCount)} />
          <Stat label="Past Due" value={String(data.pastDueCount)} />
          <Stat label="Cancelled" value={String(data.cancelledCount)} />
          <Stat label="MRR" value={formatPrice(data.mrr)} />
          <Stat label="Weekly Reports Generated" value={String(data.weeklyReportsGenerated)} />
          <Stat label="Emails Logged" value={String(data.emailDeliveries.length)} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Landing Page Visits" value={String(data.visits)} />
          <Stat label="Signups" value={String(data.signups)} />
          <Stat label="Trials Started" value={String(data.trials)} />
          <Stat label="Visit → Signup Rate" value={`${data.conversionRate}%`} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Checkouts Started" value={String(data.checkoutsStarted)} />
          <Stat label="Subscriptions Started" value={String(data.subscriptionsStarted)} />
          <Stat label="Feedback Responses" value={String(data.feedback.length)} />
          <Stat label="Would Pay $49/mo" value={data.wouldPayPct !== null ? `${data.wouldPayPct}%` : "—"} />
          <Stat label="Sample Report Views" value={String(data.sampleReportViews)} />
        </div>

        <Section title="Businesses">
          <Table
            columns={["Name", "Industry", "City/State", "Created"]}
            rows={data.businesses.map((b) => [
              b.name,
              b.industry,
              [b.city, b.state].filter(Boolean).join(", ") || "—",
              new Date(b.createdAt).toLocaleDateString(),
            ])}
          />
        </Section>

        <Section title="Pilot Access">
          <div className="p-4">
            <p className="mb-3 text-sm text-slate-600">
              Grant a specific dental practice free access before they pay — one practice at a time, no
              coupon codes. Toggle off anytime.
            </p>
            <PilotInviteForm />
          </div>
          <PilotToggleTable rows={pilotRows} />
        </Section>

        <Section title="Subscriptions">
          <Table
            columns={["Account ID", "Plan", "Status", "Trial Ends"]}
            rows={data.subscriptions.map((s) => [
              s.accountId,
              s.planId,
              s.status,
              s.trialEndsAt ? new Date(s.trialEndsAt).toLocaleDateString() : "—",
            ])}
          />
        </Section>

        <Section title={`Automation Errors (${data.automationErrors.length})`}>
          {data.automationErrors.length === 0 ? (
            <p className="text-sm text-slate-400">No automation errors logged.</p>
          ) : (
            <Table
              columns={["Job", "Detail", "Time"]}
              rows={data.automationErrors.map((l) => [l.jobName, l.detail || "—", new Date(l.startedAt).toLocaleString()])}
            />
          )}
        </Section>

        <Section title="Recent Automation Log">
          <Table
            columns={["Job", "Status", "Detail", "Time"]}
            rows={data.automationLogs.map((l) => [l.jobName, l.status, l.detail || "—", new Date(l.startedAt).toLocaleString()])}
          />
        </Section>

        <Section title="Email Deliveries">
          <Table
            columns={["Recipient", "Type", "Status", "Time"]}
            rows={data.emailDeliveries.map((e) => [e.recipientEmail, e.emailType, e.status, new Date(e.createdAt).toLocaleString()])}
          />
        </Section>

        <Section title={`Feedback (${data.feedback.length})`}>
          {data.feedback.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">No feedback submitted yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.feedback.map((f) => (
                <div key={f.id} className="p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{new Date(f.createdAt).toLocaleString()}</span>
                    {f.clarityImmediate && <span>Immediately clear: {f.clarityImmediate}</span>}
                    {f.wouldSaveTime && <span>Would save time: {f.wouldSaveTime}</span>}
                    {f.wouldUseWeekly && <span>Would use weekly: {f.wouldUseWeekly}</span>}
                    {f.wouldPay49 && <span>Would pay $49/mo: {f.wouldPay49}</span>}
                  </div>
                  {f.mostUsefulPart && (
                    <p className="mt-1 text-slate-700">
                      <span className="font-medium">Most useful:</span> {f.mostUsefulPart}
                    </p>
                  )}
                  {f.confusingPart && (
                    <p className="mt-1 text-slate-700">
                      <span className="font-medium">Confusing:</span> {f.confusingPart}
                    </p>
                  )}
                  {f.reasonablePriceIfNot && (
                    <p className="mt-1 text-slate-700">
                      <span className="font-medium">Reasonable price if not $49:</span> {f.reasonablePriceIfNot}
                    </p>
                  )}
                  {f.whatWouldChangeToPay && (
                    <p className="mt-1 text-slate-700">
                      <span className="font-medium">What would need to change:</span> {f.whatWouldChangeToPay}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-serif text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h2 className="font-serif text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">{children}</div>
    </div>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No data yet.</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          {columns.map((c) => (
            <th key={c} className="px-4 py-2 font-medium">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0">
            {row.map((cell, j) => (
              <td key={j} className="max-w-xs truncate px-4 py-2 text-slate-700">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
