import { NextRequest, NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/auth/adminSession";

// There was previously no way to log out of the admin session at all —
// same pattern as the regular user logout (app/api/logout/route.ts), just
// clearing the admin cookie instead.
export async function POST(req: NextRequest) {
  await clearAdminSession();
  return NextResponse.redirect(new URL("/admin", req.url), { status: 303 });
}
