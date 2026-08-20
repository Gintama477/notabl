import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { LegalPageShell } from "@/components/marketing/LegalPageShell";

export default function AIDisclaimerPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <LegalPageShell title="AI Disclaimer">
          <h2>How Notabl Uses AI</h2>
          <p>
            Notabl uses AI (an Anthropic Claude model, or a deterministic rule-based analyzer when no AI
            key is configured — see the technical documentation) to help identify themes, sentiment, and
            trends in review text, and to help write plain-language summaries of that already-computed data.
          </p>

          <h2>What the AI Does Not Do</h2>
          <ul>
            <li>It does not invent, alter, or paraphrase review content presented as a direct quote.</li>
            <li>It does not generate statistics that aren&apos;t derived from actual stored review data.</li>
            <li>It does not provide medical, clinical, or legal advice.</li>
            <li>It does not guarantee any business outcome.</li>
          </ul>

          <h2>Validation</h2>
          <p>
            Every AI output passes through a validation step before being shown to you. Any output that
            references information not present in the underlying data is rejected and the analysis is retried
            or flagged as failed rather than shown. See docs/ARCHITECTURE.md in the project repository for the
            technical description of this process.
          </p>

          <h2>Drafted Review Replies</h2>
          <p>
            The &ldquo;Draft a reply&rdquo; suggestions are exactly that — suggestions, not something Notabl
            posts on your behalf. They are deliberately worded in general terms and never confirm that a
            reviewer was a patient, reference any treatment or visit detail, or use the reviewer&apos;s name,
            even when the review itself states them, because doing so can violate HIPAA regardless of what
            the reviewer chose to disclose. You are responsible for reviewing and editing any draft before
            publishing it under your practice&apos;s name.
          </p>

          <h2>Human Judgment Still Matters</h2>
          <p>
            Notabl is a decision-support tool, not a decision-maker. Recommendations are suggestions based
            on patterns in review data — you should apply your own judgment and context about your practice
            before acting on them.
          </p>

          <h2>Demo Data</h2>
          <p>
            In this prototype, some or all review data shown may be synthetic demo data clearly labeled as
            such, used to demonstrate the product before a real, authorized review data source is connected.
          </p>
        </LegalPageShell>
      </main>
      <Footer />
    </>
  );
}
