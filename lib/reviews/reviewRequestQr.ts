import QRCode from "qrcode";

// Server-side-only SVG generation for a business's review-request QR code
// (app/dashboard/review-requests). Deliberately NOT a third-party QR image
// URL/service — that would leak every practice's review-request link to
// another company and break the moment that service changes its pricing or
// goes away. `qrcode` is a plain MIT-licensed local library with no network
// call and no per-scan cost.
//
// Kept pure black/white (no brand-color tinting) on purpose: QR scan
// reliability on cheap printers and older phone cameras depends on strong
// contrast, and this code gets printed on physical cards at the front desk
// — reliability matters more than matching the palette here.
export async function generateReviewRequestQrSvg(url: string, size = 240): Promise<string> {
  return QRCode.toString(url, { type: "svg", width: size, margin: 2 });
}
