import type { LiveTournamentState } from "../live-scoring";
import { createFixedPartnerTeams, type MatchResult, type TournamentMatch, type TournamentRound } from "../tournament-engine";
import type { InitialPool } from "../tournament-setup";
import type {
  FixedPairRowPayload,
  JsonRecord,
  MatchRowPayload,
  MatchSidePlayerRowPayload,
  MatchSideRowPayload,
  PersistedMatchStatus,
  PersistedRoundStatus,
  PoolParticipantRowPayload,
  RoundRowPayload,
  StandardTournamentPersistencePayload,
  TournamentPlayerRowPayload,
  TournamentPoolRowPayload,
} from "./persistence-payloads";

export interface StandardTournamentMapperOptions {
  legacyLocalId?: string;
}

export function mapLiveTournamentToPersistencePayload(
  state: LiveTournamentState,
  options: StandardTournamentMapperOptions = {},
): StandardTournamentPersistencePayload {
  const tournamentRef = "tournament";
  const resultByMatchId = new Map(state.results.map((result) => [result.matchId, result]));
  const startedMatchIds = new Set(state.startedMatchIds ?? []);
  const players = state.players.map<TournamentPlayerRowPayload>((player, index) => ({
    clientRef: playerRef(player.id),
    tournamentRef,
    legacy_player_id: player.id,
    name: player.name,
    gender: player.gender ?? null,
    display_order: index + 1,
    metadata: {},
  }));
  const fixedPairs = isFixedPartnerFormat(state.format)
    ? createFixedPartnerTeams(state.players).map<FixedPairRowPayload>((team, index) => ({
        clientRef: fixedPairRef(team.id),
        tournamentRef,
        legacy_team_id: team.id,
        player1Ref: playerRef(team.playerIds[0]),
        player2Ref: playerRef(team.playerIds[1]),
        display_order: index + 1,
      }))
    : [];
  const rounds = state.rounds.map<RoundRowPayload>((round) => ({
    clientRef: roundRef(round.roundNumber),
    tournamentRef,
    round_number: round.roundNumber,
    status: getRoundStatus(round, state.activeRoundNumber, resultByMatchId),
    byePlayerRefs: (round.byePlayerIds ?? []).map(playerRef),
    metadata: round.byePlayerIds?.length ? { byePlayerLegacyIds: round.byePlayerIds } : {},
  }));
  const matches = state.rounds.flatMap((round) => round.matches.map((match) => mapMatch(tournamentRef, match, resultByMatchId, startedMatchIds)));
  const matchSides = state.rounds.flatMap((round) => round.matches.flatMap((match) => mapMatchSides(match, resultByMatchId.get(match.id))));
  const matchSidePlayers = state.rounds.flatMap((round) => round.matches.flatMap(mapMatchSidePlayers));
  const pools = mapInitialPools(tournamentRef, state.poolPlay?.initialStage.pools ?? []);
  const poolParticipants = mapInitialPoolParticipants(state.poolPlay?.initialStage.pools ?? [], state.poolPlay?.initialStage.participants ?? []);

  return {
    tournament: {
      clientRef: tournamentRef,
      name: state.tournamentName,
      format: state.format,
      status: state.status,
      scoring_mode: state.scoringMode,
      fixed_score_rule: state.fixedScoreRule ?? null,
      fixed_score_points: state.fixedScorePoints ?? null,
      ranking_mode: state.rankingMode,
      court_count: state.courtCount ?? null,
      configured_rounds: state.configuredRounds ?? null,
      active_round_number: state.activeRoundNumber,
      time_limit_minutes: state.timeLimitMinutes ?? null,
      timer_state: toJsonRecord(state.roundTimer),
      pool_phase: state.poolPlay?.phase ?? null,
      pool_advancement_mode: state.poolPlay?.advancementMode ?? null,
      pool_unmatched_resolution: state.poolPlay?.unmatchedResolution ?? null,
      team_count: null,
      players_per_team: null,
      team_match_format: null,
      team_competition_mode: null,
      team_draw_mode: null,
      active_matchup_legacy_id: null,
      finished_at: state.finishedAt ?? null,
      legacy_local_id: options.legacyLocalId ?? null,
      metadata: {
        ...(state.poolPlay ? { runtimeState: state } : {}),
      },
    },
    players,
    fixedPairs,
    rounds,
    matches,
    matchSides,
    matchSidePlayers,
    pools,
    poolParticipants,
  };
}

function mapMatch(
  tournamentRef: string,
  match: TournamentMatch,
  resultByMatchId: Map<string, MatchResult>,
  startedMatchIds: Set<string>,
): MatchRowPayload {
  return {
    clientRef: matchRef(match.id),
    tournamentRef,
    roundRef: roundRef(match.roundNumber),
    poolRef: null,
    legacy_match_id: match.id,
    match_scope: "standard",
    label: null,
    court_number: match.courtNumber,
    status: getMatchStatus(match.id, resultByMatchId, startedMatchIds),
    metadata: {
      teamALegacyId: match.teamA.id,
      teamBLegacyId: match.teamB.id,
    },
  };
}

