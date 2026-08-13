"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { StandingsTable } from "@/components/tournament/standings-table";
import { Section } from "@/components/ui/section";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView, type ReadOnlyTournamentView } from "@/lib/read-only-views";
import type { LiveTournamentState } from "@/lib/live-scoring";
import type { TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import { useAppTranslation } from "@/lib/preferences/client";

type RemoteTournamentKind = "standard" | "team-vs-team";
type RemoteSyncStatus = "connecting" | "live" | "reconnecting" | "offline" | "error";
type RemoteReadErrorKind = "access-denied" | "expired" | "network" | "server";

interface RemoteSyncTelemetry {
  consecutiveFailures: number;
  lastCheckedAt?: number;
  lastSuccessfulSyncAt?: number;
  nextRetryAt?: number;
}

interface RemoteTournamentSession {
  accessMode: "manual" | "handoff" | "remote-session";
  tournamentCode?: string;
  shareToken?: string;
  handoffReference?: string;
  remoteSessionToken?: string;
  remoteSessionExpiresAt?: string;
  kind: RemoteTournamentKind;
  state: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
}

interface RemoteReadResponse {
  ok?: boolean;
  kind?: RemoteTournamentKind;
  state?: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
  remoteSessionToken?: string;
  remoteSessionExpiresAt?: string;
}

const remotePollBaseIntervalMs = 4000;
const remotePollMaxIntervalMs = 30000;
const remoteSessionStorageKey = "lezgo.remoteSession.v1";

class RemoteReadError extends Error {
  readonly kind: RemoteReadErrorKind;
  readonly status?: number;

  constructor(message: string, kind: RemoteReadErrorKind, status?: number) {
    super(message);
    this.name = "RemoteReadError";
    this.kind = kind;
    this.status = status;
    Object.setPrototypeOf(this, RemoteReadError.prototype);
  }
}

export function RemoteTournamentApp({ initialHandoffReference }: { initialHandoffReference?: string } = {}) {
  const { t } = useAppTranslation();
  const autoOpenAttempted = useRef(false);
  const autoSyncStoppedRef = useRef(false);
  const sessionRef = useRef<RemoteTournamentSession | null>(null);
  const pollGenerationRef = useRef(0);
  const syncTelemetryRef = useRef<RemoteSyncTelemetry>({ consecutiveFailures: 0 });
  const [tournamentCode, setTournamentCode] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [session, setSession] = useState<RemoteTournamentSession | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<RemoteSyncStatus>("connecting");
  const [syncTelemetry, setSyncTelemetry] = useState<RemoteSyncTelemetry>({ consecutiveFailures: 0 });

  const recordSuccessfulSync = useCallback(() => {
    autoSyncStoppedRef.current = false;
    const nextTelemetry = createSuccessfulSyncTelemetry();
    syncTelemetryRef.current = nextTelemetry;
    setSyncTelemetry(nextTelemetry);
  }, []);

  const readRemoteTournament = useCallback(async (code: string, token: string): Promise<RemoteTournamentSession> => {
    const normalizedCode = normalizeTournamentCodeInput(code);
    const normalizedToken = token.trim();

    if (!normalizedCode || !normalizedToken) {
      throw new RemoteReadError(t("remoteAccessDenied"), "access-denied");
    }

    const { body, response } = await postRemoteRead("/api/supabase/tournament-access/read", {
      tournamentCode: normalizedCode,
      shareToken: normalizedToken,
    }, t("remoteAccessDenied"));

    if (!response.ok || !body.ok || !body.kind || !body.state) {
      throw new RemoteReadError(t("remoteAccessDenied"), response.status === 429 || response.status >= 500 ? "server" : "access-denied", response.status);
    }

    return {
      accessMode: "manual",
      tournamentCode: normalizedCode,
      shareToken: normalizedToken,
      remoteSessionToken: body.remoteSessionToken,
      remoteSessionExpiresAt: body.remoteSessionExpiresAt,
      kind: body.kind,
      state: body.state,
      updatedAt: body.updatedAt,
    };
  }, [t]);

  const readRemoteHandoff = useCallback(async (handoffReference: string): Promise<RemoteTournamentSession> => {
    const normalizedReference = handoffReference.trim();

    if (!normalizedReference) {
      throw new RemoteReadError(t("remoteHandoffDenied"), "access-denied");
    }

    try {
      const { body, response } = await postRemoteRead("/api/supabase/tournament-handoff/redeem", {
        handoffReference: normalizedReference,
      }, t("remoteHandoffDenied"));

      if (!response.ok || !body.ok || !body.kind || !body.state) {
        throw new RemoteReadError(
          response.status === 410 ? t("remoteHandoffExpired") : t("remoteHandoffDenied"),
          response.status === 410 ? "expired" : response.status === 429 || response.status >= 500 ? "server" : "access-denied",
          response.status,
        );
      }

      return {
        accessMode: "handoff",
        handoffReference: normalizedReference,
        remoteSessionToken: body.remoteSessionToken,
        remoteSessionExpiresAt: body.remoteSessionExpiresAt,
        kind: body.kind,
        state: body.state,
        updatedAt: body.updatedAt,
      };
    } catch (caughtError) {
      throw normalizeRemoteReadError(caughtError, t("remoteHandoffDenied"));
    }
  }, [t]);

  const readEstablishedRemoteSession = useCallback(async (currentSession: RemoteTournamentSession | StoredRemoteSession): Promise<RemoteTournamentSession> => {
    const remoteSessionToken = currentSession.remoteSessionToken?.trim() ?? "";

    if (!remoteSessionToken) {
      throw new RemoteReadError(t("remoteSessionDenied"), "access-denied");
    }

    try {
      const { body, response } = await postRemoteRead("/api/supabase/remote-session/read", {
        remoteSessionToken,
      }, t("remoteSessionDenied"));

      if (!response.ok || !body.ok || !body.kind || !body.state) {
        throw new RemoteReadError(
          response.status === 410 ? t("remoteSessionExpired") : t("remoteSessionDenied"),
          response.status === 410 ? "expired" : response.status === 429 || response.status >= 500 ? "server" : "access-denied",
          response.status,
        );
      }

      return {
        accessMode: "remote-session",
        handoffReference: "handoffReference" in currentSession ? currentSession.handoffReference : undefined,
        remoteSessionToken,
        remoteSessionExpiresAt: body.remoteSessionExpiresAt ?? currentSession.remoteSessionExpiresAt,
        kind: body.kind,
        state: body.state,
        updatedAt: body.updatedAt,
      };
    } catch (caughtError) {
      throw normalizeRemoteReadError(caughtError, t("remoteSessionDenied"));
    }
  }, [t]);

  const refreshRemoteSession = useCallback(async (currentSession: RemoteTournamentSession): Promise<RemoteTournamentSession> => {
    if (currentSession.remoteSessionToken) {
      return readEstablishedRemoteSession(currentSession);
    }

    if (currentSession.accessMode === "handoff" && currentSession.handoffReference) {
      return readRemoteHandoff(currentSession.handoffReference);
    }

    return readRemoteTournament(currentSession.tournamentCode ?? "", currentSession.shareToken ?? "");
  }, [readEstablishedRemoteSession, readRemoteHandoff, readRemoteTournament]);

  const applyRemoteSession = useCallback((nextSession: RemoteTournamentSession, options: { force?: boolean } = {}) => {
    setSession((currentSession) => {
      if (!currentSession || options.force) {
        return nextSession;
      }

      if (!isSameRemoteAccess(currentSession, nextSession)) {
        return currentSession;
      }

      return isNewerRemoteVersion(currentSession.updatedAt, nextSession.updatedAt) ? nextSession : currentSession;
    });
  }, []);

  const openRemoteTournament = useCallback(async (code: string, token: string, keepPreviousOnFailure: boolean) => {
    setIsLoading(true);
    setError("");
    setMessage("");
    setSyncStatus(keepPreviousOnFailure ? "reconnecting" : "connecting");

    try {
      const nextSession = await readRemoteTournament(code, token);
      setTournamentCode(nextSession.tournamentCode ?? "");
      setShareToken(nextSession.shareToken ?? "");
      applyRemoteSession(nextSession, { force: true });
      persistEstablishedRemoteSession(nextSession, initialHandoffReference);
      setSyncStatus("live");
      recordSuccessfulSync();
      setMessage(keepPreviousOnFailure ? t("remoteLatestLoaded") : t("remoteTournamentOpened"));
    } catch (caughtError) {
      setSyncStatus(keepPreviousOnFailure ? "error" : "connecting");
      setError(getRemoteReadErrorMessage(caughtError, keepPreviousOnFailure ? t("remoteFetchError") : t("remoteAccessDenied")));
    } finally {
      setIsLoading(false);
    }
  }, [applyRemoteSession, initialHandoffReference, readRemoteTournament, recordSuccessfulSync, t]);

  const openRemoteHandoff = useCallback(async (handoffReference: string, keepPreviousOnFailure: boolean) => {
    if (!handoffReference.trim()) {
      setError(t("remoteHandoffDenied"));
      setMessage("");
      return;
    }

    setIsLoading(true);
    setError("");
    setMessage(keepPreviousOnFailure ? "" : t("remoteHandoffOpening"));
    setSyncStatus(keepPreviousOnFailure ? "reconnecting" : "connecting");

    try {
      const nextSession = await readRemoteHandoff(handoffReference);
      applyRemoteSession(nextSession, { force: !keepPreviousOnFailure });
      persistEstablishedRemoteSession(nextSession, handoffReference);
      setSyncStatus("live");
      recordSuccessfulSync();
      setMessage(keepPreviousOnFailure ? t("remoteLatestLoaded") : t("remoteTournamentOpened"));
    } catch (caughtError) {
      const fallbackMessage = keepPreviousOnFailure ? t("remoteFetchError") : t("remoteHandoffDenied");
      setSyncStatus(keepPreviousOnFailure ? "error" : "connecting");
      setError(getRemoteReadErrorMessage(caughtError, fallbackMessage));
      if (!keepPreviousOnFailure) {
        setMessage("");
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyRemoteSession, readRemoteHandoff, recordSuccessfulSync, t]);

  const openEstablishedRemoteSession = useCallback(async (storedSession: StoredRemoteSession) => {
    setIsLoading(true);
    setError("");
    setMessage(t("remoteHandoffOpening"));
    setSyncStatus("connecting");

    try {
      const nextSession = await readEstablishedRemoteSession(storedSession);
      applyRemoteSession(nextSession, { force: true });
      persistEstablishedRemoteSession(nextSession, storedSession.handoffReference);
      setSyncStatus("live");
      recordSuccessfulSync();
      setMessage(t("remoteTournamentOpened"));
    } catch (caughtError) {
      clearStoredRemoteSession();
      setSyncStatus("connecting");
      setError(getRemoteReadErrorMessage(caughtError, t("remoteSessionDenied")));
      setMessage("");
    } finally {
      setIsLoading(false);
    }
  }, [applyRemoteSession, readEstablishedRemoteSession, recordSuccessfulSync, t]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session || autoSyncStoppedRef.current) {
      return undefined;
    }

    let isDisposed = false;
    let timeoutId: number | undefined;
    let isInFlight = false;
    let consecutiveFailures = 0;
    let shouldContinuePolling = true;
    const pollGeneration = pollGenerationRef.current + 1;
    pollGenerationRef.current = pollGeneration;

    function schedulePoll(delayMs: number) {
      timeoutId = window.setTimeout(poll, delayMs);
    }

    async function poll() {
      if (isDisposed || pollGenerationRef.current !== pollGeneration || isInFlight) {
        return;
      }

      isInFlight = true;
      shouldContinuePolling = true;

      try {
        const activeSession = sessionRef.current;

        if (!activeSession) {
          return;
        }

        const nextSession = await refreshRemoteSession(activeSession);

        if (isDisposed || pollGenerationRef.current !== pollGeneration) {
          return;
        }

        applyRemoteSession(nextSession);
        consecutiveFailures = 0;
        setSyncStatus("live");
        setError("");
        recordSuccessfulSync();
      } catch (caughtError) {
        if (isDisposed || pollGenerationRef.current !== pollGeneration) {
          return;
        }

        const remoteError = normalizeRemoteReadError(caughtError, t("remoteAutoSyncError"));

        consecutiveFailures += 1;
        setSyncStatus(getRemoteSyncStatusForError(remoteError));
        setError(isTerminalRemoteReadError(remoteError) ? remoteError.message : t("remoteAutoSyncError"));

        const retryDelay = isTerminalRemoteReadError(remoteError) ? undefined : calculateRemoteRetryDelay(consecutiveFailures);
        const checkedAt = Date.now();
        const nextTelemetry = {
          consecutiveFailures,
          lastCheckedAt: checkedAt,
          lastSuccessfulSyncAt: syncTelemetryRef.current.lastSuccessfulSyncAt,
          nextRetryAt: retryDelay === undefined ? undefined : checkedAt + retryDelay,
        };
        syncTelemetryRef.current = nextTelemetry;
        setSyncTelemetry(nextTelemetry);

        if (retryDelay === undefined) {
          autoSyncStoppedRef.current = true;
          isDisposed = true;
          pollGenerationRef.current += 1;
          shouldContinuePolling = false;
        }
      } finally {
        isInFlight = false;

        if (!isDisposed && shouldContinuePolling && pollGenerationRef.current === pollGeneration) {
          schedulePoll(consecutiveFailures > 0 ? calculateRemoteRetryDelay(consecutiveFailures) : remotePollBaseIntervalMs);
        }
      }
    }

    function handleOnline() {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      setSyncStatus("reconnecting");
      void poll();
    }

    function handleOffline() {
      setSyncStatus("offline");
      setError(t("remoteAutoSyncError"));
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      setSyncStatus("reconnecting");
      void poll();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedulePoll(remotePollBaseIntervalMs);

    return () => {
      isDisposed = true;
      if (pollGenerationRef.current === pollGeneration) {
        pollGenerationRef.current += 1;
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [applyRemoteSession, recordSuccessfulSync, refreshRemoteSession, session, t]);

  useEffect(() => {
    if (!initialHandoffReference || autoOpenAttempted.current) {
      return;
    }

    const storedSession = readStoredRemoteSession(initialHandoffReference);

    let isCancelled = false;

    void Promise.resolve().then(() => {
      if (isCancelled) {
        return;
      }

      if (autoOpenAttempted.current) {
        return;
      }

      autoOpenAttempted.current = true;

      if (storedSession) {
        void openEstablishedRemoteSession(storedSession);
        return;
      }

      void openRemoteHandoff(initialHandoffReference, false);
    });

    return () => {
      isCancelled = true;
    };
  }, [initialHandoffReference, openEstablishedRemoteSession, openRemoteHandoff]);

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await openRemoteTournament(tournamentCode, shareToken, false);
  }

  async function handleRefresh() {
    if (!session) {
      return;
    }

    setIsLoading(true);
    setError("");
    setMessage("");
    setSyncStatus("reconnecting");

    try {
      const nextSession = await refreshRemoteSession(session);
      applyRemoteSession(nextSession, { force: true });
      persistEstablishedRemoteSession(nextSession, session.handoffReference);
      setSyncStatus("live");
      recordSuccessfulSync();
      setMessage(t("remoteLatestLoaded"));
    } catch (caughtError) {
      const remoteError = normalizeRemoteReadError(caughtError, t("remoteFetchError"));
      setSyncStatus(getRemoteSyncStatusForError(remoteError));
      setError(getRemoteReadErrorMessage(remoteError, t("remoteFetchError")));

      if (isTerminalRemoteReadError(remoteError)) {
        autoSyncStoppedRef.current = true;
        clearStoredRemoteSession();
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    clearStoredRemoteSession();
    setSession(null);
    setMessage("");
    setError("");
  }

  if (session) {
    return (
      <div className="grid gap-5">
        <RemoteReadOnlyBanner onClose={handleClose} onRefresh={handleRefresh} isLoading={isLoading} syncStatus={syncStatus} syncTelemetry={syncTelemetry} />
        {message ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{message}</p> : null}
        {error ? <p className="rounded-md bg-yellow-50 p-3 font-bold text-yellow-800">{error}</p> : null}
        {session.kind === "team-vs-team" ? (
          <RemoteTeamVsTeamView state={session.state as TeamVsTeamTournamentState} />
        ) : (
          <RemoteStandardView state={session.state as LiveTournamentState} />
        )}
      </div>
    );
  }

  return (
    <form className="app-card grid gap-4 p-4 sm:p-5" onSubmit={handleOpen}>
      {initialHandoffReference && isLoading ? (
        <p className="rounded-md bg-[var(--primary-soft)] p-3 font-black text-[var(--primary-strong)]">{t("remoteHandoffOpening")}</p>
      ) : null}
      <p className="font-bold text-[var(--muted)]">{t("remoteAccessHelp")}</p>
      <label className="grid gap-2 font-bold">
        {t("remoteTournamentCode")}
        <input
          required
          autoCapitalize="characters"
          className="field-control font-mono text-xl font-black uppercase tracking-widest"
          value={tournamentCode}
          onChange={(event) => setTournamentCode(normalizeTournamentCodeInput(event.target.value))}
        />
      </label>
      <label className="grid gap-2 font-bold">
        {t("remoteShareToken")}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            required
            className="field-control font-mono"
            type={showToken ? "text" : "password"}
            value={shareToken}
            onChange={(event) => setShareToken(event.target.value)}
          />
          <button className="btn-secondary min-h-12" type="button" onClick={() => setShowToken((current) => !current)}>
            {showToken ? t("remoteHideToken") : t("remoteShowToken")}
          </button>
        </div>
      </label>
      {error ? <p className="rounded-md bg-yellow-50 p-3 font-bold text-yellow-800">{error}</p> : null}
      {message ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{message}</p> : null}
      <button className="btn-primary min-h-14 disabled:bg-gray-300" type="submit" disabled={isLoading}>
        {isLoading ? t("remoteLoadingTournament") : t("openRemoteTournament")}
      </button>
    </form>
  );
}

function RemoteReadOnlyBanner({ isLoading, onClose, onRefresh, syncStatus, syncTelemetry }: { isLoading: boolean; onClose: () => void; onRefresh: () => void; syncStatus: RemoteSyncStatus; syncTelemetry: RemoteSyncTelemetry }) {
  const { t } = useAppTranslation();
  const statusCopy = getRemoteSyncStatusCopy(syncStatus);

  return (
    <section className="rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black uppercase text-[var(--primary-strong)]">{t("remoteReadOnlyBanner")}</p>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-black ${statusCopy.className}`} aria-label={t("remoteSyncStatus")}>
              <span aria-hidden="true">●</span>
              {t(statusCopy.label)}
            </span>
          </div>
          <p className="mt-1 font-bold text-[var(--muted)]">{t("remoteReadOnlyHelp")}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-[var(--muted)]">
            {syncTelemetry.lastCheckedAt ? <span>{t("remoteSyncLastChecked")}: {formatRemoteSyncTime(syncTelemetry.lastCheckedAt)}</span> : null}
            {syncTelemetry.lastSuccessfulSyncAt ? <span>{t("remoteSyncLastUpdated")}: {formatRemoteSyncTime(syncTelemetry.lastSuccessfulSyncAt)}</span> : null}
            {syncTelemetry.nextRetryAt ? <span>{t("remoteSyncNextRetry")}: {formatRemoteRetry(syncTelemetry.nextRetryAt)}</span> : null}
          </div>
        </div>
        <div className="action-grid">
          <button className="btn-secondary min-h-12 disabled:opacity-50" type="button" disabled={isLoading} onClick={onRefresh}>
            {isLoading ? t("remoteLoadingTournament") : t("remoteRefresh")}
          </button>
          <button className="btn-outline-primary min-h-12" type="button" onClick={onClose}>
            {t("remoteCloseView")}
          </button>
        </div>
      </div>
    </section>
  );
}

function getRemoteSyncStatusCopy(status: RemoteSyncStatus): { label: "remoteSyncConnecting" | "remoteSyncLive" | "remoteSyncReconnecting" | "remoteSyncOffline" | "remoteSyncError"; className: string } {
  switch (status) {
    case "connecting":
      return { label: "remoteSyncConnecting", className: "bg-blue-50 text-blue-800" };
    case "live":
      return { label: "remoteSyncLive", className: "bg-green-50 text-[var(--primary-strong)]" };
    case "reconnecting":
      return { label: "remoteSyncReconnecting", className: "bg-yellow-50 text-yellow-800" };
    case "offline":
      return { label: "remoteSyncOffline", className: "bg-gray-100 text-[var(--muted)]" };
    case "error":
      return { label: "remoteSyncError", className: "bg-red-50 text-red-700" };
  }
}

async function postRemoteRead(url: string, payload: Record<string, string>, fallbackMessage: string): Promise<{ response: Response; body: RemoteReadResponse }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return { response, body: await readRemoteJson(response) };
  } catch (caughtError) {
    throw normalizeRemoteReadError(caughtError, fallbackMessage);
  }
}

async function readRemoteJson(response: Response): Promise<RemoteReadResponse> {
  try {
    return await response.json() as RemoteReadResponse;
  } catch {
    return {};
  }
}

function normalizeRemoteReadError(error: unknown, fallbackMessage: string): RemoteReadError {
  if (error instanceof RemoteReadError) {
    return error;
  }

  if (error instanceof TypeError) {
    return new RemoteReadError(fallbackMessage, "network");
  }

  return new RemoteReadError(error instanceof Error ? error.message : fallbackMessage, "server");
}

function getRemoteReadErrorMessage(error: unknown, fallbackMessage: string): string {
  const remoteError = normalizeRemoteReadError(error, fallbackMessage);

  if (remoteError.kind === "network" || remoteError.kind === "server") {
    return fallbackMessage;
  }

  return remoteError.message;
}

function getRemoteSyncStatusForError(error: RemoteReadError): RemoteSyncStatus {
  if (error.kind === "network") {
    return typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "reconnecting";
  }

  return isTerminalRemoteReadError(error) ? "error" : "reconnecting";
}

function isTerminalRemoteReadError(error: RemoteReadError): boolean {
  return error.kind === "expired"
    || error.kind === "access-denied"
    || error.status === 410
    || error.message.toLocaleLowerCase("en").includes("expired")
    || error.message.toLocaleLowerCase("da").includes("udløbet");
}

function calculateRemoteRetryDelay(consecutiveFailures: number): number {
  return Math.min(remotePollMaxIntervalMs, remotePollBaseIntervalMs * Math.max(1, consecutiveFailures));
}

function createSuccessfulSyncTelemetry(): RemoteSyncTelemetry {
  const now = Date.now();

  return {
    consecutiveFailures: 0,
    lastCheckedAt: now,
    lastSuccessfulSyncAt: now,
  };
}

function formatRemoteSyncTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatRemoteRetry(nextRetryAt: number): string {
  const seconds = Math.max(1, Math.ceil((nextRetryAt - Date.now()) / 1000));
  return `${seconds}s`;
}

function RemoteStandardView({ state }: { state: LiveTournamentState }) {
  const view = useMemo(() => createReadOnlyTournamentView(state), [state]);

  if (view.poolPlay) {
    return <RemotePoolPlayView view={view} poolPlay={view.poolPlay} />;
  }

  return <RemoteAmericanoView view={view} />;
}

function RemoteAmericanoView({ view }: { view: ReadOnlyTournamentView }) {
  const { t } = useAppTranslation();

  return (
    <div className="grid gap-5">
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{t("liveScore")}</p>
        <h2 className="text-2xl font-black">{view.tournamentName}</h2>
        <p className="font-bold text-[var(--muted)]">
          {view.players} {t("players").toLowerCase()} - {view.courts} {t("courts").toLowerCase()} - {t("round")} {view.activeRoundNumber} / {view.totalRounds}
        </p>
        <div className="action-grid opacity-70">
          <button className="btn-secondary min-h-12" type="button" disabled>{t("enterScore")}</button>
          <button className="btn-secondary min-h-12" type="button" disabled>{t("next")}</button>
        </div>
      </section>
      {view.byePlayers.length ? <p className="rounded-md bg-yellow-50 p-3 font-black text-yellow-800">{t("remotePausedPlayers")}: {view.byePlayers.join(" / ")}</p> : null}
      <Section title={t("matches")}>
        <MatchCards matches={view.matches} />
      </Section>
      <Section title={t("liveScore")}>
        <StandingsTable standings={view.standings} />
      </Section>
      <Section title={t("allPlayers")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {view.playerInfo.map((player) => (
            <article key={player.playerId} className="app-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{player.playerName}</h3>
                  <p className="font-bold text-[var(--muted)]">#{player.rank}</p>
                </div>
                <span className="rounded-md bg-[var(--primary-soft)] px-3 py-1 text-sm font-black text-[var(--primary-strong)]">{player.court}</span>
              </div>
              <p className="mt-3 font-bold">{player.partnerName}</p>
              <p className="font-bold text-[var(--muted)]">{player.opponents}</p>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

function RemotePoolPlayView({ view, poolPlay }: { view: ReadOnlyTournamentView; poolPlay: NonNullable<ReadOnlyTournamentView["poolPlay"]> }) {
  const { t } = useAppTranslation();

  return (
    <div className="grid gap-5">
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{t("format")}</p>
        <h2 className="text-2xl font-black">{view.tournamentName}</h2>
        <p className="font-bold text-[var(--muted)]">{poolPlay.phase} - {poolPlay.participantCount} {t("players").toLowerCase()}</p>
      </section>
      <Section title={t("remotePoolStandings")}>
        <div className="grid gap-4">
          {poolPlay.initialStandings.map((table) => (
            <section key={table.poolId} className="grid gap-3" aria-labelledby={`${table.poolId}-remote-heading`}>
              <h3 id={`${table.poolId}-remote-heading`} className="text-lg font-black">{table.poolName}</h3>
              <StandingsTable standings={table.rows} />
            </section>
          ))}
        </div>
      </Section>
      <Section title={t("remoteNextPhase")}>
        {poolPlay.nextPhaseMatches.length ? <MatchCards matches={poolPlay.nextPhaseMatches} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
      </Section>
      {poolPlay.finalMatches.length ? (
        <Section title={t("finalStandings")}>
          <MatchCards matches={poolPlay.finalMatches} />
        </Section>
      ) : null}
      {poolPlay.placementTiebreakMatches.length ? (
        <Section title={t("remotePlacementTiebreak")}>
          <MatchCards matches={poolPlay.placementTiebreakMatches} />
        </Section>
      ) : null}
      {poolPlay.finalPlacements.length ? (
        <Section title={t("finalPlacements")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {poolPlay.finalPlacements.map((placement) => (
              <article key={`${placement.groupName}-${placement.rank}`} className="app-card flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{placement.groupName}</p>
                  <h3 className="mt-1 text-xl font-black">{placement.participantName}</h3>
                </div>
                <span className="text-3xl font-black">{placement.rank}.</span>
              </article>
            ))}
          </div>
        </Section>
      ) : null}
      {poolPlay.automaticAdvances.length ? (
        <Section title={t("remoteAutomaticAdvance")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {poolPlay.automaticAdvances.map((advance) => (
              <article key={advance.id} className="app-card p-4">
                <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{advance.resolution}</p>
                <h3 className="mt-1 text-xl font-black">{advance.participantName}</h3>
                <p className="mt-2 font-bold text-[var(--muted)]">{advance.sourcePoolName}, #{advance.sourceRank}</p>
              </article>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function RemoteTeamVsTeamView({ state }: { state: TeamVsTeamTournamentState }) {
  const { t } = useAppTranslation();
  const view = useMemo(() => createTeamVsTeamReadOnlyView(state), [state]);

  return (
    <div className="grid gap-5">
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Team vs. Team</p>
        <h2 className="text-2xl font-black">{view.tournamentName}</h2>
        <p className="font-bold text-[var(--muted)]">
          {view.activeMatchLabel} - {t("round")} {view.activeRoundNumber} / {view.totalRounds} - {view.teamsCount} {t("teams").toLowerCase()}
        </p>
      </section>
      <Section title={t("remoteTeamsAndCaptains")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {view.teams.map((team) => (
            <article key={team.teamId} className="app-card p-4">
              <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{team.teamName}</p>
              <h3 className="mt-1 text-xl font-black">{team.captainName}</h3>
              <p className="mt-2 font-bold text-[var(--muted)]">{team.players.join(" / ")}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section title={t("matches")}>
        {view.matches.length ? <MatchCards matches={view.matches} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
      </Section>
      <Section title={t("liveScore")}>
        <div className="grid gap-3">
          {view.standings.map((standing) => (
            <article key={standing.teamId} className="app-card grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
              <span className="text-2xl font-black">#{standing.rank}</span>
              <div>
                <h3 className="text-xl font-black">{standing.teamName}</h3>
                <p className="font-bold text-[var(--muted)]">{standing.won}-{standing.lost}</p>
              </div>
              <p className="text-right text-lg font-black">{standing.matchWins}-{standing.matchLosses}</p>
            </article>
          ))}
        </div>
      </Section>
      <button className="btn-secondary min-h-12 opacity-70" type="button" disabled>
        {t("remoteReadOnlyBanner")}
      </button>
    </div>
  );
}

function normalizeTournamentCodeInput(value: string): string {
  return value.trim().toLocaleUpperCase("en").replace(/\s+/g, "");
}

function isSameRemoteAccess(currentSession: RemoteTournamentSession, nextSession: RemoteTournamentSession): boolean {
  if (currentSession.remoteSessionToken && nextSession.remoteSessionToken) {
    return currentSession.remoteSessionToken === nextSession.remoteSessionToken;
  }

  if (currentSession.accessMode !== nextSession.accessMode) {
    return false;
  }

  if (currentSession.accessMode === "remote-session") {
    return currentSession.remoteSessionToken === nextSession.remoteSessionToken;
  }

  if (currentSession.accessMode === "handoff") {
    return currentSession.handoffReference === nextSession.handoffReference;
  }

  return currentSession.tournamentCode === nextSession.tournamentCode && currentSession.shareToken === nextSession.shareToken;
}

function isNewerRemoteVersion(currentUpdatedAt?: string, nextUpdatedAt?: string): boolean {
  if (!nextUpdatedAt) {
    return false;
  }

  if (!currentUpdatedAt) {
    return true;
  }

  const currentTime = Date.parse(currentUpdatedAt);
  const nextTime = Date.parse(nextUpdatedAt);

  if (Number.isNaN(currentTime) || Number.isNaN(nextTime)) {
    return nextUpdatedAt !== currentUpdatedAt;
  }

  return nextTime > currentTime;
}

interface StoredRemoteSession {
  remoteSessionToken: string;
  remoteSessionExpiresAt: string;
  handoffReference?: string;
}

function persistEstablishedRemoteSession(session: RemoteTournamentSession, handoffReference?: string): void {
  if (typeof window === "undefined" || !session.remoteSessionToken || !session.remoteSessionExpiresAt) {
    return;
  }

  const storedSession: StoredRemoteSession = {
    remoteSessionToken: session.remoteSessionToken,
    remoteSessionExpiresAt: session.remoteSessionExpiresAt,
    handoffReference: handoffReference ?? session.handoffReference,
  };

  try {
    window.sessionStorage.setItem(remoteSessionStorageKey, JSON.stringify(storedSession));
  } catch {
    // Session storage is a convenience for refresh recovery; polling continues without it.
  }
}

function readStoredRemoteSession(handoffReference?: string): StoredRemoteSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(remoteSessionStorageKey);

    if (!raw) {
      return null;
    }

    const storedSession = JSON.parse(raw) as StoredRemoteSession;

    if (!storedSession.remoteSessionToken || !storedSession.remoteSessionExpiresAt) {
      clearStoredRemoteSession();
      return null;
    }

    if (handoffReference && storedSession.handoffReference !== handoffReference) {
      return null;
    }

    if (Date.parse(storedSession.remoteSessionExpiresAt) <= Date.now()) {
      clearStoredRemoteSession();
      return null;
    }

    return storedSession;
  } catch {
    clearStoredRemoteSession();
    return null;
  }
}

function clearStoredRemoteSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(remoteSessionStorageKey);
  } catch {
    // Ignore storage failures; server-side validation remains authoritative.
  }
}
