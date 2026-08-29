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
  ] as const)("exports completed standard %s tournaments", (format, expectedLabel) => {
    const finishedState = finishTournament(scoreAllConfiguredRounds(createStandardTournament(format)), "2026-08-04T18:00:00.000Z");
    const lines = createTournamentResultLines(finishedState);
    const pdf = createTournamentResultPdf(finishedState);
    const expectedRounds = format === "Americano" ? 15 : 5;

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
    ["Scenario A", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", { name: "A 4 spillere 1 bane", playerText: fourPlayerText, courts: 1, rounds: 3 })), "2026-08-04T18:00:00.000Z"), 3, 1, "relaxed", 1, [[1, 2, 3]]],
    ["Scenario B", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Americano", { name: "B 8 spillere 2 baner", playerText: eightPlayerText, courts: 2, rounds: 8 })), "2026-08-04T18:00:00.000Z"), 7, 2, "standard", 1, [[1, 2, 3, 4, 5, 6, 7]]],
    ["Scenario C", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", { name: "Chopstick Mex v1", courts: 4, rounds: 20 })), "2026-08-04T18:00:00.000Z"), 20, 4, "dense", 2, [[1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]]],
    ["Scenario D", finishTournament(scoreAllConfiguredRounds(createStandardTournament("Fast Makker Mexicano", { name: "D stor fast makker", courts: 4, rounds: 20 })), "2026-08-04T18:00:00.000Z"), 20, 4, "dense", 2, [[1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]]],
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

  it("lays Scenario C first page rounds 1-8 out as a balanced 3 by 3 grid", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);
    const pageOne = diagnostics.resultPages.find((page) => page.page === 1);
    const finalRowCards = pageOne?.roundCards.filter((card) => card.roundNumber === 7 || card.roundNumber === 8) ?? [];

    expect(pageOne).toMatchObject({
      columns: 3,
      rows: 3,
      roundNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
    });
    expect(finalRowCards).toHaveLength(2);
    expect(finalRowCards[0].bounds.x).toBeGreaterThan(26);
    expect(finalRowCards[1].bounds.x + finalRowCards[1].bounds.width).toBeLessThan(569);
    expect(finalRowCards[0].bounds.x - 26).toBeCloseTo(569 - (finalRowCards[1].bounds.x + finalRowCards[1].bounds.width), 4);
  });

  it("lays Scenario C continuation rounds 9-20 out as a fixed 3 by 4 grid", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);
    const pageTwo = diagnostics.resultPages.find((page) => page.page === 2);

    expect(pageTwo).toMatchObject({
      columns: 3,
      rows: 4,
      roundNumbers: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    });
  });

  it("expands Scenario C result grids to the allocated page height", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);
    const [pageOne, pageTwo] = diagnostics.resultPages;

    expect(pageOne).toMatchObject({ columns: 3, rows: 3 });
    expect(pageTwo).toMatchObject({ columns: 3, rows: 4 });
    [pageOne, pageTwo].forEach((resultPage) => {
      const allocatedHeight = resultPage.gridTop - resultPage.gridBottom;
      const usedHeight = resultPage.rows * resultPage.cardHeight + Math.max(0, resultPage.rows - 1) * resultPage.rowGap;

      expect(usedHeight).toBeCloseTo(allocatedHeight, 4);
      expect(resultPage.cardWidth * resultPage.columns + (resultPage.columns - 1) * resultPage.rowGap).toBeCloseTo(543, 4);
      expect(resultPage.gridBottom).toBeGreaterThanOrEqual(50);
      expect(resultPage.gridTop).toBeLessThanOrEqual(700);
    });
    expect(pageOne.cardWidth).toBeGreaterThan(170);
    expect(pageTwo.cardWidth).toBeGreaterThan(170);
  });

  it("keeps Scenario C round cards inside the page without overlap", () => {
    const state = finishTournament(scoreAllConfiguredRounds(createStandardTournament("Mexicano", {
      name: "Chopstick Mex v1",
      courts: 4,
      rounds: 20,
    })), "2026-08-04T18:00:00.000Z");
    const diagnostics = createTournamentResultPdfLayoutDiagnostics(state);

    diagnostics.resultPages.forEach((resultPage) => {
      resultPage.roundCards.forEach((card, index) => {
        expect(card.bounds.x).toBeGreaterThanOrEqual(26);
        expect(card.bounds.x + card.bounds.width).toBeLessThanOrEqual(569);
        expect(card.bounds.y).toBeGreaterThanOrEqual(50);
        expect(card.bounds.y + card.bounds.height).toBeLessThanOrEqual(resultPage.gridTop);

        resultPage.roundCards.slice(index + 1).forEach((otherCard) => {
          const overlapsX = card.bounds.x < otherCard.bounds.x + otherCard.bounds.width && card.bounds.x + card.bounds.width > otherCard.bounds.x;
          const overlapsY = card.bounds.y < otherCard.bounds.y + otherCard.bounds.height && card.bounds.y + card.bounds.height > otherCard.bounds.y;

          expect(overlapsX && overlapsY).toBe(false);
        });
      });
    });
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
