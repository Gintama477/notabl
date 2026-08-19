// Shared, sitewide in-flight indicator — three dots pulsing in sequence
// (see the .loading-dot keyframes in app/globals.css). Meant to sit inline
// next to a button's existing loading text (e.g. "Connecting…"), not
// replace it — the text stays the primary signal, this just adds real
// motion so waiting reads as "actively working" instead of frozen/stalled.
//
// color picks a dot fill that reads correctly against the button it's on:
// "white" for the site's solid teal buttons, "slate" for plain white/
// outline buttons (e.g. RunAnalysisButton).
export function LoadingDots({ color = "white" }: { color?: "white" | "slate" }) {
  const dotColor = color === "white" ? "bg-white" : "bg-slate-500";
  return (
    <span className="ml-2 inline-flex items-center gap-1" role="status" aria-label="Loading">
      <span className={`loading-dot h-1.5 w-1.5 rounded-full ${dotColor}`} style={{ animationDelay: "0ms" }} />
      <span className={`loading-dot h-1.5 w-1.5 rounded-full ${dotColor}`} style={{ animationDelay: "150ms" }} />
      <span className={`loading-dot h-1.5 w-1.5 rounded-full ${dotColor}`} style={{ animationDelay: "300ms" }} />
    </span>
  );
}
