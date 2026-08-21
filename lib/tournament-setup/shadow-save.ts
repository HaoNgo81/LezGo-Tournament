import type { LiveTournamentState } from "../live-scoring";
import type { TeamVsTeamTournamentState } from "./team-vs-team-setup";

export type ShadowSaveKind = "standard" | "team-vs-team";
export type ShadowSaveStatus = "local-only" | "syncing" | "synced" | "error" | "conflict";

export interface ShadowSaveMetadata {
  localId: string;
  legacyLocalId?: string;
  kind: ShadowSaveKind;
  status: ShadowSaveStatus;
  supabaseTournamentId?: string;
  organizerToken?: string;
  canManage?: boolean;
  matchScoreVersions?: Record<string, number>;
  lastLocalSaveAt?: string;
  lastSuccessfulShadowSaveAt?: string;
  lastShadowSaveVersion?: string;
  lastError?: string;
}

interface ShadowSavePayload {
  kind: ShadowSaveKind;
  legacyLocalId: string;
  tournamentId?: string;
  expectedUpdatedAt?: string;
  state: unknown;
}

interface ShadowSaveResponse {
  ok: boolean;
  tournamentId?: string;
  updatedAt?: string;
  organizerToken?: string;
  error?: string;
}

const metadataStorageKey = "lezgo.shadowSaveMetadata.v1";
export const shadowSaveMetadataChangedEvent = "lezgo:shadow-save-metadata-changed";
const shadowSaveTimeoutMs = 10000;
const inFlightLocalIds = new Set<string>();
const genericShadowSaveErrorMessage = "Synchronization failed. Local tournament is preserved.";
const genericShadowSaveConflictMessage = "Tournament snapshot conflict.";

export function createStandardShadowSaveLocalId(state: LiveTournamentState): string {
  return `${state.tournamentName.trim().toLocaleLowerCase("da")}-${state.format}`;
}

export function createTeamVsTeamShadowSaveLocalId(state: TeamVsTeamTournamentState): string {
  return `${state.name.trim().toLocaleLowerCase("da")}-team-vs-team`;
}

export function queueStandardTournamentShadowSave(localId: string, state: LiveTournamentState): void {
  queueShadowSave({
    kind: "standard",
    localId,
    state,
  });
}

export function queueTeamVsTeamShadowSave(localId: string, state: TeamVsTeamTournamentState): void {
  queueShadowSave({
    kind: "team-vs-team",
    localId,
    state,
  });
}

export function retryStandardTournamentShadowSave(localId: string, state: LiveTournamentState): void {
  retryShadowSave(localId, "standard", state);
}

export function retryTeamVsTeamShadowSave(localId: string, state: TeamVsTeamTournamentState): void {
  retryShadowSave(localId, "team-vs-team", state);
}

export function markLocalShadowSave(localId: string, kind: ShadowSaveKind, savedAt = new Date().toISOString()): ShadowSaveMetadata {
  const existing = loadShadowSaveMetadata(localId);
  const status: ShadowSaveStatus = isShadowSaveEnabled() ? "syncing" : "local-only";
  const nextMetadata: ShadowSaveMetadata = {
    ...existing,
    localId,
    kind,
    status: existing?.status === "conflict" && status === "syncing" ? "conflict" : status,
    lastLocalSaveAt: savedAt,
    lastError: undefined,
  };

  saveShadowSaveMetadata(nextMetadata);
  return nextMetadata;
}

export function loadShadowSaveMetadata(localId: string): ShadowSaveMetadata | null {
  return loadShadowSaveMetadataMap()[localId] ?? null;
}

export function loadAllShadowSaveMetadata(): ShadowSaveMetadata[] {
  return Object.values(loadShadowSaveMetadataMap());
}

export function clearShadowSaveMetadata(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(metadataStorageKey);
  inFlightLocalIds.clear();
}

export function markRemoteShadowSaveApplied(localId: string, kind: ShadowSaveKind, updatedAt?: string, appliedAt = new Date().toISOString(), matchScoreVersions?: Record<string, number>): ShadowSaveMetadata {
  const metadata = loadShadowSaveMetadata(localId);
  const nextMetadata: ShadowSaveMetadata = {
    ...metadata,
    localId,
    kind,
    status: "synced",
    lastLocalSaveAt: appliedAt,
    lastSuccessfulShadowSaveAt: appliedAt,
    lastShadowSaveVersion: updatedAt ?? metadata?.lastShadowSaveVersion,
    matchScoreVersions: matchScoreVersions ?? metadata?.matchScoreVersions,
    lastError: undefined,
  };

  saveShadowSaveMetadata(nextMetadata);
  return nextMetadata;
}

