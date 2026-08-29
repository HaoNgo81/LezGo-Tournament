import { calculateLiveStandings, getPlayerName, type LiveTournamentState } from "../live-scoring";
import type { MatchResult, StandingRow, TournamentFormat, TournamentMatch, TournamentRound } from "../tournament-engine";
import { createPoolPlaySummary, type PoolPlaySummaryMatch } from "../live-scoring";
import { officialPdfLogo } from "./official-logo-data";

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
  return createDesignedPdf(state);
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
  logoSourcePath: string;
  logoUsed: boolean;
  matchRows: PdfMatchRowDiagnostics[];
  maxDrawnX: number;
  maxDrawnY: number;
  minimumFontSize: number;
  orientation: "portrait";
  pageCount: number;
  pageRoundRanges: Array<{ end: number; page: number; roundNumbers: number[]; start: number }>;
  resultPages: PdfResultPageDiagnostics[];
  resultCardColumns: number;
  resultCardRows: number;
  resultFontSize: number;
  standingsFontSize: number;
}

export interface PdfBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface PdfMatchRowDiagnostics {
  bottomLeftPlayer: string;
  bottomRightPlayer: string;
  court: PdfBounds;
  courtNumber: number;
  page: number;
  roundNumber: number;
  score: PdfBounds;
  sideA: PdfBounds;
  sideB: PdfBounds;
  topLeftPlayer: string;
  topRightPlayer: string;
}

export interface PdfResultPageDiagnostics {
  cardHeight: number;
  cardWidth: number;
  columns: number;
  gridBottom: number;
  gridTop: number;
  page: number;
  roundNumbers: number[];
  rowGap: number;
  rows: number;
}

