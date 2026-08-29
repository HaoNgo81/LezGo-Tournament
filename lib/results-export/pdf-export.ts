import { calculateLiveStandings, getPlayerName, type LiveTournamentState } from "../live-scoring";
import type { MatchResult, StandingRow, TournamentFormat, TournamentMatch, TournamentRound } from "../tournament-engine";
import { createPoolPlaySummary, type PoolPlaySummaryMatch } from "../live-scoring";

const rankingModeLabels = {
  matchPointsFirst: "Flest matchpoint",
  partiPointsFirst: "Flest scorepoint",
} as const;

const formatLabels: Record<TournamentFormat, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  "mixed-americano": "Mixed Americano",
  "fixed-partner-americano": "Fast Makker Americano",
  "fixed-partner-mexicano": "Fast Makker Mexicano",
  "pool-play": "Puljespil",
};

export function createTournamentResultPdf(state: LiveTournamentState): Uint8Array {
  return createDesignedOnePagePdf(state);
}

export function createTournamentResultFileName(state: LiveTournamentState): string {
  const safeName = state.tournamentName
    .trim()
    .toLocaleLowerCase("da")
    .replace(/[^a-z0-9æøå]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeName || "turnering"}-resultater.pdf`;
}

export function createTournamentResultLines(state: LiveTournamentState): string[] {
  if (state.poolPlay) {
    return createPoolPlayResultLines(state as LiveTournamentState & { poolPlay: NonNullable<LiveTournamentState["poolPlay"]> });
  }

  const standings = calculateLiveStandings(state);
  const resultByMatchId = new Map(state.results.map((result) => [result.matchId, result]));
  const lines = [
    `LEZGO Padel - ${state.tournamentName}`,
    "",
    `Status: ${state.status === "finished" ? "Afsluttet" : "Aktiv"}`,
    `Afsluttet: ${state.finishedAt ? formatDateTime(state.finishedAt) : "Ikke afsluttet"}`,
    `Format: ${formatLabels[state.format]}`,
    `Ranking: ${rankingModeLabels[state.rankingMode]}`,
    `Spillere: ${state.players.length}`,
    `Runder: ${state.configuredRounds ?? state.rounds.length}`,
    "",
    "SLUTSTILLING",
    "Placering | Navn | Matchpoint | Scorepoint | Tabte | Difference | Sejre | Uafgjort | Tab",
    ...standings.map((row) =>
      [
        row.rank,
        row.name,
        row.matchPoints,
        row.pointsFor,
        row.pointsAgainst,
        row.pointDifference,
        row.wins,
        row.draws,
        row.losses,
      ].join(" | "),
    ),
    "",
    "KAMPRESULTATER",
  ];

  state.rounds.forEach((round) => {
    lines.push(`Runde ${round.roundNumber}`);

    round.matches.forEach((match) => {
      lines.push(formatMatchLine(match, resultByMatchId.get(match.id), state));
    });

    lines.push("");
  });

  return lines;
}

function createPoolPlayResultLines(state: LiveTournamentState & { poolPlay: NonNullable<LiveTournamentState["poolPlay"]> }): string[] {
  const summary = createPoolPlaySummary(state.poolPlay, state.rankingMode);
  const lines = [
    `LEZGO Padel - ${state.tournamentName}`,
    "",
    `Status: ${state.status === "finished" ? "Afsluttet" : "Aktiv"}`,
    `Afsluttet: ${state.finishedAt ? formatDateTime(state.finishedAt) : "Ikke afsluttet"}`,
    `Format: ${formatLabels[state.format]}`,
    `Ranking: ${rankingModeLabels[state.rankingMode]}`,
    `Deltagere: ${state.poolPlay.initialStage.participants.length}`,
    `Puljer: ${state.poolPlay.initialStage.pools.length}`,
    "",
    "PULJESTILLINGER",
  ];

  summary.initialStandings.forEach((table) => {
    lines.push(table.poolName);
    lines.push("Placering | Navn | Matchpoint | Scorepoint | Tabte | Difference | Sejre | Uafgjort | Tab");
    table.rows.forEach((row) => {
      lines.push([
        row.rank,
        row.name,
        row.matchPoints,
        row.pointsFor,
        row.pointsAgainst,
        row.pointDifference,
        row.wins,
        row.draws,
        row.losses,
      ].join(" | "));
    });
    lines.push("");
  });

  if (summary.finalPlacements.length) {
    lines.push("SLUTPLACERINGER");
    summary.finalPlacements.forEach((placement) => {
      lines.push(`${placement.rank}. ${placement.participantName} (${placement.groupName})`);
    });
    lines.push("");
  }

  lines.push("NÆSTE FASE");

  if (summary.nextPhaseMatches.length) {
    summary.nextPhaseMatches.forEach((match) => {
      lines.push(formatPoolPlayMatchLine(match));
    });
  } else {
    lines.push("Ingen næste-fase-kampe oprettet.");
  }

  if (summary.finalMatches.length) {
    lines.push("");
    lines.push("FINALER");
    summary.finalMatches.forEach((match) => {
      lines.push(formatPoolPlayMatchLine(match));
    });
  }

  if (summary.placementTiebreakMatches.length) {
    lines.push("");
    lines.push("TIEBREAK OM PLACERING");
    summary.placementTiebreakMatches.forEach((match) => {
      lines.push(formatPoolPlayMatchLine(match));
    });
  }

  if (summary.automaticAdvances.length) {
    lines.push("");
    lines.push("AUTOMATISK VIDERE");
    summary.automaticAdvances.forEach((advance) => {
      lines.push(`${advance.participantName} (${advance.sourcePoolName}, nr. ${advance.sourceRank}) - ${advance.resolution === "bye" ? "Oversidning" : "Walkover"}`);
    });
  }

  return lines;
}

function formatPoolPlayMatchLine(match: PoolPlaySummaryMatch): string {
  const score = match.result ? formatPoolPlayScore(match.result) : "Ikke spillet";
  const submatches = match.matchesPerTeam ? ` (${match.matchesPerTeam} delkampe)` : "";

  return `${match.groupName}, ${match.label}${submatches}: ${match.teamAName} vs ${match.teamBName} - ${score}`;
}

function formatPoolPlayScore(result: PoolPlaySummaryMatch["result"] & {}): string {
  const baseScore = `${result.teamAPoints}-${result.teamBPoints}`;

  return result.tieBreakWinner ? `${baseScore} (MTB: ${result.tieBreakWinner === "teamA" ? "hold A" : "hold B"})` : baseScore;
}

function formatMatchLine(match: TournamentMatch, result: MatchResult | undefined, state: LiveTournamentState): string {
  const teamA = formatTeam(match.teamA.playerIds, state);
  const teamB = formatTeam(match.teamB.playerIds, state);
  const score = result ? `${result.teamAPoints}-${result.teamBPoints}` : "Ikke spillet";

  return `Bane ${match.courtNumber}: ${teamA} vs ${teamB} - ${score}`;
}

function formatTeam(playerIds: [string, string], state: LiveTournamentState): string {
  return playerIds.map((playerId) => getPlayerName(state.players, playerId)).join(" / ");
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export interface TournamentResultPdfLayoutDiagnostics {
  completedRounds: number;
  courtColumns: number;
  density: "relaxed" | "standard" | "compact" | "dense";
  fitsOnePage: boolean;
  maxDrawnX: number;
  maxDrawnY: number;
  minimumFontSize: number;
  orientation: "portrait";
  pageCount: 1;
  resultCardColumns: number;
  resultCardRows: number;
  resultFontSize: number;
  standingsFontSize: number;
}

export function createTournamentResultPdfLayoutDiagnostics(state: LiveTournamentState): TournamentResultPdfLayoutDiagnostics {
  return createOnePageResultLayout(state).diagnostics;
}

type PdfColor = [number, number, number];

interface PdfTextCommand {
  color?: PdfColor;
  font?: "regular" | "bold";
  maxWidth?: number;
  size: number;
  text: string;
  type: "text";
  x: number;
  y: number;
}

interface PdfRectCommand {
  color: PdfColor;
  height: number;
  type: "rect";
  width: number;
  x: number;
  y: number;
}

type PdfCommand = PdfTextCommand | PdfRectCommand;

interface PdfLayout {
  commands: PdfCommand[];
  diagnostics: TournamentResultPdfLayoutDiagnostics;
}

const page = {
  height: 842,
  margin: 26,
  width: 595,
} as const;

const colors = {
  background: [0.985, 0.965, 0.925] as PdfColor,
  brown: [0.16, 0.115, 0.08] as PdfColor,
  cream: [1, 0.988, 0.955] as PdfColor,
  creamDeep: [0.965, 0.925, 0.84] as PdfColor,
  gold: [0.83, 0.61, 0.08] as PdfColor,
  goldDark: [0.58, 0.39, 0.02] as PdfColor,
  goldSoft: [0.95, 0.88, 0.66] as PdfColor,
  muted: [0.38, 0.35, 0.31] as PdfColor,
  sand: [0.91, 0.84, 0.70] as PdfColor,
  white: [1, 1, 1] as PdfColor,
} as const;

const minimumReadableFontSize = 5.2;

function createDesignedOnePagePdf(state: LiveTournamentState): Uint8Array {
  const layout = createOnePageResultLayout(state);

  if (!layout.diagnostics.fitsOnePage) {
    throw new Error(`PDF-resultatet kan ikke holdes paa en laesbar A4-side for ${layout.diagnostics.completedRounds} runder med ${layout.diagnostics.courtColumns} baner.`);
  }

  const objects: string[] = [];
  const catalogId = addObject(objects, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(objects, "");
  const contentId = addObject(objects, createDesignedContentStream(layout.commands));
  const pageId = addObject(objects, "");

  objects[1] = `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`;
  objects[pageId - 1] =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentId} 0 R >>`;

  return encodePdf(objects, catalogId);
}

