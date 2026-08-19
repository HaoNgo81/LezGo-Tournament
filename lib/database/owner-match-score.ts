import { createSupabaseRestClient, SupabaseRestClientError, type SupabaseRestClient } from "../supabase/rest-client";

export class OwnerMatchScoreConflictError extends Error {
  readonly latestScoreVersion?: number;

  constructor(message = "Match score conflict.", latestScoreVersion?: number) {
    super(message);
    this.name = "OwnerMatchScoreConflictError";
    this.latestScoreVersion = latestScoreVersion;
  }
}

export interface OwnedMatchScoreVersions {
  [legacyMatchId: string]: number;
}

interface MatchScoreVersionRow {
  legacy_match_id: string;
  score_version: number;
}

interface SaveOwnedMatchScoreRpcResponse {
  ok?: boolean;
  conflict?: boolean;
  scoreVersion?: number;
  latestScoreVersion?: number;
  updatedAt?: string;
}

export interface SaveOwnedMatchScoreInput {
  tournamentId: string;
  matchId: string;
  teamAPoints: number;
  teamBPoints: number;
  expectedScoreVersion: number;
  actorUserId: string;
}

export interface SaveOwnedMatchScoreResult {
  scoreVersion: number;
  updatedAt?: string;
}

export async function readOwnedMatchScoreVersions(client: SupabaseRestClient, tournamentId: string): Promise<OwnedMatchScoreVersions> {
  const rows = await client.select<MatchScoreVersionRow>(
    "matches",
    `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=legacy_match_id,score_version`,
  );

  return Object.fromEntries(rows.map((row) => [row.legacy_match_id, row.score_version]));
}

export async function saveOwnedMatchScore(
  input: SaveOwnedMatchScoreInput,
  client: SupabaseRestClient = createSupabaseRestClient(),
): Promise<SaveOwnedMatchScoreResult> {
  try {
    const result = await client.rpc<SaveOwnedMatchScoreRpcResponse>("lezgo_save_owned_match_score_v1", {
      p_tournament_id: input.tournamentId,
      p_legacy_match_id: input.matchId,
      p_team_a_points: input.teamAPoints,
      p_team_b_points: input.teamBPoints,
      p_expected_score_version: input.expectedScoreVersion,
      p_actor_user_id: input.actorUserId,
    });

    if (result.conflict || !result.ok) {
      throw new OwnerMatchScoreConflictError("Match score conflict.", result.latestScoreVersion);
    }

    if (typeof result.scoreVersion !== "number") {
      throw new Error("Match score RPC did not return a score version.");
    }

    return {
      scoreVersion: result.scoreVersion,
      updatedAt: result.updatedAt,
    };
  } catch (error) {
    if (error instanceof OwnerMatchScoreConflictError) {
      throw error;
    }

    if (error instanceof SupabaseRestClientError && error.message.toLocaleLowerCase("en").includes("conflict")) {
      throw new OwnerMatchScoreConflictError(error.message);
    }

    throw error;
  }
}
