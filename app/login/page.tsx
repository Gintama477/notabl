import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/auth/session";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Enter a valid email address.",
  expired: "That login link is invalid or has expired. Request a new one below.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Same guard as app/signup/page.tsx, same reasoning — someone already
  // logged in has no business on a login form. Deliberately NOT applied to
  // app/login/check-email/page.tsx: that one is mid-flow, where a session
  // legitimately may not exist yet.
  const accountId = await getSessionAccountId();
  if (accountId) redirect("/dashboard");

  return (
    <>
      <Header />
      <main className="flex-1 py-16">
        <div className="mx-auto max-w-sm px-6">
          <h1 className="font-serif text-3xl font-semibold text-slate-900">Log in</h1>
          <p className="mt-2 text-slate-600">
            Enter the email you signed up with. We&apos;ll send you a one-time link — no
            password to remember.
          </p>

          <form action="/api/login" method="post" className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                name="email"
                required
                placeholder="you@yourpractice.com"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </label>

            {error && <p className="text-sm text-red-700">{ERROR_MESSAGES[error] || "Something went wrong."}</p>}

            <button
              type="submit"
              className="w-full rounded-md bg-teal-700 px-6 py-3 text-sm font-medium text-white hover:bg-teal-800"
            >
              Email Me a Login Link
            </button>
            <p className="text-center text-xs text-slate-400">
              Don&apos;t have an account? <Link href="/signup" className="underline">Sign up</Link>
            </p>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
