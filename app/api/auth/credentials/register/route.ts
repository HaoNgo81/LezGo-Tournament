import { AuthError, createCredentialAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RegisterBody {
  displayName?: string;
  username?: string;
  email?: string;
  code?: string;
  repeatCode?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: RegisterBody;

  try {
    body = await request.json() as RegisterBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await createCredentialAccount({
      displayName: body.displayName ?? "",
      username: body.username ?? "",
      email: body.email ?? "",
      code: body.code ?? "",
      repeatCode: body.repeatCode ?? "",
      rateLimitKey: getRateLimitKey(request, body.email ?? body.username ?? "unknown"),
    });

    return Response.json({
      ok: true,
      account: result.account,
      verificationRequired: result.verificationRequired,
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Account could not be created.";
    return Response.json({ ok: false, error: message }, { status });
  }
}

function getRateLimitKey(request: Request, identifier: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded || "unknown"}:${identifier}`;
}
