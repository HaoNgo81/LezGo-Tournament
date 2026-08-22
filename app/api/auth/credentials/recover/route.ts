import { AuthError, requestLoginCodeRecovery } from "@/lib/auth";
import { getCredentialRecoveryRedirectTo } from "@/lib/auth/credential-redirect";

export const dynamic = "force-dynamic";

const genericRecoveryMessage = "If the email address is registered, we have sent instructions for creating a new code.";

interface RecoverBody {
  email?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: RecoverBody;

  try {
    body = await request.json() as RecoverBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const redirectTo = getCredentialRecoveryRedirectTo(request.url);
    logRecoveryRedirectTarget(redirectTo);
    const result = await requestLoginCodeRecovery({
      email: body.email ?? "",
      redirectTo,
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
      return Response.json({ ok: true, message: genericRecoveryMessage }, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    return Response.json({ ok: false, error: "Recovery email could not be sent." }, { status });
  }
}

function getRateLimitKey(request: Request, identifier: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${identifier}`;
}

function logRecoveryRedirectTarget(redirectTo: string): void {
  const url = new URL(redirectTo);
  console.info("[auth.credentials.recover] recovery redirect target", {
    origin: url.origin,
    pathname: url.pathname,
  });
}
