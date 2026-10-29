import { calculateLiveStandings, getPlayerName, type LiveTournamentState } from "../live-scoring";
import { formatPointDifference, type MatchResult, type StandingRow, type TournamentFormat, type TournamentMatch, type TournamentRound } from "../tournament-engine";
import { createPoolPlaySummary, type PoolPlaySummaryMatch } from "../live-scoring";
import { helveticaBoldWidths, helveticaWidths } from "./helvetica-metrics";
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
  roundCards: Array<{ bounds: PdfBounds; roundNumber: number }>;
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

  return createScoreboardLayout(state);
}

// "Resultattavle" design (owner choice 2026-10-28): dark sidebar with logo, title, winner and facts;
// main column with the final standings and one compact line per match, grouped by round.
const scoreboard = {
  sidebarWidth: 170,
  sidebarPadding: 18,
  mainX: 194,
  mainRight: 571,
  top: 816,
  bottom: 44,
  roundGap: 6,
  roundHeaderHeight: 15,
  matchRowHeight: 13,
  matchFontSize: 7.6,
  scoreFontSize: 9,
  courtColumnWidth: 22,
  scoreColumnWidth: 54,
} as const;

const scoreboardColors = {
  divider: [0.29, 0.22, 0.157] as PdfColor,
  negative: [0.6, 0.23, 0.15] as PdfColor,
  positive: [0.18, 0.42, 0.18] as PdfColor,
} as const;