export function createTournamentResultPdfLayoutDiagnostics(state: LiveTournamentState): TournamentResultPdfLayoutDiagnostics {
  return createResultLayout(state).diagnostics;
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

interface PdfImageCommand {
  height: number;
  image: "officialLogo";
  type: "image";
  width: number;
  x: number;
  y: number;
}

type PdfCommand = PdfTextCommand | PdfRectCommand | PdfImageCommand;

interface PdfLayout {
  diagnostics: TournamentResultPdfLayoutDiagnostics;
  pages: PdfCommand[][];
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
const maxRoundsPerPage = 12;

function createDesignedPdf(state: LiveTournamentState): Uint8Array {
  const layout = createResultLayout(state);

  if (!layout.diagnostics.fitsOnePage) {
    throw new Error(`PDF-resultatet kan ikke holdes paa en laesbar A4-side for ${layout.diagnostics.completedRounds} runder med ${layout.diagnostics.courtColumns} baner.`);
  }

  const objects: string[] = [];
  const catalogId = addObject(objects, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(objects, "");
  const pageIds: number[] = [];
  const logoMaskId = addObject(objects, createImageStream(base64ToBinaryString(officialPdfLogo.alphaBase64), officialPdfLogo.width, officialPdfLogo.height, "/DeviceGray"));
  const logoImageId = addObject(objects, createImageStream(base64ToBinaryString(officialPdfLogo.rgbBase64), officialPdfLogo.width, officialPdfLogo.height, "/DeviceRGB", logoMaskId));
  const fontResources = "/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >>";
  const xObjectResources = `/XObject << /Logo ${logoImageId} 0 R >>`;

  layout.pages.forEach((commands) => {
    const contentId = addObject(objects, createDesignedContentStream(commands));
    const pageId = addObject(objects, "");

    pageIds.push(pageId);
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << ${fontResources} ${xObjectResources} >> /Contents ${contentId} 0 R >>`;
  });

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((pageId) => `${pageId} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  return encodePdf(objects, catalogId);
}

function createResultLayout(state: LiveTournamentState): PdfLayout {
  if (state.poolPlay) {
    return createPoolPlayOnePageLayout(state as LiveTournamentState & { poolPlay: NonNullable<LiveTournamentState["poolPlay"]> });
  }

  const standings = calculateLiveStandings(state);
  const completedRounds = getCompletedResultRounds(state);
  const courtColumns = Math.max(1, ...completedRounds.flatMap((round) => round.matches.map((match) => match.courtNumber)));
  const resultByMatchId = new Map(state.results.map((result) => [result.matchId, result]));
  const pages: PdfCommand[][] = [];
  const contentX = page.margin;
  const contentWidth = page.width - page.margin * 2;
  const density = getDensity(standings.length, completedRounds.length, courtColumns);
  const roundPages = chunkRounds(completedRounds, courtColumns);
  const summaryX = density === "relaxed" ? 398 : 414;
  const standingsWidth = summaryX - contentX - 14;
  const standingsHeight = getStandingsHeight(standings.length, density);
  const topY = 704 - standingsHeight;
  const standingsFontSize = getStandingsFontSize(standings.length, density);
  let resultFontSize = 0;
  let resultCardColumns = 1;
  let resultCardRows = 1;
  let fitsAllPages = true;
  const matchRows: PdfMatchRowDiagnostics[] = [];
  const resultPages: PdfResultPageDiagnostics[] = [];

  roundPages.forEach((roundPage, pageIndex) => {
    const commands: PdfCommand[] = [];
    const isFirstPage = pageIndex === 0;
    const pageNumber = pageIndex + 1;
    const pageCount = roundPages.length;
    const resultsTop = isFirstPage ? topY - 34 : 700;
    const resultsBottom = 50;
    const resultsHeight = resultsTop - resultsBottom;
    const grid = calculateResultGrid(roundPage.length, courtColumns, contentWidth, resultsHeight, density);
    const blockHeight = grid.rows * grid.cardHeight + Math.max(0, grid.rows - 1) * grid.rowGap;
    const blockBottom = isFirstPage ? resultsBottom : resultsTop - blockHeight;

    resultFontSize = Math.max(resultFontSize, grid.fontSize);
    resultCardColumns = Math.max(resultCardColumns, grid.columns);
    resultCardRows = Math.max(resultCardRows, grid.rows);
    fitsAllPages = fitsAllPages && grid.fontSize >= minimumReadableFontSize;

    drawPageBase(commands, isFirstPage ? "main" : "continuation");
    if (isFirstPage) {
      drawHeader(commands, state);
      drawSectionHeader(commands, contentX, topY + standingsHeight + 24, standingsWidth, "SLUTSTILLING");
      drawStandingsTable(commands, contentX, topY, standingsWidth, standingsHeight, standings, standingsFontSize, density);
      drawSummaryPanel(commands, summaryX, topY, contentX + contentWidth - summaryX, standingsHeight, state, density);
    } else {
      drawContinuationHeader(commands, state, roundPage);
    }
    drawSectionHeader(commands, contentX, resultsTop + 21, contentWidth, "KAMPRESULTATER");

    roundPage.forEach((round, index) => {
      const column = index % grid.columns;
      const row = Math.floor(index / grid.columns);
      const x = contentX + column * (grid.cardWidth + grid.gap);
      const y = blockBottom + blockHeight - (row + 1) * grid.cardHeight - row * grid.rowGap;

      matchRows.push(...drawRoundCard(commands, x, y, grid.cardWidth, grid.cardHeight, round, resultByMatchId, state, grid.fontSize, density, pageNumber));
    });
    resultPages.push({
      cardHeight: grid.cardHeight,
      cardWidth: grid.cardWidth,
      columns: grid.columns,
      gridBottom: blockBottom,
      gridTop: blockBottom + blockHeight,
      page: pageNumber,
      roundNumbers: roundPage.map((round) => round.roundNumber),
      rowGap: grid.rowGap,
      rows: grid.rows,
    });

    drawPageNumber(commands, pageNumber, pageCount);
    pages.push(commands);
  });

  const allCommands = pages.flat();
  const maxDrawnX = Math.max(...pages.map(getMaxDrawnX));
  const maxDrawnY = Math.max(...pages.map(getMaxDrawnY));
  const pageRoundRanges = roundPages.map((roundPage, index) => ({
    end: roundPage[roundPage.length - 1]?.roundNumber ?? 0,
    page: index + 1,
    roundNumbers: roundPage.map((round) => round.roundNumber),
    start: roundPage[0]?.roundNumber ?? 0,
  }));
  const roundsPerPageValid = pageRoundRanges.every((range) => range.roundNumbers.length <= maxRoundsPerPage);

  return {
    pages,
    diagnostics: {
      completedRounds: completedRounds.length,
      courtColumns,
      density,
      fitsOnePage: fitsAllPages && roundsPerPageValid && maxDrawnX <= page.width && maxDrawnY <= page.height && allCommands.length > 0,
      logoSourcePath: officialPdfLogo.sourcePath,
      logoUsed: true,
      matchRows,
      maxDrawnX,
      maxDrawnY,
      minimumFontSize: minimumReadableFontSize,
      orientation: "portrait",
      pageCount: pages.length,
      pageRoundRanges,
      resultPages,
      resultCardColumns,
      resultCardRows,
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
    pages: [commands],
    diagnostics: {
      completedRounds: 1,
      courtColumns: Math.max(1, poolMatches.length),
      density,
      fitsOnePage: resultFontSize >= minimumReadableFontSize,
      logoSourcePath: officialPdfLogo.sourcePath,
      logoUsed: true,
      matchRows: [],
      maxDrawnX: getMaxDrawnX(commands),
      maxDrawnY: getMaxDrawnY(commands),
      minimumFontSize: minimumReadableFontSize,
      orientation: "portrait",
      pageCount: 1,
      pageRoundRanges: [{ end: 1, page: 1, roundNumbers: [1], start: 1 }],
      resultPages: [{ cardHeight: 1, cardWidth: 1, columns: 1, gridBottom: 1, gridTop: 1, page: 1, roundNumbers: [1], rowGap: 0, rows: 1 }],
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

function chunkRounds(rounds: TournamentRound[], courtCount = 1): TournamentRound[][] {
  if (rounds.length === 20 && courtCount >= 4) {
    return [rounds.slice(0, 8), ...chunkRoundTail(rounds.slice(8))];
  }

  return chunkRoundTail(rounds);
}

function chunkRoundTail(rounds: TournamentRound[]): TournamentRound[][] {
  const chunks: TournamentRound[][] = [];

  for (let index = 0; index < rounds.length; index += maxRoundsPerPage) {
    chunks.push(rounds.slice(index, index + maxRoundsPerPage));
  }

  return chunks.length ? chunks : [[]];
}

function getStandingsHeight(playerCount: number, density: TournamentResultPdfLayoutDiagnostics["density"]): number {
  const rowHeight = density === "relaxed" ? 23 : density === "standard" ? 18 : 15.5;

  return clamp(30 + playerCount * rowHeight, 112, density === "relaxed" ? 210 : 278);
}

function getStandingsFontSize(playerCount: number, density: TournamentResultPdfLayoutDiagnostics["density"]): number {
  const base = density === "relaxed" ? 9.4 : density === "standard" ? 8.6 : 8.2;

  return clamp(base - Math.max(0, playerCount - 8) * 0.16, minimumReadableFontSize, base);
}

function drawPageBase(commands: PdfCommand[], variant: "main" | "continuation" = "main") {
  rect(commands, 0, 0, page.width, page.height, colors.background);
  rect(commands, page.margin, page.margin, page.width - page.margin * 2, page.height - page.margin * 2, colors.cream);
  rect(commands, page.margin, variant === "main" ? 744 : 754, page.width - page.margin * 2, variant === "main" ? 72 : 58, colors.brown);
  rect(commands, page.margin, variant === "main" ? 735 : 744, page.width - page.margin * 2, 9, colors.gold);
  rect(commands, page.margin + 14, variant === "main" ? 758 : 768, 7, variant === "main" ? 42 : 30, colors.gold);
}

function drawHeader(commands: PdfCommand[], state: LiveTournamentState) {
  image(commands, "officialLogo", 44, 784, 155, getLogoHeight(155));
  text(commands, fitTitle(state.tournamentName), 44, 763, getTitleFontSize(state.tournamentName), "bold", colors.white, 352);
  rect(commands, 420, 761, 130, 36, colors.goldSoft);
  text(commands, "AFSLUTTET", 432, 784, 6.4, "bold", colors.goldDark, 108);
  text(commands, state.finishedAt ? formatDateTime(state.finishedAt) : "Ikke afsluttet", 432, 769, 10, "bold", colors.brown, 108);
}

function drawContinuationHeader(commands: PdfCommand[], state: LiveTournamentState, rounds: TournamentRound[]) {
  image(commands, "officialLogo", 44, 784, 126, getLogoHeight(126));
  text(commands, fitTitle(state.tournamentName), 44, 766, 15, "bold", colors.white, 330);
  const start = rounds[0]?.roundNumber ?? 0;
  const end = rounds[rounds.length - 1]?.roundNumber ?? 0;
  rect(commands, 405, 767, 145, 30, colors.goldSoft);
  text(commands, "RUNDER", 418, 786, 6.2, "bold", colors.goldDark, 112);
  text(commands, `${start}-${end}`, 418, 773, 12, "bold", colors.brown, 112);
}

function drawPageNumber(commands: PdfCommand[], pageNumber: number, pageCount: number) {
  text(commands, `${pageNumber} / ${pageCount}`, 520, 32, 7.5, "bold", colors.muted, 38);
}

function getLogoHeight(width: number): number {
  return width * officialPdfLogo.height / officialPdfLogo.width;
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
    ["Afsluttet", state.finishedAt ? formatDateTime(state.finishedAt) : "Ikke afsluttet"],
  ];
  const itemGap = Math.min(density === "relaxed" ? 31 : 28, (height - 48) / entries.length);
  let cursorY = y + height - 52;

  entries.forEach(([label, value]) => {
    rect(commands, x + 14, cursorY - 17, width - 28, 22, colors.creamDeep);
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
    { label: "Navn", value: (row: StandingRow) => row.name, width: width - 238 },
    { label: "MP", value: (row: StandingRow) => String(row.matchPoints), width: 28 },
    { label: "SP", value: (row: StandingRow) => String(row.pointsFor), width: 28 },
    { label: "Tabte", value: (row: StandingRow) => String(row.pointsAgainst), width: 34 },
    { label: "Diff", value: (row: StandingRow) => String(row.pointDifference), width: 30 },
    { label: "Sejre", value: (row: StandingRow) => String(row.wins), width: 30 },
    { label: "Uafgjort", value: (row: StandingRow) => String(row.draws), width: 44 },
    { label: "Tab", value: (row: StandingRow) => String(row.losses), width: 24 },
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
  const gap = density === "relaxed" ? 10 : 7;
  const maxColumns = density === "relaxed" ? Math.min(3, safeRoundCount) : 4;
  const preferredColumns = courtCount >= 4 ? 4 : Math.ceil(Math.sqrt(safeRoundCount * 1.05));
  const columns = clamp(preferredColumns, 1, Math.min(maxColumns, safeRoundCount));
  const rows = Math.ceil(safeRoundCount / columns);
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const lineCount = courtCount + 1;
  const stretchedCardHeight = (height - gap * (rows - 1)) / rows;
  const cardHeight = stretchedCardHeight;
  const rowGap = gap;
  const fontSize = Math.min(density === "relaxed" ? 9.3 : 7.8, Math.max(minimumReadableFontSize, (cardHeight - 24) / Math.max(1, lineCount) * 0.58));

  return { cardHeight, cardWidth, columns, fontSize, gap, rowGap, rows };
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
  pageNumber: number,
): PdfMatchRowDiagnostics[] {
  const matchRows: PdfMatchRowDiagnostics[] = [];

  rect(commands, x, y, width, height, colors.white);
  rect(commands, x, y + height - 18, width, 18, colors.goldSoft);
  rect(commands, x, y, 3, height, colors.gold);
  text(commands, `RUNDE ${round.roundNumber}`, x + 7, y + height - 12, Math.max(7, fontSize + 1.2), "bold", colors.brown, width - 14);

  const courtGap = 3;
  const courtCardHeight = (height - 24 - courtGap * Math.max(0, round.matches.length - 1)) / Math.max(1, round.matches.length);
  const scoreWidth = Math.min(58, Math.max(52, width * 0.32));
  const sideGap = 3;
  const sidePadding = 10;
  const sideWidth = (width - sidePadding * 2 - scoreWidth - sideGap * 2) / 2;
  const sideXLeft = x + sidePadding;
  const scoreX = x + (width - scoreWidth) / 2;
  const sideXRight = scoreX + scoreWidth + sideGap;
  const scoreHeight = clamp(courtCardHeight * 0.28, 17, 24);
  const scoreFontSize = clamp(courtCardHeight * 0.26, fontSize + 1.5, 12.8);
  const nameFontSize = density === "relaxed" ? Math.max(7.6, fontSize) : clamp(courtCardHeight * 0.16, 6.1, 8.4);
  const courtFontSize = density === "relaxed" ? 6.8 : clamp(courtCardHeight * 0.12, 5.7, 6.8);
  round.matches.forEach((match, index) => {
    const result = resultByMatchId.get(match.id);
    const topLeft = formatCourtPlayerName(getPlayerName(state.players, match.teamA.playerIds[0]), density);
    const bottomLeft = formatCourtPlayerName(getPlayerName(state.players, match.teamA.playerIds[1]), density);
    const topRight = formatCourtPlayerName(getPlayerName(state.players, match.teamB.playerIds[0]), density);
    const bottomRight = formatCourtPlayerName(getPlayerName(state.players, match.teamB.playerIds[1]), density);
    const score = result ? `${result.teamAPoints}–${result.teamBPoints}` : "-";
    const courtY = y + height - 21 - (index + 1) * courtCardHeight - index * courtGap;
    const courtBounds = { height: courtCardHeight, width: width - 16, x: x + 8, y: courtY };
    const scoreBounds = { height: scoreHeight, width: scoreWidth, x: scoreX, y: courtY + (courtCardHeight - scoreHeight) / 2 };
    const sideABounds = { height: courtCardHeight, width: sideWidth, x: sideXLeft, y: courtY };
    const sideBBounds = { height: courtCardHeight, width: sideWidth, x: sideXRight, y: courtY };
    const topNameY = courtY + courtCardHeight - 13;
    const bottomNameY = courtY + 7;

    rect(commands, courtBounds.x, courtBounds.y, courtBounds.width, courtBounds.height, [0.995, 0.99, 0.97]);
    rect(commands, scoreBounds.x, scoreBounds.y, scoreBounds.width, scoreBounds.height, [1, 1, 1]);
    centeredText(commands, `BANE ${match.courtNumber}`, { height: 8, width: courtBounds.width, x: courtBounds.x, y: courtY + courtCardHeight - 8 }, courtFontSize, "bold", colors.muted);
    text(commands, topLeft, sideXLeft, topNameY, nameFontSize, "regular", colors.brown, sideWidth);
    text(commands, topRight, sideXRight, topNameY, nameFontSize, "regular", colors.brown, sideWidth);
    centeredText(commands, score, scoreBounds, scoreFontSize, "bold", colors.brown);
    text(commands, bottomLeft, sideXLeft, bottomNameY, nameFontSize, "regular", colors.brown, sideWidth);
    text(commands, bottomRight, sideXRight, bottomNameY, nameFontSize, "regular", colors.brown, sideWidth);
    matchRows.push({
      bottomLeftPlayer: getPlayerName(state.players, match.teamA.playerIds[1]),
      bottomRightPlayer: getPlayerName(state.players, match.teamB.playerIds[1]),
      court: courtBounds,
      courtNumber: match.courtNumber,
      page: pageNumber,
      roundNumber: round.roundNumber,
      score: scoreBounds,
      sideA: sideABounds,
      sideB: sideBBounds,
      topLeftPlayer: getPlayerName(state.players, match.teamA.playerIds[0]),
      topRightPlayer: getPlayerName(state.players, match.teamB.playerIds[0]),
    });
  });

  return matchRows;
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

function formatCourtPlayerName(name: string, density: TournamentResultPdfLayoutDiagnostics["density"]): string {
  if (density === "relaxed") {
    return name;
  }

  return shortenName(name);
}

function shortenName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const numberedName = /^(.+?)\s+(\d+)$/.exec(name.trim());

  if (numberedName?.[1] && numberedName[2]) {
    return `${numberedName[1].slice(0, 2)}. ${numberedName[2]}`;
  }

  if (parts.length === 1) {
    return parts[0] ?? "";
  }

  return `${parts[0]} ${parts.slice(1).map((part) => part[0]).join("")}.`;
}

function rect(commands: PdfCommand[], x: number, y: number, width: number, height: number, color: PdfColor) {
  commands.push({ color, height, type: "rect", width, x, y });
}

function image(commands: PdfCommand[], image: PdfImageCommand["image"], x: number, y: number, width: number, height: number) {
  commands.push({ height, image, type: "image", width, x, y });
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

function centeredText(commands: PdfCommand[], value: string, bounds: PdfBounds, size: number, font: "regular" | "bold", color: PdfColor) {
  const fittedText = fitText(value, size, bounds.width - 4);
  const textWidth = estimateTextWidth(fittedText, size);
  const x = bounds.x + Math.max(2, (bounds.width - textWidth) / 2);
  const y = bounds.y + (bounds.height - size) / 2 + 1.5;

  text(commands, fittedText, x, y, size, font, color);
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
    if (command.type === "rect" || command.type === "image") {
      return command.x + command.width;
    }

    return command.maxWidth ? command.x + command.maxWidth : command.x + estimateTextWidth(command.text, command.size);
  }));
}

function getMaxDrawnY(commands: PdfCommand[]): number {
  return Math.max(0, ...commands.map((command) => {
    if (command.type === "rect" || command.type === "image") {
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

    if (command.type === "image") {
      return `q\n${formatNumber(command.width)} 0 0 ${formatNumber(command.height)} ${formatNumber(command.x)} ${formatNumber(command.y)} cm\n/Logo Do\nQ`;
    }

    return [
      "BT",
      `${formatColor(command.color ?? colors.brown)} rg`,
      `/${command.font === "bold" ? "F2" : "F1"} ${formatNumber(command.size)} Tf`,
      `${formatNumber(command.x)} ${formatNumber(command.y)} Td`,
      `${toPdfLiteralString(command.text)} Tj`,
      "ET",
    ].join("\n");
  }).join("\n");

  return `<< /Length ${byteLength(body)} >>\nstream\n${body}\nendstream`;
}

function formatColor(color: PdfColor): string {
  return color.map(formatNumber).join(" ");
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/g, "").replace(/\.$/, "");
}

function toPdfLiteralString(value: string): string {
  const encoded = Array.from(value.normalize("NFC")).map(toWinAnsiChar).join("");

  return `(${encoded.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

function toWinAnsiChar(value: string): string {
  const codePoint = value.codePointAt(0) ?? 32;

  if (codePoint === 0x2013) {
    return String.fromCharCode(0x96);
  }

  if (codePoint <= 0xff) {
    return String.fromCharCode(codePoint);
  }

  return "?";
}

function createImageStream(data: string, width: number, height: number, colorSpace: "/DeviceRGB" | "/DeviceGray", maskObjectId?: number): string {
  const mask = maskObjectId ? ` /SMask ${maskObjectId} 0 R` : "";

  return `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /FlateDecode${mask} /Length ${byteLength(data)} >>\nstream\n${data}\nendstream`;
}

function base64ToBinaryString(value: string): string {
  const cleanValue = value.replace(/\s/g, "");
  let output = "";

  for (let index = 0; index < cleanValue.length; index += 4) {
    const a = decodeBase64Char(cleanValue[index]);
    const b = decodeBase64Char(cleanValue[index + 1]);
    const c = cleanValue[index + 2] === "=" ? 0 : decodeBase64Char(cleanValue[index + 2]);
    const d = cleanValue[index + 3] === "=" ? 0 : decodeBase64Char(cleanValue[index + 3]);
    const triplet = (a << 18) | (b << 12) | (c << 6) | d;

    output += String.fromCharCode((triplet >> 16) & 0xff);

    if (cleanValue[index + 2] !== "=") {
      output += String.fromCharCode((triplet >> 8) & 0xff);
    }

    if (cleanValue[index + 3] !== "=") {
      output += String.fromCharCode(triplet & 0xff);
    }
  }

  return output;
}

function decodeBase64Char(value: string | undefined): number {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const decoded = value ? alphabet.indexOf(value) : -1;

  if (decoded < 0) {
    throw new Error("Invalid PDF logo data.");
  }

  return decoded;
}

function addObject(objects: string[], body: string): number {
  objects.push(body);
  return objects.length;
}

function encodePdf(objects: string[], catalogId: number): Uint8Array {
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets.push(totalLength(chunks));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefOffset = totalLength(chunks);
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach((offset) => {
    chunks.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  });
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return toBinaryBytes(chunks.join(""));
}

function totalLength(chunks: string[]): number {
  return chunks.reduce((length, chunk) => length + byteLength(chunk), 0);
}

function byteLength(value: string): number {
  return value.length;
}

function toBinaryBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }

  return bytes;
}
