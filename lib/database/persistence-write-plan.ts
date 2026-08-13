import { randomUUID } from "node:crypto";
import type {
  PoolParticipantRowPayload,
  StandardTournamentPersistencePayload,
  TeamVsTeamPersistencePayload,
  TournamentPoolRowPayload,
} from "./persistence-payloads";

export type DatabaseRow = Record<string, unknown>;
export type DatabaseOperationKind = "insert" | "update";

export interface DatabaseWriteOperation {
  kind: DatabaseOperationKind;
  table: string;
  rows?: DatabaseRow[];
  match?: DatabaseRow;
  values?: DatabaseRow;
}

export interface PersistenceWritePlan {
  transactional: true;
  idMap: Record<string, string>;
  operations: DatabaseWriteOperation[];
}

export interface PersistenceWritePlanOptions {
  createId?: () => string;
  tournamentId?: string;
}

export function createStandardTournamentWritePlan(
  payload: StandardTournamentPersistencePayload,
  options: PersistenceWritePlanOptions = {},
): PersistenceWritePlan {
  const createId = createTournamentAwareIdFactory(options);
  const idMap = createIdMap(
    [
      payload.tournament.clientRef,
      ...payload.players.map((row) => row.clientRef),
      ...payload.fixedPairs.map((row) => row.clientRef),
      ...payload.rounds.map((row) => row.clientRef),
      ...payload.pools.map((row) => row.clientRef),
      ...payload.poolParticipants.map((row) => row.clientRef),
      ...payload.matches.map((row) => row.clientRef),
      ...payload.matchSides.map((row) => row.clientRef),
      ...payload.matchSidePlayers.map((row) => row.clientRef),
    ],
    createId,
  );
  const tournamentId = resolveRef(idMap, payload.tournament.clientRef);
  const operations: DatabaseWriteOperation[] = [
    {
      kind: "insert",
      table: "tournaments",
      rows: [
        {
          id: tournamentId,
          ...withoutClientFields(payload.tournament, ["clientRef", "active_matchup_legacy_id"]),
          active_matchup_id: null,
        },
      ],
    },
    {
      kind: "insert",
      table: "tournament_players",
      rows: payload.players.map((player) => ({
        id: resolveRef(idMap, player.clientRef),
        tournament_id: tournamentId,
        ...withoutClientFields(player, ["clientRef", "tournamentRef"]),
      })),
    },
  ];

  if (payload.fixedPairs.length) {
    operations.push({
      kind: "insert",
      table: "fixed_pairs",
      rows: payload.fixedPairs.map((pair) => ({
        id: resolveRef(idMap, pair.clientRef),
        tournament_id: tournamentId,
        legacy_team_id: pair.legacy_team_id,
        player_1_id: resolveRef(idMap, pair.player1Ref),
        player_2_id: resolveRef(idMap, pair.player2Ref),
        display_order: pair.display_order,
      })),
    });
  }

  operations.push({
    kind: "insert",
    table: "rounds",
    rows: payload.rounds.map((round) => ({
      id: resolveRef(idMap, round.clientRef),
      tournament_id: tournamentId,
      round_number: round.round_number,
      status: round.status,
      bye_player_ids: round.byePlayerRefs.map((ref) => resolveRef(idMap, ref)),
      metadata: round.metadata,
    })),
  });

  pushPoolOperations(operations, payload.pools, payload.poolParticipants, tournamentId, idMap);

  operations.push(
    {
      kind: "insert",
      table: "matches",
      rows: payload.matches.map((match) => ({
        id: resolveRef(idMap, match.clientRef),
        tournament_id: tournamentId,
        round_id: match.roundRef ? resolveRef(idMap, match.roundRef) : null,
        pool_id: match.poolRef ? resolveRef(idMap, match.poolRef) : null,
        legacy_match_id: match.legacy_match_id,
        match_scope: match.match_scope,
        label: match.label,
        court_number: match.court_number,
        status: match.status,
        metadata: match.metadata,
      })),
    },
    {
      kind: "insert",
      table: "match_sides",
      rows: payload.matchSides.map((side) => ({
        id: resolveRef(idMap, side.clientRef),
        match_id: resolveRef(idMap, side.matchRef),
        side_number: side.side_number,
        score: side.score,
        tie_break_winner: side.tie_break_winner,
        metadata: side.metadata,
      })),
    },
    {
      kind: "insert",
      table: "match_side_players",
      rows: payload.matchSidePlayers.map((sidePlayer) => ({
        id: resolveRef(idMap, sidePlayer.clientRef),
        match_side_id: resolveRef(idMap, sidePlayer.matchSideRef),
        tournament_player_id: resolveRef(idMap, sidePlayer.tournamentPlayerRef),
        display_order: sidePlayer.display_order,
      })),
    },
  );

  return { transactional: true, idMap, operations };
}