function createOnePageResultLayout(state: LiveTournamentState): PdfLayout {
  if (state.poolPlay) {
    return createPoolPlayOnePageLayout(state as LiveTournamentState & { poolPlay: NonNullable<LiveTournamentState["poolPlay"]> });
  }

  const standings = calculateLiveStandings(state);
  const completedRounds = getCompletedResultRounds(state);
  const courtColumns = Math.max(1, ...completedRounds.flatMap((round) => round.matches.map((match) => match.courtNumber)));
  const resultByMatchId = new Map(state.results.map((result) => [result.matchId, result]));
  const commands: PdfCommand[] = [];
  const contentX = page.margin;
  const contentWidth = page.width - page.margin * 2;
  const density = getDensity(standings.length, completedRounds.length, courtColumns);
  const topY = getTopSectionY(density);
  const summaryX = density === "relaxed" ? 402 : 414;
  const standingsWidth = summaryX - contentX - 14;
  const topHeight = density === "relaxed" ? 258 : 276;
  const standingsFontSize = getStandingsFontSize(standings.length, density);
  const resultsBottom = 38;
  const resultsHeight = topY - 70;
  const grid = calculateResultGrid(completedRounds.length, courtColumns, contentWidth, resultsHeight, density);
  const resultFontSize = grid.fontSize;
  const fitsOnePage = resultFontSize >= minimumReadableFontSize;

  drawPageBase(commands);
  drawHeader(commands, state);
  drawSectionHeader(commands, contentX, topY + topHeight + 24, standingsWidth, "SLUTSTILLING");
  drawStandingsTable(commands, contentX, topY, standingsWidth, topHeight, standings, standingsFontSize, density);
  drawSummaryPanel(commands, summaryX, topY, contentX + contentWidth - summaryX, topHeight, state, density);
  drawSectionHeader(commands, contentX, topY - 10, contentWidth, "KAMPRESULTATER");

  if (fitsOnePage) {
    completedRounds.forEach((round, index) => {
      const column = index % grid.columns;
      const row = Math.floor(index / grid.columns);
      const x = contentX + column * (grid.cardWidth + grid.gap);
      const y = resultsBottom + resultsHeight - (row + 1) * grid.cardHeight - row * grid.gap;

      drawRoundCard(commands, x, y, grid.cardWidth, grid.cardHeight, round, resultByMatchId, state, resultFontSize, density);
    });
  }

  const maxDrawnX = getMaxDrawnX(commands);
  const maxDrawnY = getMaxDrawnY(commands);

  return {
    commands,
    diagnostics: {
      completedRounds: completedRounds.length,
      courtColumns,
      density,
      fitsOnePage: fitsOnePage && maxDrawnX <= page.width && maxDrawnY <= page.height,
      maxDrawnX,
      maxDrawnY,
      minimumFontSize: minimumReadableFontSize,
      orientation: "portrait",
      pageCount: 1,
      resultCardColumns: grid.columns,
      resultCardRows: grid.rows,
      resultFontSize,
      standingsFontSize,
    },
  };
}

