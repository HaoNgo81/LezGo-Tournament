import { beforeEach, describe, expect, it } from "vitest";
import { createFixedPartnerTeams } from "../lib/tournament-engine";
import { calculateLiveStandings, canGoToNextRound, finishTournament, getLiveMatches, goToNextRound, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createTournamentFromSetup, loadActiveTournament, saveActiveTournament, saveCompletedTournament } from "../lib/tournament-setup";
import { createTournamentResultPdf } from "../lib/results-export";
import { createPublicResultSnapshot } from "../lib/results-sharing";

const scorePatterns: ReadonlyArray<readonly [number, number]> = [[21, 9], [18, 21], [16, 16], [24, 8]];

describe("Fast Makker Mexicano open-ended rounds", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates new Fast Makker Mexicano tournaments as open-ended exact-capacity tournaments without pair byes", () => {
    const state = createFixedPartnerMexicanoTournament(8, 2);

    expect(state.format).toBe("fixed-partner-mexicano");
    expect(state.configuredRounds).toBeUndefined();
    expect(state.automaticCycle).toBeUndefined();
    expect(state.rounds).toHaveLength(1);
    expect(state.rounds[0].matches).toHaveLength(2);
    expect(state.rounds[0].byePlayerIds).toBeUndefined();
  });

  it.each([
    [1, 4],
    [2, 8],
    [3, 12],
    [4, 16],
  ])("accepts %i court(s) / %i players", (courts, playerCount) => {
    const state = createFixedPartnerMexicanoTournament(playerCount, courts);

    expect(state.players).toHaveLength(playerCount);
    expect(state.rounds[0].matches).toHaveLength(courts);
    expect(state.rounds[0].byePlayerIds).toBeUndefined();
  });

  it.each([
    [1, 6],
    [2, 10],
    [4, 18],
  ])("rejects %i court(s) / %i players instead of creating Oversidderpar", (courts, playerCount) => {
    expect(() => createFixedPartnerMexicanoTournament(playerCount, courts)).toThrow("Fast Makker Mexicano kræver præcis 2 par pr. bane.");
  });

  it("generates Round 2 from current fixed-pair standings with the existing pair-ranking algorithm", () => {
    const scoredState = scoreActiveRound(createFixedPartnerMexicanoTournament(16, 4), [[8, 21], [21, 4], [20, 10], [19, 13]]);
    const standings = calculateLiveStandings(scoredState);
    const nextState = goToNextRound(scoredState);

    expect(nextState.configuredRounds).toBeUndefined();
    expect(nextState.rounds).toHaveLength(2);
    expect(nextState.rounds[1].matches[0].teamA.id).toBe(standings[0].id);
    expect(nextState.rounds[1].matches[0].teamB.id).toBe(standings[1].id);
    expect(nextState.rounds[1].matches[1].teamA.id).toBe(standings[2].id);
    expect(nextState.rounds[1].matches[1].teamB.id).toBe(standings[3].id);
    expect(nextState.rounds[1].byePlayerIds).toBeUndefined();
  });

  it.each([
    [1, 4],
    [2, 8],
    [4, 16],
  ])("runs %i-court / %i-player Fast Makker Mexicano through 50 open-ended rounds", (courts, playerCount) => {
    const state = playRounds(createFixedPartnerMexicanoTournament(playerCount, courts), 50);
    const expectedPairIds = createFixedPartnerTeams(state.players).map((team) => team.id).sort();

    expect(state.configuredRounds).toBeUndefined();
    expect(state.rounds).toHaveLength(50);
    expect(state.activeRoundNumber).toBe(50);
    expect(state.results).toHaveLength(50 * courts);
    expect(canGoToNextRound(state)).toBe(true);
    expect(() => goToNextRound(state)).not.toThrow();

    for (const round of state.rounds) {
      expect(round.matches).toHaveLength(courts);
      expect(round.byePlayerIds).toBeUndefined();
      expect(new Set(round.matches.map((match) => match.id)).size).toBe(courts);

      const roundPairIds = round.matches.flatMap((match) => [match.teamA.id, match.teamB.id]);
      const roundPlayerIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);

      expect(roundPairIds.sort()).toEqual(expectedPairIds);
      expect(new Set(roundPairIds).size).toBe(expectedPairIds.length);
      expect(roundPlayerIds).toHaveLength(playerCount);
      expect(new Set(roundPlayerIds).size).toBe(playerCount);
      expect(roundPlayerIds.sort()).toEqual(state.players.map((player) => player.id).sort());

      for (const match of round.matches) {
        assertFixedPairTeam(match.teamA.playerIds);
        assertFixedPairTeam(match.teamB.playerIds);
        expect(new Set([...match.teamA.playerIds, ...match.teamB.playerIds]).size).toBe(4);
      }
    }
  });

  it.each([
    ["Fri scoring", undefined, undefined],
    ["Fast antal point", "target", 21],
    ["Spil på tid", undefined, undefined],
  ] as const)("saves later generated Fast Makker Mexicano scores with %s", (scoringMode, fixedScoreRule, fixedScorePoints) => {
    const warmupScores = scoringMode === "Fast antal point"
      ? [[21, 9], [18, 21], [21, 16], [21, 8]] as const
      : scorePatterns;
    const state = playRounds(createFixedPartnerMexicanoTournament(16, 4, { scoringMode, fixedScoreRule, fixedScorePoints }), 20, warmupScores);
    const round21 = goToNextRound(state);

    expect(round21.activeRoundNumber).toBe(21);
    expect(() => scoreActiveRound(round21, [[21, 8], [21, 12], [21, 15], [21, 19]])).not.toThrow();
  });

  it.each(["matchPointsFirst", "partiPointsFirst"] as const)("continues from updated pair standings with %s ranking", (rankingMode) => {
    let state = createFixedPartnerMexicanoTournament(16, 4, { rankingMode });

    for (let index = 0; index < 12; index += 1) {
      state = scoreActiveRound(state, scorePatterns);
      const standings = calculateLiveStandings(state);
      state = goToNextRound(state);

      expect(state.rounds.at(-1)?.matches[0].teamA.id).toBe(standings[0].id);
      expect(state.rounds.at(-1)?.matches[0].teamB.id).toBe(standings[1].id);
    }
  });

  it("persists Round 11, Round 20 and Round 50 while preserving fixed-pair identity after reload", () => {
    const state = playRounds(createFixedPartnerMexicanoTournament(16, 4), 49);
    const round50State = goToNextRound(state);
    const round50MatchIds = getLiveMatches(round50State).map((liveMatch) => liveMatch.match.id);

    saveActiveTournament(round50State);
    const reloaded = loadActiveTournament();

    expect(reloaded?.rounds.find((round) => round.roundNumber === 11)).toBeDefined();
    expect(reloaded?.rounds.find((round) => round.roundNumber === 20)).toBeDefined();
    expect(reloaded?.rounds.find((round) => round.roundNumber === 50)?.matches.map((match) => match.id)).toEqual(round50MatchIds);
    expect(() => scoreActiveRound(reloaded ?? fail("Missing reloaded tournament"), [[21, 7], [21, 9], [21, 11], [21, 13]])).not.toThrow();
  });

  it("allows manual finish after arbitrary generated rounds and supports history, sharing snapshots and PDF", () => {
    const active = playRounds(createFixedPartnerMexicanoTournament(16, 4), 23);
    const finished = finishTournament(active, "2026-08-31T20:30:00.000Z");
    const completed = saveCompletedTournament(finished);
    const pdf = createTournamentResultPdf(finished);
    const snapshot = createPublicResultSnapshot({
      resultId: "ABCDEFGHJKLMNPQR",
      tournamentId: "00000000-0000-4000-8000-000000000031",
      state: finished,
    });

    expect(completed.state.status).toBe("finished");
    expect(completed.state.rounds).toHaveLength(23);
    expect(calculateLiveStandings(finished)).toHaveLength(8);
    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(snapshot.format).toBe("fixed-partner-mexicano");
    expect(snapshot.state?.rounds).toHaveLength(23);
  });

  it("preserves existing active configured-round Fast Makker Mexicano behavior", () => {
    const openEnded = createFixedPartnerMexicanoTournament(16, 4);
    let legacy: LiveTournamentState = { ...openEnded, configuredRounds: 3 };

    legacy = playRounds(legacy, 3);

    expect(legacy.configuredRounds).toBe(3);
    expect(legacy.activeRoundNumber).toBe(3);
    expect(canGoToNextRound(legacy)).toBe(false);
    expect(goToNextRound(legacy)).toBe(legacy);
  });
});

