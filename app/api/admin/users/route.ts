import { listManagedAccountUsers } from "@/lib/admin/users";
import { AuthError, assertFreshAdminAccountFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const admin = await assertFreshAdminAccountFromCookies();
    const users = await listManagedAccountUsers(admin);

    return Response.json({ ok: true, users }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    return Response.json({ ok: false, error: getSafeAdminError(error) }, { status });
  }
}

function getSafeAdminError(error: unknown): string {
  if (error instanceof AuthError && error.status === 403) {
    return error.message;
  }

  return "Admin access was denied.";
}
