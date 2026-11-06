// Browser helpers for keeping a signed-in organizer's session alive during a live tournament.
//
// A request answered with 401 means "not signed in" (the access token expired, the browser dropped the
// session cookie while the screen was off, or the user signed out elsewhere). That is different from 403,
// which means another account now controls the tournament. Callers must never treat 401 as lost control.

export type AuthSessionStatus = "signedIn" | "signedOut" | "unknown";

/** Asks the server for the current account; with "Husk mig" the server renews the access token. */
export async function checkCurrentAuthSession(): Promise<AuthSessionStatus> {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });

    if (response.status === 401 || response.status === 403) {
      return "signedOut";
    }

    const body = await response.json() as { ok?: boolean; account?: unknown };
    return response.ok && body.ok === true && Boolean(body.account) ? "signedIn" : "unknown";
  } catch {
    // Offline or the server could not be reached: the session may still be valid.
    return "unknown";
  }
}

export async function refreshCurrentAuthSession(): Promise<boolean> {
  return (await checkCurrentAuthSession()) === "signedIn";
}

/** Sends the request; on 401 it renews the session once and retries. A remaining 401 means signed out. */
export async function fetchWithAuthRefresh(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);

  if (response.status !== 401) {
    return response;
  }

  if (!await refreshCurrentAuthSession()) {
    return response;
  }

  return await fetch(input, init);
}
