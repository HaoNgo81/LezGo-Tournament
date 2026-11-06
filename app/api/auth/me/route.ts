import { readAccountFromAccessToken, refreshAuthenticatedSession, logoutCurrentSupabaseSession, AuthError } from "@/lib/auth";
import { isAdminSignInTooOld } from "@/lib/auth/admin-remember";
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

    // A remembered ADMIN session is fine only with a valid signed 30-day admin remember cookie, and no
    // admin session (remembered or not) lives on more than 30 days after its sign-in.
    if (account.role === "admin" && (isAdminSignInTooOld(accessToken) || (isRemembered && (await readAuthAdminRememberIssuedAt(account.userId)) === null))) {
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
      const headers = adminRememberIssuedAt === null || isAdminSignInTooOld(result.session.accessToken)
        ? null
        : createAuthCookieHeaders(result.session, {
          remember: true,
          accountRole: "admin",
          userId: result.account.userId,
          adminRememberIssuedAt,
        });

      // Only keep the session if the remember cookie could really be renewed; otherwise end it here and
      // at Supabase, so the refresh that just happened leaves no live session behind.
      if (!headers || !hasAdminRememberCookie(headers)) {
        await revokeQuietly(result.session.accessToken);
        return Response.json({ ok: false, error: "Authentication was denied." }, {
          status: 401,
          headers: createLogoutCookieHeaders(),
        });
      }

      return Response.json({ ok: true, account: result.account, remembered: true }, { headers });
    }

    if (result.account.role !== "user") {
      await revokeQuietly(result.session.accessToken);
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

function hasAdminRememberCookie(headers: Headers): boolean {
  return headers.getSetCookie().some((cookie) => cookie.startsWith("lezgo_auth_remember=admin.v1."));
}

async function revokeQuietly(accessToken: string): Promise<void> {
  try {
    await logoutCurrentSupabaseSession({ accessToken });
  } catch {
    // The cookies are cleared either way; the provider session then simply expires unused.
  }
}
