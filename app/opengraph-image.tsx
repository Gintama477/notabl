import { ImageResponse } from "next/og";

// Generated at request time (not a static asset) so it stays in sync with
// the brand mark in components/marketing/Logo.tsx without duplicating an
// exported PNG anywhere. Same teal (#0f766e) and warm off-white
// (#fbfaf8, app/globals.css --background) as the rest of the site.
export const alt = "Notabl — Get more patient reviews, and know what they say";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#fbfaf8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              width: 72,
              height: 72,
              borderRadius: 18,
              backgroundColor: "#0f766e",
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 700, color: "#1c2530" }}>Notabl</div>
        </div>
        <div
          style={{
            marginTop: 56,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
            color: "#1c2530",
            maxWidth: 980,
          }}
        >
          Get more patient reviews — and know what they&apos;re actually telling you.
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: "#475569", maxWidth: 900 }}>
          A QR code that makes it easy for patients to leave a review, plus plain-language alerts
          the moment one needs your attention.
        </div>
      </div>
    ),
    { ...size }
  );
}
