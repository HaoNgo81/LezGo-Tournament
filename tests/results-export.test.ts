import { describe, expect, it } from "vitest";
import { advanceLivePoolPlayState, advanceLivePoolPlayToFinals, calculateLiveStandings, createMockLiveTournamentState, finishTournament, getLiveMatches, goToNextRound, saveMatchResult, saveNextPoolPhaseResult, savePoolFinalResult, savePoolPlacementTiebreakResult, type LiveTournamentState } from "../lib/live-scoring";
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
  ] as const)("exports completed standard %s tournaments", (format, expectedLabel) => {
    const finishedState = finishTournament(scoreAllConfiguredRounds(createStandardTournament(format)), "2026-08-04T18:00:00.000Z");
    const lines = createTournamentResultLines(finishedState);
    const pdf = createTournamentResultPdf(finishedState);
    const expectedRounds = format === "Americano" ? 15 : format === "Fast Makker Americano" ? 7 : format === "Mixed Americano" ? 8 : format === "Fast Makker Mexicano" ? 1 : 5;

    expect(lines).toContain(`Format: ${expectedLabel}`);
    expect(lines).toContain("Status: Afsluttet");
    expect(lines).toContain("Spillere: 16");
    expect(lines).toContain(`Runder: ${expectedRounds}`);
    expect(lines).toContain(`Runde ${expectedRounds}`);
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
    ["Scenario A", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", { name: "A 4 spillere 1 bane", playerText: fourPlayerText, courts: 1, rounds: 3 })), "2026-08-04T18:00:00.000Z"), 3, 1, "relaxed"],
    ["Scenario B", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", { name: "B 8 spillere 2 baner", playerText: eightPlayerText, courts: 2, rounds: 8 })), "2026-08-04T18:00:00.000Z"), 7, 2, "standard"],
    ["Scenario C", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", { name: "Chopstick Mex v1", courts: 4, rounds: 20 })), "2026-08-04T18:00:00.000Z"), 20, 4, "dense"],
    ["Scenario D", finishTournament(scoreRounds(createStandardTournament("Fast Makker Mexicano", { name: "D stor fast makker", courts: 4, rounds: 20 }), 20), "2026-08-04T18:00:00.000Z"), 20, 4, "dense"],
    ["Scenario E", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mixed Americano", { name: "E mixed format", courts: 4, rounds: 8 })), "2026-08-04T18:00:00.000Z"), 8, 4, "compact"],
    ["Scenario F", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", { name: "F 25 runder", courts: 4, rounds: 25 })), "2026-08-04T18:00:00.000Z"), 25, 4, "dense"],
  ] as const)("paginates %s without dropping completed data", (_label, state, expectedRounds, expectedCourts, expectedDensity) => {
    const pdf = createTournamentResultPdf(state);
    const lines = createTournamentResultLines(state);
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    expect(getPdfPageCount(pdf)).toBe(diagnostics.pageCount);
    expect(diagnostics).toMatchObject({
      completedRounds: expectedRounds,
      courtColumns: expectedCourts,
      density: expectedDensity,
      fitsOnePage: true,
      orientation: "portrait",
    });
    expectEveryRoundOnceInOrder(diagnostics, expectedRounds);
    expect(diagnostics.matchRows).toHaveLength(expectedRounds * expectedCourts);
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

  it.each([13, 24, 25, 36, 37] as const)("splits %s completed rounds across pages without splitting a round", (rounds) => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      courts: 4,
      name: `${rounds} runder boundary`,
      rounds,
    })), "2026-08-04T18:00:00.000Z");
    const pdf = createTournamentResultPdf(state);
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    expect(getPdfPageCount(pdf)).toBe(diagnostics.pageCount);
    expect(diagnostics.pageCount).toBeGreaterThan(1);
    expectEveryRoundOnceInOrder(diagnostics, rounds);
    expect(diagnostics.fitsOnePage).toBe(true);
    diagnostics.matchRows.forEach((row) => {
      const roundPage = diagnostics.pageRoundRanges.find((range) => range.roundNumbers.includes(row.roundNumber));
      expect(row.page).toBe(roundPage?.page);
    });
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

  it("renders PDF text without BOM artifacts and preserves Danish characters in WinAnsi text", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", {
      name: "ÆØÅ æøå - UAFGJORT test",
      playerText: ["Ægir Åsen", "Ørn Æble", "Åse Øster", "Maja Bøge"].join("\n"),
      courts: 1,
      rounds: 3,
    })), "2026-08-04T18:00:00.000Z");
    const pdf = createTournamentResultPdf(state);
    const pdfText = new TextDecoder("windows-1252")
      .decode(pdf)
      .replace(/<< \/Type \/XObject \/Subtype \/Image[\s\S]*?endstream\s*endobj/g, "");

    expect(pdfText).toContain("ÆØÅ æøå");
    expect(pdfText).toContain("SLUTSTILLING");
    expect(pdfText).toContain("KAMPRESULTATER");
    expect(pdfText).toContain("OVERBLIK");
    expect(pdfText).toContain("RUNDE");
    expect(pdfText).toContain("BANE");
    expect(pdfText).toContain("SPILLERE");
    expect(pdfText).toContain("AFSLUTTET");
    expect(pdfText).toContain("UAFGJORT");
    expect(pdfText).not.toContain("þÿ");
    expect(pdfText).not.toContain("�");
  });

  it("uses the official LEZGO logo asset in the designed PDF", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const pdf = createTournamentResultPdf(state);
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);
    const pdfText = new TextDecoder("windows-1252").decode(pdf);

    expect(diagnostics.logoUsed).toBe(true);
    expect(diagnostics.logoSourcePath).toBe("public/lezgo-padel-logo.png");
    expect(pdfText).toContain("/Subtype /Image");
    expect(pdfText).toContain("/Logo Do");
    expect(pdfText).not.toContain("(LEZGO)");
  });

  it("keeps every four-court match row inside separate non-overlapping bounded cells", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);
    const roundOneRows = diagnostics.matchRows.filter((row) => row.roundNumber === 1);

    expect(roundOneRows).toHaveLength(4);
    roundOneRows.forEach((row) => {
      expect(row.sideA.x).toBeGreaterThanOrEqual(row.court.x);
      expect(row.sideB.x + row.sideB.width).toBeLessThanOrEqual(row.court.x + row.court.width);
      expect(row.sideA.x + row.sideA.width).toBeLessThanOrEqual(row.score.x);
      expect(row.score.x + row.score.width).toBeLessThanOrEqual(row.sideB.x);
      expect(row.sideB.x + row.sideB.width).toBeLessThanOrEqual(595);
      expect(row.court.y).toBeGreaterThanOrEqual(0);
      expect(row.sideA.y).toBe(row.court.y);
      expect(row.sideB.y).toBe(row.court.y);
    });
  });

  it("keeps Scenario C partners vertically aligned by team in every court card", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);
    const players = new Map(state.players.map((player) => [player.id, player.name]));

    state.rounds.forEach((round) => {
      round.matches.forEach((match) => {
        const row = diagnostics.matchRows.find((candidate) => candidate.roundNumber === round.roundNumber && candidate.courtNumber === match.courtNumber);

        expect(row).toBeDefined();
        expect(row?.topLeftPlayer).toBe(players.get(match.teamA.playerIds[0]));
        expect(row?.bottomLeftPlayer).toBe(players.get(match.teamA.playerIds[1]));
        expect(row?.topRightPlayer).toBe(players.get(match.teamB.playerIds[0]));
        expect(row?.bottomRightPlayer).toBe(players.get(match.teamB.playerIds[1]));
        expect(new Set([row?.topLeftPlayer, row?.bottomLeftPlayer, row?.topRightPlayer, row?.bottomRightPlayer]).size).toBe(4);
      });
    });
  });

  it("uses one centered score column between the left and right teams in every court card", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    diagnostics.matchRows.forEach((row) => {
      expect(row.sideA.x + row.sideA.width).toBeLessThanOrEqual(row.score.x);
      expect(row.score.x + row.score.width).toBeLessThanOrEqual(row.sideB.x);
      expect(row.score.y).toBeGreaterThan(row.court.y);
      expect(row.score.y + row.score.height).toBeLessThan(row.court.y + row.court.height);
      expect(row.score.height).toBeGreaterThanOrEqual(9);
      expect(row.score.x + row.score.width / 2).toBeCloseTo(row.court.x + row.court.width / 2, 1);
    });
  });

  it("uses the same court-card template across all Scenario C rounds and courts", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);
    const firstRow = diagnostics.matchRows[0];

    expect(firstRow).toBeDefined();
    diagnostics.matchRows.forEach((row) => {
      expect(row.sideA.width).toBeCloseTo(firstRow.sideA.width, 4);
      expect(row.sideB.width).toBeCloseTo(firstRow.sideB.width, 4);
      expect(row.score.width).toBeCloseTo(firstRow.score.width, 4);
      expect(row.sideA.height).toBe(row.court.height);
      expect(row.sideB.height).toBe(row.court.height);
      expect(row.score.height).toBeGreaterThanOrEqual(9);
      expect(row.score.height).toBeLessThanOrEqual(24);
      expect(row.topLeftPlayer).not.toBe(row.bottomLeftPlayer);
      expect(row.topRightPlayer).not.toBe(row.bottomRightPlayer);
    });
  });

  it("puts the standings and the first rounds on page 1 and continues with full pages of rounds", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    expect(diagnostics.pageRoundRanges.map((range) => range.roundNumbers.length)).toEqual([6, 9, 5]);
    expect(diagnostics.resultPages.every((resultPage) => resultPage.columns === 1)).toBe(true);
  });

  it("keeps every round block inside the main column of its page without overlap", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    diagnostics.resultPages.forEach((resultPage) => {
      resultPage.roundCards.forEach((card, index) => {
        expect(card.bounds.x).toBeGreaterThanOrEqual(194);
        expect(card.bounds.x + card.bounds.width).toBeLessThanOrEqual(571);
        expect(card.bounds.y).toBeGreaterThanOrEqual(44);
        expect(card.bounds.y + card.bounds.height).toBeLessThanOrEqual(resultPage.gridTop);

        resultPage.roundCards.slice(index + 1).forEach((otherCard) => {
          const overlapsY = card.bounds.y < otherCard.bounds.y + otherCard.bounds.height && card.bounds.y + card.bounds.height > otherCard.bounds.y;
          expect(overlapsY).toBe(false);
        });
      });
    });
    diagnostics.matchRows.forEach((row) => {
      const card = diagnostics.resultPages.find((resultPage) => resultPage.page === row.page)?.roundCards.find((candidate) => candidate.roundNumber === row.roundNumber);
      expect(card).toBeDefined();
      expect(row.court.y).toBeGreaterThanOrEqual(card!.bounds.y);
      expect(row.court.y + row.court.height).toBeLessThanOrEqual(card!.bounds.y + card!.bounds.height);
    });
  });

  it("shows the winner, the facts and signed point differences in the scoreboard design", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", {
      name: "Resultattavle test",
      playerText: eightPlayerText,
      courts: 2,
      rounds: 8,
    })), "2026-08-04T18:00:00.000Z");
    const pdfText = new TextDecoder("windows-1252")
      .decode(createTournamentResultPdf(state))
      .replace(/<< \/Type \/XObject \/Subtype \/Image[\s\S]*?endstream\s*endobj/g, "");
    const winner = calculateLiveStandings(state)[0];

    expect(pdfText).toContain("(VINDER)");
    expect(pdfText).toContain(`(${winner.name})`);
    expect(pdfText).toContain("(SLUTSTILLING)");
    expect(pdfText).toContain("(+/-)");
    expect(pdfText).toMatch(/\(\+\d+\)/);
    expect(pdfText).toMatch(/\(-\d+\)/);
    ["(FORMAT)", "(SPILLERE)", "(BANER)", "(RUNDER)", "(RANGERING)", "(AFSLUTTET)", "(Side 1 / 1)"].forEach((label) => {
      expect(pdfText).toContain(label);
    });
  });

  it("labels the leader instead of a winner while the tournament is still running", () => {
    const state = scoreAllConfiguredRounds(createStandardTournament("Americano", {
      name: "Ikke afsluttet",
      playerText: eightPlayerText,
      courts: 2,
      rounds: 3,
    }));
    const pdfText = new TextDecoder("windows-1252").decode(createTournamentResultPdf(state));

    expect(pdfText).toContain("(FØRER)");
    expect(pdfText).not.toContain("(VINDER)");
    expect(pdfText).toContain("(STILLING)");
    expect(pdfText).not.toContain("(SLUTSTILLING)");
    expect(pdfText).toContain("(Ikke afsluttet)");
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
  const state = createTournamentFromSetup({
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

  return format === "Mexicano" ? { ...state, configuredRounds: overrides.rounds ?? 5 } : state;
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

function scoreRounds(state: LiveTournamentState, rounds: number): LiveTournamentState {
  let currentState = state;

  for (let roundNumber = 1; roundNumber <= rounds; roundNumber += 1) {
    currentState = scoreActiveRound(currentState);

    if (roundNumber < rounds) {
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

function expectEveryRoundOnceInOrder(diagnostics: ReturnType<typeof createTournamentResultPdfLayoutDiagnostics>, expectedRounds: number) {
  const roundsInPageOrder = diagnostics.pageRoundRanges.flatMap((range) => range.roundNumbers);

  expect(roundsInPageOrder).toEqual(Array.from({ length: expectedRounds }, (_, index) => index + 1));
  diagnostics.resultPages.forEach((resultPage) => {
    expect(resultPage.gridBottom).toBeGreaterThanOrEqual(44);
  });
  expect(diagnostics.maxDrawnX).toBeLessThanOrEqual(595);
  expect(diagnostics.maxDrawnY).toBeLessThanOrEqual(842);
}
