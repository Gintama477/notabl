"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/LoadingDots";

export function RunAnalysisButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/analysis/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Analysis failed.");
      } else {
        setMessage(`Done — ${data.reviewsNewlyAnalyzed} new review(s) analyzed.`);
        router.refresh();
      }
    } catch {
      setMessage("Analysis failed. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={running}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
      >
        {running ? (
          <>
            Running analysis…
            <LoadingDots color="slate" />
          </>
        ) : (
          "Run Analysis Now"
        )}
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
