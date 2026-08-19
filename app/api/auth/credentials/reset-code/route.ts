import { AuthError, updateLoginCodeWithSession } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

interface ResetCodeBody {
  code?: string;
  repeatCode?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: ResetCodeBody;

  try {
    body = await request.json() as ResetCodeBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await updateLoginCodeWithSession({
      accessToken: await readAuthAccessCookie(),
      code: body.code ?? "",
      repeatCode: body.repeatCode ?? "",
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
