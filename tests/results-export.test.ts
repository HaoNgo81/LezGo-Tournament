import { describe, expect, it } from "vitest";
import { advanceLivePoolPlayState, advanceLivePoolPlayToFinals, createMockLiveTournamentState, finishTournament, getLiveMatches, goToNextRound, saveMatchResult, saveNextPoolPhaseResult, savePoolFinalResult, savePoolPlacementTiebreakResult, type LiveTournamentState } from "../lib/live-scoring";
import { createTournamentResultFileName, createTournamentResultLines, createTournamentResultPdf } from "../lib/results-export";
import { createTournamentResultPdfLayoutDiagnostics } from "../lib/results-export/pdf-export";
import { createPoolTournamentFromSetup, createTournamentFromSetup, type TournamentSetupFormat } from "../lib/tournament-setup";
import type { TournamentMatch } from "../lib/tournament-engine";

const fourPlayerText = Array.from({ length: 4 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const eightPlayerText = Array.from({ length: 8 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const sixteenPlayerText = Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const eightFemalePlayerText = Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n");
const eightMalePlayerText = Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n");

describe("result export", () => {
  it.each([
    ["Americano", "Americano"],
    ["Mexicano", "Mexicano"],
    ["Mixed Americano", "Mixed Americano"],
    ["Fast Makker Americano", "Fast Makker Americano"],
    ["Fast Makker Mexicano", "Fast Makker Mexicano"],
  ] as const)("exports completed five-round %s tournaments", (format, expectedLabel) => {
    const finishedState = finishTournament(scoreAllConfiguredRounds(createStandardTournament(format)), "2026-08-04T18:00:00.000Z");
    const lines = createTournamentResultLines(finishedState);
    const pdf = createTournamentResultPdf(finishedState);

    expect(lines).toContain(`Format: ${expectedLabel}`);
    expect(lines).toContain("Status: Afsluttet");
    expect(lines).toContain("Spillere: 16");
    expect(lines).toContain("Runder: 5");
    expect(lines).toContain("Runde 5");
    expect(lines).toContain("KAMPRESULTATER");
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
  });

  it("creates result lines with tournament metadata, standings and match results", () => {
    const state = createMockLiveTournamentState();
    const firstMatch = getLiveMatches(state)[0].match;
    const scoredState = saveMatchResult(state, { matchId: firstMatch.id, teamAPoints: 21, teamBPoints: 12 });
    const finishedState = finishTournament(scoredState, "2026-08-04T18:00:00.000Z");

    const lines = createTournamentResultLines(finishedState);

    expect(lines).toContain("LEZGO Padel - Mock Americano");
    expect(lines).toContain("Status: Afsluttet");
    expect(lines).toContain("Format: Americano");
    expect(lines).toContain("Ranking: Flest matchpoint");
    expect(lines).toContain("Placering | Navn | Matchpoint | Scorepoint | Tabte | Difference | Sejre | Uafgjort | Tab");
    expect(lines).toContain("SLUTSTILLING");
    expect(lines).toContain("KAMPRESULTATER");
    expect(lines).toContain("Bane 1: Anna / Hassan vs Maja / Noah - 21-12");
  });

  it("creates a downloadable pdf byte stream", () => {
    const state = finishTournament(createMockLiveTournamentState(), "2026-08-04T18:00:00.000Z");
    const pdf = createTournamentResultPdf(state);
    const header = new TextDecoder().decode(pdf.slice(0, 8));

    expect(header).toBe("%PDF-1.4");
    expect(getPdfPageCount(pdf)).toBe(1);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it.each([
    ["Scenario A", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", { name: "A 4 spillere 1 bane", playerText: fourPlayerText, courts: 1, rounds: 3 })), "2026-08-04T18:00:00.000Z"), 3, 1, "relaxed", 1, [[1, 2, 3]]],
    ["Scenario B", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", { name: "B 8 spillere 2 baner", playerText: eightPlayerText, courts: 2, rounds: 8 })), "2026-08-04T18:00:00.000Z"), 8, 2, "standard", 1, [[1, 2, 3, 4, 5, 6, 7, 8]]],
    ["Scenario C", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", { name: "Chopstick Mex v1", courts: 4, rounds: 20 })), "2026-08-04T18:00:00.000Z"), 20, 4, "dense", 2, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18, 19, 20]]],
    ["Scenario D", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Fast Makker Mexicano", { name: "D stor fast makker", courts: 4, rounds: 20 })), "2026-08-04T18:00:00.000Z"), 20, 4, "dense", 2, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18, 19, 20]]],
    ["Scenario E", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mixed Americano", { name: "E mixed format", courts: 4, rounds: 8 })), "2026-08-04T18:00:00.000Z"), 8, 4, "compact", 1, [[1, 2, 3, 4, 5, 6, 7, 8]]],
    ["Scenario F", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", { name: "F 25 runder", courts: 4, rounds: 25 })), "2026-08-04T18:00:00.000Z"), 25, 4, "dense", 3, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], [25]]],
  ] as const)("paginates %s without dropping completed data", (_label, state, expectedRounds, expectedCourts, expectedDensity, expectedPages, expectedRoundPages) => {
    const pdf = createTournamentResultPdf(state);
    const lines = createTournamentResultLines(state);
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    expect(getPdfPageCount(pdf)).toBe(expectedPages);
    expect(diagnostics).toMatchObject({
      completedRounds: expectedRounds,
      courtColumns: expectedCourts,
      density: expectedDensity,
      fitsOnePage: true,
      orientation: "portrait",
      pageCount: expectedPages,
    });
    expect(diagnostics.pageRoundRanges.map((range) => range.roundNumbers)).toEqual(expectedRoundPages);
    diagnostics.pageRoundRanges.forEach((range) => {
      expect(range.roundNumbers.length).toBeLessThanOrEqual(12);
    });
    expect(diagnostics.maxDrawnX).toBeLessThanOrEqual(595);
    expect(diagnostics.maxDrawnY).toBeLessThanOrEqual(842);
    expect(diagnostics.resultFontSize).toBeGreaterThanOrEqual(diagnostics.minimumFontSize);
    expect(diagnostics.standingsFontSize).toBeGreaterThanOrEqual(diagnostics.minimumFontSize);
    expect(lines).toContain(`Runde ${expectedRounds}`);
    expect(lines).toContain(`Bane ${expectedCourts}: ${formatTeamLineFragment(state.rounds[0].matches[expectedCourts - 1], state)} - 21-${10 + expectedCourts - 1}`);
    expect(lines.filter((line) => /^Runde \d+$/.test(line))).toHaveLength(expectedRounds);
    expect(lines.filter((line) => line.startsWith("Bane "))).toHaveLength(expectedRounds * expectedCourts);
    state.players.forEach((player) => {
      expect(lines.join("\n")).toContain(player.name);
    });
  });

  it.each([
    [13, 2, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [13]]],
    [24, 2, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]]],
    [25, 3, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], [25]]],
    [36, 3, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]]],
    [37, 4, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36], [37]]],
  ] as const)("splits %s completed rounds into pages of at most 12 rounds", (rounds, expectedPages, expectedRoundPages) => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      courts: 4,
      name: `${rounds} runder boundary`,
      rounds,
    })), "2026-08-04T18:00:00.000Z");
    const pdf = createTournamentResultPdf(state);
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    expect(getPdfPageCount(pdf)).toBe(expectedPages);
    expect(diagnostics.pageCount).toBe(expectedPages);
    expect(diagnostics.pageRoundRanges.map((range) => range.roundNumbers)).toEqual(expectedRoundPages);
    expect(diagnostics.pageRoundRanges.every((range) => range.roundNumbers.length <= 12)).toBe(true);
    expect(diagnostics.fitsOnePage).toBe(true);
  });

  it("keeps a long tournament title inside the one-page PDF header", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", {
      name: "Sommerfinale med ekstra lang klubtitel og sponsornavn uden headerkollision",
      playerText: eightPlayerText,
      courts: 2,
      rounds: 8,
    })), "2026-08-04T18:00:00.000Z");
    const pdf = createTournamentResultPdf(state);
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    expect(getPdfPageCount(pdf)).toBe(1);
    expect(diagnostics.fitsOnePage).toBe(true);
    expect(diagnostics.maxDrawnX).toBeLessThanOrEqual(595);
    expect(diagnostics.maxDrawnY).toBeLessThanOrEqual(842);
  });

  it("creates pool-play result lines with pool standings and next phase matches", () => {
    const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament());
    const matchId = advancedState.poolPlay?.crossMatchStage?.groups[0].encounters[0].id;

    if (!matchId) {
      throw new Error("Cross-match was not created.");
    }

    const scoredState = saveNextPoolPhaseResult(advancedState, { matchId, teamAPoints: 21, teamBPoints: 18 });
    const finishedState = finishTournament(scoredState, "2026-08-04T18:00:00.000Z");
    const lines = createTournamentResultLines(finishedState);

    expect(lines).toContain("Format: Puljespil");
    expect(lines).toContain("PULJESTILLINGER");
    expect(lines).toContain("Pulje 1");
    expect(lines).toContain("NÆSTE FASE");
    expect(lines).toContain("Krydsspil 1, Kamp 1: Par A vs Par D - 21-18");
  });

  it("exports automatic pool-play advances without inventing a score", () => {
    const finishedState = finishTournament(advanceLivePoolPlayState(createCompletedInitialPoolTournament({
      name: "Ulige puljer",
      participantText: ["Par A", "Par B", "Par C", "Par D", "Par E", "Par F"].join("\n"),
      poolCount: 3,
      unmatchedResolution: "walkover",
    })), "2026-08-04T18:00:00.000Z");
    const lines = createTournamentResultLines(finishedState);

    expect(lines).toContain("AUTOMATISK VIDERE");
    expect(lines).toContain("Par E (Pulje 3, nr. 1) - Walkover");
    expect(lines).toContain("Par F (Pulje 3, nr. 2) - Walkover");
    expect(lines.join("\n")).not.toContain("Par E vs");
  });

  it("exports pool-play final and bronze matches", () => {
    const finalState = scoreFinalAndBronze(createFinalPoolTournament());
    const finishedState = finishTournament(finalState, "2026-08-04T18:00:00.000Z");
    const lines = createTournamentResultLines(finishedState);

    expect(lines).toContain("SLUTPLACERINGER");
    expect(lines).toContain("1. Par A (Finalespil 1)");
    expect(lines).toContain("2. Par C (Finalespil 1)");
    expect(lines).toContain("3. Par D (Finalespil 1)");
    expect(lines).toContain("4. Par B (Finalespil 1)");
    expect(lines).toContain("FINALER");
    expect(lines).toContain("Finalespil 1, Finale: Par A vs Par C - 21-19");
    expect(lines).toContain("Finalespil 1, Bronzekamp: Par D vs Par B - 21-16");
  });

  it("exports pool-play placement-pool placements", () => {
    const finishedState = finishTournament(scorePlacementPoolTournament(), "2026-08-04T18:00:00.000Z");
    const lines = createTournamentResultLines(finishedState);

    expect(lines).toContain("SLUTPLACERINGER");
    expect(lines).toContain("1. Par A (Placeringspulje 1)");
    expect(lines).toContain("2. Par C (Placeringspulje 1)");
    expect(lines).toContain("3. Par D (Placeringspulje 2)");
    expect(lines).toContain("4. Par B (Placeringspulje 2)");
  });

  it("exports match-tiebreak decided pool-play placements", () => {
    const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament({ advancementMode: "placementPools" }));
    const tieBreakState = saveNextPoolPhaseResult(advancedState, {
      matchId: "placement-pool-1-match-1",
      teamAPoints: 20,
      teamBPoints: 20,
      tieBreakWinner: "teamB",
    });
    const lines = createTournamentResultLines(finishTournament(tieBreakState, "2026-08-04T18:00:00.000Z"));

    expect(lines).toContain("1. Par C (Placeringspulje 1)");
    expect(lines).toContain("2. Par A (Placeringspulje 1)");
    expect(lines).toContain("Placeringspulje 1, Kamp 1: Par A vs Par C - 20-20 (MTB: hold B)");
  });

  it("exports separate individual Americano placement tiebreaks", () => {
    const tieBreakState = savePoolPlacementTiebreakResult(scoreIndividualCrossMatchAmericanoTournament(), {
      matchId: "cross-group-1-placement-tiebreak-2-3",
      teamAPoints: 10,
      teamBPoints: 7,
    });
    const lines = createTournamentResultLines(finishTournament(tieBreakState, "2026-08-04T18:00:00.000Z"));

    expect(lines).toContain("SLUTPLACERINGER");
    expect(lines).toContain("1. Alpha (Krydsspil 1)");
    expect(lines).toContain("2. Birk (Krydsspil 1)");
    expect(lines).toContain("3. Echo (Krydsspil 1)");
    expect(lines).toContain("4. Freja (Krydsspil 1)");
    expect(lines).toContain("TIEBREAK OM PLACERING");
    expect(lines).toContain("Krydsspil 1, Tiebreak om 2. / 3. plads: Birk vs Echo - 10-7");
  });

  it("exports pending separate individual Americano placement tiebreaks before placements", () => {
    const lines = createTournamentResultLines(finishTournament(scoreIndividualCrossMatchAmericanoTournament(), "2026-08-04T18:00:00.000Z"));

    expect(lines).not.toContain("SLUTPLACERINGER");
    expect(lines).toContain("TIEBREAK OM PLACERING");
    expect(lines).toContain("Krydsspil 1, Tiebreak om 2. / 3. plads: Birk vs Echo - Ikke spillet");
  });

  it("exports unmatched final player pool Americano placement play", () => {
    const lines = createTournamentResultLines(finishTournament(scoreIndividualOddPoolCrossMatchTournament(), "2026-08-04T18:00:00.000Z"));

    expect(lines).toContain("1. Alpha (Krydsspil 1)");
    expect(lines).toContain("4. Birk (Krydsspil 1)");
    expect(lines).toContain("5. Iben (Placeringsspil 2)");
    expect(lines).toContain("8. Jens (Placeringsspil 2)");
    expect(lines).toContain("Placeringsspil 2, Runde 1, bane 1: Iben / Liam vs Jens / Karla - 30-0");
    expect(lines.join("\n")).not.toContain("AUTOMATISK VIDERE");
  });

  it("creates a safe pdf file name", () => {
    const state = { ...createMockLiveTournamentState(), tournamentName: "Fredag Padel #1" };

    expect(createTournamentResultFileName(state)).toBe("fredag-padel-1-resultater.pdf");
  });
});

