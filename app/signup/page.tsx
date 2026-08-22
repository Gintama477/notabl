import { redirect } from "next/navigation";
import { getSessionAccountId } from "@/lib/auth/session";
import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { SignupForm } from "./SignupForm";

// Server Component wrapper — Header is itself an async Server Component
// (checks session state), which a "use client" file can't render directly.
// All the interactive form logic lives in SignupForm.
export default async function SignupPage() {
  // Someone already signed in has no business on a signup form. This is
  // the layer that actually matters: it catches a bookmark, a typed URL, a
  // stale tab, and any future CTA that forgets to check — where fixing the
  // button labels alone (see PrimaryCta) would not. Without it, an existing
  // customer submitting this form hits the "email already exists" path and
  // gets mailed a magic link instead of an account, which is confusing
  // rather than broken but reads as broken.
  const accountId = await getSessionAccountId();
  if (accountId) redirect("/dashboard");

  return (
    <>
      <Header />
      <SignupForm />
      <Footer />
    </>
  );
}
