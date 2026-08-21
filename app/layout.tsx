import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/siteUrl";
import "./globals.css";

// Deliberately using system font stacks (defined in globals.css) instead of
// next/font/google — this sandbox's network allowlist blocks
// fonts.googleapis.com, which breaks `next build` entirely when a Google
// Font is used. System fonts also load with zero external dependency/CDN
// risk and render immediately (no FOUT), which fits the "trustworthy,
// simple, fast" brief better than importing a trendy webfont anyway. Swap
// in next/font/local or next/font/google once deploying somewhere with
// unrestricted network access, if desired.

const title = "Notabl — Get more patient reviews, and know what they say";
const description =
  "Notabl gives your dental practice a QR code that makes it easy for patients to leave a review, then reads every review that comes in and emails you a plain-language alert the moment one needs your attention.";

export const metadata: Metadata = {
  // Required for opengraph-image.tsx's relative output, and for the
  // og:url/canonical below, to resolve to the real domain instead of
  // whatever origin a preview deployment happened to be built from.
  metadataBase: new URL(getSiteUrl()),
  title,
  description,
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Notabl",
    type: "website",
    // Image itself comes from app/opengraph-image.tsx — Next.js wires it
    // up automatically, no need to list it here.
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)] font-sans">
        {children}
      </body>
    </html>
  );
}
