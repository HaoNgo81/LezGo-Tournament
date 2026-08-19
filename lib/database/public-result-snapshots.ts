import type { LiveTournamentState } from "../live-scoring";
import { createPublicResultSnapshot, generateResultId, type PublicResultSnapshot } from "../results-sharing/public-result-snapshot";
import { validateResultId } from "../results-sharing/result-url";
import { createSupabaseRestClient, SupabaseRestClientError, type SupabaseRestClient } from "../supabase/rest-client";

export class PublicResultSnapshotError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "PublicResultSnapshotError";
    this.status = status;
  }
}

interface PublicResultSnapshotRow {
  id: string;
  tournament_id: string;
  kind: "standard";
  tournament_name: string;
  format: string;
  completed_at?: string | null;
  participant_count: number;
  snapshot: PublicResultSnapshot;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface PublicResultSnapshotRepository {
  publishStandard(input: { tournamentId: string; state: LiveTournamentState }): Promise<PublicResultSnapshot>;
  read(resultId: string): Promise<PublicResultSnapshot>;
}

export function createPublicResultSnapshotRepository(client: SupabaseRestClient = createSupabaseRestClient()): PublicResultSnapshotRepository {
  return {
    async publishStandard(input) {
      validateUuid(input.tournamentId, "tournamentId");

      const existing = await findByTournamentId(client, input.tournamentId);
      const resultId = existing?.id ?? generateResultId();
      const now = new Date().toISOString();
      const snapshot = createPublicResultSnapshot({
        resultId,
        tournamentId: input.tournamentId,
        state: input.state,
        createdAt: existing?.created_at,
        updatedAt: now,
      });
      const row = toDatabaseRow(snapshot, now);

      try {
        if (existing) {
          await client.update<PublicResultSnapshotRow>("public_result_snapshots", `id=eq.${encodeURIComponent(existing.id)}`, {
            tournament_name: row.tournament_name,
            format: row.format,
            completed_at: row.completed_at,
            participant_count: row.participant_count,
            snapshot: row.snapshot,
            published_at: row.published_at,
          });
        } else {
          await client.insert<PublicResultSnapshotRow>("public_result_snapshots", { ...row });
        }

        return snapshot;
      } catch (error) {
        throw toPublicResultSnapshotError("Could not publish public result snapshot.", error);
      }
    },
    async read(resultId) {
      try {
        validateResultId(resultId);
        const [row] = await client.select<PublicResultSnapshotRow>(
          "public_result_snapshots",
          `id=eq.${encodeURIComponent(resultId)}&published_at=not.is.null&select=id,snapshot`,
        );

        if (!row) {
          throw new PublicResultSnapshotError("Public result was not found.", 404);
        }

        return row.snapshot;
      } catch (error) {
        throw toPublicResultSnapshotError("Could not read public result snapshot.", error);
      }
    },
  };
}

function toDatabaseRow(snapshot: PublicResultSnapshot, publishedAt: string): PublicResultSnapshotRow {
  return {
    id: snapshot.resultId,
    tournament_id: snapshot.tournamentId,
    kind: snapshot.kind,
    tournament_name: snapshot.tournamentName,
    format: snapshot.format,
    completed_at: snapshot.completedAt ?? null,
    participant_count: snapshot.participantCount,
    snapshot,
    published_at: publishedAt,
    created_at: snapshot.createdAt,
    updated_at: snapshot.updatedAt,
  };
}

async function findByTournamentId(client: SupabaseRestClient, tournamentId: string): Promise<PublicResultSnapshotRow | null> {
  try {
    const [row] = await client.select<PublicResultSnapshotRow>(
      "public_result_snapshots",
      `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=id,created_at`,
    );
    return row ?? null;
  } catch (error) {
    throw toPublicResultSnapshotError("Could not inspect public result snapshot.", error);
  }
}

function toPublicResultSnapshotError(message: string, error: unknown): PublicResultSnapshotError {
  if (error instanceof PublicResultSnapshotError) {
    return error;
  }

  if (error instanceof Error && error.message === "Result ID is invalid.") {
    return new PublicResultSnapshotError("Public result was not found.", 404);
  }

  if (error instanceof SupabaseRestClientError) {
    return new PublicResultSnapshotError(`${message} ${error.message}`, error.status);
  }

  return new PublicResultSnapshotError(error instanceof Error ? `${message} ${error.message}` : message);
}

function validateUuid(value: string, fieldName: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new PublicResultSnapshotError(`${fieldName} must be a UUID.`, 400);
  }
}
