import { createManagedUsernameOnlyAccount, listManagedAccountUsers } from "@/lib/admin/users";
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

interface CreateUserBody {
  username?: string;
  code?: string;
  displayName?: string;
  note?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: CreateUserBody;

  try {
    body = await request.json() as CreateUserBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const admin = await assertFreshAdminAccountFromCookies();
    const user = await createManagedUsernameOnlyAccount({
      actor: admin,
      username: body.username ?? "",
      code: body.code ?? "",
      displayName: body.displayName,
      note: body.note,
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
  if (error instanceof AuthError && error.status < 500) {
    return error.message;
  }

  return "Admin access was denied.";
}