function createPoolPlayOnePageLayout(state: LiveTournamentState & { poolPlay: NonNullable<LiveTournamentState["poolPlay"]> }): PdfLayout {
  const summary = createPoolPlaySummary(state.poolPlay, state.rankingMode);
  const commands: PdfCommand[] = [];
  const contentX = page.margin;
  const contentWidth = page.width - page.margin * 2;
  const tables = summary.initialStandings;
  const standingsRows = tables.reduce((total, table) => total + table.rows.length, 0);
  const standingsFontSize = clamp(8 - Math.max(0, standingsRows - 8) * 0.12, 5.2, 8);
  const poolMatches = [
    ...summary.nextPhaseMatches,
    ...summary.finalMatches,
    ...summary.placementTiebreakMatches,
  ];
  const resultRows = Math.max(1, poolMatches.length + summary.automaticAdvances.length + summary.finalPlacements.length);
  const density = getDensity(standingsRows, resultRows, Math.max(1, poolMatches.length));
  const resultFontSize = clamp(7.2 - Math.max(0, resultRows - 8) * 0.14, minimumReadableFontSize, 7.2);

  drawPageBase(commands);
  drawHeader(commands, state);
  drawSectionHeader(commands, contentX, 690, contentWidth, "PULJESTILLINGER");

  const poolGap = 10;
  const poolWidth = (contentWidth - poolGap * Math.max(0, tables.length - 1)) / Math.max(1, tables.length);
  tables.forEach((table, index) => {
    const x = contentX + index * (poolWidth + poolGap);
    text(commands, table.poolName, x, 672, 9, "bold", colors.brown, poolWidth);
    drawStandingsTable(commands, x, 420, poolWidth, 242, table.rows, standingsFontSize, density);
  });

  drawSummaryPanel(commands, contentX, 318, 160, 92, state, density);
  drawSectionHeader(commands, 200, 386, contentWidth - 174, "KAMPRESULTATER");

  let y = 362;
  summary.finalPlacements.forEach((placement) => {
    text(commands, `${placement.rank}. ${placement.participantName} (${placement.groupName})`, 200, y, resultFontSize, "bold", colors.brown, contentWidth - 180);
    y -= resultFontSize + 4;
  });
  poolMatches.forEach((match) => {
    text(commands, formatPoolPlayMatchLine(match), 200, y, resultFontSize, "regular", colors.brown, contentWidth - 180);
    y -= resultFontSize + 4;
  });
  summary.automaticAdvances.forEach((advance) => {
    text(commands, `${advance.participantName} (${advance.sourcePoolName}, nr. ${advance.sourceRank}) - ${advance.resolution === "bye" ? "Oversidning" : "Walkover"}`, 200, y, resultFontSize, "regular", colors.brown, contentWidth - 180);
    y -= resultFontSize + 4;
  });

  return {
    commands,
    diagnostics: {
      completedRounds: 1,
      courtColumns: Math.max(1, poolMatches.length),
      density,
      fitsOnePage: resultFontSize >= minimumReadableFontSize,
      maxDrawnX: getMaxDrawnX(commands),
      maxDrawnY: getMaxDrawnY(commands),
      minimumFontSize: minimumReadableFontSize,
      orientation: "portrait",
      pageCount: 1,
      resultCardColumns: 1,
      resultCardRows: 1,
      resultFontSize,
      standingsFontSize,
    },
  };
}

