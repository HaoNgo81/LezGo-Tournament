import { updateManagedAccountRole } from "@/lib/admin/users";
import { AuthError, assertAdminAccount, readAuthAccessCookie, type AccountRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RoleBody {
  role?: string;
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  let body: RoleBody;

  try {
    body = await request.json() as RoleBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const { userId } = await context.params;
    const admin = await assertAdminAccount(await readAuthAccessCookie());
    const user = await updateManagedAccountRole({
      actor: admin,
      targetUserId: userId,
      role: body.role as AccountRole,
    });

    return Response.json({ ok: true, user }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ ok: false, error: getSafeAdminError(error) }, { status });
  }
}

function getSafeAdminError(error: unknown): string {
  if (error instanceof AuthError) {
    return error.message;
  }

  return "Role could not be updated.";
}
