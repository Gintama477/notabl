import { notFound } from "next/navigation";
import { getBusinessBySlug, getGoogleWriteReviewUrl } from "@/lib/db/queries";
import { track } from "@/lib/analytics/track";
import { ReviewChoiceSection } from "./ReviewChoiceSection";

// Public, unauthenticated — a patient reaches this from a printed QR code
// or a link in an appointment reminder, never from being logged in. No
// session check, no auth of any kind, by design.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  return { title: business ? `Leave a Review — ${business.name}` : "Review Request" };
}

export default async function ReviewRequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();

  const googleReviewUrl = await getGoogleWriteReviewUrl(business.id);

  await track("review_request_page_viewed", { businessId: business.id });

  return (
    // Deliberately no <Header />/<Footer /> here — this page is reached by
    // a patient, not someone shopping for Notabl, and shouldn't try to
    // sell them anything. Only a small "powered by" line at the bottom.
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-900/5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{business.name}</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold leading-snug text-slate-900">
          Thanks for visiting {business.name}. How was your visit?
        </h1>

        <ReviewChoiceSection slug={business.slug ?? slug} googleReviewUrl={googleReviewUrl} />
      </div>

      <p className="mt-8 text-xs text-slate-400">Powered by Notabl</p>
    </main>
  );
}
