import Link from "next/link";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex-1 py-24">
        <div className="mx-auto max-w-md px-6 text-center">
          <p className="font-serif text-5xl font-semibold text-slate-300">404</p>
          <h1 className="mt-3 font-serif text-xl font-semibold text-slate-900">Page not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            The page you&apos;re looking for doesn&apos;t exist or may have moved.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-md bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            Back to Home
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