function createPoolTournament(overrides: Partial<Parameters<typeof createPoolTournamentFromSetup>[0]> = {}) {
  return createPoolTournamentFromSetup({
    name: overrides.name ?? "Lørdag Puljespil",
    participantType: overrides.participantType ?? "pair",
    participantText: overrides.participantText ?? ["Par A", "Par B", "Par C", "Par D"].join("\n"),
    poolCount: overrides.poolCount ?? 2,
    participantsPerPool: overrides.participantsPerPool ?? 2,
    advancementMode: overrides.advancementMode ?? "crossMatches",
    unmatchedResolution: overrides.unmatchedResolution ?? "bye",
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
  });
}

function createStandardTournament(format: TournamentSetupFormat, overrides: Partial<{
  courts: number;
  femalePlayerText: string;
  malePlayerText: string;
  name: string;
  playerText: string;
  rounds: number;
}> = {}): LiveTournamentState {
  return createTournamentFromSetup({
    name: overrides.name ?? `${format} 16/4`,
    format,
    playerText: overrides.playerText ?? (format === "Mixed Americano" ? "" : sixteenPlayerText),
    femalePlayerText: overrides.femalePlayerText ?? (format === "Mixed Americano" ? eightFemalePlayerText : ""),
    malePlayerText: overrides.malePlayerText ?? (format === "Mixed Americano" ? eightMalePlayerText : ""),
    courts: overrides.courts ?? 4,
    rounds: overrides.rounds ?? 5,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function scoreActiveRound(state: LiveTournamentState): LiveTournamentState {
  return getLiveMatches(state).reduce((currentState, liveMatch, index) => (
    saveMatchResult(currentState, {
      matchId: liveMatch.match.id,
      teamAPoints: 21,
      teamBPoints: 10 + index,
    })
  ), state);
}

function scoreAllConfiguredRounds(state: LiveTournamentState): LiveTournamentState {
  let currentState = state;
  const configuredRounds = currentState.configuredRounds ?? currentState.rounds.length;

  for (let roundNumber = 1; roundNumber <= configuredRounds; roundNumber += 1) {
    currentState = scoreActiveRound(currentState);

    if (roundNumber < configuredRounds) {
      currentState = goToNextRound(currentState);
    }
  }

  return currentState;
}

function formatTeamLineFragment(match: TournamentMatch, state: LiveTournamentState): string {
  const players = new Map(state.players.map((player) => [player.id, player.name]));
  const teamA = match.teamA.playerIds.map((playerId) => players.get(playerId) ?? playerId).join(" / ");
  const teamB = match.teamB.playerIds.map((playerId) => players.get(playerId) ?? playerId).join(" / ");

  return `${teamA} vs ${teamB}`;
}

function getPdfPageCount(pdf: Uint8Array): number {
  const text = new TextDecoder().decode(pdf);
  const match = /\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/.exec(text);

  return match ? Number(match[1]) : 0;
}

function createCompletedInitialPoolTournament(overrides: Partial<Parameters<typeof createPoolTournamentFromSetup>[0]> = {}) {
  let state = createPoolTournament(overrides);
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const encounter of pool.encounters) {
      const currentPoolPlay = state.poolPlay;

      if (!currentPoolPlay) {
        throw new Error("Pool play state was removed.");
      }

      state = {
        ...state,
        poolPlay: {
          ...currentPoolPlay,
          initialResults: [
            ...currentPoolPlay.initialResults,
            { matchId: encounter.id, teamAPoints: 21, teamBPoints: 10 },
          ],
        },
      };
    }
  }

  return state;
}

function createFinalPoolTournament() {
  const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament());
  const encounters = advancedState.poolPlay?.crossMatchStage?.groups[0].encounters;

  if (!encounters) {
    throw new Error("Cross matches were not created.");
  }

  return advanceLivePoolPlayToFinals(
    saveNextPoolPhaseResult(
      saveNextPoolPhaseResult(advancedState, { matchId: encounters[0].id, teamAPoints: 21, teamBPoints: 18 }),
      { matchId: encounters[1].id, teamAPoints: 17, teamBPoints: 21 },
    ),
  );
}

