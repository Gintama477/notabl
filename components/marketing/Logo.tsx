/**
 * The Notabl mark — a teal rounded square with a white brush-flick
 * checkmark-like shape. Single source of truth for the icon so it's never
 * duplicated inline; every place that shows it (currently just the header,
 * plus app/favicon.ico as a separate rasterized copy for the browser tab)
 * should render this component instead of redrawing the SVG.
 */
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect x="4" y="4" width="72" height="72" rx="20" fill="#0f766e" />
      <path d="M18 54 L30 58 L52 30 L46 22 Z" fill="white" />
    </svg>
  );
}
