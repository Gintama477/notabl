"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

const DEMO_LINK_COOKIE = "notabl_demo_login_link";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function CheckEmailPage() {
  const [demoLink, setDemoLink] = useState<string | null>(null);

  useEffect(() => {
    const link = readCookie(DEMO_LINK_COOKIE);
    if (!link) return;
    // One-shot: clear it immediately so it isn't sitting in the browser past
    // this single page load.
    document.cookie = `${DEMO_LINK_COOKIE}=; Max-Age=0; path=/login/check-email`;
    // Cookies don't exist during the server render, so this has to happen
    // post-mount to avoid a hydration mismatch — a legitimate "synchronize
    // with an external system" effect, not app state derived from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDemoLink(link);
  }, []);

  return (
    <>
      <Header />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-sm px-6 text-center">
          <h1 className="font-serif text-2xl font-semibold text-slate-900">Check your email</h1>
          <p className="mt-3 text-slate-600">
            If that email has a Notabl account, we&apos;ve sent a one-time login link to it.
            The link expires in 15 minutes.
          </p>

          {demoLink && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Demo mode</p>
              <p className="mt-1 text-sm text-amber-900">
                No email service is configured yet, so here&apos;s your link directly (this only
                shows up here because email sending isn&apos;t set up — see the setup docs).
              </p>
              <a
                href={demoLink}
                className="mt-3 inline-block break-all rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
              >
                Continue to Dashboard
              </a>
            </div>
          )}

          <p className="mt-6 text-sm text-slate-500">
            <Link href="/login" className="text-teal-700 underline">
              Try a different email
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
