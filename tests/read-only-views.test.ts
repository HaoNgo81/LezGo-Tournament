import { describe, expect, it } from "vitest";
import { advanceLivePoolPlayState, advanceLivePoolPlayToFinals, createMockLiveTournamentState, getLiveMatches, saveMatchResult, saveNextPoolPhaseResult, savePoolFinalResult, savePoolPlacementTiebreakResult, type LiveTournamentState } from "../lib/live-scoring";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView } from "../lib/read-only-views";
import { createPoolTournamentFromSetup, createTeamVsTeamTournamentFromSetup, createTournamentFromSetup, type TournamentSetupFormat } from "../lib/tournament-setup";
import type { TeamVsTeamRoundLineup, TeamVsTeamRoundResult, TeamVsTeamTeam } from "../lib/team-vs-team";

const sixteenPlayerText = Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n");
const eightFemalePlayerText = Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n");
const eightMalePlayerText = Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n");

describe("read-only tournament views", () => {
  it("creates QR and TV data from the active tournament state", () => {
    const state = createMockLiveTournamentState();
    const [firstMatch] = getLiveMatches(state);
    const scoredState = saveMatchResult(state, { matchId: firstMatch.match.id, teamAPoints: 21, teamBPoints: 15 });
    const view = createReadOnlyTournamentView(scoredState);

    expect(view).toMatchObject({
      tournamentName: "Mock Americano",
      activeRoundNumber: 1,
      totalRounds: 2,
      courts: 2,
      players: 8,
    });
    expect(view.matches[0]).toMatchObject({ court: "Bane 1", score: "21 - 15", status: "Afsluttet" });
    expect(view.playerInfo[0]).toMatchObject({
      playerName: "Anna",
      rank: 1,
      court: "Bane 1",
      partnerName: "Hassan",
      opponents: "Maja / Noah",
    });
    expect(view.standings[0]).toMatchObject({ id: "p1", matchPoints: 3, pointsFor: 21 });
  });

  it.each([
    ["Americano", 16],
    ["Mexicano", 16],
    ["Mixed Americano", 16],
    ["Fast Makker Americano", 8],
    ["Fast Makker Mexicano", 8],
  ] as const)("creates QR and TV data for standard %s tournaments", (format, expectedStandingRows) => {
    const view = createReadOnlyTournamentView(scoreActiveRound(createStandardTournament(format)));
    const expectedTotalRounds = format === "Americano" ? 15 : format === "Fast Makker Americano" ? 7 : format === "Mixed Americano" ? 8 : 5;

    expect(view).toMatchObject({
      format: "standard",
      activeRoundNumber: 1,
      totalRounds: expectedTotalRounds,
      courts: 4,
      players: 16,
    });
    expect(view.matches).toHaveLength(4);
    expect(view.standings).toHaveLength(expectedStandingRows);
  });


  it("creates Team vs. Team QR and TV data from the active holdkamp", () => {
    const tournament = createTeamVsTeamTournamentFromSetup({
      name: "Klubkamp",
      scoringMode: "Fri scoring",
      teamCount: 2,
      playersPerTeam: 4,
      matchFormat: "oneSet",
      teams: [createTeam("a", "Hold A"), createTeam("b", "Hold B")],
    });
    const stateWithLineup = {
      ...tournament,
      status: "active" as const,
      matchups: [
        {
          ...tournament.matchups[0],
          lineups: [lineup(1)],
          roundResults: [round(1, 6, 4, 3, 6)],
        },
      ],
    };

    const view = createTeamVsTeamReadOnlyView(stateWithLineup);

    expect(view).toMatchObject({
      tournamentName: "Klubkamp",
      activeMatchLabel: "Holdkamp",
      activeRoundNumber: 2,
      totalRounds: 3,
      teamsCount: 2,
      playersPerTeam: 4,
      matchFormat: "1 sæt",
    });
    expect(view.teams[0]).toMatchObject({ teamName: "Hold A", captainName: "Hold A spiller 1" });
    expect(view.matches).toEqual([]);
    expect(view.standings[0]).toMatchObject({ teamName: "Hold A", matchWins: 1, matchLosses: 1 });
  });
  it("marks rounds as live, completed, or upcoming", () => {
    const state = createMockLiveTournamentState();
    const [firstMatch, secondMatch] = getLiveMatches(state);
    const firstSave = saveMatchResult(state, { matchId: firstMatch.match.id, teamAPoints: 21, teamBPoints: 15 });
    const completedRound = saveMatchResult(firstSave, { matchId: secondMatch.match.id, teamAPoints: 12, teamBPoints: 12 });
    const view = createReadOnlyTournamentView(completedRound);

    expect(view.rounds).toEqual([
      { roundNumber: 1, label: "afsluttet" },
      { roundNumber: 2, label: "kommende" },
    ]);
  });

  it("creates QR and TV data for pool-play standings and next phase matches", () => {
    const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament());
    const matchId = advancedState.poolPlay?.crossMatchStage?.groups[0].encounters[0].id;

    if (!matchId) {
      throw new Error("Cross-match was not created.");
    }

    const scoredState = saveNextPoolPhaseResult(advancedState, { matchId, teamAPoints: 21, teamBPoints: 18 });
    const view = createReadOnlyTournamentView(scoredState);

    expect(view).toMatchObject({
      tournamentName: "Lørdag Puljespil",
      format: "pool-play",
      players: 4,
      courts: 2,
    });
    expect(view.poolPlay).toMatchObject({
      phase: "Krydskampe",
      participantCount: 4,
      poolCount: 2,
    });
    expect(view.poolPlay?.initialStandings[0].poolName).toBe("Pulje 1");
    expect(view.poolPlay?.nextPhaseMatches[0]).toMatchObject({
      court: "Krydsspil 1 · Kamp 1",
      teamA: "Par A",
      teamB: "Par D",
      score: "21 - 18",
      status: "Afsluttet",
    });
  });

  it("includes automatic pool-play advances in read-only data", () => {
    const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament({
      name: "Ulige puljer",
      participantText: ["Par A", "Par B", "Par C", "Par D", "Par E", "Par F"].join("\n"),
      poolCount: 3,
      unmatchedResolution: "walkover",
    }));
    const view = createReadOnlyTournamentView(advancedState);

    expect(view.poolPlay?.automaticAdvances).toEqual([
      expect.objectContaining({ participantName: "Par E", sourcePoolName: "Pulje 3", sourceRank: 1, resolution: "walkover" }),
      expect.objectContaining({ participantName: "Par F", sourcePoolName: "Pulje 3", sourceRank: 2, resolution: "walkover" }),
    ]);
    expect(view.poolPlay?.nextPhaseMatches).toHaveLength(2);
  });

  it("includes pool-play final and bronze matches in read-only data", () => {
    const finalState = scoreFinalAndBronze(createFinalPoolTournament());
    const view = createReadOnlyTournamentView(finalState);

    expect(view.poolPlay).toMatchObject({
      phase: "Finaler",
      finalMatches: [
        expect.objectContaining({
          court: "Finalespil 1 · Finale",
          teamA: "Par A",
          teamB: "Par C",
          score: "21 - 19",
          status: "Afsluttet",
        }),
        expect.objectContaining({
          court: "Finalespil 1 · Bronzekamp",
          teamA: "Par D",
          teamB: "Par B",
          score: "21 - 16",
          status: "Afsluttet",
        }),
      ],
      finalPlacements: [
        { rank: 1, participantName: "Par A", groupName: "Finalespil 1" },
        { rank: 2, participantName: "Par C", groupName: "Finalespil 1" },
        { rank: 3, participantName: "Par D", groupName: "Finalespil 1" },
        { rank: 4, participantName: "Par B", groupName: "Finalespil 1" },
      ],
    });
    expect(view.poolPlay?.nextPhaseMatches).toHaveLength(2);
  });

  it("does not calculate pool-play final placements from drawn final matches", () => {
    const drawnBronzeState = savePoolFinalResult(
      savePoolFinalResult(createFinalPoolTournament(), {
        matchId: "cross-group-1-final",
        teamAPoints: 21,
        teamBPoints: 19,
      }),
      {
        matchId: "cross-group-1-bronze",
        teamAPoints: 20,
        teamBPoints: 20,
      },
    );

    const view = createReadOnlyTournamentView(drawnBronzeState);

    expect(view.poolPlay?.finalPlacements).toEqual([]);
  });

  it("calculates pool-play final placements from match tiebreak winners", () => {
    const tieBreakState = savePoolFinalResult(
      savePoolFinalResult(createFinalPoolTournament(), {
        matchId: "cross-group-1-final",
        teamAPoints: 20,
        teamBPoints: 20,
        tieBreakWinner: "teamB",
      }),
      {
        matchId: "cross-group-1-bronze",
        teamAPoints: 18,
        teamBPoints: 18,
        tieBreakWinner: "teamA",
      },
    );
    const view = createReadOnlyTournamentView(tieBreakState);

    expect(view.poolPlay?.finalPlacements).toEqual([
      { rank: 1, participantName: "Par C", groupName: "Finalespil 1" },
      { rank: 2, participantName: "Par A", groupName: "Finalespil 1" },
      { rank: 3, participantName: "Par D", groupName: "Finalespil 1" },
      { rank: 4, participantName: "Par B", groupName: "Finalespil 1" },
    ]);
    expect(view.poolPlay?.finalMatches[0].score).toBe("20 - 20 (MTB: hold B)");
  });

  it("calculates pool-play placement-pool placements by score points", () => {
    const view = createReadOnlyTournamentView(scorePlacementPoolTournament());

    expect(view.poolPlay).toMatchObject({
      phase: "Placering",
      finalPlacements: [
        { rank: 1, participantName: "Par A", groupName: "Placeringspulje 1" },
        { rank: 2, participantName: "Par C", groupName: "Placeringspulje 1" },
        { rank: 3, participantName: "Par D", groupName: "Placeringspulje 2" },
        { rank: 4, participantName: "Par B", groupName: "Placeringspulje 2" },
      ],
    });
  });

  it("does not calculate tied placement-pool placements before match tiebreak", () => {
    const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament({ advancementMode: "placementPools" }));
    const tiedState = saveNextPoolPhaseResult(advancedState, {
      matchId: "placement-pool-1-match-1",
      teamAPoints: 20,
      teamBPoints: 20,
    });
    const view = createReadOnlyTournamentView(tiedState);

    expect(view.poolPlay?.finalPlacements).toEqual([]);
  });

  it("calculates tied placement-pool placements from match tiebreak winners", () => {
    const advancedState = advanceLivePoolPlayState(createCompletedInitialPoolTournament({ advancementMode: "placementPools" }));
    const tieBreakState = saveNextPoolPhaseResult(advancedState, {
      matchId: "placement-pool-1-match-1",
      teamAPoints: 20,
      teamBPoints: 20,
      tieBreakWinner: "teamB",
    });
    const view = createReadOnlyTournamentView(tieBreakState);

    expect(view.poolPlay?.finalPlacements).toEqual([
      { rank: 1, participantName: "Par C", groupName: "Placeringspulje 1" },
      { rank: 2, participantName: "Par A", groupName: "Placeringspulje 1" },
    ]);
    expect(view.poolPlay?.nextPhaseMatches[0].score).toBe("20 - 20 (MTB: hold B)");
  });

  it("requires separate placement tiebreaks for tied individual Americano cross-play placements", () => {
    const view = createReadOnlyTournamentView(scoreIndividualCrossMatchAmericanoTournament());

    expect(view.poolPlay?.finalPlacements).toEqual([]);
    expect(view.poolPlay?.placementTiebreakMatches).toEqual([
      expect.objectContaining({
        court: "Krydsspil 1 · Tiebreak om 2. / 3. plads",
        teamA: "Birk",
        teamB: "Echo",
        score: "Ikke gemt",
        status: "Klar",
      }),
    ]);
  });

  it("calculates individual Americano cross-play placements after separate placement tiebreaks", () => {
    const tieBreakState = savePoolPlacementTiebreakResult(scoreIndividualCrossMatchAmericanoTournament(), {
      matchId: "cross-group-1-placement-tiebreak-2-3",
      teamAPoints: 10,
      teamBPoints: 7,
    });
    const view = createReadOnlyTournamentView(tieBreakState);

    expect(view.poolPlay?.placementTiebreakMatches[0]).toMatchObject({
      court: "Krydsspil 1 · Tiebreak om 2. / 3. plads",
      teamA: "Birk",
      teamB: "Echo",
      score: "10 - 7",
      status: "Afsluttet",
    });
    expect(view.poolPlay?.finalPlacements).toEqual([
      { rank: 1, participantName: "Alpha", groupName: "Krydsspil 1" },
      { rank: 2, participantName: "Birk", groupName: "Krydsspil 1" },
      { rank: 3, participantName: "Echo", groupName: "Krydsspil 1" },
      { rank: 4, participantName: "Freja", groupName: "Krydsspil 1" },
    ]);
  });

  it("calculates unmatched final player pool placements from Americano placement play", () => {
    const view = createReadOnlyTournamentView(scoreIndividualOddPoolCrossMatchTournament());

    expect(view.poolPlay?.automaticAdvances).toEqual([]);
    expect(view.poolPlay?.nextPhaseMatches).toEqual([
      expect.objectContaining({ court: "Krydsspil 1 · Runde 1, bane 1", score: "30 - 0" }),
      expect.objectContaining({ court: "Krydsspil 1 · Runde 2, bane 1", score: "20 - 5" }),
      expect.objectContaining({ court: "Krydsspil 1 · Runde 3, bane 1", score: "10 - 15" }),
      expect.objectContaining({ court: "Placeringsspil 2 · Runde 1, bane 1", score: "30 - 0" }),
      expect.objectContaining({ court: "Placeringsspil 2 · Runde 2, bane 1", score: "20 - 5" }),
      expect.objectContaining({ court: "Placeringsspil 2 · Runde 3, bane 1", score: "10 - 15" }),
    ]);
    expect(view.poolPlay?.finalPlacements).toEqual([
      { rank: 1, participantName: "Alpha", groupName: "Krydsspil 1" },
      { rank: 2, participantName: "Freja", groupName: "Krydsspil 1" },
      { rank: 3, participantName: "Echo", groupName: "Krydsspil 1" },
      { rank: 4, participantName: "Birk", groupName: "Krydsspil 1" },
      { rank: 5, participantName: "Iben", groupName: "Placeringsspil 2" },
      { rank: 6, participantName: "Liam", groupName: "Placeringsspil 2" },
      { rank: 7, participantName: "Karla", groupName: "Placeringsspil 2" },
      { rank: 8, participantName: "Jens", groupName: "Placeringsspil 2" },
    ]);
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

function createStandardTournament(format: TournamentSetupFormat): LiveTournamentState {
  return createTournamentFromSetup({
    name: `${format} 16/4`,
    format,
    playerText: format === "Mixed Americano" ? "" : sixteenPlayerText,
    femalePlayerText: format === "Mixed Americano" ? eightFemalePlayerText : "",
    malePlayerText: format === "Mixed Americano" ? eightMalePlayerText : "",
    courts: 4,
    rounds: 5,
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

function createTeam(idPrefix: string, name: string): TeamVsTeamTeam {
  return {
    id: `team-${idPrefix}`,
    name,
    captainPlayerId: `${idPrefix}1`,
    players: Array.from({ length: 4 }, (_, index) => ({ id: `${idPrefix}${index + 1}`, name: `${name} spiller ${index + 1}` })),
  };
}

function lineup(roundNumber: 1 | 2 | 3): TeamVsTeamRoundLineup {
  return {
    roundNumber,
    match1: { teamAPlayerIds: ["a1", "a2"], teamBPlayerIds: ["b1", "b2"] },
    match2: { teamAPlayerIds: ["a3", "a4"], teamBPlayerIds: ["b3", "b4"] },
  };
}

function round(roundNumber: 1 | 2 | 3, match1TeamAPoints: number, match1TeamBPoints: number, match2TeamAPoints: number, match2TeamBPoints: number): TeamVsTeamRoundResult {
  return {
    roundNumber,
    match1: { sets: [{ teamAPoints: match1TeamAPoints, teamBPoints: match1TeamBPoints }] },
    match2: { sets: [{ teamAPoints: match2TeamAPoints, teamBPoints: match2TeamBPoints }] },
  };
}
