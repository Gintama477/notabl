"use client";

import { useState } from "react";
import { LoadingDots } from "@/components/ui/LoadingDots";
import { CopyLinkButton } from "./CopyLinkButton";

// Generates on click, not on page load — see the cost comment on
// app/api/reviews/[id]/draft-reply/route.ts. A drafted reply is
// deliberately worded generically (no patient confirmation, no treatment
// detail, no reviewer name — see lib/ai/prompts/draftReply.ts); this
// component never lets the owner post it automatically, since Notabl has
// no Google Business Profile API access and faking a post isn't something
// to build. It only ever hands back editable text, a copy button, and a
// link to go find the review on Google.
export function DraftReplyButton({ reviewId, googleReviewsUrl }: { reviewId: string; googleReviewsUrl: string | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/draft-reply`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Could not draft a reply. Please try again.");
        return;
      }
      setDraftText(data.draftText);
    } catch {
      setError("Could not draft a reply. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleDraft}
        className="mt-2 text-xs font-medium text-teal-700 hover:text-teal-800"
      >
        Draft a reply
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      {loading ? (
        <p className="flex items-center text-xs text-slate-500">
          Drafting…
          <LoadingDots color="slate" />
        </p>
      ) : error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : (
        <>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <CopyLinkButton text={draftText} />
            {googleReviewsUrl && (
              <a
                href={googleReviewsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-teal-700 hover:text-teal-800"
              >
                Find it on Google →
              </a>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Worded generically on purpose: confirming someone was a patient is a HIPAA violation even when they&apos;ve
            identified themselves in their review — that stays true no matter what the review says. Review before
            posting; you&apos;re responsible for what gets published under your practice&apos;s name.
          </p>
        </>
      )}
    </div>
  );
}