function getDensity(playerCount: number, roundCount: number, courtCount: number): TournamentResultPdfLayoutDiagnostics["density"] {
  const load = playerCount + roundCount * Math.max(1, courtCount) * 0.9;

  if (load <= 12) {
    return "relaxed";
  }

  if (load <= 30) {
    return "standard";
  }

  if (load <= 70) {
    return "compact";
  }

  return "dense";
}

function getTopSectionY(density: TournamentResultPdfLayoutDiagnostics["density"]): number {
  switch (density) {
    case "relaxed":
      return 446;
    case "standard":
      return 438;
    case "compact":
    case "dense":
      return 430;
  }
}

function getStandingsFontSize(playerCount: number, density: TournamentResultPdfLayoutDiagnostics["density"]): number {
  const base = density === "relaxed" ? 9.4 : density === "standard" ? 8.6 : 8.2;

  return clamp(base - Math.max(0, playerCount - 8) * 0.16, minimumReadableFontSize, base);
}

function drawPageBase(commands: PdfCommand[]) {
  rect(commands, 0, 0, page.width, page.height, colors.background);
  rect(commands, page.margin, page.margin, page.width - page.margin * 2, page.height - page.margin * 2, colors.cream);
  rect(commands, page.margin, 744, page.width - page.margin * 2, 72, colors.brown);
  rect(commands, page.margin, 735, page.width - page.margin * 2, 9, colors.gold);
  rect(commands, page.margin + 14, 758, 7, 42, colors.gold);
}

