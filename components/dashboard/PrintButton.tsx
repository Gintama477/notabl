"use client";

// Trivial client component purely for window.print() — kept separate from
// app/dashboard/review-requests/print/page.tsx so that page can stay a
// server component (it just renders the practice's real QR/name, no
// interactivity of its own beyond this one button).
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
    >
      Print
    </button>
  );
}
