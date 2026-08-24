import { NextResponse, type NextRequest } from "next/server";

const canonicalProductionOrigin = "https://lezgotournament.vercel.app";
const legacyProductionHosts = new Set([
  "lez-go-tournament.vercel.app",
]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();

  if (!host || !legacyProductionHosts.has(host)) {
    return NextResponse.next();
  }

  const redirectUrl = new URL(request.nextUrl.pathname, canonicalProductionOrigin);
  redirectUrl.search = request.nextUrl.search;
  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js).*)",
  ],
};