export function markCloudTournamentRestored(input: { localId: string; legacyLocalId?: string; kind: ShadowSaveKind; tournamentId: string; updatedAt?: string; organizerToken?: string; canManage?: boolean; matchScoreVersions?: Record<string, number> }, restoredAt = new Date().toISOString()): ShadowSaveMetadata {
  const metadata = loadShadowSaveMetadata(input.localId);
  const nextMetadata: ShadowSaveMetadata = {
    ...metadata,
    localId: input.localId,
    legacyLocalId: input.legacyLocalId ?? metadata?.legacyLocalId,
    kind: input.kind,
    status: "synced",
    supabaseTournamentId: input.tournamentId,
    organizerToken: input.canManage === false ? undefined : input.organizerToken ?? metadata?.organizerToken,
    canManage: input.canManage ?? metadata?.canManage ?? true,
    matchScoreVersions: input.matchScoreVersions ?? metadata?.matchScoreVersions,
    lastLocalSaveAt: restoredAt,
    lastSuccessfulShadowSaveAt: restoredAt,
    lastShadowSaveVersion: input.updatedAt ?? metadata?.lastShadowSaveVersion,
    lastError: undefined,
  };

  saveShadowSaveMetadata(nextMetadata);
  return nextMetadata;
}

function queueShadowSave({ kind, localId, state }: { kind: ShadowSaveKind; localId: string; state: unknown }): void {
  if (typeof window === "undefined" || !isShadowSaveEnabled()) {
    return;
  }

  const metadata = loadShadowSaveMetadata(localId);

  if (metadata?.status === "conflict" || inFlightLocalIds.has(localId)) {
    return;
  }

  inFlightLocalIds.add(localId);
  window.setTimeout(() => {
    void performShadowSave({ kind, localId, state }).finally(() => inFlightLocalIds.delete(localId));
  }, 0);
}

function retryShadowSave(localId: string, kind: ShadowSaveKind, state: unknown): void {
  const metadata = loadShadowSaveMetadata(localId);

  if (metadata?.status === "conflict") {
    return;
  }

  saveShadowSaveMetadata({
    ...metadata,
    localId,
    kind,
    status: isShadowSaveEnabled() ? "syncing" : "local-only",
    lastError: undefined,
  });
  queueShadowSave({ kind, localId, state });
}

async function performShadowSave({ kind, localId, state }: { kind: ShadowSaveKind; localId: string; state: unknown }): Promise<void> {
  const metadata = loadShadowSaveMetadata(localId);
  const payload: ShadowSavePayload = {
    kind,
    legacyLocalId: metadata?.legacyLocalId ?? localId,
    tournamentId: metadata?.supabaseTournamentId,
    expectedUpdatedAt: metadata?.lastShadowSaveVersion,
    state,
  };
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), shadowSaveTimeoutMs);

  try {
    const response = await fetch("/api/supabase/shadow-save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await parseShadowSaveResponse(response);

    if (response.status === 409) {
      saveShadowSaveMetadata({
        ...metadata,
        localId,
        kind,
        status: "conflict",
        lastError: genericShadowSaveConflictMessage,
      });
      return;
    }

    if (!response.ok || !body.ok || !body.tournamentId) {
      throw new Error(genericShadowSaveErrorMessage);
    }

    const savedAt = new Date().toISOString();
    saveShadowSaveMetadata({
      ...metadata,
      localId,
      kind,
      status: "synced",
      supabaseTournamentId: body.tournamentId,
      organizerToken: body.organizerToken ?? metadata?.organizerToken,
      lastSuccessfulShadowSaveAt: savedAt,
      lastShadowSaveVersion: body.updatedAt ?? metadata?.lastShadowSaveVersion,
      lastError: undefined,
    });
  } catch (error) {
    saveShadowSaveMetadata({
      ...metadata,
      localId,
      kind,
      status: "error",
      lastError: getShadowSaveErrorMessage(error),
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function isShadowSaveEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE === "1";
}

function saveShadowSaveMetadata(metadata: ShadowSaveMetadata): void {
  if (typeof window === "undefined") {
    return;
  }

  const metadataMap = loadShadowSaveMetadataMap();
  metadataMap[metadata.localId] = metadata;
  window.localStorage.setItem(metadataStorageKey, JSON.stringify(metadataMap));
  window.dispatchEvent(new CustomEvent(shadowSaveMetadataChangedEvent, { detail: metadata }));
}

function loadShadowSaveMetadataMap(): Record<string, ShadowSaveMetadata> {
  if (typeof window === "undefined") {
    return {};
  }

  const savedMetadata = window.localStorage.getItem(metadataStorageKey);

  if (!savedMetadata) {
    return {};
  }

  try {
    return JSON.parse(savedMetadata) as Record<string, ShadowSaveMetadata>;
  } catch {
    window.localStorage.removeItem(metadataStorageKey);
    return {};
  }
}

async function parseShadowSaveResponse(response: Response): Promise<ShadowSaveResponse> {
  try {
    return await response.json() as ShadowSaveResponse;
  } catch {
    return { ok: false, error: genericShadowSaveErrorMessage };
  }
}

function getShadowSaveErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return genericShadowSaveErrorMessage;
  }

  return error instanceof Error && error.message === genericShadowSaveErrorMessage
    ? error.message
    : genericShadowSaveErrorMessage;
}
