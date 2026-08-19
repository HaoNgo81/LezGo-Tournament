import { readAccountFromAccessToken, AuthError } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const account = await readAccountFromAccessToken(await readAuthAccessCookie());
    return Response.json({ ok: true, account }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    return Response.json({ ok: false, error: "Authentication was denied." }, { status });
  }
}
