import { randomBytes } from "node:crypto";
import { validateResultId } from "./result-url";
import { calculateLiveStandings, createPoolPlaySummary, type LiveTournamentState } from "../live-scoring";
import type { StandingRow } from "../tournament-engine";

export type PublicResultKind = "standard";

export interface PublicResultRow {
  id: string;
  rank: number;
  name: string;
  matchPoints?: number;
  scorePoints?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  groupName?: string;
}

export interface PublicResultSnapshot {
  version: 1;
  resultId: string;
  tournamentId: string;
  kind: PublicResultKind;
  tournamentName: string;
  format: LiveTournamentState["format"];
  formatLabel: string;
  completedAt?: string;
  rankingMode: LiveTournamentState["rankingMode"];
  participantType: "player" | "pair" | "team";
  participantCount: number;
  statusLabel: string;
  rows: PublicResultRow[];
  createdAt: string;
  updatedAt: string;
}

export function createPublicResultSnapshot(input: {
  resultId: string;
  tournamentId: string;
  state: LiveTournamentState;
  createdAt?: string;
  updatedAt?: string;
}): PublicResultSnapshot {
  validateResultId(input.resultId);
  validateUuid(input.tournamentId, "tournamentId");

  if (input.state.status !== "finished") {
    throw new Error("Only completed tournaments can be shared as public results.");
  }

  const now = new Date().toISOString();
  const poolPlay = input.state.poolPlay;
  const rows = poolPlay ? createPoolPlayRows(input.state) : calculateLiveStandings(input.state).map(mapStandingRow);
  const participantType = poolPlay?.initialStage.participantType ?? (isFixedPartnerFormat(input.state.format) ? "pair" : "player");
  const participantCount = poolPlay?.initialStage.participants.length ?? rows.length;

  return {
    version: 1,
    resultId: input.resultId,
    tournamentId: input.tournamentId,
    kind: "standard",
    tournamentName: input.state.tournamentName,
    format: input.state.format,
    formatLabel: getFormatLabel(input.state.format),
    completedAt: input.state.finishedAt,
    rankingMode: input.state.rankingMode,
    participantType,
    participantCount,
    statusLabel: "Turneringen er afsluttet",
    rows,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function generateResultId(): string {
  return toBase32NoAmbiguous(randomBytes(10));
}

function createPoolPlayRows(state: LiveTournamentState): PublicResultRow[] {
  if (!state.poolPlay) {
    return [];
  }

  const summary = createPoolPlaySummary(state.poolPlay, state.rankingMode);

  if (summary.finalPlacements.length > 0) {
    return summary.finalPlacements.map((placement) => ({
      id: `${placement.groupName}-${placement.rank}-${placement.participantName}`,
      rank: placement.rank,
      name: placement.participantName,
      groupName: placement.groupName,
    }));
  }

  return summary.initialStandings.flatMap((table) =>
    table.rows.map((row) => ({
      ...mapStandingRow(row),
      groupName: table.poolName,
    })),
  );
}

function mapStandingRow(row: StandingRow): PublicResultRow {
  return {
    id: row.id,
    rank: row.rank,
    name: row.name,
    matchPoints: row.matchPoints,
    scorePoints: row.pointsFor,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
  };
}

function getFormatLabel(format: LiveTournamentState["format"]): string {
  const labels: Record<LiveTournamentState["format"], string> = {
    americano: "Americano",
    mexicano: "Mexicano",
    "mixed-americano": "Mixed Americano",
    "fixed-partner-americano": "Fast Makker Americano",
    "fixed-partner-mexicano": "Fast Makker Mexicano",
    "pool-play": "Puljespil",
  };

  return labels[format];
}

function isFixedPartnerFormat(format: LiveTournamentState["format"]): boolean {
  return format === "fixed-partner-americano" || format === "fixed-partner-mexicano";
}

function toBase32NoAmbiguous(buffer: Buffer): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output.slice(0, 16);
}

function validateUuid(value: string, fieldName: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${fieldName} must be a UUID.`);
  }
}
