import { safeSessionStorageGetItem, safeSessionStorageRemoveItem, safeSessionStorageSetItem } from "../browser-storage";
import type { ShadowSaveKind } from "./shadow-save";

const activeCloudAuthorityStorageKey = "lezgo.activeCloudTournamentAuthority.v1";

export interface CloudTournamentAuthority {
  source: "server";
  kind: ShadowSaveKind;
  localId: string;
  tournamentId: string;
  canRead: boolean;
  canManage: boolean;
  createdByUserId?: string | null;
  controllerUserId?: string | null;
  ownerUserId?: string | null;
}

export function markActiveCloudTournamentAuthority(authority: CloudTournamentAuthority): void {
  if (typeof window === "undefined") {
    return;
  }

  safeSessionStorageSetItem(activeCloudAuthorityStorageKey, JSON.stringify(authority));
}

export function loadActiveCloudTournamentAuthority(kind: ShadowSaveKind, localId: string): CloudTournamentAuthority | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawAuthority = safeSessionStorageGetItem(activeCloudAuthorityStorageKey);

  if (!rawAuthority) {
    return null;
  }

  try {
    const authority = JSON.parse(rawAuthority) as CloudTournamentAuthority;

    if (
      authority?.source === "server"
      && authority.kind === kind
      && authority.localId === localId
      && authority.tournamentId
      && authority.canRead === true
    ) {
      return authority;
    }
  } catch {
    safeSessionStorageRemoveItem(activeCloudAuthorityStorageKey);
  }

  return null;
}
