import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-slate-500">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-serif text-base font-semibold text-slate-800">Notabl</div>
            {/* A data-sourcing disclaimer, not a product pitch — so it stays
                scoped to what Notabl actually processes. Updated to cover
                feedback patients submit directly through a practice's
                review-request page, which isn't publicly available review
                data and wasn't covered by the previous wording. */}
            <p className="mt-1 max-w-sm text-slate-500">
              Notabl analyzes publicly available customer reviews, plus feedback patients submit directly
              to a practice through its own review-request page. We are not affiliated with Google, Yelp,
              or any review platform.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/legal/terms" className="hover:text-slate-800">Terms of Service</Link>
            <Link href="/legal/privacy" className="hover:text-slate-800">Privacy Policy</Link>
            <Link href="/legal/ai-disclaimer" className="hover:text-slate-800">AI Disclaimer</Link>
            <Link href="/feedback" className="hover:text-slate-800">Feedback</Link>
            <Link href="/admin" className="hover:text-slate-800">Admin</Link>
          </nav>
        </div>
        <p className="mt-8 text-xs text-slate-400">
          © {new Date().getFullYear()} Notabl. &ldquo;Notabl&rdquo; is a working product name and may change.
        </p>
      </div>
    </footer>
  );
}
