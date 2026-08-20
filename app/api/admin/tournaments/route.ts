import { AuthError, assertFreshAdminAccountFromCookies } from "@/lib/auth";
import { listManagedTournaments } from "@/lib/admin/tournaments";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const admin = await assertFreshAdminAccountFromCookies();
    const tournaments = await listManagedTournaments(admin);

    return Response.json({ ok: true, tournaments }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ ok: false, error: "Admin access was denied." }, { status });
  }
}