function mapMatchSides(match: TournamentMatch, result?: MatchResult): MatchSideRowPayload[] {
  return [
    {
      clientRef: matchSideRef(match.id, 1),
      matchRef: matchRef(match.id),
      side_number: 1,
      score: result?.teamAPoints ?? null,
      tie_break_winner: result?.tieBreakWinner === "teamA",
      metadata: { legacyTeamId: match.teamA.id },
    },
    {
      clientRef: matchSideRef(match.id, 2),
      matchRef: matchRef(match.id),
      side_number: 2,
      score: result?.teamBPoints ?? null,
      tie_break_winner: result?.tieBreakWinner === "teamB",
      metadata: { legacyTeamId: match.teamB.id },
    },
  ];
}

function mapMatchSidePlayers(match: TournamentMatch): MatchSidePlayerRowPayload[] {
  return [
    ...match.teamA.playerIds.map((playerId, index) => ({
      clientRef: matchSidePlayerRef(match.id, 1, playerId),
      matchSideRef: matchSideRef(match.id, 1),
      tournamentPlayerRef: playerRef(playerId),
      display_order: index + 1,
    })),
    ...match.teamB.playerIds.map((playerId, index) => ({
      clientRef: matchSidePlayerRef(match.id, 2, playerId),
      matchSideRef: matchSideRef(match.id, 2),
      tournamentPlayerRef: playerRef(playerId),
      display_order: index + 1,
    })),
  ];
}

function mapInitialPools(tournamentRef: string, pools: InitialPool[]): TournamentPoolRowPayload[] {
  return pools.map((pool, index) => ({
    clientRef: poolRef(pool.id),
    tournamentRef,
    legacy_pool_id: pool.id,
    name: pool.name,
    stage: "initial",
    schedule_type: pool.scheduleType,
    display_order: index + 1,
    matches_per_team: getPoolMatchesPerTeam(pool),
    metadata: { participantLegacyIds: pool.participantIds },
  }));
}

function mapInitialPoolParticipants(
  pools: InitialPool[],
  participants: Array<{ id: string; name: string }>,
): PoolParticipantRowPayload[] {
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));

  return pools.flatMap((pool) =>
    pool.participantIds.map((participantId, index) => ({
      clientRef: poolParticipantRef(pool.id, participantId),
      poolRef: poolRef(pool.id),
      tournamentPlayerRef: participantById.has(participantId) ? playerRef(participantId) : null,
      legacy_participant_id: participantId,
      display_order: index + 1,
      metadata: participantById.has(participantId) ? { name: participantById.get(participantId)?.name } : {},
    })),
  );
}

function getRoundStatus(round: TournamentRound, activeRoundNumber: number, resultByMatchId: Map<string, MatchResult>): PersistedRoundStatus {
  if (round.matches.length > 0 && round.matches.every((match) => resultByMatchId.has(match.id))) {
    return "completed";
  }

  return round.roundNumber === activeRoundNumber ? "active" : "scheduled";
}

function getMatchStatus(matchId: string, resultByMatchId: Map<string, MatchResult>, startedMatchIds: Set<string>): PersistedMatchStatus {
  if (resultByMatchId.has(matchId)) {
    return "completed";
  }

  return startedMatchIds.has(matchId) ? "running" : "ready";
}

function getPoolMatchesPerTeam(pool: InitialPool): 2 | 3 | null {
  const matchesPerTeam = pool.encounters.find((encounter) => encounter.matchesPerTeam)?.matchesPerTeam;
  return matchesPerTeam === 2 || matchesPerTeam === 3 ? matchesPerTeam : null;
}

function isFixedPartnerFormat(format: LiveTournamentState["format"]): boolean {
  return format === "fixed-partner-americano" || format === "fixed-partner-mexicano";
}

function toJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function playerRef(playerId: string): string {
  return `player:${playerId}`;
}

function fixedPairRef(teamId: string): string {
  return `fixed-pair:${teamId}`;
}

function roundRef(roundNumber: number): string {
  return `round:${roundNumber}`;
}

function matchRef(matchId: string): string {
  return `match:${matchId}`;
}

function matchSideRef(matchId: string, sideNumber: 1 | 2): string {
  return `match-side:${matchId}:${sideNumber}`;
}

function matchSidePlayerRef(matchId: string, sideNumber: 1 | 2, playerId: string): string {
  return `match-side-player:${matchId}:${sideNumber}:${playerId}`;
}

function poolRef(poolId: string): string {
  return `pool:${poolId}`;
}

function poolParticipantRef(poolId: string, participantId: string): string {
  return `pool-participant:${poolId}:${participantId}`;
}
