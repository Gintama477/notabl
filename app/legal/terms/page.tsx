import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { LegalPageShell } from "@/components/marketing/LegalPageShell";
import { PLANS, DEFAULT_PLAN, formatPrice } from "@/config/pricing";

export default function TermsPage() {
  const plan = PLANS[DEFAULT_PLAN];
  return (
    <>
      <Header />
      <main className="flex-1">
        <LegalPageShell title="Terms of Service">
          <p>Last updated: August 21, 2026</p>

          <h2>1. What Notabl Is</h2>
          <p>
            Notabl (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides automated analysis of publicly available customer reviews for
            dental practices (&ldquo;you&rdquo;, the &ldquo;Customer&rdquo;). Notabl analyzes review content that you provide or
            that is publicly accessible; it does not itself independently verify, endorse, or guarantee the
            accuracy of any review.
          </p>

          <h2>2. No Affiliation With Review Platforms</h2>
          <p>
            Notabl is not affiliated with, endorsed by, or officially connected to Google, Yelp, or any
            other review platform. Any references to such platforms are for identification purposes only.
          </p>

          <h2>3. Subscription and Billing</h2>
          <p>
            The {plan.name} plan is billed at {formatPrice(plan.priceMonthlyUsd)}/month following a{" "}
            {plan.trialDays}-day free trial, unless canceled before the trial ends. Payment is processed by a
            third-party payment processor (Stripe); we do not store your card details. You may cancel at any
            time through the billing portal, effective at the end of the current billing period.
          </p>

          <h2>4. No Guarantee of Business Outcomes</h2>
          <p>
            Notabl provides analysis and suggestions based on patterns in review data. We do not
            guarantee any specific business outcome, including but not limited to increased revenue, patient
            volume, or review ratings.
          </p>

          <h2>5. Not Medical Advice</h2>
          <p>
            Notabl analyzes customer feedback about business operations and patient experience only. It
            does not provide, and should not be used as a substitute for, medical or clinical advice of any
            kind.
          </p>

          <h2>6. Acceptable Use</h2>
          <p>
            You agree not to use Notabl to collect, submit, or process review data obtained in violation
            of any third-party platform&apos;s terms of service, or in violation of any applicable law. You also
            agree not to upload, paste, or otherwise submit patient medical records, treatment details,
            insurance information, or other protected health information into Notabl at any point —
            Notabl is designed to analyze public review content only (see our Privacy Policy, &ldquo;What We Do
            Not Collect&rdquo;).
          </p>

          <h2>7. Limitation of Liability</h2>
          <p>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any
            kind, whether express or implied, including implied warranties of merchantability, fitness for a
            particular purpose, or non-infringement. To the fullest extent permitted by law, Notabl and its
            operators will not be liable for any indirect, incidental, special, consequential, or punitive
            damages, or any loss of profits, revenue, data, or goodwill, arising from your use of or inability
            to use the service, even if advised of the possibility of such damages. Notabl&apos;s total liability
            for any claim arising out of or relating to these Terms or the service will not exceed the amount
            you paid to Notabl in the twelve (12) months preceding the claim. Some jurisdictions do not allow
            the exclusion or limitation of certain damages or warranties, so some of the limitations above may
            not apply to you.
          </p>

          <h2>8. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be communicated to active
            subscribers.
          </p>

          <h2>9. Contact</h2>
          <p>Questions about these Terms? Contact us at <a href="mailto:support@trynotabl.com">support@trynotabl.com</a>.</p>
        </LegalPageShell>
      </main>
      <Footer />
    </>
  );
}
