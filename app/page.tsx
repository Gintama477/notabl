import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";
import { LandingPageView } from "@/components/marketing/LandingPageView";
import { Hero } from "@/components/marketing/Hero";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { ReviewRequestsSection } from "@/components/marketing/ReviewRequestsSection";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { CtaSection } from "@/components/marketing/CtaSection";

export default function LandingPage() {
  return (
    <>
      <Header />
      <LandingPageView />
      <main>
        <Hero />
        <FeatureGrid />
        <ReviewRequestsSection />
        <HowItWorks />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