function createScoreboardLayout(state: LiveTournamentState): PdfLayout {
  const standings = calculateLiveStandings(state);
  const completedRounds = getCompletedResultRounds(state);
  const courtColumns = Math.max(1, ...completedRounds.flatMap((round) => round.matches.map((match) => match.courtNumber)));
  const resultByMatchId = new Map(state.results.map((result) => [result.matchId, result]));
  const density = getDensity(standings.length, completedRounds.length, courtColumns);
  const mainWidth = scoreboard.mainRight - scoreboard.mainX;
  const standingsRowHeight = getScoreboardStandingsRowHeight(standings.length);
  const standingsFontSize = getScoreboardStandingsFontSize(standingsRowHeight);
  const standingsTop = scoreboard.top - 18;
  const standingsBottom = standingsTop - 16 - standings.length * standingsRowHeight;
  const firstResultsTop = standingsBottom - 22;
  const roundPages = paginateScoreboardRounds(completedRounds, firstResultsTop - 16, scoreboard.top - 16);
  const pageCount = roundPages.length;
  const pages: PdfCommand[][] = [];
  const matchRows: PdfMatchRowDiagnostics[] = [];
  const resultPages: PdfResultPageDiagnostics[] = [];

  roundPages.forEach((roundPage, pageIndex) => {
    const commands: PdfCommand[] = [];
    const pageNumber = pageIndex + 1;
    const isFirstPage = pageIndex === 0;
    let cursorY = isFirstPage ? firstResultsTop : scoreboard.top;

    rect(commands, 0, 0, page.width, page.height, colors.background);
    if (isFirstPage) {
      drawScoreboardSidebar(commands, state, standings, completedRounds.length);
      drawScoreboardSectionHeader(commands, scoreboard.top, state.finishedAt ? "SLUTSTILLING" : "STILLING");
      drawScoreboardStandings(commands, standingsTop, standings, standingsRowHeight, standingsFontSize);
    } else {
      drawScoreboardContinuationSidebar(commands, state, roundPage);
    }

    const roundCards: PdfResultPageDiagnostics["roundCards"] = [];
    if (roundPage.length > 0) {
      drawScoreboardSectionHeader(commands, cursorY, isFirstPage ? "KAMPRESULTATER" : "KAMPRESULTATER (FORTSAT)");
      cursorY -= 16;
    }
    const gridTop = cursorY;

    roundPage.forEach((round) => {
      const blockHeight = getScoreboardRoundHeight(round);
      const blockBottom = cursorY - blockHeight;
      roundCards.push({ bounds: { height: blockHeight, width: mainWidth, x: scoreboard.mainX, y: blockBottom }, roundNumber: round.roundNumber });
      matchRows.push(...drawScoreboardRound(commands, scoreboard.mainX, cursorY, mainWidth, round, resultByMatchId, state, pageNumber));
      cursorY = blockBottom - scoreboard.roundGap;
    });

    resultPages.push({
      cardHeight: Math.max(0, ...roundCards.map((card) => card.bounds.height)),
      cardWidth: mainWidth,
      columns: 1,
      gridBottom: roundCards.length ? Math.min(...roundCards.map((card) => card.bounds.y)) : gridTop,
      gridTop,
      page: pageNumber,
      roundCards,
      roundNumbers: roundPage.map((round) => round.roundNumber),
      rowGap: scoreboard.roundGap,
      rows: roundPage.length,
    });
    drawScoreboardFooter(commands, pageNumber, pageCount);
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
  const contentInsidePages = resultPages.every((resultPage) => resultPage.gridBottom >= scoreboard.bottom);

  return {
    pages,
    diagnostics: {
      completedRounds: completedRounds.length,
      courtColumns,
      density,
      fitsOnePage: contentInsidePages && standingsBottom >= scoreboard.bottom && maxDrawnX <= page.width && maxDrawnY <= page.height && allCommands.length > 0,
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
      resultCardColumns: 1,
      resultCardRows: Math.max(1, ...roundPages.map((roundPage) => roundPage.length)),
      resultFontSize: scoreboard.matchFontSize,
      standingsFontSize,
    },
  };
}

function getScoreboardStandingsRowHeight(rowCount: number): number {
  if (rowCount <= 8) return 20;
  if (rowCount <= 12) return 17;
  if (rowCount <= 16) return 15;
  if (rowCount <= 24) return 12.5;
  return 11;
}

function getScoreboardStandingsFontSize(rowHeight: number): number {
  if (rowHeight >= 17) return 9;
  if (rowHeight >= 15) return 8;
  return 7.2;
}

function getScoreboardRoundHeight(round: TournamentRound): number {
  return scoreboard.roundHeaderHeight + round.matches.length * scoreboard.matchRowHeight + 3;
}

function paginateScoreboardRounds(rounds: TournamentRound[], firstPageSpace: number, continuationSpace: number): TournamentRound[][] {
  const pagesOfRounds: TournamentRound[][] = [[]];
  let remaining = firstPageSpace - scoreboard.bottom;

  rounds.forEach((round) => {
    const needed = getScoreboardRoundHeight(round) + scoreboard.roundGap;
    const currentPage = pagesOfRounds[pagesOfRounds.length - 1];

    if (needed > remaining && (currentPage.length > 0 || pagesOfRounds.length === 1)) {
      pagesOfRounds.push([]);
      remaining = continuationSpace - scoreboard.bottom;
    }

    pagesOfRounds[pagesOfRounds.length - 1].push(round);
    remaining -= needed;
  });

  return pagesOfRounds.filter((roundPage, index) => index === 0 || roundPage.length > 0);
}

function drawScoreboardSectionHeader(commands: PdfCommand[], y: number, label: string) {
  const labelWidth = estimateTextWidth(label, 8, "bold") + 8;
  text(commands, label, scoreboard.mainX, y - 8, 8, "bold", colors.goldDark);
  rect(commands, scoreboard.mainX + labelWidth, y - 5.5, scoreboard.mainRight - scoreboard.mainX - labelWidth, 1, colors.gold);
}

function drawScoreboardSidebar(commands: PdfCommand[], state: LiveTournamentState, standings: StandingRow[], playedRounds: number) {
  const x = scoreboard.sidebarPadding;
  const width = scoreboard.sidebarWidth - scoreboard.sidebarPadding * 2;
  const logoHeight = getLogoHeight(width);
  let cursorY = scoreboard.top - logoHeight;

  rect(commands, 0, 0, scoreboard.sidebarWidth, page.height, colors.brown);
  image(commands, "officialLogo", x, cursorY, width, logoHeight);

  const titleSize = state.tournamentName.length > 40 ? 14 : 18;
  const titleLines = wrapText(state.tournamentName, titleSize, width, 4);
  cursorY -= 14;
  titleLines.forEach((line) => {
    cursorY -= titleSize * 1.12;
    text(commands, line, x, cursorY, titleSize, "bold", colors.cream, width);
  });

  const leader = standings[0];
  if (leader) {
    const nameLines = wrapText(leader.name, 12, width - 20, 2);
    const boxHeight = 44 + nameLines.length * 14;
    cursorY -= 18 + boxHeight;
    rect(commands, x, cursorY, width, boxHeight, colors.gold);
    text(commands, state.finishedAt ? "VINDER" : "FØRER", x + 10, cursorY + boxHeight - 16, 6.2, "bold", colors.brown, width - 20);
    nameLines.forEach((line, index) => {
      text(commands, line, x + 10, cursorY + boxHeight - 32 - index * 14, 12, "bold", colors.brown, width - 20);
    });
    text(commands, `${leader.matchPoints} MP · ${leader.pointsFor} point · ${formatPointDifference(leader.pointDifference)}`, x + 10, cursorY + 10, 7, "regular", colors.brown, width - 20);
  }

  const entries: Array<[string, string]> = [
    ["Format", formatLabels[state.format]],
    ["Spillere", String(state.players.length)],
    ["Baner", String(state.courtCount)],
    ["Runder", String(playedRounds)],
    ["Rangering", rankingModeLabels[state.rankingMode]],
    ["Afsluttet", state.finishedAt ? formatDateTime(state.finishedAt) : "Ikke afsluttet"],
  ];
  cursorY -= 22;
  text(commands, "OVERBLIK", x, cursorY, 6.2, "bold", colors.gold, width);
  cursorY -= 8;
  entries.forEach(([label, value]) => {
    rect(commands, x, cursorY, width, 0.6, scoreboardColors.divider);
    text(commands, label.toUpperCase(), x, cursorY - 10, 6.2, "bold", colors.gold, width);
    text(commands, value, x, cursorY - 22, 9, "bold", colors.cream, width);
    cursorY -= 31;
  });
}

function drawScoreboardContinuationSidebar(commands: PdfCommand[], state: LiveTournamentState, rounds: TournamentRound[]) {
  const x = scoreboard.sidebarPadding;
  const width = scoreboard.sidebarWidth - scoreboard.sidebarPadding * 2;
  const logoHeight = getLogoHeight(width);
  let cursorY = scoreboard.top - logoHeight;

  rect(commands, 0, 0, scoreboard.sidebarWidth, page.height, colors.brown);
  image(commands, "officialLogo", x, cursorY, width, logoHeight);
  cursorY -= 14;
  wrapText(state.tournamentName, 14, width, 3).forEach((line) => {
    cursorY -= 16;
    text(commands, line, x, cursorY, 14, "bold", colors.cream, width);
  });
  const start = rounds[0]?.roundNumber ?? 0;
  const end = rounds[rounds.length - 1]?.roundNumber ?? 0;
  cursorY -= 26;
  rect(commands, x, cursorY, width, 0.6, scoreboardColors.divider);
  text(commands, "RUNDER", x, cursorY - 10, 6.2, "bold", colors.gold, width);
  text(commands, start === end ? String(start) : `${start}-${end}`, x, cursorY - 22, 9, "bold", colors.cream, width);
}

function drawScoreboardStandings(commands: PdfCommand[], top: number, standings: StandingRow[], rowHeight: number, fontSize: number) {
  const x = scoreboard.mainX;
  const right = scoreboard.mainRight;
  const numberColumns: Array<{ label: string; right: number; value: (row: StandingRow) => string; bold?: boolean; signed?: boolean }> = [
    { label: "+/-", right: right - 4, value: (row) => formatPointDifference(row.pointDifference), bold: true, signed: true },
    { label: "POINT", right: right - 44, value: (row) => String(row.pointsFor) },
    { label: "MP", right: right - 86, value: (row) => String(row.matchPoints), bold: true },
    { label: "T", right: right - 116, value: (row) => String(row.losses) },
    { label: "U", right: right - 140, value: (row) => String(row.draws) },
    { label: "V", right: right - 164, value: (row) => String(row.wins) },
  ];
  const nameWidth = right - 188 - (x + 22);
  const headerBaseline = top - 9;

  text(commands, "#", x + 4, headerBaseline, 6.5, "bold", colors.muted);
  text(commands, "NAVN", x + 22, headerBaseline, 6.5, "bold", colors.muted);
  numberColumns.forEach((column) => rightAlignedText(commands, column.label, column.right, headerBaseline, 6.5, "bold", colors.muted));
  rect(commands, x, top - 15, right - x, 1, colors.brown);

  standings.forEach((row, index) => {
    const rowTop = top - 16 - index * rowHeight;
    const baseline = rowTop - rowHeight / 2 - fontSize * 0.35;

    text(commands, String(row.rank), x + 4, baseline, fontSize, "bold", colors.brown);
    text(commands, row.name, x + 22, baseline, fontSize, "bold", colors.brown, nameWidth);
    numberColumns.forEach((column) => {
      const value = column.value(row);
      const color = column.signed ? (row.pointDifference > 0 ? scoreboardColors.positive : row.pointDifference < 0 ? scoreboardColors.negative : colors.brown) : colors.brown;
      rightAlignedText(commands, value, column.right, baseline, fontSize, column.bold ? "bold" : "regular", color);
    });
    rect(commands, x, rowTop - rowHeight, right - x, 0.5, colors.sand);
  });
}

function drawScoreboardRound(
  commands: PdfCommand[],
  x: number,
  top: number,
  width: number,
  round: TournamentRound,
  resultByMatchId: Map<string, MatchResult>,
  state: LiveTournamentState,
  pageNumber: number,
): PdfMatchRowDiagnostics[] {
  const height = getScoreboardRoundHeight(round);
  const rows: PdfMatchRowDiagnostics[] = [];
  const innerX = x + 9;
  const innerRight = x + width - 8;
  const byes = (round.byePlayerIds ?? []).map((playerId) => getPlayerName(state.players, playerId));

  rect(commands, x, top - height, width, height, colors.cream);
  rect(commands, x, top - height, 3, height, colors.gold);
  text(commands, `RUNDE ${round.roundNumber}`, innerX, top - 10, 7, "bold", colors.goldDark);
  if (byes.length > 0) {
    const label = `Pause: ${byes.join(", ")}`;
    rightAlignedText(commands, fitText(label, 6.5, width - 90), innerRight, top - 10, 6.5, "regular", colors.muted);
  }

  [...round.matches].sort((left, right) => left.courtNumber - right.courtNumber).forEach((match, index) => {
    const rowTop = top - scoreboard.roundHeaderHeight - index * scoreboard.matchRowHeight;
    const rowBottom = rowTop - scoreboard.matchRowHeight;
    const baseline = rowBottom + 4;
    const result = resultByMatchId.get(match.id);
    const teamA = match.teamA.playerIds.map((playerId) => getPlayerName(state.players, playerId));
    const teamB = match.teamB.playerIds.map((playerId) => getPlayerName(state.players, playerId));
    const aWon = result ? result.teamAPoints > result.teamBPoints : false;
    const bWon = result ? result.teamBPoints > result.teamAPoints : false;
    // Row bounds are symmetric around the block centre so the score column sits exactly in the middle.
    const court: PdfBounds = { height: scoreboard.matchRowHeight, width: width - 8, x: x + 4, y: rowBottom };
    const scoreX = x + width / 2 - scoreboard.scoreColumnWidth / 2;
    const score: PdfBounds = { height: scoreboard.matchRowHeight - 2, width: scoreboard.scoreColumnWidth, x: scoreX, y: rowBottom + 1 };
    const sideAX = innerX + scoreboard.courtColumnWidth;
    const sideA: PdfBounds = { height: scoreboard.matchRowHeight, width: score.x - 4 - sideAX, x: sideAX, y: rowBottom };
    const sideBX = score.x + score.width + 4;
    const sideB: PdfBounds = { height: scoreboard.matchRowHeight, width: innerRight - sideBX, x: sideBX, y: rowBottom };

    text(commands, `B${match.courtNumber}`, innerX, baseline, 6.5, "bold", colors.goldDark);
    text(commands, teamA.join(" / "), sideA.x, baseline, scoreboard.matchFontSize, aWon ? "bold" : "regular", colors.brown, sideA.width);
    centeredText(commands, result ? `${result.teamAPoints}–${result.teamBPoints}` : "-", score, scoreboard.scoreFontSize, "bold", colors.brown);
    const nameB = fitText(teamB.join(" / "), scoreboard.matchFontSize, sideB.width, bWon ? "bold" : "regular");
    rightAlignedText(commands, nameB, innerRight, baseline, scoreboard.matchFontSize, bWon ? "bold" : "regular", colors.brown);
    if (index < round.matches.length - 1) {
      rect(commands, innerX, rowBottom, innerRight - innerX, 0.4, colors.sand);
    }

    rows.push({
      bottomLeftPlayer: teamA[1] ?? "",
      bottomRightPlayer: teamB[1] ?? "",
      court,
      courtNumber: match.courtNumber,
      page: pageNumber,
      roundNumber: round.roundNumber,
      score,
      sideA,
      sideB,
      topLeftPlayer: teamA[0] ?? "",
      topRightPlayer: teamB[0] ?? "",
    });
  });

  return rows;
}

function drawScoreboardFooter(commands: PdfCommand[], pageNumber: number, pageCount: number) {
  text(commands, "LEZGO PADEL · app.lezgopadel.dk", scoreboard.mainX, 22, 6.5, "regular", colors.muted);
  rightAlignedText(commands, `Side ${pageNumber} / ${pageCount}`, scoreboard.mainRight, 22, 6.5, "regular", colors.muted);
}

function rightAlignedText(commands: PdfCommand[], value: string, right: number, y: number, size: number, font: "regular" | "bold", color: PdfColor) {
  text(commands, value, right - estimateTextWidth(value, size, font), y, size, font, color);
}

function wrapText(value: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (estimateTextWidth(candidate, size, "bold") <= maxWidth || !current) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fitText(`${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`, size, maxWidth, "bold");
  return kept;
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
      resultPages: [{ cardHeight: 1, cardWidth: 1, columns: 1, gridBottom: 1, gridTop: 1, page: 1, roundCards: [], roundNumbers: [1], rowGap: 0, rows: 1 }],
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
    { label: "+/-", value: (row: StandingRow) => formatPointDifference(row.pointDifference), width: 30 },
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

function getCompletedResultRounds(state: LiveTournamentState): TournamentRound[] {
  const resultByMatchId = new Set(state.results.map((result) => result.matchId));

  return state.rounds
    .map((round) => ({
      ...round,
      matches: round.matches.filter((match) => resultByMatchId.has(match.id)),
    }))
    .filter((round) => round.matches.length > 0);
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
    text: maxWidth ? fitText(value, size, maxWidth, font) : value,
    type: "text",
    x,
    y,
  });
}

function centeredText(commands: PdfCommand[], value: string, bounds: PdfBounds, size: number, font: "regular" | "bold", color: PdfColor) {
  const fittedText = fitText(value, size, bounds.width - 4, font);
  const textWidth = estimateTextWidth(fittedText, size, font);
  const x = bounds.x + Math.max(2, (bounds.width - textWidth) / 2);
  const y = bounds.y + (bounds.height - size) / 2 + 1.5;

  text(commands, fittedText, x, y, size, font, color);
}

function fitText(value: string, size: number, maxWidth: number, font: "regular" | "bold" = "regular"): string {
  if (estimateTextWidth(value, size, font) <= maxWidth) {
    return value;
  }

  let clipped = value;
  while (clipped.length > 4 && estimateTextWidth(`${clipped}...`, size, font) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }

  return `${clipped.trimEnd()}...`;
}

function estimateTextWidth(value: string, size: number, font: "regular" | "bold" = "regular"): number {
  const widths = font === "bold" ? helveticaBoldWidths : helveticaWidths;
  let total = 0;

  for (const character of value) {
    total += widths[toWinAnsiChar(character).charCodeAt(0)] || 556;
  }

  return total * size / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getMaxDrawnX(commands: PdfCommand[]): number {
  return Math.max(0, ...commands.map((command) => {
    if (command.type === "rect" || command.type === "image") {
      return command.x + command.width;
    }

    return command.maxWidth ? command.x + command.maxWidth : command.x + estimateTextWidth(command.text, command.size, command.font);
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
