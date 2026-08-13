import type { LiveTournamentState } from "../live-scoring";
import type { TeamVsTeamTournamentState } from "./team-vs-team-setup";
import { createStandardShadowSaveLocalId, createTeamVsTeamShadowSaveLocalId, loadShadowSaveMetadata, type ShadowSaveMetadata } from "./shadow-save";
import {
  loadActiveTeamVsTeamTournament,
  loadActiveTournament,
  loadActiveTournaments,
  loadCompletedTeamVsTeamTournaments,
  loadCompletedTournaments,
} from "./storage";

export type MigrationReadinessClassification = "local-only" | "mapped-and-synced" | "mapped-but-outdated" | "conflict" | "invalid/unmappable";

export interface MigrationReadinessEntry {
  localRecordId: string;
  localId: string;
  kind: "standard" | "team-vs-team";
  title: string;
  source: "active" | "completed";
  classification: MigrationReadinessClassification;
  supabaseTournamentId?: string;
  lastLocalSaveAt?: string;
  lastSuccessfulShadowSaveAt?: string;
  reason: string;
}

export interface MigrationDryRunReport {
  generatedAt: string;
  entries: MigrationReadinessEntry[];
  totals: {
    localTournaments: number;
    canMigrateSafely: number;
    alreadyInSupabase: number;
    conflicts: number;
    invalid: number;
  };
}

export function analyzeLocalStorageMigrationReadiness(now = new Date().toISOString()): MigrationDryRunReport {
  const entries = collectLocalTournamentEntries().map(toMigrationReadinessEntry);

  return {
    generatedAt: now,
    entries,
    totals: {
      localTournaments: entries.length,
      canMigrateSafely: entries.filter((entry) => entry.classification === "local-only" || entry.classification === "mapped-but-outdated").length,
      alreadyInSupabase: entries.filter((entry) => entry.classification === "mapped-and-synced").length,
      conflicts: entries.filter((entry) => entry.classification === "conflict").length,
      invalid: entries.filter((entry) => entry.classification === "invalid/unmappable").length,
    },
  };
}

export function formatMigrationDryRunSummary(report: MigrationDryRunReport): string {
  return [
    `Total lokale turneringer: ${report.totals.localTournaments}`,
    `Kan migreres sikkert: ${report.totals.canMigrateSafely}`,
    `Findes allerede i Supabase: ${report.totals.alreadyInSupabase}`,
    `Konflikter: ${report.totals.conflicts}`,
    `Ugyldige: ${report.totals.invalid}`,
  ].join("\n");
}

function collectLocalTournamentEntries(): Array<{ localRecordId: string; localId: string; kind: "standard" | "team-vs-team"; title: string; source: "active" | "completed"; metadata: ShadowSaveMetadata | null }> {
  if (typeof window === "undefined") {
    return [];
  }

  const activeStandard = uniqueByLocalId([
    ...loadActiveTournaments(),
    ...optionalItem(loadActiveTournament()),
  ]).map((state) => createStandardEntry(state, "active", createStandardShadowSaveLocalId(state)));
  const completedStandard = loadCompletedTournaments().map((completed) => createStandardEntry(completed.state, "completed", `completed:${completed.id}`));
  const activeTeamVsTeam = optionalItem(loadActiveTeamVsTeamTournament()).map((state) => createTeamVsTeamEntry(state, "active", createTeamVsTeamShadowSaveLocalId(state)));
  const completedTeamVsTeam = loadCompletedTeamVsTeamTournaments().map((completed) => createTeamVsTeamEntry(completed.state, "completed", `completed:${completed.id}`));

  return [...activeStandard, ...completedStandard, ...activeTeamVsTeam, ...completedTeamVsTeam];
}

function createStandardEntry(state: LiveTournamentState, source: "active" | "completed", localRecordId: string) {
  const localId = source === "active" ? createStandardShadowSaveLocalId(state) : localRecordId;
  return {
    localRecordId,
    localId,
    kind: "standard" as const,
    title: state.tournamentName,
    source,
    metadata: loadShadowSaveMetadata(localId),
  };
}

function createTeamVsTeamEntry(state: TeamVsTeamTournamentState, source: "active" | "completed", localRecordId: string) {
  const localId = source === "active" ? createTeamVsTeamShadowSaveLocalId(state) : localRecordId;
  return {
    localRecordId,
    localId,
    kind: "team-vs-team" as const,
    title: state.name,
    source,
    metadata: loadShadowSaveMetadata(localId),
  };
}

function toMigrationReadinessEntry(entry: ReturnType<typeof collectLocalTournamentEntries>[number]): MigrationReadinessEntry {
  const classification = classifyMigrationEntry(entry.localId, entry.metadata);

  return {
    localRecordId: entry.localRecordId,
    localId: entry.localId,
    kind: entry.kind,
    title: entry.title,
    source: entry.source,
    classification,
    supabaseTournamentId: entry.metadata?.supabaseTournamentId,
    lastLocalSaveAt: entry.metadata?.lastLocalSaveAt,
    lastSuccessfulShadowSaveAt: entry.metadata?.lastSuccessfulShadowSaveAt,
    reason: getMigrationReason(classification, entry.metadata),
  };
}

function classifyMigrationEntry(localId: string, metadata: ShadowSaveMetadata | null): MigrationReadinessClassification {
  if (!localId.trim()) {
    return "invalid/unmappable";
  }

  if (!metadata || metadata.status === "local-only") {
    return "local-only";
  }

  if (metadata.status === "conflict") {
    return "conflict";
  }

  if (!metadata.supabaseTournamentId) {
    return "invalid/unmappable";
  }

  if (metadata.status === "synced" && metadata.lastLocalSaveAt && metadata.lastSuccessfulShadowSaveAt && metadata.lastLocalSaveAt <= metadata.lastSuccessfulShadowSaveAt) {
    return "mapped-and-synced";
  }

  return "mapped-but-outdated";
}

function getMigrationReason(classification: MigrationReadinessClassification, metadata: ShadowSaveMetadata | null): string {
  switch (classification) {
    case "local-only":
      return "Findes kun i localStorage og kan shadow-saves i en senere migration.";
    case "mapped-and-synced":
      return "Har Supabase UUID og lokal version er ikke nyere end seneste sync.";
    case "mapped-but-outdated":
      return metadata?.lastError ?? "Har mapping, men lokal version skal syncs igen.";
    case "conflict":
      return metadata?.lastError ?? "Supabase har en konflikt, som skal håndteres manuelt.";
    case "invalid/unmappable":
      return "Mapping mangler eller er korrupt.";
  }
}

function optionalItem<T>(value: T | null | undefined): T[] {
  return value ? [value] : [];
}

function uniqueByLocalId(states: LiveTournamentState[]): LiveTournamentState[] {
  const seen = new Set<string>();
  return states.filter((state) => {
    const localId = createStandardShadowSaveLocalId(state);
    if (seen.has(localId)) {
      return false;
    }
    seen.add(localId);
    return true;
  });
}
