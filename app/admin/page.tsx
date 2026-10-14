import { getAdminOverview, getProspects } from "@/lib/db/queries";
import { formatPrice } from "@/config/pricing";
import { hasValidAdminSession } from "@/lib/auth/adminSession";
import { BfcacheGuard } from "@/components/BfcacheGuard";
import { PilotInviteForm, PilotToggleTable, PilotRow, ConnectGoogleReviewsForm } from "@/components/admin/PilotManagement";
import { OutreachControls, OutreachQueueTable, ProspectRow } from "@/components/admin/OutreachQueue";
import { DeleteBusinessTable, DeletableBusinessRow } from "@/components/admin/DeleteBusiness";
import { RunAnalysisForBusiness } from "@/components/admin/RunAnalysisForBusiness";
import { SAMPLE_REPORT_ACCOUNT_EMAIL, getReviewCountForBusiness } from "@/lib/db/queries";
import { getAlertCandidateBusinesses } from "@/lib/alerts/reviewAlerts";

// Intentionally minimal per the development rule ("do NOT overbuild the
// admin dashboard") — raw numbers, no charts library, no pagination.
// Gated by a shared-secret key, submitted once via POST and then held as a
// short-lived signed cookie (lib/auth/adminSession.ts) rather than a
// ?key=... query param on every request — avoids the secret sitting in
// browser history, shared links, and server access logs. Still not real
// per-operator authenticated access — see docs/SECURITY-AUDIT.md for the
// documented upgrade path (a role check against Supabase Auth) before this
// handles real customer data.

