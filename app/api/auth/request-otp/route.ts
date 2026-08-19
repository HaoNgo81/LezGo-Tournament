import { requestEmailOtp, AuthError } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RequestOtpBody {
  email?: string;
  displayName?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: RequestOtpBody;

  try {
    body = await request.json() as RequestOtpBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    await requestEmailOtp({
      email: body.email ?? "",
      displayName: body.displayName ?? "",
      redirectTo: new URL("/settings", request.url).toString(),
    });

    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not send login email.";
    return Response.json({ ok: false, error: message }, { status });
  }
}
