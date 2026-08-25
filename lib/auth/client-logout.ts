"use client";

import { safeLocalStorageGetItem, safeLocalStorageRemoveItem, safeLocalStorageSetItem, safeSessionStorageGetItem, safeSessionStorageRemoveItem, safeSessionStorageSetItem } from "@/lib/browser-storage";

export const explicitLogoutStorageKey = "lezgo.authExplicitLogout.v1";

export function markExplicitLogout(): void {
  safeLocalStorageSetItem(explicitLogoutStorageKey, "1");
  safeSessionStorageSetItem(explicitLogoutStorageKey, "1");
}

export function clearExplicitLogout(): void {
  safeLocalStorageRemoveItem(explicitLogoutStorageKey);
  safeSessionStorageRemoveItem(explicitLogoutStorageKey);
}

export function hasExplicitLogoutMarker(): boolean {
  return safeLocalStorageGetItem(explicitLogoutStorageKey) === "1"
    || safeSessionStorageGetItem(explicitLogoutStorageKey) === "1";
}
