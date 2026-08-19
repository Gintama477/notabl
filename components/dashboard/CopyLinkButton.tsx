"use client";

import { useState } from "react";

// Tiny client component purely for navigator.clipboard — the link itself
// is always shown as plain selectable text right next to this button, so a
// clipboard failure (unsupported browser, non-HTTPS) degrades gracefully
// to "select and copy manually" rather than breaking anything.
export function CopyLinkButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently ignored — see comment above.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