export function createTeamVsTeamTournamentWritePlan(
  payload: TeamVsTeamPersistencePayload,
  options: PersistenceWritePlanOptions = {},
): PersistenceWritePlan {
  const createId = createTournamentAwareIdFactory(options);
  const idMap = createIdMap(
    [
      payload.tournament.clientRef,
      ...payload.teams.map((row) => row.clientRef),
      ...payload.players.map((row) => row.clientRef),
      ...payload.matchups.map((row) => row.clientRef),
      ...payload.lineups.map((row) => row.clientRef),
      ...payload.roundResults.map((row) => row.clientRef),
      ...payload.tieBreaks.map((row) => row.clientRef),
    ],
    createId,
  );
  const tournamentId = resolveRef(idMap, payload.tournament.clientRef);
  const activeMatchup = payload.matchups.find((matchup) => matchup.legacy_matchup_id === payload.tournament.active_matchup_legacy_id);
  const operations: DatabaseWriteOperation[] = [
    {
      kind: "insert",
      table: "tournaments",
      rows: [
        {
          id: tournamentId,
          ...withoutClientFields(payload.tournament, ["clientRef", "active_matchup_legacy_id"]),
          active_matchup_id: null,
        },
      ],
    },
    {
      kind: "insert",
      table: "team_vs_team_teams",
      rows: payload.teams.map((team) => ({
        id: resolveRef(idMap, team.clientRef),
        tournament_id: tournamentId,
        legacy_team_id: team.legacy_team_id,
        name: team.name,
        captain_player_id: null,
        display_order: team.display_order,
      })),
    },
    {
      kind: "insert",
      table: "team_vs_team_players",
      rows: payload.players.map((player) => ({
        id: resolveRef(idMap, player.clientRef),
        team_id: resolveRef(idMap, player.teamRef),
        legacy_player_id: player.legacy_player_id,
        name: player.name,
        display_order: player.display_order,
      })),
    },
  ];

  operations.push(
    ...payload.teams
      .filter((team) => team.captainPlayerRef)
      .map<DatabaseWriteOperation>((team) => ({
        kind: "update",
        table: "team_vs_team_teams",
        match: { id: resolveRef(idMap, team.clientRef) },
        values: { captain_player_id: resolveRef(idMap, team.captainPlayerRef as string) },
      })),
  );

  operations.push({
    kind: "insert",
    table: "team_vs_team_matchups",
    rows: payload.matchups.map((matchup) => ({
      id: resolveRef(idMap, matchup.clientRef),
      tournament_id: tournamentId,
      legacy_matchup_id: matchup.legacy_matchup_id,
      label: matchup.label,
      team_a_id: resolveRef(idMap, matchup.teamARef),
      team_b_id: resolveRef(idMap, matchup.teamBRef),
      status: matchup.status,
      display_order: matchup.display_order,
      metadata: matchup.metadata,
    })),
  });

  if (activeMatchup) {
    operations.push({
      kind: "update",
      table: "tournaments",
      match: { id: tournamentId },
      values: { active_matchup_id: resolveRef(idMap, activeMatchup.clientRef) },
    });
  }

  if (payload.lineups.length) {
    operations.push({
      kind: "insert",
      table: "team_vs_team_lineups",
      rows: payload.lineups.map((lineup) => ({
        id: resolveRef(idMap, lineup.clientRef),
        matchup_id: resolveRef(idMap, lineup.matchupRef),
        round_number: lineup.round_number,
        match_number: lineup.match_number,
        team_a_player_1_id: resolveRef(idMap, lineup.teamAPlayer1Ref),
        team_a_player_2_id: resolveRef(idMap, lineup.teamAPlayer2Ref),
        team_b_player_1_id: resolveRef(idMap, lineup.teamBPlayer1Ref),
        team_b_player_2_id: resolveRef(idMap, lineup.teamBPlayer2Ref),
        override_repeated_pairs: lineup.override_repeated_pairs,
      })),
    });
  }

  if (payload.roundResults.length) {
    operations.push({
      kind: "insert",
      table: "team_vs_team_round_results",
      rows: payload.roundResults.map((result) => ({
        id: resolveRef(idMap, result.clientRef),
        matchup_id: resolveRef(idMap, result.matchupRef),
        round_number: result.round_number,
        match_number: result.match_number,
        set_number: result.set_number,
        team_a_points: result.team_a_points,
        team_b_points: result.team_b_points,
      })),
    });
  }

  if (payload.tieBreaks.length) {
    operations.push({
      kind: "insert",
      table: "team_vs_team_tiebreaks",
      rows: payload.tieBreaks.map((tieBreak) => ({
        id: resolveRef(idMap, tieBreak.clientRef),
        matchup_id: resolveRef(idMap, tieBreak.matchupRef),
        team_a_player_1_id: resolveRef(idMap, tieBreak.teamAPlayer1Ref),
        team_a_player_2_id: resolveRef(idMap, tieBreak.teamAPlayer2Ref),
        team_b_player_1_id: resolveRef(idMap, tieBreak.teamBPlayer1Ref),
        team_b_player_2_id: resolveRef(idMap, tieBreak.teamBPlayer2Ref),
        team_a_points: tieBreak.team_a_points,
        team_b_points: tieBreak.team_b_points,
      })),
    });
  }

  return { transactional: true, idMap, operations };
}

