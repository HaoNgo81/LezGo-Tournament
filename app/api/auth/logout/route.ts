import { createLogoutCookieHeaders, logoutCurrentSupabaseSession, readAuthAccessCookie, readAuthRefreshCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  await logoutCurrentSupabaseSession({
    accessToken: await readAuthAccessCookie(),
    refreshToken: await readAuthRefreshCookie(),
  }).catch(() => undefined);

  const headers = createLogoutCookieHeaders();
  headers.set("Cache-Control", "no-store, max-age=0");

  return Response.json({ ok: true }, {
    headers,
  });
}