function createFixedPartnerMexicanoTournament(
  playerCount: number,
  courts: number,
  overrides: Partial<Pick<Parameters<typeof createTournamentFromSetup>[0], "scoringMode" | "fixedScoreRule" | "fixedScorePoints" | "rankingMode">> = {},
): LiveTournamentState {
  const scoringMode = overrides.scoringMode ?? "Fri scoring";

  return createTournamentFromSetup({
    name: `Fast Makker Mexicano ${playerCount}/${courts}`,
    format: "Fast Makker Mexicano",
    playerText: Array.from({ length: playerCount }, (_, index) => `Spiller ${index + 1}`).join("\n"),
    femalePlayerText: "",
    malePlayerText: "",
    courts,
    rounds: 5,
    scoringMode,
    fixedScoreRule: overrides.fixedScoreRule,
    fixedScorePoints: overrides.fixedScorePoints,
    timeLimitMinutes: scoringMode === "Spil på tid" ? 12 : undefined,
    firstRoundOrder: "manual",
    rankingMode: overrides.rankingMode ?? "matchPointsFirst",
  });
}

function playRounds(state: LiveTournamentState, roundCount: number, scores = scorePatterns): LiveTournamentState {
  let currentState = state;

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    currentState = scoreActiveRound(currentState, scores);

    if (roundNumber < roundCount) {
      expect(canGoToNextRound(currentState)).toBe(true);
      currentState = goToNextRound(currentState);
    }
  }

  return currentState;
}

function scoreActiveRound(state: LiveTournamentState, scores = scorePatterns): LiveTournamentState {
  return getLiveMatches(state).reduce((currentState, liveMatch, index) => saveMatchResult(currentState, {
    matchId: liveMatch.match.id,
    teamAPoints: scores[index % scores.length][0],
    teamBPoints: scores[index % scores.length][1],
  }), state);
}

function assertFixedPairTeam(playerIds: readonly string[]): void {
  expect(playerIds).toHaveLength(2);
  const indexes = playerIds.map((playerId) => Number(playerId.replace("p", ""))).sort((left, right) => left - right);

  expect(indexes[1] - indexes[0]).toBe(1);
  expect(indexes[0] % 2).toBe(1);
}

function fail(message: string): never {
  throw new Error(message);
}
