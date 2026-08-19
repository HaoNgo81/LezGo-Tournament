import { notFound } from "next/navigation";
import { PublicResultPage } from "@/components/tournament/public-result-page";
import { createPublicResultSnapshotRepository, PublicResultSnapshotError } from "@/lib/database";

export const dynamic = "force-dynamic";

export default async function ResultPage({ params }: { params: Promise<{ resultId: string }> }) {
  const { resultId } = await params;
  let snapshot;

  try {
    snapshot = await createPublicResultSnapshotRepository().read(resultId);
  } catch (error) {
    if (error instanceof PublicResultSnapshotError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  return <PublicResultPage snapshot={snapshot} />;
}
