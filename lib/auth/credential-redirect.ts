const productionAuthOrigin = "https://lez-go-tournament.vercel.app";

export function getCredentialEmailRedirectTo(requestUrl: string, outcome: "verified" | "error" = "verified"): string {
  const requestOrigin = new URL(requestUrl).origin;
  const origin = getCredentialRedirectOrigin(requestOrigin);
  const redirectUrl = new URL("/", origin);
  redirectUrl.searchParams.set("accountVerified", outcome);
  return redirectUrl.toString();
}

export function getCredentialRecoveryRedirectTo(requestUrl: string): string {
  const requestOrigin = new URL(requestUrl).origin;
  return new URL("/auth/reset", getCredentialRedirectOrigin(requestOrigin)).toString();
}

function getCredentialRedirectOrigin(requestOrigin: string): string {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

  if (!isProduction) {
    return requestOrigin;
  }

  const configuredOrigin = process.env.LEZGO_PUBLIC_APP_ORIGIN?.trim();
  return configuredOrigin ? new URL(configuredOrigin).origin : productionAuthOrigin;
}