function scoreFinalAndBronze(state: ReturnType<typeof createFinalPoolTournament>) {
  return savePoolFinalResult(
    savePoolFinalResult(state, {
      matchId: "cross-group-1-final",
      teamAPoints: 21,
      teamBPoints: 19,
    }),
    {
      matchId: "cross-group-1-bronze",
      teamAPoints: 21,
      teamBPoints: 16,
    },
  );
}

function scorePlacementPoolTournament() {
  const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament({ advancementMode: "placementPools" }));

  return saveNextPoolPhaseResult(
    saveNextPoolPhaseResult(advancedState, {
      matchId: "placement-pool-1-match-1",
      teamAPoints: 21,
      teamBPoints: 17,
    }),
    {
      matchId: "placement-pool-2-match-1",
      teamAPoints: 14,
      teamBPoints: 21,
    },
  );
}

function createCompletedInitialPlayerPoolTournament() {
  let state = createPoolTournament({
    participantType: "player",
    participantText: ["Alpha", "Birk", "Clara", "David", "Echo", "Freja", "Greta", "Helge"].join("\n"),
    participantsPerPool: 4,
  });
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const round of pool.americanoRounds) {
      for (const match of round.matches) {
        const currentPoolPlay = state.poolPlay;

        if (!currentPoolPlay) {
          throw new Error("Pool play state was removed.");
        }

        state = {
          ...state,
          poolPlay: {
            ...currentPoolPlay,
            initialResults: [
              ...currentPoolPlay.initialResults,
              { matchId: match.id, teamAPoints: 10, teamBPoints: 10 },
            ],
          },
        };
      }
    }
  }

  return state;
}

