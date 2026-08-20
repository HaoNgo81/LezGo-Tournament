import { AuthError, resendCredentialVerification } from "@/lib/auth";
import { getCredentialEmailRedirectTo } from "@/lib/auth/credential-redirect";

export const dynamic = "force-dynamic";

const genericVerificationMessage = "If the email can be verified, we have sent a new verification email.";

interface ResendVerificationBody {
  email?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: ResendVerificationBody;

  try {
    body = await request.json() as ResendVerificationBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await resendCredentialVerification({
      email: body.email ?? "",
      redirectTo: getCredentialEmailRedirectTo(request.url),
      rateLimitKey: getRateLimitKey(request, body.email ?? "unknown"),
    });

    return Response.json({ ok: true, message: result.message }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;

    if (status === 429) {
      return Response.json({ ok: false, error: "Too many attempts. Try again later." }, { status });
    }

    if (status < 500) {
      return Response.json({ ok: true, message: genericVerificationMessage }, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    return Response.json({ ok: false, error: "Verification email could not be sent." }, { status });
  }
}

function getRateLimitKey(request: Request, identifier: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${identifier}`;
}