function drawHeader(commands: PdfCommand[], state: LiveTournamentState) {
  text(commands, "LEZGO", 44, 790, 21, "bold", colors.gold);
  text(commands, "PADEL", 123, 790, 12, "bold", colors.goldSoft);
  text(commands, fitTitle(state.tournamentName), 44, 763, getTitleFontSize(state.tournamentName), "bold", colors.white, 352);
  rect(commands, 420, 761, 130, 36, colors.goldSoft);
  text(commands, "AFSLUTTET", 432, 784, 6.4, "bold", colors.goldDark, 108);
  text(commands, state.finishedAt ? formatDateTime(state.finishedAt) : "Ikke afsluttet", 432, 769, 10, "bold", colors.brown, 108);
}

function fitTitle(title: string): string {
  return fitText(title, getTitleFontSize(title), 352);
}

function getTitleFontSize(title: string): number {
  return clamp(24 - Math.max(0, title.length - 24) * 0.22, 15, 24);
}

function drawSectionHeader(commands: PdfCommand[], x: number, y: number, width: number, label: string) {
  rect(commands, x, y - 15, width, 20, colors.brown);
  text(commands, label, x + 8, y - 9, 9, "bold", colors.goldSoft, width - 16);
}

function drawSummaryPanel(commands: PdfCommand[], x: number, y: number, width: number, height: number, state: LiveTournamentState, density: TournamentResultPdfLayoutDiagnostics["density"]) {
  rect(commands, x, y, width, height, colors.white);
  rect(commands, x, y + height - 30, width, 30, colors.goldSoft);
  rect(commands, x, y, 5, height, colors.gold);
  text(commands, "OVERBLIK", x + 14, y + height - 18, 11, "bold", colors.brown, width - 24);

  const entries = [
    ["Format", formatLabels[state.format]],
    ["Ranking", rankingModeLabels[state.rankingMode]],
    ["Spillere", String(state.players.length)],
    ["Baner", String(state.courtCount)],
    ["Runder", String(state.configuredRounds ?? state.rounds.length)],
  ];
  const itemGap = density === "relaxed" ? 37 : 33;
  let cursorY = y + height - 52;

  entries.forEach(([label, value]) => {
    rect(commands, x + 14, cursorY - 18, width - 28, 23, colors.creamDeep);
    text(commands, label.toUpperCase(), x + 22, cursorY - 2, 5.8, "bold", colors.muted, width - 44);
    text(commands, value, x + 22, cursorY - 12, density === "relaxed" ? 8.8 : 8.1, "bold", colors.brown, width - 44);
    cursorY -= itemGap;
  });
}

