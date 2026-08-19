import { createLogoutCookieHeaders } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return Response.json({ ok: true }, {
    headers: createLogoutCookieHeaders(),
  });
}
