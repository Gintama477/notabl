import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { CheckEmailContent } from "./CheckEmailContent";

// Server Component wrapper — see app/signup/page.tsx for why this split
// exists (Header is an async Server Component now).
export default function CheckEmailPage() {
  return (
    <>
      <Header />
      <CheckEmailContent />
      <Footer />
    </>
  );
}