// Target picture shown by default on the tiles above the operational
// sections. Private, for motivation. Live numbers: /admin?view=real
const VISION = {
  totalRevenue: "$10,829",
  mrr: "$1,078",
  paid: "22",
  trialingActive: "31",
  accounts: "61",
  businesses: "48",
  pastDue: "1",
  cancelled: "6",
  weeklyReports: "412",
  emailsLogged: "1,930",
  arpa: "$49",
  monthsLive: "10",
  visits: "8,420",
  signups: "61",
  trials: "38",
  conversionRate: "0.7%",
  checkouts: "29",
  subscriptionsStarted: "28",
  feedback: "17",
  wouldPay: "71%",
  sampleReportViews: "1,204",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; view?: string }>;
}) {
  const { error, view } = await searchParams;
  // Vision mode (default): the tiles show the target picture Emre is building
  // toward, for his own eyes only. ?view=real shows the live database numbers.
  const vision = view !== "real";
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
        </form>
      </main>
    );
  }

  const data = await getAdminOverview();
  const allProspects = await getProspects();
  // The exact set the daily cron fans out over — the same function it
  // calls, not a re-implementation of the query, so the two can never
  // drift and quietly disagree about what is being paid for.
  const syncedDaily = await getAlertCandidateBusinesses();

  const prospectRows: ProspectRow[] = allProspects.map((p) => ({
    id: p.id,
    businessName: p.businessName,
    campaign: p.campaign,
    website: p.website,
    phone: p.phone,
    city: p.city,
    state: p.state,
    googleRating: p.googleRating,
    googleReviewCount: p.googleReviewCount,
    contactEmail: p.contactEmail,
    emailValidationStatus: p.emailValidationStatus,
    emailValidationReason: p.emailValidationReason,
    emailSubject: p.emailSubject,
    emailBody: p.emailBody,
    status: p.status,
    sentAt: p.sentAt,
    skipReason: p.skipReason,
  }));

  const pilotRows: PilotRow[] = data.accounts.map((a) => {
    const business = data.businesses.find((b) => b.accountId === a.id);
    const subscription = data.subscriptions.find((s) => s.accountId === a.id);
    return {
      accountId: a.id,
      email: a.email,
      businessName: business?.name ?? "—",
      isPilot: subscription?.isPilot ?? false,
      subscriptionStatus: subscription?.status ?? "none",
      canCancel: Boolean(
        subscription?.stripeSubscriptionId && subscription.status !== "none" && subscription.status !== "canceled"
      ),
    };
  });

  // Every rule the delete route enforces is mirrored here so the panel can
  // show WHY a business is protected before anyone types its name — the
  // server (deleteBusinessAndAllData) remains the authority and re-checks
  // all of it.
  const deletableRows: DeletableBusinessRow[] = await Promise.all(
    data.businesses.map(async (b) => {
      const account = data.accounts.find((a) => a.id === b.accountId);
      const subscription = data.subscriptions.find((s) => s.accountId === b.accountId);
      const stripeSubId = subscription?.stripeSubscriptionId;
      return {
        businessId: b.id,
        name: b.name,
        email: account?.email ?? "—",
        reviewCount: await getReviewCountForBusiness(b.id),
        isSampleBusiness: account?.email === SAMPLE_REPORT_ACCOUNT_EMAIL,
        hasRealStripeSubscription: Boolean(stripeSubId && !stripeSubId.startsWith("demo_")),
      };
    })
  );

  const APPEAL_TYPE_LABELS: Record<string, string> = {
    business_already_claimed: "Google connect blocked (already claimed)",
    duplicate_business_signup: "Duplicate business at signup",
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <BfcacheGuard />
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-2xl font-semibold text-slate-900">Notabl Admin</h1>
          <form action="/api/admin/logout" method="post">
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              Log Out
            </button>
          </form>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total Revenue" value={vision ? VISION.totalRevenue : "—"} />
          <Stat label="MRR" value={vision ? VISION.mrr : formatPrice(data.mrr)} />
          <Stat label="Paid (Active)" value={vision ? VISION.paid : String(data.activePaidCount)} />
          <Stat label="Trialing/Active" value={vision ? VISION.trialingActive : String(data.activeOrTrialingCount)} />
          <Stat label="Accounts" value={vision ? VISION.accounts : String(data.accountCount)} />
          <Stat label="Businesses" value={vision ? VISION.businesses : String(data.businesses.length)} />
          <Stat label="Past Due" value={vision ? VISION.pastDue : String(data.pastDueCount)} />
          <Stat label="Cancelled" value={vision ? VISION.cancelled : String(data.cancelledCount)} />
          <Stat label="Weekly Reports Generated" value={vision ? VISION.weeklyReports : String(data.weeklyReportsGenerated)} />
          <Stat label="Emails Logged" value={vision ? VISION.emailsLogged : String(data.emailDeliveries.length)} />
          <Stat label="Avg. Revenue / Practice" value={vision ? VISION.arpa : "—"} />
          <Stat label="Months Live" value={vision ? VISION.monthsLive : "—"} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Landing Page Visits" value={vision ? VISION.visits : String(data.visits)} />
          <Stat label="Signups" value={vision ? VISION.signups : String(data.signups)} />
          <Stat label="Trials Started" value={vision ? VISION.trials : String(data.trials)} />
          <Stat label="Visit → Signup Rate" value={vision ? VISION.conversionRate : `${data.conversionRate}%`} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Checkouts Started" value={vision ? VISION.checkouts : String(data.checkoutsStarted)} />
          <Stat label="Subscriptions Started" value={vision ? VISION.subscriptionsStarted : String(data.subscriptionsStarted)} />
          <Stat label="Feedback Responses" value={vision ? VISION.feedback : String(data.feedback.length)} />
          <Stat label="Would Pay $49/mo" value={vision ? VISION.wouldPay : data.wouldPayPct !== null ? `${data.wouldPayPct}%` : "—"} />
          <Stat label="Sample Report Views" value={vision ? VISION.sampleReportViews : String(data.sampleReportViews)} />
        </div>

        <p className="mt-3 text-right text-xs text-slate-300">
          <a href={vision ? "/admin?view=real" : "/admin"} className="hover:text-slate-500">
            {vision ? "live" : "vision"}
          </a>
        </p>

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

        {/* Same "make invisible failures visible" idea as the stalled-run
            banner below: a fake test practice with 1,007 reviews was
            re-synced through Outscraper every day for weeks purely because
            no screen ever showed that it was. A count nobody can miss is
            the whole fix. */}
        <Section
          title={`Synced daily by cron: ${syncedDaily.length} ${syncedDaily.length === 1 ? "business" : "businesses"}`}
        >
          <div className="p-4">
            <p className="text-sm text-slate-600">
              Every business the daily alerts cron re-imports from Google &mdash; one billed Outscraper fetch
              each, every day, for as long as it stays on this list. A business appears here when its
              subscription is <code className="rounded bg-slate-100 px-1.5 py-0.5">active</code> or{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5">trialing</code> <em>and</em> it has a Google
              review source whose status is <code className="rounded bg-slate-100 px-1.5 py-0.5">active</code>.
              To take one off, delete the business below, cancel its subscription, or set that review
              source&apos;s status to something other than active &mdash; stored reviews and generated reports are
              untouched either way.
            </p>
            {syncedDaily.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Nothing is being synced daily &mdash; no recurring Outscraper spend.
              </p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {syncedDaily.map((c) => (
                  <li key={c.businessId}>
                    <span className="font-medium">{c.businessName}</span>{" "}
                    <span className="text-slate-500">
                      &mdash; {c.accountEmail} &mdash; last synced{" "}
                      {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleDateString() : "never"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section title="Review Analysis Status">
          <div className="p-4">
            {data.stalledRuns.length > 0 && (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-800">
                  {data.stalledRuns.length} analysis run{data.stalledRuns.length === 1 ? "" : "s"} stuck in
                  &ldquo;running&rdquo; for over 10 minutes
                </p>
                <p className="mt-1 text-xs text-red-700">
                  A run is only marked completed at the very end, so one killed mid-flight (function timeout,
                  deploy) stays &ldquo;running&rdquo; forever and makes the run history below misleading. Nothing is
                  actually in flight — the calling routes cap at 60 seconds. Running analysis again for the
                  affected business clears these automatically.
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-red-700">
                  {data.stalledRuns.map((r) => {
                    const business = data.businesses.find((b) => b.id === r.businessId);
                    return (
                      <li key={r.id}>
                        {business?.name ?? r.businessId} — started{" "}
                        {r.startedAt ? new Date(r.startedAt).toLocaleString() : "unknown"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <p className="mb-3 text-sm text-slate-600">
              Current provider version: <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.currentAnalysisVersion}</code>.
              Per business, how many real reviews are analyzed with THIS version versus stale (analyzed by an older
              provider/prompt version, or never analyzed) — this is how to confirm a provider switchover (e.g.
              setting ANTHROPIC_API_KEY and moving off the keyword-matching DemoProvider) actually finished, rather
              than guessing from the dashboard. A business isn&apos;t &ldquo;done&rdquo; until Stale reads 0; run
              analysis again (from the dashboard or via Connect Real Google Reviews below) to make progress on the
              rest.
            </p>
            {data.reviewAnalysisStatus.length === 0 ? (
              <p className="text-sm text-slate-400">No businesses with real (non-demo) reviews yet.</p>
            ) : (
              <Table
                columns={["Business", "Current version", "Stale", "Total"]}
                rows={data.reviewAnalysisStatus.map((r) => [r.businessName, String(r.current), String(r.stale), String(r.total)])}
              />
            )}
            {/* Deliberately here rather than in its own section — this is
                the table that tells you a business is stale, so the control
                that fixes it belongs directly underneath. Lists ALL
                businesses, not just those with real reviews, because the
                demo-data sample-report practice is exactly the one that
                can't be reached any other way. */}
            <RunAnalysisForBusiness businesses={data.businesses.map((b) => ({ id: b.id, name: b.name }))} />
          </div>
        </Section>

        <Section title={`Support Appeals (${data.supportAppeals.length})`}>
          {data.supportAppeals.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">
              No appeals filed — these show up when the &ldquo;already claimed&rdquo; block or the
              duplicate-business signup notice gets a &ldquo;Contact Support&rdquo; submission. Needs a human
              decision either way, nothing here is auto-resolved.
            </p>
          ) : (
            <Table
              columns={["Type", "Business", "Account", "Message", "Submitted"]}
              rows={data.supportAppeals.map((a) => {
                const account = data.accounts.find((acc) => acc.id === a.accountId);
                const business = data.businesses.find((b) => b.id === a.businessId);
                return [
                  APPEAL_TYPE_LABELS[a.appealType] || a.appealType,
                  business?.name ?? "—",
                  account?.email ?? "—",
                  a.message,
                  new Date(a.createdAt).toLocaleString(),
                ];
              })}
            />
          )}
        </Section>

        <Section title="Connect Real Google Reviews">
          <div className="p-4">
            <p className="mb-3 text-sm text-slate-600">
              Temporary stopgap while the official Google Business Profile API application is pending — see
              docs/REVIEW-DATA-PROVIDERS.md. Paste a business&apos;s Google Place ID to pull their real reviews in;
              safe to re-run later to pick up new ones.
            </p>
            <ConnectGoogleReviewsForm businesses={data.businesses.map((b) => ({ id: b.id, name: b.name }))} />
          </div>
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

        <Section title={`Outreach — Cold Email (${prospectRows.length})`}>
          <div className="p-4">
            <p className="mb-3 text-sm text-slate-600">
              Finds public dental-practice listings by city/state (name, address, phone, website, public
              star rating — never review content) and drafts a cold-outreach email for each new one.
              Nothing sends automatically — review and edit each draft below, then click Send yourself,
              one practice at a time. See docs/OUTREACH-AUTOMATION.md.
            </p>
            <OutreachControls />
          </div>
          <OutreachQueueTable rows={prospectRows} />
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

        <Section title="Danger Zone — Delete Business">
          <div className="border-b border-slate-200 bg-red-50 p-4">
            <p className="text-sm text-red-900">
              Permanently deletes a business, its account, and every review, report, analysis run, and event
              belonging to it. <strong>There is no undo</strong> — the only record afterwards is an
              automation_logs entry.
            </p>
            <p className="mt-2 text-xs text-red-800">
              Built because the daily alerts cron re-syncs and re-analyzes every active/trialing business with a
              connected Google source, so a leftover test business spends real Outscraper and Anthropic money
              every day until it&apos;s removed. The public sample-report business and any account with a real Stripe
              subscription are protected and cannot be deleted here.
            </p>
          </div>
          <DeleteBusinessTable rows={deletableRows} />
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
