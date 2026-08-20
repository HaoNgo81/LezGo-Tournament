import { AuthError, verifyCredentialEmailToken } from "@/lib/auth";
import { getCredentialEmailRedirectTo } from "@/lib/auth/credential-redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "";

  try {
    await verifyCredentialEmailToken({
      tokenHash,
      type,
    });

    return Response.redirect(getCredentialEmailRedirectTo(request.url, "verified"), 303);
  } catch (error) {
    if (error instanceof AuthError && error.status >= 500) {
      return Response.redirect(getCredentialEmailRedirectTo(request.url, "error"), 303);
    }

    return Response.redirect(getCredentialEmailRedirectTo(request.url, "error"), 303);
  }
}
