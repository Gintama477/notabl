"use client";

import { useState } from "react";
import { FEEDBACK_QUESTIONS } from "@/lib/validation/feedback";
import { LoadingDots } from "@/components/ui/LoadingDots";

type FormState = {
  clarityImmediate: string;
  mostUsefulPart: string;
  confusingPart: string;
  wouldSaveTime: string;
  wouldUseWeekly: string;
  wouldPay49: string;
  reasonablePriceIfNot: string;
  whatWouldChangeToPay: string;
};

const EMPTY: FormState = {
  clarityImmediate: "",
  mostUsefulPart: "",
  confusingPart: "",
  wouldSaveTime: "",
  wouldUseWeekly: "",
  wouldPay49: "",
  reasonablePriceIfNot: "",
  whatWouldChangeToPay: "",
};

export function FeedbackForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clarityImmediate: form.clarityImmediate || undefined,
          mostUsefulPart: form.mostUsefulPart || undefined,
          confusingPart: form.confusingPart || undefined,
          wouldSaveTime: form.wouldSaveTime || undefined,
          wouldUseWeekly: form.wouldUseWeekly || undefined,
          wouldPay49: form.wouldPay49 || undefined,
          reasonablePriceIfNot: form.reasonablePriceIfNot || undefined,
          whatWouldChangeToPay: form.whatWouldChangeToPay || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.formErrors?.[0] || "Please answer at least one question before submitting.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="flex-1 py-20">
        <div className="mx-auto max-w-lg px-6 text-center">
          <h1 className="font-serif text-2xl font-semibold text-slate-900">Thank you</h1>
          <p className="mt-3 text-slate-600">
            Your feedback was recorded. This kind of input directly shapes what gets built next.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 py-16">
      <div className="mx-auto max-w-lg px-6">
        <h1 className="font-serif text-3xl font-semibold text-slate-900">Quick feedback</h1>
        <p className="mt-2 text-slate-600">
          8 short questions, all optional — answer whichever apply. Honest answers are more useful than
          polite ones.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 rounded-lg border border-slate-200 bg-white p-6">
          <RadioField
            label={FEEDBACK_QUESTIONS.clarityImmediate}
            options={[["yes", "Yes"], ["no", "No"]]}
            value={form.clarityImmediate}
            onChange={(v) => setForm({ ...form, clarityImmediate: v })}
          />
          <TextField
            label={FEEDBACK_QUESTIONS.mostUsefulPart}
            value={form.mostUsefulPart}
            onChange={(v) => setForm({ ...form, mostUsefulPart: v })}
          />
          <TextField
            label={FEEDBACK_QUESTIONS.confusingPart}
            value={form.confusingPart}
            onChange={(v) => setForm({ ...form, confusingPart: v })}
          />
          <RadioField
            label={FEEDBACK_QUESTIONS.wouldSaveTime}
            options={[["yes", "Yes"], ["no", "No"], ["not_sure", "Not sure"]]}
            value={form.wouldSaveTime}
            onChange={(v) => setForm({ ...form, wouldSaveTime: v })}
          />
          <RadioField
            label={FEEDBACK_QUESTIONS.wouldUseWeekly}
            options={[["yes", "Yes"], ["no", "No"], ["not_sure", "Not sure"]]}
            value={form.wouldUseWeekly}
            onChange={(v) => setForm({ ...form, wouldUseWeekly: v })}
          />
          <RadioField
            label={FEEDBACK_QUESTIONS.wouldPay49}
            options={[["yes", "Yes"], ["no", "No"]]}
            value={form.wouldPay49}
            onChange={(v) => setForm({ ...form, wouldPay49: v })}
          />
          <TextField
            label={FEEDBACK_QUESTIONS.reasonablePriceIfNot}
            value={form.reasonablePriceIfNot}
            onChange={(v) => setForm({ ...form, reasonablePriceIfNot: v })}
            short
          />
          <TextField
            label={FEEDBACK_QUESTIONS.whatWouldChangeToPay}
            value={form.whatWouldChangeToPay}
            onChange={(v) => setForm({ ...form, whatWouldChangeToPay: v })}
          />

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-teal-700 px-6 py-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {submitting ? (
              <>
                Submitting…
                <LoadingDots />
              </>
            ) : (
              "Submit Feedback"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

function RadioField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-2 flex flex-wrap gap-4">
        {options.map(([val, display]) => (
          <label key={val} className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="radio" checked={value === val} onChange={() => onChange(val)} />
            {display}
          </label>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  short,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  short?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {short ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
        />
      )}
    </label>
  );
}
