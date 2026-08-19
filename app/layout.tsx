import type { Metadata } from "next";
import "./globals.css";

// Deliberately using system font stacks (defined in globals.css) instead of
// next/font/google — this sandbox's network allowlist blocks
// fonts.googleapis.com, which breaks `next build` entirely when a Google
// Font is used. System fonts also load with zero external dependency/CDN
// risk and render immediately (no FOUT), which fits the "trustworthy,
// simple, fast" brief better than importing a trendy webfont anyway. Swap
// in next/font/local or next/font/google once deploying somewhere with
// unrestricted network access, if desired.

export const metadata: Metadata = {
  title: "Notabl — Get more patient reviews, and know what they say",
  description:
    "Notabl gives your dental practice a QR code that makes it easy for patients to leave a review, then reads every review that comes in and sends a plain-language weekly report on what they add up to.",
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
