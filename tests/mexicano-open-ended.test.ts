import { beforeEach, describe, expect, it } from "vitest";
import { createNextMexicanoRoundFromPlayerRanking } from "../lib/tournament-engine";
import { calculateLiveStandings, canGoToNextRound, finishTournament, getLiveMatches, goToNextRound, saveMatchResult, type LiveTournamentState } from "../lib/live-scoring";
import { createTournamentFromSetup, loadActiveTournament, saveActiveTournament, saveCompletedTournament } from "../lib/tournament-setup";
import { createTournamentResultPdf } from "../lib/results-export";
import { createPublicResultSnapshot } from "../lib/results-sharing";

const scorePatterns: ReadonlyArray<readonly [number, number]> = [[21, 10], [18, 21], [19, 19], [24, 12]];

describe("Mexicano open-ended rounds", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates new Mexicano tournaments without configured rounds or byes", () => {
    const state = createMexicanoTournament(8, 2);

    expect(state.format).toBe("mexicano");
    expect(state.configuredRounds).toBeUndefined();
    expect(state.automaticCycle).toBeUndefined();
    expect(state.rounds).toHaveLength(1);
    expect(state.rounds[0].matches).toHaveLength(2);
    expect(state.rounds[0].byePlayerIds).toBeUndefined();
  });

  it.each([
    [5, 1],
    [9, 2],
    [17, 4],
  ])("rejects %i players on %i Mexicano court(s)", (playerCount, courts) => {
    expect(() => createMexicanoTournament(playerCount, courts)).toThrow("Mexicano kræver præcis 4 spillere pr. bane.");
  });

  it("generates Round 2 from current standings using the existing Mexicano ranking algorithm", () => {
    const roundOne = scoreActiveRound(createMexicanoTournament(8, 2), [[5, 21], [21, 8]]);
    const rankedPlayers = getRankedPlayers(roundOne);
    const expectedRoundTwo = createNextMexicanoRoundFromPlayerRanking(rankedPlayers, 2, 2);
    const roundTwo = goToNextRound(roundOne);

    expect(roundTwo.rounds[1]).toEqual(expectedRoundTwo);
    expect(roundTwo.rounds[1].byePlayerIds).toBeUndefined();
  });

  it.each([
    [4, 1],
    [8, 2],
    [16, 4],
  ])("runs %i-player / %i-court Mexicano through 50 open-ended rounds", (playerCount, courts) => {
    const state = playRounds(createMexicanoTournament(playerCount, courts), 50);

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

      const playerIds = round.matches.flatMap((match) => [...match.teamA.playerIds, ...match.teamB.playerIds]);
      expect(playerIds).toHaveLength(playerCount);
      expect(new Set(playerIds).size).toBe(playerCount);
      expect(playerIds.sort()).toEqual(state.players.map((player) => player.id).sort());

      for (const match of round.matches) {
        expect(new Set([...match.teamA.playerIds, ...match.teamB.playerIds]).size).toBe(4);
      }
    }
  });

  it.each([
    ["Fri scoring", undefined, undefined],
    ["Fast antal point", "target", 21],
    ["Spil på tid", undefined, undefined],
  ] as const)("saves later generated Mexicano scores with %s", (scoringMode, fixedScoreRule, fixedScorePoints) => {
    const state = playRounds(createMexicanoTournament(8, 2, { scoringMode, fixedScoreRule, fixedScorePoints }), 20);
    const round21 = goToNextRound(state);

    expect(round21.activeRoundNumber).toBe(21);
    expect(() => scoreActiveRound(round21, [[21, 8], [21, 12]])).not.toThrow();
  });

  it.each(["matchPointsFirst", "partiPointsFirst"] as const)("continues from updated standings with %s ranking", (rankingMode) => {
    let state = createMexicanoTournament(16, 4, { rankingMode });

    for (let index = 0; index < 12; index += 1) {
      state = scoreActiveRound(state, scorePatterns);
      const expectedNextRound = createNextMexicanoRoundFromPlayerRanking(getRankedPlayers(state), state.activeRoundNumber + 1, 4);
      state = goToNextRound(state);
      expect(state.rounds[state.rounds.length - 1]).toEqual(expectedNextRound);
    }
  });

  it("persists Round 11, Round 20, Round 50 and allows scoring after reload", () => {
    const state = playRounds(createMexicanoTournament(8, 2), 49);
    const round50State = goToNextRound(state);
    const round50MatchIds = getLiveMatches(round50State).map((liveMatch) => liveMatch.match.id);

    saveActiveTournament(round50State);
    const reloaded = loadActiveTournament();

    expect(reloaded?.rounds.find((round) => round.roundNumber === 11)).toBeDefined();
    expect(reloaded?.rounds.find((round) => round.roundNumber === 20)).toBeDefined();
    expect(reloaded?.rounds.find((round) => round.roundNumber === 50)?.matches.map((match) => match.id)).toEqual(round50MatchIds);
    expect(() => scoreActiveRound(reloaded ?? fail("Missing reloaded tournament"), [[21, 7], [21, 9]])).not.toThrow();
  });

  it("allows manual finish after arbitrary generated rounds and supports history, sharing and PDF", () => {
    const active = playRounds(createMexicanoTournament(16, 4), 23);
    const finished = finishTournament(active, "2026-08-31T20:00:00.000Z");
    const completed = saveCompletedTournament(finished);
    const pdf = createTournamentResultPdf(finished);
    const snapshot = createPublicResultSnapshot({
      resultId: "ABCDEFGHJKLMNPQR",
      tournamentId: "00000000-0000-4000-8000-000000000030",
      state: finished,
    });

    expect(completed.state.status).toBe("finished");
    expect(completed.state.rounds).toHaveLength(23);
    expect(calculateLiveStandings(finished)).toHaveLength(16);
    expect(pdf.byteLength).toBeGreaterThan(1000);
    expect(snapshot.format).toBe("mexicano");
    expect(snapshot.state?.rounds).toHaveLength(23);
  });

  it("preserves existing active configured-round Mexicano behavior", () => {
    const openEnded = createMexicanoTournament(8, 2);
    let legacy: LiveTournamentState = { ...openEnded, configuredRounds: 3 };

    legacy = playRounds(legacy, 3);

    expect(legacy.configuredRounds).toBe(3);
    expect(legacy.activeRoundNumber).toBe(3);
    expect(canGoToNextRound(legacy)).toBe(false);
    expect(goToNextRound(legacy)).toBe(legacy);
  });
});

function createMexicanoTournament(
  playerCount: number,
  courts: number,
  overrides: Partial<Pick<Parameters<typeof createTournamentFromSetup>[0], "scoringMode" | "fixedScoreRule" | "fixedScorePoints" | "rankingMode">> = {},
): LiveTournamentState {
  const scoringMode = overrides.scoringMode ?? "Fri scoring";

  return createTournamentFromSetup({
    name: `Mexicano ${playerCount}/${courts}`,
    format: "Mexicano",
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

function playRounds(state: LiveTournamentState, roundCount: number): LiveTournamentState {
  let currentState = state;

  for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
    currentState = scoreActiveRound(currentState);

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

function getRankedPlayers(state: LiveTournamentState) {
  const playerById = new Map(state.players.map((player) => [player.id, player]));

  return calculateLiveStandings(state)
    .map((row) => playerById.get(row.id))
    .filter((player): player is LiveTournamentState["players"][number] => Boolean(player));
}

function fail(message: string): never {
  throw new Error(message);
}
