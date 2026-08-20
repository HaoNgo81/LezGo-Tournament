import { AuthError, createAuthCookieHeaders, loginWithCredential } from "@/lib/auth";

export const dynamic = "force-dynamic";

const genericLoginMessage = "Email/username or code is incorrect.";
const unverifiedEmailMessage = "Email is not verified.";

interface LoginBody {
  identifier?: string;
  code?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: LoginBody;

  try {
    body = await request.json() as LoginBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await loginWithCredential({
      identifier: body.identifier ?? "",
      code: body.code ?? "",
      rateLimitKey: getRateLimitKey(request, body.identifier ?? "unknown"),
    });

    return Response.json({
      ok: true,
      account: result.account,
    }, {
      headers: createAuthCookieHeaders(result.session),
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    const rawMessage = error instanceof Error ? error.message : "";
    const message = status === 429
      ? "Too many attempts. Try again later."
      : rawMessage === unverifiedEmailMessage
        ? unverifiedEmailMessage
        : genericLoginMessage;
    return Response.json({ ok: false, error: message }, { status });
  }
}

function getRateLimitKey(request: Request, identifier: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${identifier}`;
}
