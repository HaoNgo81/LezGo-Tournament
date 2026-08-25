export type BrowserStorageArea = "localStorage" | "sessionStorage";

export function safeStorageGetItem(area: BrowserStorageArea, key: string): string | null {
  const storage = getBrowserStorage(area);

  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSetItem(area: BrowserStorageArea, key: string, value: string): boolean {
  const storage = getBrowserStorage(area);

  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemoveItem(area: BrowserStorageArea, key: string): boolean {
  const storage = getBrowserStorage(area);

  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const safeLocalStorageGetItem = (key: string): string | null => safeStorageGetItem("localStorage", key);
export const safeLocalStorageSetItem = (key: string, value: string): boolean => safeStorageSetItem("localStorage", key, value);
export const safeLocalStorageRemoveItem = (key: string): boolean => safeStorageRemoveItem("localStorage", key);
export const safeSessionStorageGetItem = (key: string): string | null => safeStorageGetItem("sessionStorage", key);
export const safeSessionStorageSetItem = (key: string, value: string): boolean => safeStorageSetItem("sessionStorage", key, value);
export const safeSessionStorageRemoveItem = (key: string): boolean => safeStorageRemoveItem("sessionStorage", key);

function getBrowserStorage(area: BrowserStorageArea): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window[area] ?? null;
  } catch {
    return null;
  }
}
