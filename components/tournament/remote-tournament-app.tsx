"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { Section } from "@/components/ui/section";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView, type ReadOnlyMatchCard, type ReadOnlyTournamentView } from "@/lib/read-only-views";
import type { LiveTournamentState } from "@/lib/live-scoring";
import type { TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";

type RemoteTournamentKind = "standard" | "team-vs-team";
type RemoteSyncStatus = "connecting" | "live" | "reconnecting" | "offline" | "error";
type RemoteReadErrorKind = "access-denied" | "expired" | "network" | "server";
type RemoteDisplayMode = "standard" | "tv" | "scoreboard";

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

type ScoreboardStanding = {
  id: string;
  rank: number;
  name: string;
  matchPoints: number;
  pointsFor: number;
};

type ScoreboardMatchCard = ReadOnlyMatchCard;

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
  const [displayMode, setDisplayMode] = useState<RemoteDisplayMode>(() => getInitialRemoteDisplayMode());
  const isTvMode = displayMode !== "standard";
  const isScoreboardMode = displayMode === "scoreboard";

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
    setDisplayMode("standard");
  }

  async function handleFullscreen() {
    if (typeof document === "undefined" || !document.documentElement.requestFullscreen) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is optional and browser-controlled; the TV layout still works without it.
    }
  }

  if (session) {
    return (
      <div className={isTvMode ? "fixed inset-0 z-50 min-h-screen w-screen max-w-[100vw] overflow-auto overflow-x-hidden bg-[var(--background)] p-2 sm:p-4 lg:p-5" : "grid gap-5"}>
        {isScoreboardMode ? null : (
          <RemoteReadOnlyBanner
            onClose={handleClose}
            onRefresh={handleRefresh}
            onSetDisplayMode={setDisplayMode}
            onFullscreen={handleFullscreen}
            displayMode={displayMode}
            isLoading={isLoading}
            isTerminalError={Boolean(error && syncStatus === "error")}
            syncStatus={syncStatus}
            syncTelemetry={syncTelemetry}
          />
        )}
        {message && !isScoreboardMode ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{message}</p> : null}
        {error ? <RemoteErrorMessage message={error} isTerminal={syncStatus === "error"} onNewConnection={handleClose} /> : null}
        {isScoreboardMode ? (
          <RemoteScoreboardView
            kind={session.kind}
            state={session.state}
            syncStatus={syncStatus}
            onClose={handleClose}
            onFullscreen={handleFullscreen}
            onRefresh={handleRefresh}
            onStandardView={() => setDisplayMode("standard")}
            isLoading={isLoading}
          />
        ) : session.kind === "team-vs-team" ? (
          <RemoteTeamVsTeamView state={session.state as TeamVsTeamTournamentState} isTvMode={isTvMode} />
        ) : (
          <RemoteStandardView state={session.state as LiveTournamentState} isTvMode={isTvMode} />
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

function RemoteReadOnlyBanner({
  displayMode,
  isLoading,
  isTerminalError,
  onClose,
  onFullscreen,
  onRefresh,
  onSetDisplayMode,
  syncStatus,
  syncTelemetry,
}: {
  displayMode: RemoteDisplayMode;
  isLoading: boolean;
  isTerminalError: boolean;
  onClose: () => void;
  onFullscreen: () => void;
  onRefresh: () => void;
  onSetDisplayMode: (mode: RemoteDisplayMode) => void;
  syncStatus: RemoteSyncStatus;
  syncTelemetry: RemoteSyncTelemetry;
}) {
  const { t } = useAppTranslation();
  const statusCopy = getRemoteSyncStatusCopy(syncStatus);
  const isTvMode = displayMode === "tv";

  return (
    <section className={`w-full max-w-full overflow-hidden rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] p-4 ${isTvMode ? "sticky top-0 z-10 shadow-sm" : ""}`}>
      <div className="flex w-full min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black uppercase text-[var(--primary-strong)]">
              <span className="sm:hidden">{t("remoteReadOnlyShort")}</span>
              <span className="hidden sm:inline">{t("remoteReadOnlyBanner")}</span>
            </p>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-black ${statusCopy.className}`} aria-label={t("remoteSyncStatus")}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
              {t(statusCopy.label)}
            </span>
          </div>
          {isTvMode ? null : <p className="mt-1 font-bold text-[var(--muted)]">{t("remoteReadOnlyHelp")}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-[var(--muted)]">
            {syncTelemetry.lastCheckedAt ? <span>{t("remoteSyncLastChecked")}: {formatRemoteSyncTime(syncTelemetry.lastCheckedAt)}</span> : null}
            {syncTelemetry.lastSuccessfulSyncAt ? <span>{t("remoteSyncLastUpdated")}: {formatRemoteSyncTime(syncTelemetry.lastSuccessfulSyncAt)}</span> : null}
            {syncTelemetry.nextRetryAt ? <span>{t("remoteSyncNextRetry")}: {formatRemoteRetry(syncTelemetry.nextRetryAt)}</span> : null}
          </div>
        </div>
        <div className={isTvMode ? "grid w-full min-w-0 gap-3 sm:grid-cols-2 md:w-48 md:grid-cols-1" : "action-grid"}>
          <button className="btn-primary-soft min-h-12 disabled:opacity-50" type="button" onClick={() => onSetDisplayMode(isTvMode ? "standard" : "tv")}>
            {isTvMode ? t("remoteStandardMode") : t("remoteTvMode")}
          </button>
          <button className="btn-primary-soft min-h-12 disabled:opacity-50" type="button" onClick={() => onSetDisplayMode("scoreboard")}>
            {t("remoteScoreboardMode")}
          </button>
          <button className="btn-secondary min-h-12 disabled:opacity-50" type="button" onClick={onFullscreen}>
            {t("remoteFullscreen")}
          </button>
          <button className="btn-secondary min-h-12 disabled:opacity-50" type="button" disabled={isLoading} onClick={onRefresh}>
            {isLoading ? t("remoteLoadingTournament") : t("remoteRefresh")}
          </button>
          <button className="btn-outline-primary min-h-12" type="button" onClick={onClose}>
            {isTerminalError ? t("remoteNewConnection") : t("remoteCloseView")}
          </button>
        </div>
      </div>
    </section>
  );
}

function RemoteErrorMessage({ isTerminal, message, onNewConnection }: { isTerminal: boolean; message: string; onNewConnection: () => void }) {
  const { t } = useAppTranslation();

  return (
    <section className="rounded-md bg-yellow-50 p-4 font-bold text-yellow-900">
      <p>{isTerminal ? t("remoteConnectionExpired") : message}</p>
      {isTerminal ? (
        <button className="btn-primary mt-3 min-h-12" type="button" onClick={onNewConnection}>
          {t("remoteNewConnection")}
        </button>
      ) : null}
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

function RemoteScoreboardView({
  isLoading,
  kind,
  onClose,
  onFullscreen,
  onRefresh,
  onStandardView,
  state,
  syncStatus,
}: {
  isLoading: boolean;
  kind: RemoteTournamentKind;
  onClose: () => void;
  onFullscreen: () => void;
  onRefresh: () => void;
  onStandardView: () => void;
  state: LiveTournamentState | TeamVsTeamTournamentState;
  syncStatus: RemoteSyncStatus;
}) {
  return kind === "team-vs-team" ? (
    <RemoteTeamVsTeamScoreboardView
      isLoading={isLoading}
      onClose={onClose}
      onFullscreen={onFullscreen}
      onRefresh={onRefresh}
      onStandardView={onStandardView}
      state={state as TeamVsTeamTournamentState}
      syncStatus={syncStatus}
    />
  ) : (
    <RemoteStandardScoreboardView
      isLoading={isLoading}
      onClose={onClose}
      onFullscreen={onFullscreen}
      onRefresh={onRefresh}
      onStandardView={onStandardView}
      state={state as LiveTournamentState}
      syncStatus={syncStatus}
    />
  );
}

function RemoteStandardScoreboardView({
  isLoading,
  onClose,
  onFullscreen,
  onRefresh,
  onStandardView,
  state,
  syncStatus,
}: {
  isLoading: boolean;
  onClose: () => void;
  onFullscreen: () => void;
  onRefresh: () => void;
  onStandardView: () => void;
  state: LiveTournamentState;
  syncStatus: RemoteSyncStatus;
}) {
  const { t } = useAppTranslation();
  const view = useMemo(() => createReadOnlyTournamentView(state), [state]);

  if (view.poolPlay) {
    const primaryMatches = view.poolPlay.finalMatches.length ? view.poolPlay.finalMatches : view.poolPlay.nextPhaseMatches;
    const poolStandings = view.poolPlay.initialStandings.flatMap((table) => table.rows.slice(0, 4).map((row) => ({
      ...row,
      id: `${table.poolId}-${row.id}`,
      name: `${table.poolName}: ${row.name}`,
    })));

    return (
      <RemoteScoreboardLayout
        formatLabel={t("formatPoolPlay")}
        matches={primaryMatches}
        onClose={onClose}
        onFullscreen={onFullscreen}
        onRefresh={onRefresh}
        onStandardView={onStandardView}
        roundLabel={view.poolPlay.phase}
        standings={poolStandings}
        syncStatus={syncStatus}
        title={view.tournamentName}
        isLoading={isLoading}
      />
    );
  }

  return (
    <RemoteScoreboardLayout
      formatLabel={formatLiveTournamentFormat(state.format, t)}
      matches={view.matches}
      onClose={onClose}
      onFullscreen={onFullscreen}
      onRefresh={onRefresh}
      onStandardView={onStandardView}
      roundLabel={`${t("round")} ${view.activeRoundNumber} / ${view.totalRounds}`}
      standings={view.standings.slice(0, 6)}
      syncStatus={syncStatus}
      title={view.tournamentName}
      isLoading={isLoading}
    />
  );
}

function RemoteTeamVsTeamScoreboardView({
  isLoading,
  onClose,
  onFullscreen,
  onRefresh,
  onStandardView,
  state,
  syncStatus,
}: {
  isLoading: boolean;
  onClose: () => void;
  onFullscreen: () => void;
  onRefresh: () => void;
  onStandardView: () => void;
  state: TeamVsTeamTournamentState;
  syncStatus: RemoteSyncStatus;
}) {
  const { t } = useAppTranslation();
  const view = useMemo(() => createTeamVsTeamReadOnlyView(state), [state]);
  const standings = view.standings.map((standing) => ({
    id: standing.teamId,
    rank: standing.rank,
    name: standing.teamName,
    matchPoints: standing.matchWins,
    pointsFor: standing.matchLosses,
  }));

  return (
    <RemoteScoreboardLayout
      formatLabel="Team vs. Team"
      matches={view.matches}
      onClose={onClose}
      onFullscreen={onFullscreen}
      onRefresh={onRefresh}
      onStandardView={onStandardView}
      roundLabel={`${view.activeMatchLabel} - ${t("round")} ${view.activeRoundNumber} / ${view.totalRounds}`}
      standings={standings}
      syncStatus={syncStatus}
      title={view.tournamentName}
      isLoading={isLoading}
    />
  );
}

function RemoteScoreboardLayout({
  formatLabel,
  isLoading,
  matches,
  onClose,
  onFullscreen,
  onRefresh,
  onStandardView,
  roundLabel,
  standings,
  syncStatus,
  title,
}: {
  formatLabel: string;
  isLoading: boolean;
  matches: ScoreboardMatchCard[];
  onClose: () => void;
  onFullscreen: () => void;
  onRefresh: () => void;
  onStandardView: () => void;
  roundLabel: string;
  standings: ScoreboardStanding[];
  syncStatus: RemoteSyncStatus;
  title: string;
}) {
  const { t } = useAppTranslation();

  return (
    <div className="grid min-h-[calc(100vh-1rem)] max-w-full gap-3 overflow-x-hidden lg:h-[calc(100vh-2.5rem)] lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:overflow-hidden">
      <RemoteScoreboardHeader
        formatLabel={formatLabel}
        isLoading={isLoading}
        onClose={onClose}
        onFullscreen={onFullscreen}
        onRefresh={onRefresh}
        onStandardView={onStandardView}
        roundLabel={roundLabel}
        syncStatus={syncStatus}
        title={title}
      />
      <main className="grid min-h-0 gap-3 xl:grid-cols-[0.42fr_0.58fr]">
        <section className="grid min-h-0 gap-2 lg:overflow-hidden">
          <h2 className="text-xl font-black uppercase tracking-wide text-[var(--muted)] lg:text-2xl">{t("remoteCurrentMatches")}</h2>
          <RemoteScoreboardMatchGrid matches={matches} />
        </section>
        <section className="grid min-h-0 gap-2 lg:overflow-hidden">
          <h2 className="text-xl font-black uppercase tracking-wide text-[var(--primary-strong)] lg:text-2xl">{t("liveScore")}</h2>
          <RemoteScoreboardScoreGrid matches={matches} />
        </section>
      </main>
      <RemoteScoreboardStandings standings={standings} />
    </div>
  );
}

function RemoteScoreboardHeader({
  formatLabel,
  isLoading,
  onClose,
  onFullscreen,
  onRefresh,
  onStandardView,
  roundLabel,
  syncStatus,
  title,
}: {
  formatLabel: string;
  isLoading: boolean;
  onClose: () => void;
  onFullscreen: () => void;
  onRefresh: () => void;
  onStandardView: () => void;
  roundLabel: string;
  syncStatus: RemoteSyncStatus;
  title: string;
}) {
  const { t } = useAppTranslation();
  const statusCopy = getRemoteSyncStatusCopy(syncStatus);

  return (
    <header className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--card)] p-3 shadow-sm lg:grid-cols-[auto_1fr_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-sm font-black uppercase text-[var(--primary-strong)]">{t("appBrand")}</p>
        <h1 className="max-w-full break-all text-xl font-black leading-tight sm:text-2xl lg:text-[clamp(2rem,2.6vw,3.25rem)]" style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}>{title}</h1>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-black uppercase text-[var(--muted)] lg:justify-center lg:text-xl">
        <span>{formatLabel}</span>
        <span aria-hidden="true">/</span>
        <span>{roundLabel}</span>
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs lg:text-sm ${statusCopy.className}`} aria-label={t("remoteSyncStatus")}>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
          {t(statusCopy.label)}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-4 lg:w-44 lg:grid-cols-1">
        <button className="btn-primary-soft min-h-10 text-sm" type="button" onClick={onStandardView}>{t("remoteStandardMode")}</button>
        <button className="btn-secondary min-h-10 text-sm" type="button" onClick={onFullscreen}>{t("remoteFullscreen")}</button>
        <button className="btn-secondary min-h-10 text-sm" type="button" disabled={isLoading} onClick={onRefresh}>{isLoading ? t("remoteLoadingTournament") : t("remoteRefresh")}</button>
        <button className="btn-outline-primary min-h-10 text-sm" type="button" onClick={onClose}>{t("remoteCloseView")}</button>
      </div>
    </header>
  );
}

function RemoteScoreboardMatchGrid({ matches }: { matches: ScoreboardMatchCard[] }) {
  return (
    <div className={`grid min-h-0 gap-3 lg:overflow-hidden ${getScoreboardGridClass(matches.length)}`}>
      {matches.map((match) => (
        <article key={match.id} className={`grid min-w-0 gap-2 rounded-md border p-4 ${getScoreboardMatchTone(match.status)}`}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-2xl font-black uppercase lg:text-[clamp(1.8rem,2.4vw,3rem)]">{match.court}</h3>
            <span className="hidden rounded-md bg-white/75 px-3 py-1 text-xs font-black uppercase text-[var(--muted)] sm:inline-flex">{match.status}</span>
          </div>
          <div className="grid min-w-0 gap-2 text-[clamp(1.25rem,1.8vw,2rem)] font-black leading-tight">
            <p style={{ overflowWrap: "anywhere" }}>{match.teamA}</p>
            <p className="text-sm uppercase text-[var(--muted)] lg:text-lg">vs</p>
            <p style={{ overflowWrap: "anywhere" }}>{match.teamB}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function RemoteScoreboardScoreGrid({ matches }: { matches: ScoreboardMatchCard[] }) {
  return (
    <div className={`grid min-h-0 gap-3 lg:overflow-hidden ${getScoreboardGridClass(matches.length)}`}>
      {matches.map((match) => {
        const score = parseScore(match.score);

        return (
          <article key={match.id} className={`grid min-w-0 content-between gap-3 rounded-md border p-4 text-center ${getScoreboardMatchTone(match.status)}`}>
            <h3 className="text-2xl font-black uppercase text-[var(--primary-strong)] lg:text-[clamp(1.6rem,2.2vw,2.75rem)]">{match.court}</h3>
            <p className="text-[clamp(0.95rem,1.2vw,1.45rem)] font-black leading-tight" style={{ overflowWrap: "anywhere" }}>{match.teamA}</p>
            {score ? (
              <>
                <p className="sr-only">{match.score}</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <span className="font-black leading-none text-[clamp(3.25rem,5.5vw,7rem)]">{score.teamA}</span>
                  <span className="font-black leading-none text-[clamp(1.6rem,2.8vw,3.2rem)] text-[var(--muted)]">-</span>
                  <span className="font-black leading-none text-[clamp(3.25rem,5.5vw,7rem)]">{score.teamB}</span>
                </div>
              </>
            ) : (
              <p className="font-black leading-tight text-[clamp(1.75rem,3.2vw,3.75rem)] text-[var(--muted)]">{match.score}</p>
            )}
            <p className="text-[clamp(0.95rem,1.2vw,1.45rem)] font-black leading-tight" style={{ overflowWrap: "anywhere" }}>{match.teamB}</p>
          </article>
        );
      })}
    </div>
  );
}

function RemoteScoreboardStandings({ standings }: { standings: ScoreboardStanding[] }) {
  const { t } = useAppTranslation();
  const visibleStandings = standings.slice(0, 3);

  if (!visibleStandings.length) {
    return null;
  }

  return (
    <section className="grid gap-2 overflow-hidden">
      <h2 className="text-lg font-black uppercase tracking-wide text-[var(--muted)]">{t("remoteTopStandings")}</h2>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visibleStandings.map((row) => (
          <article key={row.id} className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--card)] px-4 py-2">
            <span className="text-2xl font-black text-[var(--primary-strong)]">#{row.rank}</span>
            <h3 className="min-w-0 text-lg font-black leading-tight" style={{ overflowWrap: "anywhere" }}>{row.name}</h3>
            <p className="text-right text-lg font-black text-[var(--muted)]">{row.matchPoints} / {row.pointsFor}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function RemoteStandardView({ isTvMode, state }: { isTvMode: boolean; state: LiveTournamentState }) {
  const view = useMemo(() => createReadOnlyTournamentView(state), [state]);

  if (view.poolPlay) {
    return <RemotePoolPlayView view={view} poolPlay={view.poolPlay} isTvMode={isTvMode} />;
  }

  return <RemoteAmericanoView view={view} isTvMode={isTvMode} />;
}

function RemoteAmericanoView({ isTvMode, view }: { isTvMode: boolean; view: ReadOnlyTournamentView }) {
  const { t } = useAppTranslation();
  const topStandings = view.standings.slice(0, isTvMode ? 8 : view.standings.length);

  return (
    <div className={`grid gap-5 ${isTvMode ? "text-[clamp(1rem,1.15vw,1.45rem)]" : ""}`}>
      <RemoteTournamentHeader
        eyebrow={view.format === "standard" ? t("liveScore") : t("format")}
        title={view.tournamentName}
        details={`${view.players} ${t("players").toLowerCase()} - ${view.courts} ${t("courts").toLowerCase()} - ${t("round")} ${view.activeRoundNumber} / ${view.totalRounds}`}
        isTvMode={isTvMode}
      />
      {view.byePlayers.length ? <p className="rounded-md bg-yellow-50 p-3 font-black text-yellow-800">{t("remotePausedPlayers")}: {view.byePlayers.join(" / ")}</p> : null}
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <RemotePanel title={t("remoteCurrentMatches")} isTvMode={isTvMode}>
          <RemoteMatchGrid matches={view.matches} isTvMode={isTvMode} />
        </RemotePanel>
        <RemotePanel title={t("liveScore")} isTvMode={isTvMode}>
          <RemoteLiveScoreGrid matches={view.matches} isTvMode={isTvMode} />
        </RemotePanel>
      </div>
      <RemotePanel title={t("remoteTopStandings")} isTvMode={isTvMode}>
        <RemoteStandingsList standings={topStandings} isTvMode={isTvMode} />
      </RemotePanel>
      {isTvMode ? null : (
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
      )}
    </div>
  );
}

function RemotePoolPlayView({ isTvMode, view, poolPlay }: { isTvMode: boolean; view: ReadOnlyTournamentView; poolPlay: NonNullable<ReadOnlyTournamentView["poolPlay"]> }) {
  const { t } = useAppTranslation();
  const primaryMatches = poolPlay.finalMatches.length ? poolPlay.finalMatches : poolPlay.nextPhaseMatches;

  return (
    <div className={`grid gap-5 ${isTvMode ? "text-[clamp(1rem,1.1vw,1.4rem)]" : ""}`}>
      <RemoteTournamentHeader
        eyebrow={t("format")}
        title={view.tournamentName}
        details={`${poolPlay.phase} - ${poolPlay.participantCount} ${t("players").toLowerCase()}`}
        isTvMode={isTvMode}
      />
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <RemotePanel title={primaryMatches.length ? t("remoteCurrentMatches") : t("remoteNextPhase")} isTvMode={isTvMode}>
          {primaryMatches.length ? <RemoteMatchGrid matches={primaryMatches} isTvMode={isTvMode} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
        </RemotePanel>
        <RemotePanel title={t("liveScore")} isTvMode={isTvMode}>
          {primaryMatches.length ? <RemoteLiveScoreGrid matches={primaryMatches} isTvMode={isTvMode} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
        </RemotePanel>
      </div>
      <RemotePanel title={t("remotePoolStandings")} isTvMode={isTvMode}>
        <div className="grid gap-4 xl:grid-cols-2">
          {poolPlay.initialStandings.map((table) => (
            <section key={table.poolId} className="grid gap-3" aria-labelledby={`${table.poolId}-remote-heading`}>
              <h3 id={`${table.poolId}-remote-heading`} className={`${isTvMode ? "text-2xl" : "text-lg"} font-black`}>{table.poolName}</h3>
              <RemoteStandingsList standings={table.rows.slice(0, isTvMode ? 6 : table.rows.length)} isTvMode={isTvMode} />
            </section>
          ))}
        </div>
      </RemotePanel>
      {isTvMode ? null : (
        <Section title={t("remoteNextPhase")}>
          {poolPlay.nextPhaseMatches.length ? <MatchCards matches={poolPlay.nextPhaseMatches} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
        </Section>
      )}
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

function RemoteTeamVsTeamView({ isTvMode, state }: { isTvMode: boolean; state: TeamVsTeamTournamentState }) {
  const { t } = useAppTranslation();
  const view = useMemo(() => createTeamVsTeamReadOnlyView(state), [state]);

  return (
    <div className={`grid gap-5 ${isTvMode ? "text-[clamp(1rem,1.1vw,1.4rem)]" : ""}`}>
      <RemoteTournamentHeader
        eyebrow="Team vs. Team"
        title={view.tournamentName}
        details={`${view.activeMatchLabel} - ${t("round")} ${view.activeRoundNumber} / ${view.totalRounds} - ${view.teamsCount} ${t("teams").toLowerCase()}`}
        isTvMode={isTvMode}
      />
      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <RemotePanel title={t("remoteCurrentMatches")} isTvMode={isTvMode}>
          {view.matches.length ? <RemoteMatchGrid matches={view.matches} isTvMode={isTvMode} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
        </RemotePanel>
        <RemotePanel title={t("liveScore")} isTvMode={isTvMode}>
          {view.matches.length ? <RemoteLiveScoreGrid matches={view.matches} isTvMode={isTvMode} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
        </RemotePanel>
      </div>
      <RemotePanel title={t("remoteTopStandings")} isTvMode={isTvMode}>
        <div className="grid gap-3 xl:grid-cols-2">
          {view.standings.map((standing) => (
            <article key={standing.teamId} className="app-card grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
              <span className={`${isTvMode ? "text-4xl" : "text-2xl"} font-black text-[var(--primary-strong)]`}>#{standing.rank}</span>
              <div>
                <h3 className={`${isTvMode ? "text-2xl" : "text-xl"} font-black`}>{standing.teamName}</h3>
                <p className="font-bold text-[var(--muted)]">{standing.won}-{standing.lost}</p>
              </div>
              <p className={`${isTvMode ? "text-3xl" : "text-lg"} text-right font-black`}>{standing.matchWins}-{standing.matchLosses}</p>
            </article>
          ))}
        </div>
      </RemotePanel>
      {isTvMode ? null : (
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
      )}
    </div>
  );
}

function RemoteTournamentHeader({ details, eyebrow, isTvMode, title }: { details: string; eyebrow: string; isTvMode: boolean; title: string }) {
  return (
    <section className={`app-card grid min-w-0 max-w-full gap-3 overflow-hidden p-4 sm:p-5 ${isTvMode ? "lg:grid-cols-[1fr_auto] lg:items-end lg:p-7" : ""}`}>
      <div className="min-w-0">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{eyebrow}</p>
        <h2 className={`${isTvMode ? "text-2xl sm:text-4xl lg:text-6xl" : "text-2xl"} break-words font-black leading-tight`} style={{ overflowWrap: "anywhere", wordBreak: "normal" }}>{title}</h2>
        <p className={`${isTvMode ? "text-xl" : ""} mt-2 font-bold text-[var(--muted)]`}>{details}</p>
      </div>
    </section>
  );
}

function RemotePanel({ children, isTvMode, title }: { children: ReactNode; isTvMode: boolean; title: string }) {
  return (
    <section className="grid min-w-0 max-w-full gap-3 overflow-hidden">
      <h2 className={`${isTvMode ? "text-3xl lg:text-4xl" : "text-lg sm:text-xl"} font-black leading-tight`}>{title}</h2>
      {children}
    </section>
  );
}

function RemoteMatchGrid({ isTvMode, matches }: { isTvMode: boolean; matches: ReadOnlyMatchCard[] }) {
  return (
    <div className={`grid min-w-0 max-w-full gap-3 ${isTvMode ? "md:grid-cols-2" : "sm:grid-cols-2"}`}>
      {matches.map((match) => (
        <article key={match.id} className={`app-card grid min-w-0 gap-3 overflow-hidden p-4 ${isTvMode ? "min-h-44 p-5" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className={`${isTvMode ? "text-3xl" : "text-xl"} font-black`}>{match.court}</h3>
            <span className={`rounded-md px-3 py-1 text-sm font-black ${match.status === "Afsluttet" ? "bg-green-100 text-[var(--primary-strong)]" : match.status === "I gang" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-[var(--muted)]"}`}>
              {match.status}
            </span>
          </div>
          <p className={`${isTvMode ? "text-lg leading-7 sm:text-2xl sm:leading-9" : "text-lg leading-7"} break-words font-black`} style={{ overflowWrap: "anywhere", wordBreak: "normal" }}>
            <span>{match.teamA}</span>{" "}
            <span className="text-[var(--muted)]">vs</span>{" "}
            <span>{match.teamB}</span>
          </p>
        </article>
      ))}
    </div>
  );
}

function RemoteLiveScoreGrid({ isTvMode, matches }: { isTvMode: boolean; matches: ReadOnlyMatchCard[] }) {
  return (
    <div className={`grid min-w-0 max-w-full gap-3 ${isTvMode ? "md:grid-cols-2" : "sm:grid-cols-2"}`}>
      {matches.map((match) => {
        const score = parseScore(match.score);

        return (
          <article key={match.id} className={`app-card grid min-w-0 gap-3 overflow-hidden p-4 text-center ${isTvMode ? "min-h-60 p-5" : ""}`}>
            <h3 className={`${isTvMode ? "text-3xl" : "text-xl"} font-black text-[var(--primary-strong)]`}>{match.court}</h3>
            <p className={`${isTvMode ? "text-base sm:text-xl" : "text-base"} break-words font-black`} style={{ overflowWrap: "anywhere", wordBreak: "normal" }}>{match.teamA}</p>
            {score ? (
              <>
                <p className="sr-only">{match.score}</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <span className={`${isTvMode ? "text-7xl" : "text-4xl"} font-black`}>{score.teamA}</span>
                  <span className={`${isTvMode ? "text-5xl" : "text-3xl"} font-black text-[var(--muted)]`}>-</span>
                  <span className={`${isTvMode ? "text-7xl" : "text-4xl"} font-black`}>{score.teamB}</span>
                </div>
              </>
            ) : (
              <p className={`${isTvMode ? "text-5xl" : "text-3xl"} font-black text-[var(--muted)]`}>{match.score}</p>
            )}
            <p className={`${isTvMode ? "text-base sm:text-xl" : "text-base"} break-words font-black`} style={{ overflowWrap: "anywhere", wordBreak: "normal" }}>{match.teamB}</p>
          </article>
        );
      })}
    </div>
  );
}

function RemoteStandingsList({ isTvMode, standings }: { isTvMode: boolean; standings: Array<{ id: string; rank: number; name: string; matchPoints: number; pointsFor: number }> }) {
  return (
    <div className={`grid gap-2 ${isTvMode ? "xl:grid-cols-2" : ""}`}>
      {standings.map((row) => (
        <article key={row.id} className="app-card grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 p-3 sm:p-4">
          <span className={`${isTvMode ? "text-4xl" : "text-2xl"} font-black text-[var(--primary-strong)]`}>#{row.rank}</span>
          <h3 className={`${isTvMode ? "text-2xl" : "text-lg"} break-words font-black`} style={{ overflowWrap: "anywhere", wordBreak: "normal" }}>{row.name}</h3>
          <p className="text-right font-bold text-[var(--muted)]">{row.matchPoints}</p>
          <p className="text-right font-bold text-[var(--muted)]">{row.pointsFor}</p>
        </article>
      ))}
    </div>
  );
}

function getInitialRemoteDisplayMode(): RemoteDisplayMode {
  if (typeof window === "undefined") {
    return "standard";
  }

  const display = new URLSearchParams(window.location.search).get("display");

  return display === "scoreboard" || display === "tv" ? display : "standard";
}

function formatLiveTournamentFormat(format: LiveTournamentState["format"], t: (key: TranslationKey) => string): string {
  switch (format) {
    case "americano":
      return t("formatAmericano");
    case "mexicano":
      return t("formatMexicano");
    case "mixed-americano":
      return t("formatMixedAmericano");
    case "fixed-partner-americano":
      return t("fixedPartnerAmericano");
    case "fixed-partner-mexicano":
      return t("fixedPartnerMexicano");
    case "pool-play":
      return t("formatPoolPlay");
  }
}

function getScoreboardGridClass(matchCount: number): string {
  if (matchCount <= 1) {
    return "grid-cols-1";
  }

  if (matchCount === 2) {
    return "lg:grid-cols-2";
  }

  return "md:grid-cols-2";
}

function getScoreboardMatchTone(status: ScoreboardMatchCard["status"]): string {
  if (status === "Afsluttet") {
    return "border-[var(--line)] bg-white/70 text-[var(--muted)]";
  }

  if (status === "I gang") {
    return "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)] shadow-sm";
  }

  return "border-[var(--line)] bg-[var(--card)] text-[var(--foreground)]";
}

function parseScore(score: string): { teamA: string; teamB: string } | null {
  const match = /^(\d+)\s*[-–]\s*(\d+)/.exec(score);

  return match ? { teamA: match[1], teamB: match[2] } : null;
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
