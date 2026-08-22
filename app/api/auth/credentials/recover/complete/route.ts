import { AuthError, completeLoginCodeRecovery } from "@/lib/auth";

export const dynamic = "force-dynamic";

const invalidRecoveryLinkMessage = "The link is invalid or expired.";

interface CompleteRecoveryBody {
  tokenHash?: string;
  accessToken?: string;
  type?: string;
  code?: string;
  repeatCode?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: CompleteRecoveryBody;

  try {
    body = await request.json() as CompleteRecoveryBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await completeLoginCodeRecovery({
      tokenHash: body.tokenHash ?? "",
      accessToken: body.accessToken ?? "",
      type: body.type ?? "",
      code: body.code ?? "",
      repeatCode: body.repeatCode ?? "",
      rateLimitKey: getRateLimitKey(request, body.tokenHash ?? body.accessToken ?? "unknown"),
    });

    return Response.json({ ok: true }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const rawMessage = error instanceof Error ? error.message : "";
    const message = status === 429
      ? "Too many attempts. Try again later."
      : status < 500 && rawMessage === "Login codes do not match."
        ? rawMessage
        : status < 500 && rawMessage === "Login code is invalid."
          ? rawMessage
          : invalidRecoveryLinkMessage;

    return Response.json({ ok: false, error: message }, { status });
  }
}

function getRateLimitKey(request: Request, identifier: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${identifier}`;
}
