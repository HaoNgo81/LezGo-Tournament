import type { LiveTournamentState } from "../live-scoring";
import { createSupabaseRestClient, SupabaseRestClientError, type SupabaseRestClient } from "../supabase/rest-client";
import { mapLiveTournamentToPersistencePayload } from "./live-tournament-mapper";
import { mapPersistenceRowsToLiveTournamentState, type StandardTournamentReadModel } from "./live-tournament-readback";
import { createStandardTournamentWritePlan, type DatabaseWriteOperation, type PersistenceWritePlan } from "./persistence-write-plan";

export class TournamentPersistenceError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "TournamentPersistenceError";
    this.cause = cause;
  }
}

export interface SaveStandardTournamentOptions {
  legacyLocalId: string;
  createId?: () => string;
  tournamentId?: string;
  expectedUpdatedAt?: string;
}

export interface SaveStandardTournamentResult {
  tournamentId: string;
  updatedAt?: string;
  writePlan: PersistenceWritePlan;
  saveMode: "insert" | "replace";
}

export interface StandardTournamentRepository {
  save(state: LiveTournamentState, options: SaveStandardTournamentOptions): Promise<SaveStandardTournamentResult>;
  read(tournamentId: string): Promise<LiveTournamentState>;
  deleteById(tournamentId: string): Promise<void>;
}

export function createStandardTournamentRepository(client: SupabaseRestClient = createSupabaseRestClient()): StandardTournamentRepository {
  return {
    async save(state, options) {
      validateStandardTournamentState(state);
      validateLegacyLocalId(options.legacyLocalId);

      const payload = mapLiveTournamentToPersistencePayload(state, { legacyLocalId: options.legacyLocalId });
      const writePlan = createStandardTournamentWritePlan(payload, { createId: options.createId, tournamentId: options.tournamentId });
      assertStandardWritePlanSupported(writePlan);

      try {
        const tournamentId = await client.rpc<string>("lezgo_save_tournament_snapshot_v2", { p_operations: writePlan.operations, p_expected_updated_at: options.expectedUpdatedAt ?? null });
        return { tournamentId, updatedAt: await readTournamentUpdatedAt(client, tournamentId), writePlan, saveMode: options.tournamentId ? "replace" : "insert" };
      } catch (error) {
        throw toPersistenceError("Could not save tournament snapshot to Supabase.", error);
      }
    },
    async read(tournamentId) {
      validateUuid(tournamentId, "tournamentId");

      try {
        const readModel = await readStandardTournamentRows(client, tournamentId);
        return mapPersistenceRowsToLiveTournamentState(readModel);
      } catch (error) {
        if (error instanceof TournamentPersistenceError) {
          throw error;
        }

        throw toPersistenceError("Could not read tournament snapshot from Supabase.", error);
      }
    },
    async deleteById(tournamentId) {
      validateUuid(tournamentId, "tournamentId");

      try {
        await client.delete("tournaments", `id=eq.${encodeURIComponent(tournamentId)}`);
      } catch (error) {
        throw toPersistenceError("Could not delete tournament snapshot from Supabase.", error);
      }
    },
  };
}

export function assertStandardWritePlanSupported(writePlan: PersistenceWritePlan): void {
  const supportedTables = new Set([
    "tournaments",
    "tournament_players",
    "fixed_pairs",
    "rounds",
    "tournament_pools",
    "pool_participants",
    "matches",
    "match_sides",
    "match_side_players",
  ]);

  for (const operation of writePlan.operations) {
    if (operation.kind !== "insert") {
      throw new TournamentPersistenceError(`Unsupported write operation kind: ${operation.kind}.`);
    }

    if (!supportedTables.has(operation.table)) {
      throw new TournamentPersistenceError(`Unsupported write operation table: ${operation.table}.`);
    }
  }
}

async function readTournamentUpdatedAt(client: SupabaseRestClient, tournamentId: string): Promise<string | undefined> {
  const [row] = await client.select<{ updated_at?: string }>("tournaments", `id=eq.${encodeURIComponent(tournamentId)}&select=updated_at`);
  return row?.updated_at;
}

async function readStandardTournamentRows(client: SupabaseRestClient, tournamentId: string): Promise<StandardTournamentReadModel> {
  const [tournament] = await client.select<StandardTournamentReadModel["tournament"]>("tournaments", `id=eq.${encodeURIComponent(tournamentId)}&select=*`);

  if (!tournament) {
    throw new TournamentPersistenceError(`Tournament was not found: ${tournamentId}.`);
  }

  const players = await client.select<StandardTournamentReadModel["players"][number]>("tournament_players", `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*&order=display_order.asc`);
  const rounds = await client.select<StandardTournamentReadModel["rounds"][number]>("rounds", `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*&order=round_number.asc`);
  const matches = await client.select<StandardTournamentReadModel["matches"][number]>("matches", `tournament_id=eq.${encodeURIComponent(tournamentId)}&select=*&order=court_number.asc`);
  const matchIds = matches.map((match) => match.id);
  const matchSides = matchIds.length
    ? await client.select<StandardTournamentReadModel["matchSides"][number]>("match_sides", `match_id=in.(${matchIds.join(",")})&select=*&order=side_number.asc`)
    : [];
  const sideIds = matchSides.map((side) => side.id);
  const matchSidePlayers = sideIds.length
    ? await client.select<StandardTournamentReadModel["matchSidePlayers"][number]>("match_side_players", `match_side_id=in.(${sideIds.join(",")})&select=*&order=display_order.asc`)
    : [];

  return {
    tournament,
    players,
    rounds,
    matches,
    matchSides,
    matchSidePlayers,
  };
}

function validateStandardTournamentState(state: LiveTournamentState): void {
  if (!state.tournamentName.trim()) {
    throw new TournamentPersistenceError("Tournament name is required.");
  }

  if (!state.players.length) {
    throw new TournamentPersistenceError("Tournament players are required.");
  }

  if (state.format !== "pool-play" && !state.rounds.length) {
    throw new TournamentPersistenceError("Tournament rounds are required.");
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

export function getOperationRows(writePlan: PersistenceWritePlan, table: string): NonNullable<DatabaseWriteOperation["rows"]> {
  return writePlan.operations.find((operation) => operation.kind === "insert" && operation.table === table)?.rows ?? [];
}
