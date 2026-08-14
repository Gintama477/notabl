import Link from "next/link";
import { TrackedCtaLink } from "./TrackedCtaLink";

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-teal-700 text-sm font-semibold text-white">
            N
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight text-slate-900">
            Notabl
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <Link href="/sample-report" className="hover:text-slate-900">
            Sample Report
          </Link>
          <Link href="/pricing" className="hover:text-slate-900">
            Pricing
          </Link>
          <Link href="/dashboard" className="hover:text-slate-900">
            Dashboard
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm text-slate-600 hover:text-slate-900 sm:inline">
            Log In
          </Link>
          <TrackedCtaLink
            href="/signup"
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Analyze My Reviews
          </TrackedCtaLink>
        </div>
      </div>
    </header>
  );
}
