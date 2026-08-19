import type { TeamVsTeamTournamentState } from "../tournament-setup";
import { createSupabaseRestClient, SupabaseRestClientError, type SupabaseRestClient } from "../supabase/rest-client";
import { createTeamVsTeamTournamentWritePlan, type PersistenceWritePlan } from "./persistence-write-plan";
import { mapTeamVsTeamTournamentToPersistencePayload } from "./team-vs-team-mapper";
import { mapPersistenceRowsToTeamVsTeamTournamentState, type TeamVsTeamReadModel } from "./team-vs-team-readback";
import { TournamentPersistenceError } from "./supabase-standard-repository";

export interface SaveTeamVsTeamTournamentOptions {
  legacyLocalId: string;
  createId?: () => string;
  tournamentId?: string;
  expectedUpdatedAt?: string;
  ownerUserId?: string;
}

export interface SaveTeamVsTeamTournamentResult {
  tournamentId: string;
  updatedAt?: string;
  writePlan: PersistenceWritePlan;
  saveMode: "insert" | "replace";
}

export interface TeamVsTeamTournamentRepository {
  save(state: TeamVsTeamTournamentState, options: SaveTeamVsTeamTournamentOptions): Promise<SaveTeamVsTeamTournamentResult>;
  read(tournamentId: string): Promise<TeamVsTeamTournamentState>;
  deleteById(tournamentId: string): Promise<void>;
}

export function createTeamVsTeamTournamentRepository(client: SupabaseRestClient = createSupabaseRestClient()): TeamVsTeamTournamentRepository {
  return {
    async save(state, options) {
      validateTeamVsTeamState(state);
      validateLegacyLocalId(options.legacyLocalId);

      const payload = mapTeamVsTeamTournamentToPersistencePayload(state, { legacyLocalId: options.legacyLocalId });
      const writePlan = createTeamVsTeamTournamentWritePlan(payload, { createId: options.createId, tournamentId: options.tournamentId });

      try {
        const tournamentId = options.ownerUserId
          ? await client.rpc<string>("lezgo_save_owned_tournament_snapshot_v1", { p_operations: writePlan.operations, p_expected_updated_at: options.expectedUpdatedAt ?? null, p_actor_user_id: options.ownerUserId })
          : await client.rpc<string>("lezgo_save_tournament_snapshot_v2", { p_operations: writePlan.operations, p_expected_updated_at: options.expectedUpdatedAt ?? null });
        return { tournamentId, updatedAt: await readTournamentUpdatedAt(client, tournamentId), writePlan, saveMode: options.tournamentId ? "replace" : "insert" };
      } catch (error) {
        throw toPersistenceError("Could not save Team vs Team snapshot to Supabase.", error);
      }
    },
    async read(tournamentId) {
      validateUuid(tournamentId, "tournamentId");

      try {
        return mapPersistenceRowsToTeamVsTeamTournamentState(await readTeamVsTeamRows(client, tournamentId));
      } catch (error) {
        if (error instanceof TournamentPersistenceError) {
          throw error;
        }

        throw toPersistenceError("Could not read Team vs Team snapshot from Supabase.", error);
      }
    },
    async deleteById(tournamentId) {
      validateUuid(tournamentId, "tournamentId");

      try {
        await client.delete("tournaments", `id=eq.${encodeURIComponent(tournamentId)}`);
      } catch (error) {
        throw toPersistenceError("Could not delete Team vs Team snapshot from Supabase.", error);
      }
    },
  };
}

async function readTournamentUpdatedAt(client: SupabaseRestClient, tournamentId: string): Promise<string | undefined> {
  const [row] = await client.select<{ updated_at?: string }>("tournaments", `id=eq.${encodeURIComponent(tournamentId)}&select=updated_at`);
  return row?.updated_at;
}

async function readTeamVsTeamRows(client: SupabaseRestClient, tournamentId: string): Promise<TeamVsTeamReadModel> {
  const [tournament] = await client.select<TeamVsTeamReadModel["tournament"]>("tournaments", `id=eq.${encodeURIComponent(tournamentId)}&select=*`);

  if (!tournament) {
    throw new TournamentPersistenceError(`Tournament was not found: ${tournamentId}.`);
  }

  if (tournament.team_competition_mode !== "knockout" && tournament.team_competition_mode !== "pool") {
    throw new TournamentPersistenceError("Tournament is not a Team vs Team tournament.");
  }

  const teams = await client.select<TeamVsTeamReadModel["teams"][number]>("team_vs_team_teams", `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*&order=display_order.asc`);
  const teamIds = teams.map((team) => team.id);
  const players = teamIds.length
    ? await client.select<TeamVsTeamReadModel["players"][number]>("team_vs_team_players", `team_id=in.(${teamIds.join(",")})&select=*&order=display_order.asc`)
    : [];
  const matchups = await client.select<TeamVsTeamReadModel["matchups"][number]>("team_vs_team_matchups", `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*&order=display_order.asc`);
  const matchupIds = matchups.map((matchup) => matchup.id);
  const lineups = matchupIds.length
    ? await client.select<TeamVsTeamReadModel["lineups"][number]>("team_vs_team_lineups", `matchup_id=in.(${matchupIds.join(",")})&select=*&order=round_number.asc,match_number.asc`)
    : [];
  const roundResults = matchupIds.length
    ? await client.select<TeamVsTeamReadModel["roundResults"][number]>("team_vs_team_round_results", `matchup_id=in.(${matchupIds.join(",")})&select=*&order=round_number.asc,match_number.asc,set_number.asc`)
    : [];
  const tieBreaks = matchupIds.length
    ? await client.select<TeamVsTeamReadModel["tieBreaks"][number]>("team_vs_team_tiebreaks", `matchup_id=in.(${matchupIds.join(",")})&select=*`)
    : [];

  return { tournament, teams, players, matchups, lineups, roundResults, tieBreaks };
}

function validateTeamVsTeamState(state: TeamVsTeamTournamentState): void {
  if (!state.name.trim()) {
    throw new TournamentPersistenceError("Team vs Team tournament name is required.");
  }

  if (!state.teams.length) {
    throw new TournamentPersistenceError("Team vs Team teams are required.");
  }

  if (!state.matchups.length) {
    throw new TournamentPersistenceError("Team vs Team matchups are required.");
  }
}

function validateLegacyLocalId(legacyLocalId: string): void {
  if (!legacyLocalId.trim()) {
    throw new TournamentPersistenceError("legacyLocalId is required.");
  }
}

function validateUuid(value: string, fieldName: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TournamentPersistenceError(`${fieldName} must be a UUID.`);
  }
}

function toPersistenceError(message: string, error: unknown): TournamentPersistenceError {
  if (error instanceof TournamentPersistenceError) {
    return error;
  }

  if (error instanceof SupabaseRestClientError) {
    return new TournamentPersistenceError(`${message} ${error.message}`, error);
  }

  return new TournamentPersistenceError(message, error);
}
