import { AuthError, changeOwnLoginCode } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

interface ChangeCodeBody {
  currentCode?: string;
  newCode?: string;
  repeatNewCode?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: ChangeCodeBody;

  try {
    body = await request.json() as ChangeCodeBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await changeOwnLoginCode({
      accessToken: await readAuthAccessCookie(),
      currentCode: body.currentCode ?? "",
      newCode: body.newCode ?? "",
      repeatNewCode: body.repeatNewCode ?? "",
      rateLimitKey: getClientRateLimitKey(request),
    });

    return Response.json({ ok: true }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Login code could not be updated.";
    return Response.json({ ok: false, error: message }, { status });
  }
}

function getClientRateLimitKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}
