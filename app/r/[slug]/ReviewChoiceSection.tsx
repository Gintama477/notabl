"use client";

import { useState } from "react";
import { LoadingDots } from "@/components/ui/LoadingDots";

// Shared card styling for the two options below — deliberately identical
// (same padding, border, size) between the Google link and the private-
// feedback trigger. See the no-gating comment in this file's default
// export for why that has to stay true.
const OPTION_CARD =
  "flex flex-col items-center justify-center gap-1.5 rounded-lg border px-6 py-8 text-center shadow-sm transition-all duration-200";

// The unchosen and chosen treatments, BOTH shared between the two options
// (see the no-gating comment below — symmetry here is the whole point, so
// these live as shared constants rather than being written inline per
// option, where they could drift apart).
//
// active: variants matter more than hover: on this page specifically: it's
// reached by scanning a QR code, so effectively every real visitor is on a
// touchscreen, where hover: never fires and a tap would otherwise produce
// no visual response at all.
const OPTION_UNCHOSEN =
  "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md active:border-teal-500 active:bg-teal-50";
const OPTION_CHOSEN = "border-teal-600 bg-teal-50 shadow-md";

// hover: classes are dropped once chosen — left in, their variant
// specificity would beat OPTION_CHOSEN's flat border color and lighten a
// chosen card back toward neutral when the pointer sits on it.
function optionClasses(chosen: boolean) {
  return `${OPTION_CARD} ${chosen ? OPTION_CHOSEN : OPTION_UNCHOSEN}`;
}

export function ReviewChoiceSection({ slug, googleReviewUrl }: { slug: string; googleReviewUrl: string | null }) {
  const [showForm, setShowForm] = useState(false);
  // Set on click and never cleared — the browser is already navigating to
  // /r/[slug]/go, which records the click server-side and then redirects to
  // Google, so this page is being replaced. It exists purely so the card
  // doesn't sit there looking dead during that round-trip.
  const [navigating, setNavigating] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/r/${slug}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: rating ?? undefined, message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({
          ok: false,
          message: data?.error?.formErrors?.[0] || data?.error || "Could not submit. Please try again.",
        });
        return;
      }
      setResult({ ok: true, message: "Thank you — your feedback has been sent to the practice." });
    } catch {
      setResult({ ok: false, message: "Could not submit. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8">
      {/*
        NO REVIEW GATING, EVER. Google explicitly prohibits "discouraging or
        prohibiting negative reviews and selectively soliciting positive
        reviews" — asking a sentiment question first and routing happy
        patients to a public review / unhappy patients to a private form is
        exactly that pattern, and risks the practice's reviews being removed
        or their profile penalized. The FTC's Consumer Review Rule adds
        separate exposure for review suppression.

        Both options below MUST render together, unconditionally, for EVERY
        visitor, at genuinely equal visual weight (OPTION_CARD above is
        shared between them on purpose). Do not add a rating/sentiment
        question above this section that branches to one option or the
        other, and do not make either option larger, more colorful, or
        positioned as more "primary" than the other.

        SELECTED-AFTER-YOU-CHOOSE IS FINE; PREFERRED-BEFORE-YOU-CHOOSE IS
        NOT. Each option gets a teal "chosen" treatment once the visitor
        actually taps it (OPTION_CHOSEN above), which is feedback, not a
        nudge — it's the same treatment on whichever one they pick, and it
        only ever appears in response to their own action. What would cross
        the line is that teal becoming a DEFAULT state on one option: e.g.
        rendering "Leave a public review" teal on page load while the
        feedback option sits gray. That's a persistent visual preference for
        the public path, i.e. selective solicitation, and it's exactly what
        this comment exists to prevent. Both options must be visually
        identical until tapped — which is why OPTION_UNCHOSEN and
        OPTION_CHOSEN are shared constants applied by the same
        optionClasses() helper, rather than per-option inline styling that
        could quietly diverge in a later restyle.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        {googleReviewUrl ? (
          <a
            href={`/r/${slug}/go`}
            // Deliberately no preventDefault — the link navigates normally,
            // this only marks the card as chosen for the moment before the
            // redirect lands.
            onClick={() => setNavigating(true)}
            className={optionClasses(navigating)}
          >
            <span className={`text-base font-semibold ${navigating ? "text-teal-900" : "text-slate-900"}`}>
              Leave a public review
            </span>
            {navigating ? (
              <span className="flex items-center text-sm text-teal-800">
                Opening Google…
                <LoadingDots color="slate" />
              </span>
            ) : (
              <span className="text-sm text-slate-500">Share your experience on Google</span>
            )}
          </a>
        ) : (
          <div className={`${OPTION_CARD} border-dashed border-slate-200 bg-slate-50`}>
            <span className="text-base font-semibold text-slate-400">Leave a public review</span>
            <span className="text-sm text-slate-400">This practice hasn&apos;t finished setting up their review page yet.</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          className={optionClasses(showForm)}
        >
          <span className={`text-base font-semibold ${showForm ? "text-teal-900" : "text-slate-900"}`}>
            Send private feedback
          </span>
          <span className={`text-sm ${showForm ? "text-teal-800" : "text-slate-500"}`}>
            Tell the practice directly, just between you and them
          </span>
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Your feedback goes straight to the practice. Please don&apos;t include medical details or personal health information.
      </p>

      {showForm && result?.ok !== true && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Rating (optional)</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? null : n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  className={`text-2xl leading-none ${rating !== null && n <= rating ? "text-amber-500" : "text-slate-300"}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="feedback-message" className="mb-2 block text-sm font-medium text-slate-700">
              Your feedback
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={2000}
              rows={4}
              placeholder="What could have gone better?"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {submitting ? (
              <>
                Sending…
                <LoadingDots />
              </>
            ) : (
              "Submit Feedback"
            )}
          </button>
          {result && !result.ok && <p className="text-sm text-red-700">{result.message}</p>}
        </form>
      )}

      {result?.ok && <p className="mt-6 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">{result.message}</p>}
    </div>
  );
}