function pushPoolOperations(
  operations: DatabaseWriteOperation[],
  pools: TournamentPoolRowPayload[],
  poolParticipants: PoolParticipantRowPayload[],
  tournamentId: string,
  idMap: Record<string, string>,
): void {
  if (!pools.length) {
    return;
  }

  operations.push({
    kind: "insert",
    table: "tournament_pools",
    rows: pools.map((pool) => ({
      id: resolveRef(idMap, pool.clientRef),
      tournament_id: tournamentId,
      legacy_pool_id: pool.legacy_pool_id,
      name: pool.name,
      stage: pool.stage,
      schedule_type: pool.schedule_type,
      display_order: pool.display_order,
      matches_per_team: pool.matches_per_team,
      metadata: pool.metadata,
    })),
  });

  if (poolParticipants.length) {
    operations.push({
      kind: "insert",
      table: "pool_participants",
      rows: poolParticipants.map((participant) => ({
        pool_id: resolveRef(idMap, participant.poolRef),
        id: resolveRef(idMap, participant.clientRef),
        tournament_player_id: participant.tournamentPlayerRef ? resolveRef(idMap, participant.tournamentPlayerRef) : null,
        legacy_participant_id: participant.legacy_participant_id,
        display_order: participant.display_order,
        metadata: participant.metadata,
      })),
    });
  }
}

function createIdMap(clientRefs: string[], createId: () => string): Record<string, string> {
  const idMap: Record<string, string> = {};

  for (const ref of clientRefs) {
    if (!idMap[ref]) {
      idMap[ref] = createId();
    }
  }

  return idMap;
}

function createTournamentAwareIdFactory(options: PersistenceWritePlanOptions): () => string {
  const createId = options.createId ?? randomUUID;
  let tournamentIdUsed = false;

  return () => {
    if (options.tournamentId && !tournamentIdUsed) {
      tournamentIdUsed = true;
      return options.tournamentId;
    }

    return createId();
  };
}

function resolveRef(idMap: Record<string, string>, clientRef: string): string {
  const id = idMap[clientRef];

  if (!id) {
    throw new Error(`Missing UUID mapping for ${clientRef}.`);
  }

  return id;
}

function withoutClientFields<T extends object, K extends keyof T>(row: T, keys: K[]): Omit<T, K> {
  const copy = { ...row };

  for (const key of keys) {
    delete copy[key];
  }

  return copy;
}
