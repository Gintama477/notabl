"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: "",
    website: "",
    city: "",
    state: "",
    reviewProfileLinks: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set on a successful signup that also looks like a duplicate of an
  // existing business (see findDuplicateBusiness in lib/db/queries.ts).
  // Non-null means "show the heads-up instead of redirecting immediately" —
  // an instant router.push would navigate away before anyone could read it.
  const [duplicateNotice, setDuplicateNotice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.formErrors?.[0] || data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      // That email already had an account — no session was started (see
      // app/api/signup/route.ts). A magic link was sent instead; send the
      // browser to the same "check your email" page /login uses.
      if (data.redirectTo) {
        router.push(data.redirectTo);
        return;
      }
      // Signup already succeeded (account/business created, session
      // started) by this point either way — this only decides whether to
      // redirect immediately or pause to show the heads-up first.
      if (data.possibleDuplicate) {
        setSubmitting(false);
        setDuplicateNotice(true);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (duplicateNotice) {
    return (
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-lg px-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h1 className="font-serif text-xl font-semibold text-slate-900">One more thing</h1>
            <p className="mt-3 text-sm text-amber-900">
              A business with a similar name and location already has a Notabl account. If that&apos;s you,
              sign in instead — creating a second account for the same practice won&apos;t unlock a second
              trial.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              If this is a different, unrelated business, no action needed — your dashboard is ready.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-md bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800"
              >
                Continue to Dashboard
              </button>
              <a href="/login" className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Sign In Instead
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 py-16">
      <div className="mx-auto max-w-lg px-6">
        <h1 className="font-serif text-3xl font-semibold text-slate-900">Analyze your reviews</h1>
        <p className="mt-2 text-slate-600">
          Tell us about your practice. We&apos;ll set up your dashboard right away using{" "}
          <strong>demo review data</strong> for this prototype — live review data
          requires connecting an authorized data source, coming in a later phase.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6">
          <Field
            label="Business name"
            required
            value={form.businessName}
            onChange={(v) => setForm({ ...form, businessName: v })}
            placeholder="Brightview Family Dental"
          />
          <Field
            label="Website"
            value={form.website}
            onChange={(v) => setForm({ ...form, website: v })}
            placeholder="https://yourpractice.com"
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="Austin" />
            <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} placeholder="TX" />
          </div>
          <Field
            label="Public review profile links (optional)"
            value={form.reviewProfileLinks}
            onChange={(v) => setForm({ ...form, reviewProfileLinks: v })}
            placeholder="Google Business Profile URL, Yelp URL, etc."
          />
          <p className="text-xs text-slate-400">
            Notabl analyzes public review content only. Please don&apos;t paste or upload patient
            medical records, treatment details, insurance information, or other protected health
            information anywhere in this product.
          </p>
          <Field
            label="Email for reports"
            required
            type="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            placeholder="you@yourpractice.com"
          />

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-teal-700 px-6 py-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {submitting ? "Setting up your dashboard…" : "Analyze My Reviews"}
          </button>
          <p className="text-center text-xs text-slate-400">
            No credit card required. By continuing you agree to our{" "}
            <a href="/legal/terms" className="underline">Terms</a> and{" "}
            <a href="/legal/privacy" className="underline">Privacy Policy</a>.
          </p>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Already signed up? <a href="/login" className="text-teal-700 underline">Log in</a>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
      />
    </label>
  );
}
