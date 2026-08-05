import { calculateLiveStandings, getPlayerName, type LiveTournamentState } from "../live-scoring";
import type { MatchResult, TournamentFormat, TournamentMatch } from "../tournament-engine";

const rankingModeLabels = {
  matchPointsFirst: "Flest matchpoint",
  partiPointsFirst: "Flest partipoint",
} as const;

const formatLabels: Record<TournamentFormat, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  "mixed-americano": "Mixed Americano",
  "fixed-partner-americano": "Fast Makker Americano",
  "fixed-partner-mexicano": "Fast Makker Mexicano",
};

export function createTournamentResultPdf(state: LiveTournamentState): Uint8Array {
  return createSimplePdf(createTournamentResultLines(state));
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
    `Runder: ${state.rounds.length}`,
    "",
    "SLUTSTILLING",
    "Placering | Navn | Matchpoint | Partipoint | Tabte | Difference | Sejre | Uafgjort | Tab",
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

function createSimplePdf(lines: string[]): Uint8Array {
  const pages = paginateLines(lines);
  const objects: string[] = [];
  const catalogId = addObject(objects, "<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds: number[] = [];
  const contentIds: number[] = [];

  addObject(objects, "");

  pages.forEach((pageLines) => {
    contentIds.push(addObject(objects, createContentStream(pageLines)));
    pageIds.push(addObject(objects, ""));
  });

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  pageIds.forEach((pageId, index) => {
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentIds[index]} 0 R >>`;
  });

  return encodePdf(objects, catalogId);
}

function paginateLines(lines: string): string[][];
function paginateLines(lines: string[]): string[][];
function paginateLines(lines: string | string[]): string[][] {
  const sourceLines = Array.isArray(lines) ? lines : [lines];
  const wrappedLines = sourceLines.flatMap((line) => wrapLine(line, 94));
  const pages: string[][] = [];

  for (let index = 0; index < wrappedLines.length; index += 48) {
    pages.push(wrappedLines.slice(index, index + 48));
  }

  return pages.length ? pages : [[]];
}

function wrapLine(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) {
    return [line];
  }

  const words = line.split(" ");
  const wrapped: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxLength && currentLine) {
      wrapped.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  });

  if (currentLine) {
    wrapped.push(currentLine);
  }

  return wrapped;
}

function createContentStream(lines: string[]): string {
  const commands = [
    "BT",
    "/F1 10 Tf",
    "14 TL",
    "50 800 Td",
    ...lines.flatMap((line, index) => [index ? "T*" : "", `${toPdfUnicodeString(line)} Tj`]).filter(Boolean),
    "ET",
  ].join("\n");

  return `<< /Length ${new TextEncoder().encode(commands).length} >>\nstream\n${commands}\nendstream`;
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
