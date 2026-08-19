import { createPublicResultSnapshotRepository, PublicResultSnapshotError } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ resultId: string }> }): Promise<Response> {
  const { resultId } = await context.params;

  try {
    const snapshot = await createPublicResultSnapshotRepository().read(resultId);
    return Response.json({ ok: true, snapshot }, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const status = error instanceof PublicResultSnapshotError ? error.status : 500;
    return Response.json({ ok: false, error: status === 404 ? "Public result was not found." : "Could not read public result." }, { status });
  }
}
