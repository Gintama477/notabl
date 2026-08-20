import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { LegalPageShell } from "@/components/marketing/LegalPageShell";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <LegalPageShell title="Privacy Policy">
          <p>Last updated: placeholder — set this when finalized.</p>

          <h2>1. What We Collect</h2>
          <p>
            We collect the minimum information necessary to operate Notabl: your account email, your
            practice&apos;s business information (name, website, location), the public review profile links you
            provide, and the public review content associated with those profiles (or, in this prototype,
            demo review data — see the demo-data banner shown throughout the app). If your practice uses a
            Notabl review-request link or QR code, we collect anonymized scan and click counts, and any
            private feedback text a patient chooses to submit — never a patient&apos;s name, email, or phone
            number.
          </p>

          <h2>2. What We Do Not Collect</h2>
          <p>
            Notabl is designed to analyze public business reviews only. We do not collect or process
            private patient records, protected health information, or any patient medical history. If a
            public review happens to contain sensitive personal or medical details volunteered by its author,
            we minimize storage and display of that content beyond what is necessary for theme analysis.
          </p>

          <h2>3. How We Use It</h2>
          <ul>
            <li>To generate your dashboard and weekly reports</li>
            <li>To send you the emails you&apos;ve signed up for</li>
            <li>To process payment through our payment processor (Stripe)</li>
            <li>To improve the product (aggregated, non-identifying usage analytics)</li>
          </ul>

          <h2>4. Third-Party Services</h2>
          <p>
            We use third-party services to operate Notabl, including a hosting provider, a database
            provider, a payment processor (Stripe), an email delivery provider (Resend), and an AI provider
            (Anthropic, for review analysis) once live keys are configured. Each processes data only as
            necessary to provide their service to us.
          </p>

          <h2>5. Data Retention</h2>
          <p>[Placeholder — retention period to be defined before real customer data is processed.]</p>

          <h2>6. Your Rights</h2>
          <p>
            You may request a copy of your data or request deletion of your account and associated data by
            contacting us. [Placeholder — add jurisdiction-specific rights language, e.g. GDPR/CCPA, before
            operating in applicable regions.]
          </p>

          <h2>7. Contact</h2>
          <p>[Placeholder — privacy contact email to be added.]</p>
        </LegalPageShell>
      </main>
      <Footer />
    </>
  );
}