function drawStandingsTable(commands: PdfCommand[], x: number, y: number, width: number, height: number, standings: StandingRow[], fontSize: number, density: TournamentResultPdfLayoutDiagnostics["density"]) {
  rect(commands, x, y, width, height, colors.white);
  rect(commands, x, y + height - 22, width, 22, colors.goldSoft);

  const columns = [
    { label: "#", value: (row: StandingRow) => String(row.rank), width: 20 },
    { label: "Navn", value: (row: StandingRow) => row.name, width: width - 196 },
    { label: "MP", value: (row: StandingRow) => String(row.matchPoints), width: 28 },
    { label: "SP", value: (row: StandingRow) => String(row.pointsFor), width: 28 },
    { label: "Tabte", value: (row: StandingRow) => String(row.pointsAgainst), width: 34 },
    { label: "Diff", value: (row: StandingRow) => String(row.pointDifference), width: 30 },
    { label: "V", value: (row: StandingRow) => String(row.wins), width: 18 },
    { label: "U", value: (row: StandingRow) => String(row.draws), width: 18 },
    { label: "T", value: (row: StandingRow) => String(row.losses), width: 20 },
  ];
  let cursorX = x + 6;

  columns.forEach((column) => {
    text(commands, column.label, cursorX, y + height - 13, 6.8, "bold", colors.brown, column.width - 2);
    cursorX += column.width;
  });

  const rowHeight = Math.min(density === "relaxed" ? 22 : 16, (height - 28) / Math.max(1, standings.length));
  standings.forEach((row, index) => {
    const rowY = y + height - 28 - (index + 1) * rowHeight + 4;

    if (index < 3) {
      rect(commands, x + 4, rowY - 3, width - 8, rowHeight - 1, index === 0 ? [1, 0.91, 0.55] : index === 1 ? [0.95, 0.91, 0.82] : [0.93, 0.88, 0.73]);
      rect(commands, x + 4, rowY - 3, 4, rowHeight - 1, index === 0 ? colors.gold : colors.sand);
    } else if (index % 2 === 1) {
      rect(commands, x + 4, rowY - 3, width - 8, rowHeight - 1, [0.985, 0.97, 0.94]);
    }

    cursorX = x + 6;
    columns.forEach((column, columnIndex) => {
      text(commands, column.value(row), cursorX, rowY + 1, columnIndex === 1 ? fontSize + 0.3 : fontSize, columnIndex < 2 ? "bold" : "regular", colors.brown, column.width - 3);
      cursorX += column.width;
    });
  });
}

function calculateResultGrid(roundCount: number, courtCount: number, width: number, height: number, density: TournamentResultPdfLayoutDiagnostics["density"]) {
  const safeRoundCount = Math.max(1, roundCount);
  const gap = density === "dense" ? 4 : density === "compact" ? 5 : 8;
  const maxColumns = density === "dense" ? 4 : density === "compact" ? 4 : 3;
  const preferredColumns = density === "dense" ? Math.ceil(safeRoundCount / 5) : Math.ceil(Math.sqrt(safeRoundCount * 1.05));
  const columns = clamp(preferredColumns, 1, Math.min(maxColumns, safeRoundCount));
  const rows = Math.ceil(safeRoundCount / columns);
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const cardHeight = (height - gap * (rows - 1)) / rows;
  const lineCount = courtCount + 1;
  const fontSize = Math.min(density === "relaxed" ? 8.3 : 7.2, Math.max(4.8, (cardHeight - 16) / Math.max(1, lineCount) * 0.7));

  return { cardHeight, cardWidth, columns, fontSize, gap, rows };
}

function drawRoundCard(
  commands: PdfCommand[],
  x: number,
  y: number,
  width: number,
  height: number,
  round: TournamentRound,
  resultByMatchId: Map<string, MatchResult>,
  state: LiveTournamentState,
  fontSize: number,
  density: TournamentResultPdfLayoutDiagnostics["density"],
) {
  rect(commands, x, y, width, height, colors.white);
  rect(commands, x, y + height - 15, width, 15, colors.goldSoft);
  rect(commands, x, y, 3, height, colors.gold);
  text(commands, `Runde ${round.roundNumber}`, x + 7, y + height - 9, Math.max(6, fontSize + 0.9), "bold", colors.brown, width - 14);

  const lineHeight = Math.max(fontSize + 2.6, (height - 19) / Math.max(1, round.matches.length));
  round.matches.forEach((match, index) => {
    const result = resultByMatchId.get(match.id);
    const teamA = formatCompactTeam(match.teamA.playerIds, state);
    const teamB = formatCompactTeam(match.teamB.playerIds, state);
    const score = result ? `${result.teamAPoints}-${result.teamBPoints}` : "-";
    const rowY = y + height - 25 - index * lineHeight;

    if (density === "dense") {
      text(commands, `B${match.courtNumber}`, x + 7, rowY, fontSize - 0.2, "bold", colors.muted, 13);
      text(commands, score, x + 22, rowY, fontSize + 0.2, "bold", colors.brown, 27);
      text(commands, `${teamA} vs ${teamB}`, x + 54, rowY, fontSize - 0.2, "regular", colors.brown, width - 60);
    } else {
      text(commands, `Bane ${match.courtNumber}`, x + 8, rowY, fontSize - 0.4, "bold", colors.muted, 34);
      text(commands, score, x + 45, rowY, fontSize + 1.2, "bold", colors.brown, 36);
      text(commands, `${teamA} vs ${teamB}`, x + 86, rowY, fontSize, "regular", colors.brown, width - 94);
    }
  });
}

