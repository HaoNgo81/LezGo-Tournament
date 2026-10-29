"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { safeLocalStorageGetItem, safeSessionStorageGetItem, safeSessionStorageSetItem } from "@/lib/browser-storage";
import { useAppTranslation } from "@/lib/preferences/client";

const updateCheckIntervalMs = 30 * 60 * 1000;
const updateReloadKey = "lezgo.pwaUpdateReload.v1";
const activeTournamentStorageKey = "lezgo.activeTournament.v1";
const activeTournamentsStorageKey = "lezgo.activeTournaments.v1";
const activeTeamVsTeamStorageKey = "lezgo.activeTeamVsTeam.v1";
const serviceWorkerSkipWaitingMessage = "LEZGO_SKIP_WAITING";

export function ServiceWorkerRegistration({ reload = () => window.location.reload() }: { reload?: () => void } = {}) {
  const { t } = useAppTranslation();
  const [readyUpdateVersion, setReadyUpdateVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const pendingUpdateVersionRef = useRef<string | null>(null);
  const pageReloadedRef = useRef(false);

  const applyUpdateWhenSafe = useCallback((version: string) => {
    pendingUpdateVersionRef.current = version;

    if (hasActiveTournamentInBrowserStorage()) {
      setReadyUpdateVersion(version);
      return;
    }

    if (pageReloadedRef.current) {
      return;
    }

    const lastReloadAttempt = safeSessionStorageGetItem(updateReloadKey);

    if (lastReloadAttempt === version) {
      setReadyUpdateVersion(version);
      return;
    }

    pageReloadedRef.current = true;
    safeSessionStorageSetItem(updateReloadKey, version);
    reload();
  }, [reload]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations?.()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    let isDisposed = false;
    let knownAppVersion: string | null = null;
    // A page that loaded without a controlling worker gets one on first install (clients.claim()).
    // That first takeover is not an app update, so it must not show the update notice or reload.
    let pageHasBeenControlled = Boolean(navigator.serviceWorker.controller);
    let registration: globalThis.ServiceWorkerRegistration | null = null;

    const requestWorkerActivation = (worker: ServiceWorker | null | undefined) => {
      worker?.postMessage?.({ type: serviceWorkerSkipWaitingMessage });
    };

    const checkForWaitingWorker = () => {
      if (!registration || !navigator.serviceWorker.controller) {
        return;
      }

      requestWorkerActivation(registration.waiting);
    };

    const checkAppVersion = async () => {
      try {
        const response = await fetch(`${basePath}/api/app-version`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });

        if (!response.ok) {
          return;
        }

        const body = await response.json() as { version?: unknown };
        const nextVersion = typeof body.version === "string" ? body.version.trim() : "";

        if (!nextVersion) {
          return;
        }

        if (!knownAppVersion) {
          knownAppVersion = nextVersion;
          return;
        }

        if (nextVersion !== knownAppVersion) {
          pendingUpdateVersionRef.current = nextVersion;
          await registration?.update().catch(() => undefined);
          applyUpdateWhenSafe(nextVersion);
        }
      } catch {
        // Keep the currently running app available offline and retry on the next scheduled check.
      }
    };

    const runUpdateCheck = () => {
      if (isDisposed) {
        return;
      }

      const pendingVersion = pendingUpdateVersionRef.current;

      if (pendingVersion) {
        applyUpdateWhenSafe(pendingVersion);
      }

      void registration?.update().then(checkForWaitingWorker).catch(() => undefined);
      void checkAppVersion();
    };

    const handleControllerChange = () => {
      if (!pageHasBeenControlled && !pendingUpdateVersionRef.current) {
        pageHasBeenControlled = true;
        return;
      }

      pageHasBeenControlled = true;
      applyUpdateWhenSafe(pendingUpdateVersionRef.current ?? "service-worker");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runUpdateCheck();
      }
    };

    void navigator.serviceWorker.register(`${basePath}/sw.js`, { updateViaCache: "none" })
      .then((nextRegistration) => {
        if (isDisposed) {
          return;
        }

        registration = nextRegistration;
        registration.addEventListener("updatefound", () => {
          const worker = registration?.installing;

          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              pendingUpdateVersionRef.current = "service-worker";
              requestWorkerActivation(worker);
            }
          });
        });

        checkForWaitingWorker();
        runUpdateCheck();
      })
      .catch(() => undefined);

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    window.addEventListener("focus", runUpdateCheck);
    window.addEventListener("online", runUpdateCheck);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(runUpdateCheck, updateCheckIntervalMs);

    return () => {
      isDisposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("focus", runUpdateCheck);
      window.removeEventListener("online", runUpdateCheck);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [applyUpdateWhenSafe]);

  if (!readyUpdateVersion || dismissedVersion === readyUpdateVersion) {
    return null;
  }

  return (
    <aside
      className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-start gap-3 rounded-md border border-[var(--primary)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-xl sm:left-auto sm:right-4 sm:mx-0"
      role="status"
      aria-live="polite"
      data-testid="pwa-update-notice"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-[var(--accent-text)]">{t("pwaUpdateReadyTitle")}</p>
        <p className="mt-1 text-sm font-bold text-[var(--muted)]">{t("pwaUpdateReadyBody")}</p>
      </div>
      <button
        type="button"
        className="-m-1 grid h-11 w-11 shrink-0 place-items-center rounded-md text-2xl font-black leading-none text-[var(--muted)] hover:bg-[var(--primary-soft)] focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)]"
        aria-label={t("close")}
        onClick={() => setDismissedVersion(readyUpdateVersion)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}

export function hasActiveTournamentInBrowserStorage(): boolean {
  return hasActiveStoredTournament(activeTournamentStorageKey)
    || hasActiveStoredTournament(activeTeamVsTeamStorageKey)
    || hasActiveStoredTournamentList();
}

function hasActiveStoredTournament(key: string): boolean {
  const savedState = safeLocalStorageGetItem(key);

  if (!savedState) {
    return false;
  }

  try {
    const parsedState = JSON.parse(savedState) as { status?: unknown } | null;
    return parsedState?.status === "active";
  } catch {
    return false;
  }
}

function hasActiveStoredTournamentList(): boolean {
  const savedTournaments = safeLocalStorageGetItem(activeTournamentsStorageKey);

  if (!savedTournaments) {
    return false;
  }

  try {
    const parsedTournaments = JSON.parse(savedTournaments) as Array<{ status?: unknown }>;
    return Array.isArray(parsedTournaments) && parsedTournaments.some((tournament) => tournament?.status === "active");
  } catch {
    return false;
  }
}
