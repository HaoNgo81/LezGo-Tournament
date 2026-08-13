export type PersistenceConflictDecision = "use-local" | "use-remote" | "no-op" | "manual-review";

export interface PersistenceConflictInput {
  hasLocalState: boolean;
  hasRemoteState: boolean;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  localHasUnsyncedChanges?: boolean;
}

export interface PersistenceConflictResult {
  decision: PersistenceConflictDecision;
  reason: string;
}

export function resolveLocalStoragePrimaryConflict(input: PersistenceConflictInput): PersistenceConflictResult {
  if (input.hasLocalState && !input.hasRemoteState) {
    return { decision: "use-local", reason: "Only localStorage has tournament state." };
  }

  if (!input.hasLocalState && input.hasRemoteState) {
    return { decision: "use-remote", reason: "Only Supabase has tournament state." };
  }

  if (!input.hasLocalState && !input.hasRemoteState) {
    return { decision: "no-op", reason: "No tournament state exists in localStorage or Supabase." };
  }

  if (input.localHasUnsyncedChanges) {
    return { decision: "use-local", reason: "localStorage is primary and contains unsynced changes." };
  }

  if (!input.localUpdatedAt || !input.remoteUpdatedAt) {
    return { decision: "manual-review", reason: "Both states exist but one or both updated timestamps are missing." };
  }

  const localTime = Date.parse(input.localUpdatedAt);
  const remoteTime = Date.parse(input.remoteUpdatedAt);

  if (!Number.isFinite(localTime) || !Number.isFinite(remoteTime)) {
    return { decision: "manual-review", reason: "Both states exist but one or both updated timestamps are invalid." };
  }

  if (localTime === remoteTime) {
    return { decision: "no-op", reason: "localStorage and Supabase have matching timestamps." };
  }

  if (localTime > remoteTime) {
    return { decision: "use-local", reason: "localStorage is newer and remains primary during migration." };
  }

  return { decision: "use-remote", reason: "Supabase is newer and localStorage has no unsynced changes." };
}