function scoreIndividualCrossMatchAmericanoTournament() {
  let state = advanceLivePoolPlayState(createCompletedInitialPlayerPoolTournament());
  const matches = state.poolPlay?.crossMatchStage?.groups[0].americanoRounds.flatMap((round) => round.matches);

  if (!matches) {
    throw new Error("Cross-match Americano rounds were not created.");
  }

  const scores = [
    { teamAPoints: 20, teamBPoints: 20 },
    { teamAPoints: 20, teamBPoints: 10 },
    { teamAPoints: 20, teamBPoints: 10 },
  ];

  matches.forEach((match, index) => {
    state = saveNextPoolPhaseResult(state, {
      matchId: match.id,
      ...scores[index],
    });
  });

  return state;
}

function createCompletedInitialOddPlayerPoolTournament() {
  let state = createPoolTournament({
    participantType: "player",
    participantText: ["Alpha", "Birk", "Clara", "David", "Echo", "Freja", "Greta", "Helge", "Iben", "Jens", "Karla", "Liam"].join("\n"),
    poolCount: 3,
    participantsPerPool: 4,
  });
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const round of pool.americanoRounds) {
      for (const match of round.matches) {
        const currentPoolPlay = state.poolPlay;

        if (!currentPoolPlay) {
          throw new Error("Pool play state was removed.");
        }

        state = {
          ...state,
          poolPlay: {
            ...currentPoolPlay,
            initialResults: [
              ...currentPoolPlay.initialResults,
              { matchId: match.id, teamAPoints: 10, teamBPoints: 10 },
            ],
          },
        };
      }
    }
  }

  return state;
}

function scoreIndividualOddPoolCrossMatchTournament() {
  let state = advanceLivePoolPlayState(createCompletedInitialOddPlayerPoolTournament());
  const matches = [
    ...(state.poolPlay?.crossMatchStage?.groups[0].americanoRounds.flatMap((round) => round.matches) ?? []),
    ...(state.poolPlay?.crossMatchStage?.unmatchedPlacementGroups[0].americanoRounds.flatMap((round) => round.matches) ?? []),
  ];

  if (matches.length !== 6) {
    throw new Error("Expected paired and unmatched Americano matches.");
  }

  [
    { teamAPoints: 30, teamBPoints: 0 },
    { teamAPoints: 20, teamBPoints: 5 },
    { teamAPoints: 10, teamBPoints: 15 },
    { teamAPoints: 30, teamBPoints: 0 },
    { teamAPoints: 20, teamBPoints: 5 },
    { teamAPoints: 10, teamBPoints: 15 },
  ].forEach((score, index) => {
    state = saveNextPoolPhaseResult(state, {
      matchId: matches[index].id,
      ...score,
    });
  });

  return state;
}
