import { readAccountFromAccessToken, refreshAuthenticatedSession, AuthError } from "@/lib/auth";
import {
  createAuthCookieHeaders,
  createLogoutCookieHeaders,
  readAuthAccessCookie,
  readAuthRefreshCookie,
  readAuthRememberCookie,
} from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const isRemembered = await readAuthRememberCookie();

  try {
    const account = await readAccountFromAccessToken(await readAuthAccessCookie());

    if (isRemembered && account.role === "admin") {
      return Response.json({ ok: false, error: "Authentication was denied." }, {
        status: 401,
        headers: createLogoutCookieHeaders(),
      });
    }

    return Response.json({ ok: true, account }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    if (!isRemembered) {
      const status = error instanceof AuthError ? error.status : 401;
      return Response.json({ ok: false, error: "Authentication was denied." }, { status });
    }
  }

  try {
    const result = await refreshAuthenticatedSession(await readAuthRefreshCookie());

    if (result.account.role !== "user") {
      return Response.json({ ok: false, error: "Authentication was denied." }, {
        status: 401,
        headers: createLogoutCookieHeaders(),
      });
    }

    return Response.json({ ok: true, account: result.account, remembered: true }, {
      headers: createAuthCookieHeaders(result.session, {
        remember: true,
        accountRole: result.account.role,
      }),
    });
  } catch {
    return Response.json({ ok: false, error: "Authentication was denied." }, {
      status: 401,
      headers: createLogoutCookieHeaders(),
    });
  }
}