function getCompletedResultRounds(state: LiveTournamentState): TournamentRound[] {
  const resultByMatchId = new Set(state.results.map((result) => result.matchId));

  return state.rounds
    .map((round) => ({
      ...round,
      matches: round.matches.filter((match) => resultByMatchId.has(match.id)),
    }))
    .filter((round) => round.matches.length > 0);
}

function formatCompactTeam(playerIds: [string, string], state: LiveTournamentState): string {
  return playerIds.map((playerId) => shortenName(getPlayerName(state.players, playerId))).join("/");
}

function shortenName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const numberedName = /^(.+?)\s+(\d+)$/.exec(name.trim());

  if (numberedName?.[1] && numberedName[2]) {
    return `${numberedName[1][0] ?? ""}${numberedName[2]}`;
  }

  if (parts.length === 1) {
    return parts[0] ?? "";
  }

  return `${parts[0]} ${parts.slice(1).map((part) => part[0]).join("")}.`;
}

function rect(commands: PdfCommand[], x: number, y: number, width: number, height: number, color: PdfColor) {
  commands.push({ color, height, type: "rect", width, x, y });
}

function text(commands: PdfCommand[], value: string, x: number, y: number, size: number, font: "regular" | "bold", color: PdfColor, maxWidth?: number) {
  commands.push({
    color,
    font,
    maxWidth,
    size,
    text: maxWidth ? fitText(value, size, maxWidth) : value,
    type: "text",
    x,
    y,
  });
}

function fitText(value: string, size: number, maxWidth: number): string {
  if (estimateTextWidth(value, size) <= maxWidth) {
    return value;
  }

  let clipped = value;
  while (clipped.length > 4 && estimateTextWidth(`${clipped}...`, size) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }

  return `${clipped.trimEnd()}...`;
}

function estimateTextWidth(value: string, size: number): number {
  return value.length * size * 0.48;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getMaxDrawnX(commands: PdfCommand[]): number {
  return Math.max(0, ...commands.map((command) => {
    if (command.type === "rect") {
      return command.x + command.width;
    }

    return command.maxWidth ? command.x + command.maxWidth : command.x + estimateTextWidth(command.text, command.size);
  }));
}

function getMaxDrawnY(commands: PdfCommand[]): number {
  return Math.max(0, ...commands.map((command) => {
    if (command.type === "rect") {
      return command.y + command.height;
    }

    return command.y + command.size;
  }));
}

function createDesignedContentStream(commands: PdfCommand[]): string {
  const body = commands.map((command) => {
    if (command.type === "rect") {
      return `${formatColor(command.color)} rg\n${formatNumber(command.x)} ${formatNumber(command.y)} ${formatNumber(command.width)} ${formatNumber(command.height)} re f`;
    }

    return [
      "BT",
      `${formatColor(command.color ?? colors.brown)} rg`,
      `/${command.font === "bold" ? "F2" : "F1"} ${formatNumber(command.size)} Tf`,
      `${formatNumber(command.x)} ${formatNumber(command.y)} Td`,
      `${toPdfUnicodeString(command.text)} Tj`,
      "ET",
    ].join("\n");
  }).join("\n");

  return `<< /Length ${new TextEncoder().encode(body).length} >>\nstream\n${body}\nendstream`;
}

function formatColor(color: PdfColor): string {
  return color.map(formatNumber).join(" ");
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/g, "").replace(/\.$/, "");
}

function toPdfUnicodeString(value: string): string {
  const bytes = [0xfe, 0xff];

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 32;
    bytes.push((codePoint >> 8) & 0xff, codePoint & 0xff);
  }

  return `<${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}>`;
}

function addObject(objects: string[], body: string): number {
  objects.push(body);
  return objects.length;
}

function encodePdf(objects: string[], catalogId: number): Uint8Array {
  const encoder = new TextEncoder();
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets.push(totalLength(chunks, encoder));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefOffset = totalLength(chunks, encoder);
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => {
    chunks.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  });
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return encoder.encode(chunks.join(""));
}

function totalLength(chunks: string[], encoder: TextEncoder): number {
  return chunks.reduce((length, chunk) => length + encoder.encode(chunk).length, 0);
}
