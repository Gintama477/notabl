import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { FeedbackForm } from "./FeedbackForm";

// Server Component wrapper — see app/signup/page.tsx for why this split
// exists (Header is an async Server Component now).
export default function FeedbackPage() {
  return (
    <>
      <Header />
      <FeedbackForm />
      <Footer />
    </>
  );
}
