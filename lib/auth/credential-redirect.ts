const productionAuthOrigin = "https://lezgotournament.vercel.app";

export function getCredentialEmailRedirectTo(requestUrl: string, outcome: "verified" | "error" = "verified"): string {
  const requestOrigin = new URL(requestUrl).origin;
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const origin = isProduction ? productionAuthOrigin : requestOrigin;
  const redirectUrl = new URL("/", origin);
  redirectUrl.searchParams.set("accountVerified", outcome);
  return redirectUrl.toString();
}

export function getCredentialRecoveryRedirectTo(requestUrl: string): string {
  const requestOrigin = new URL(requestUrl).origin;
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  return new URL("/auth/reset", isProduction ? productionAuthOrigin : requestOrigin).toString();
}
