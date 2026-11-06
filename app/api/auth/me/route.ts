import { readAccountFromAccessToken, refreshAuthenticatedSession, AuthError } from "@/lib/auth";
import {
  createAuthCookieHeaders,
  createLogoutCookieHeaders,
  readAuthAccessCookie,
  readAuthRefreshCookie,
  readAuthAdminRememberIssuedAt,
  readAuthRememberedSessionCookie,
} from "@/lib/auth/cookies";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const isRemembered = await readAuthRememberedSessionCookie();
  const accessToken = await readAuthAccessCookie();
  const refreshToken = await readAuthRefreshCookie();

  try {
    const account = await readAccountFromAccessToken(accessToken);

    // A remembered ADMIN session is fine only with a valid signed 30-day admin remember cookie.
    if (isRemembered && account.role === "admin" && (await readAuthAdminRememberIssuedAt(account.userId)) === null) {
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
      return Response.json({
        ok: false,
        error: "Authentication was denied.",
        reauthRequired: Boolean(accessToken || refreshToken),
      }, { status });
    }
  }

  try {
    const result = await refreshAuthenticatedSession(refreshToken);

    if (result.account.role === "admin") {
      // Admins stay remembered only inside the 30 days after their sign-in; the limit never moves.
      const adminRememberIssuedAt = await readAuthAdminRememberIssuedAt(result.account.userId);

      if (adminRememberIssuedAt === null) {
        return Response.json({ ok: false, error: "Authentication was denied." }, {
          status: 401,
          headers: createLogoutCookieHeaders(),
        });
      }

      return Response.json({ ok: true, account: result.account, remembered: true }, {
        headers: createAuthCookieHeaders(result.session, {
          remember: true,
          accountRole: "admin",
          userId: result.account.userId,
          adminRememberIssuedAt,
        }),
      });
    }

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
