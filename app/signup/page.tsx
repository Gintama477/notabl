import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { SignupForm } from "./SignupForm";

// Server Component wrapper — Header is itself an async Server Component
// (checks session state), which a "use client" file can't render directly.
// All the interactive form logic lives in SignupForm.
export default function SignupPage() {
  return (
    <>
      <Header />
      <SignupForm />
      <Footer />
    </>
  );
}
