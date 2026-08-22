import { AuthError, logoutOtherSupabaseSessions, readAccountFromAccessToken } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    const accessToken = await readAuthAccessCookie();
    await readAccountFromAccessToken(accessToken);
    await logoutOtherSupabaseSessions(accessToken);

    return Response.json({ ok: true, currentSessionPreserved: true }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Other sessions could not be logged out.";
    return Response.json({ ok: false, error: message }, { status });
  }
}
