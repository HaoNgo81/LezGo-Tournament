"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { Section } from "@/components/ui/section";
import { UnifiedCourtCard, splitCourtTeamName } from "@/components/tournament/unified-court-card";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView, type ReadOnlyMatchCard, type ReadOnlyTournamentView } from "@/lib/read-only-views";
import type { LiveTournamentState } from "@/lib/live-scoring";
import type { TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import { calculateFixedTotalScore } from "@/lib/tournament-setup/scoring";
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";

type RemoteTournamentKind = "standard" | "team-vs-team";
type RemoteAccessLevel = "score-entry" | "read-only";
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
  accessLevel: RemoteAccessLevel;
  kind: RemoteTournamentKind;
  state: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
}

interface RemoteReadResponse {
  ok?: boolean;
  accessLevel?: RemoteAccessLevel;
  kind?: RemoteTournamentKind;
  state?: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
  remoteSessionToken?: string;
  remoteSessionExpiresAt?: string;
}

interface RemoteScoreSaveResponse extends RemoteReadResponse {
  error?: string;
  tournamentCode?: string;
}

interface RemoteScoreDraft {
  matchId: string;
  court: string;
  teamA: string;
  teamB: string;
  teamAPoints: string;
  teamBPoints: string;
  isEditing: boolean;
}

const remotePollBaseIntervalMs = 4000;
const remotePollMaxIntervalMs = 30000;
const remoteSessionStorageKey = "lezgo.remoteSession.v1";
const remoteAccessPinLength = 4;

type ScoreboardStanding = {
  id: string;
  rank: number;
  name: string;
  wins: number;
  draws: number;
  losses: number;
  matchPoints: number;
  pointsFor: number;
};

type ScoreboardMatchCard = ReadOnlyMatchCard;

type ScoreboardDensity = "large" | "medium" | "compact" | "high";
type ScoreboardStandingsDensity = "large" | "medium" | "compact";

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
  const scoreSaveInFlightRef = useRef(false);
  const pollGenerationRef = useRef(0);
  const syncTelemetryRef = useRef<RemoteSyncTelemetry>({ consecutiveFailures: 0 });
  const [tournamentCode, setTournamentCode] = useState(() => getInitialRemoteTournamentCode());
  const [shareToken, setShareToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [session, setSession] = useState<RemoteTournamentSession | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<RemoteSyncStatus>("connecting");
  const [syncTelemetry, setSyncTelemetry] = useState<RemoteSyncTelemetry>({ consecutiveFailures: 0 });
  const [displayMode, setDisplayMode] = useState<RemoteDisplayMode>(() => getInitialRemoteDisplayMode());
  const [scoreDraft, setScoreDraft] = useState<RemoteScoreDraft | null>(null);
  const [scoreError, setScoreError] = useState("");
  const [isSavingScore, setIsSavingScore] = useState(false);
  const isTvMode = displayMode !== "standard";
  const isScoreboardMode = displayMode === "scoreboard";
  const canEditRemoteScore = Boolean(session?.accessLevel === "score-entry" && session.kind === "standard" && session.tournamentCode && session.shareToken && displayMode === "standard");

  const recordSuccessfulSync = useCallback(() => {
    autoSyncStoppedRef.current = false;
    const nextTelemetry = createSuccessfulSyncTelemetry();
    syncTelemetryRef.current = nextTelemetry;
    setSyncTelemetry(nextTelemetry);
  }, []);

  const readRemoteTournament = useCallback(async (code: string, token: string): Promise<RemoteTournamentSession> => {
    const normalizedCode = normalizeTournamentCodeInput(code);
    const normalizedToken = normalizeRemoteAccessPinInput(token);

    if (!normalizedCode || !isValidRemoteAccessPin(normalizedToken)) {
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
      accessLevel: body.accessLevel === "score-entry" ? "score-entry" : "read-only",
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
        accessLevel: "read-only",
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
        accessMode: "accessMode" in currentSession ? currentSession.accessMode : "remote-session",
        accessLevel: hasManualScoreCredentials(currentSession) ? "score-entry" : "read-only",
        tournamentCode: "tournamentCode" in currentSession ? currentSession.tournamentCode : undefined,
        shareToken: "shareToken" in currentSession ? currentSession.shareToken : undefined,
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
    setScoreDraft(null);
    setScoreError("");
    setDisplayMode("standard");
  }

  function handleOpenScoreDialog(match: ReadOnlyMatchCard) {
    const score = parseScore(match.score);
    setScoreError("");
    setScoreDraft({
      matchId: match.id,
      court: match.court,
      teamA: match.teamA,
      teamB: match.teamB,
      teamAPoints: score?.teamA ?? "",
      teamBPoints: score?.teamB ?? "",
      isEditing: score !== null,
    });
  }

  async function handleSaveRemoteScore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (scoreSaveInFlightRef.current) {
      return;
    }

    if (!scoreDraft || !session || session.accessLevel !== "score-entry" || session.kind !== "standard" || !session.tournamentCode || !session.shareToken) {
      setScoreError("Score kan kun gemmes med gyldig skriveadgang.");
      return;
    }

    let teamAPoints: number;
    let teamBPoints: number;

    try {
      const parsedTeamAPoints = parseRequiredRemoteScoreInput(scoreDraft.teamAPoints);
      const fixedTotalPoints = getFixedTotalPoints(session.state as LiveTournamentState);
      const score = fixedTotalPoints !== undefined
        ? calculateFixedTotalScore(fixedTotalPoints, parsedTeamAPoints)
        : {
            teamAPoints: parsedTeamAPoints,
            teamBPoints: parseRequiredRemoteScoreInput(scoreDraft.teamBPoints),
          };

      teamAPoints = score.teamAPoints;
      teamBPoints = score.teamBPoints;
    } catch (caughtError) {
      setScoreError(caughtError instanceof Error ? caughtError.message : "Scoren er ugyldig.");
      return;
    }

    scoreSaveInFlightRef.current = true;
    setIsSavingScore(true);
    setScoreError("");

    try {
      const response = await fetch("/api/supabase/tournament-access/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentCode: session.tournamentCode,
          shareToken: session.shareToken,
          matchId: scoreDraft.matchId,
          teamAPoints,
          teamBPoints,
          expectedUpdatedAt: session.updatedAt,
        }),
      });
      const body = await readRemoteJson(response) as RemoteScoreSaveResponse;

      if (!response.ok || !body.ok || body.kind !== "standard" || !body.state) {
        throw new Error(getRemoteScoreResponseErrorMessage(response.status, body.error, t));
      }

      const nextSession: RemoteTournamentSession = {
        ...session,
        kind: "standard",
        state: body.state,
        updatedAt: body.updatedAt,
      };

      applyRemoteSession(nextSession, { force: true });
      recordSuccessfulSync();
      setMessage("Score gemt.");
      setScoreDraft(null);
    } catch (caughtError) {
      setScoreError(caughtError instanceof TypeError ? t("remoteScoreNetworkError") : caughtError instanceof Error ? caughtError.message : t("remoteScoreSaveError"));
    } finally {
      scoreSaveInFlightRef.current = false;
      setIsSavingScore(false);
    }
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
      <div className={isTvMode ? "fixed inset-0 z-50 min-h-screen w-screen max-w-[100vw] overflow-auto overflow-x-hidden bg-[var(--background)] p-2 sm:p-4 lg:p-5" : "grid gap-3 sm:gap-4"}>
        {isScoreboardMode ? null : (
          <RemoteReadOnlyBanner
            onClose={handleClose}
            onRefresh={handleRefresh}
            onSetDisplayMode={(nextDisplayMode) => {
              if (nextDisplayMode !== "standard") {
                setScoreDraft(null);
                setScoreError("");
              }
              setDisplayMode(nextDisplayMode);
            }}
            onFullscreen={handleFullscreen}
            displayMode={displayMode}
            isLoading={isLoading}
            isTerminalError={Boolean(error && syncStatus === "error")}
            syncStatus={syncStatus}
            syncTelemetry={syncTelemetry}
            canEditScore={canEditRemoteScore}
          />
        )}
        {message && !isScoreboardMode ? <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-bold text-[var(--primary-strong)] sm:text-base">{message}</p> : null}
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
          <>
            <RemoteStandardView canEditScore={canEditRemoteScore} onEditScore={handleOpenScoreDialog} state={session.state as LiveTournamentState} isTvMode={isTvMode} />
            {scoreDraft ? (
              <RemoteScoreDialog
                draft={scoreDraft}
                error={scoreError}
                isSaving={isSavingScore}
                state={session.state as LiveTournamentState}
                onCancel={() => {
                  setScoreDraft(null);
                  setScoreError("");
                }}
                onChange={setScoreDraft}
                onSubmit={handleSaveRemoteScore}
              />
            ) : null}
          </>
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
            inputMode="numeric"
            maxLength={remoteAccessPinLength}
            pattern="[0-9]*"
            className="field-control font-mono"
            type={showToken ? "text" : "password"}
            value={shareToken}
            onChange={(event) => setShareToken(normalizeRemoteAccessPinInput(event.target.value))}
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
  canEditScore,
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
  canEditScore: boolean;
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
  const statusLabel = syncStatus === "reconnecting" ? t("remoteSyncRestoring") : t(statusCopy.label);
  const isTvMode = displayMode === "tv";
  const bannerLong = canEditScore ? t("remoteScoreEntryBanner") : t("remoteReadOnlyBanner");
  const bannerShort = canEditScore ? t("remoteScoreEntryShort") : t("remoteReadOnlyShort");

  if (isTvMode) {
    return (
      <section className="sticky top-0 z-10 w-full max-w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--card)] px-4 py-3 shadow-sm">
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-wide text-[var(--primary-strong)]">
                <span className="sm:hidden">{t("remoteReadOnlyShort")}</span>
                <span className="hidden sm:inline">{t("remoteReadOnlyBanner")}</span>
              </p>
              <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-black ${statusCopy.className}`} aria-label={t("remoteSyncStatus")}>
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
                {statusLabel}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-[var(--muted)]">
              {syncTelemetry.lastSuccessfulSyncAt ? <span>{t("remoteSyncLastUpdated")}: {formatRemoteSyncTime(syncTelemetry.lastSuccessfulSyncAt)}</span> : null}
              {!syncTelemetry.lastSuccessfulSyncAt && syncTelemetry.lastCheckedAt ? <span>{t("remoteSyncLastChecked")}: {formatRemoteSyncTime(syncTelemetry.lastCheckedAt)}</span> : null}
              {syncTelemetry.nextRetryAt ? <span>{t("remoteSyncNextRetry")}: {formatRemoteRetry(syncTelemetry.nextRetryAt)}</span> : null}
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button className="btn-primary-soft min-h-11 px-3 text-sm disabled:opacity-50" type="button" onClick={() => onSetDisplayMode("standard")}>
              {t("remoteStandardMode")}
            </button>
            <button className="btn-primary-soft min-h-11 px-3 text-sm disabled:opacity-50" type="button" onClick={() => onSetDisplayMode("scoreboard")}>
              {t("remoteScoreboardMode")}
            </button>
            <button className="btn-secondary min-h-11 px-3 text-sm disabled:opacity-50" type="button" onClick={onFullscreen}>
              {t("remoteFullscreen")}
            </button>
            <button className="btn-secondary min-h-11 px-3 text-sm disabled:opacity-50" type="button" disabled={isLoading} onClick={onRefresh}>
              {isLoading ? t("remoteLoadingTournament") : t("remoteRefresh")}
            </button>
            <button className="btn-outline-primary min-h-11 px-3 text-sm" type="button" onClick={onClose}>
              {isTerminalError ? t("remoteNewConnection") : t("remoteCloseView")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--card)] px-3 py-2 shadow-sm sm:px-4">
      <div className="flex w-full min-w-0 flex-wrap items-start justify-between gap-2 lg:items-center">
        <div className="min-w-[14rem] flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-black uppercase tracking-wide text-[var(--primary-strong)]">
              <span className="sm:hidden">{bannerShort}</span>
              <span className="hidden sm:inline">{bannerLong}</span>
            </p>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-black ${statusCopy.className}`} aria-label={t("remoteSyncStatus")}>
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-bold text-[var(--muted)] sm:text-sm">
            {syncTelemetry.lastSuccessfulSyncAt ? <span>{t("remoteSyncLastUpdated")}: {formatRemoteSyncTime(syncTelemetry.lastSuccessfulSyncAt)}</span> : null}
            {!syncTelemetry.lastSuccessfulSyncAt && syncTelemetry.lastCheckedAt ? <span>{t("remoteSyncLastChecked")}: {formatRemoteSyncTime(syncTelemetry.lastCheckedAt)}</span> : null}
            {syncTelemetry.nextRetryAt ? <span>{t("remoteSyncNextRetry")}: {formatRemoteRetry(syncTelemetry.nextRetryAt)}</span> : null}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-start gap-1.5 sm:justify-end" data-testid="remote-view-controls">
          <RemoteViewButton isActive={displayMode === "standard"} label={t("remoteStandardMode")} shortLabel="Standard" onClick={() => onSetDisplayMode("standard")} />
          <RemoteViewButton isActive={false} label={t("remoteTvMode")} shortLabel="TV" onClick={() => onSetDisplayMode("tv")} />
          <RemoteViewButton isActive={displayMode === "scoreboard"} label={t("remoteScoreboardMode")} shortLabel="Scoreboard" onClick={() => onSetDisplayMode("scoreboard")} />
          <button className="btn-secondary min-h-9 px-2.5 text-xs font-black sm:min-h-10 sm:px-3 sm:text-sm" type="button" onClick={onFullscreen}>
            {t("remoteFullscreen")}
          </button>
          <button className="btn-secondary min-h-9 px-2.5 text-xs font-black disabled:opacity-50 sm:min-h-10 sm:px-3 sm:text-sm" type="button" disabled={isLoading} onClick={onRefresh}>
            {isLoading ? t("remoteLoadingTournament") : t("remoteRefresh")}
          </button>
          <button aria-label={isTerminalError ? t("remoteNewConnection") : t("remoteCloseView")} className="btn-outline-primary min-h-9 px-2.5 text-xs font-black sm:min-h-10 sm:px-3 sm:text-sm" type="button" onClick={onClose}>
            <span className="sm:hidden">{isTerminalError ? t("remoteNewConnection") : "Luk"}</span>
            <span className="hidden sm:inline">{isTerminalError ? t("remoteNewConnection") : t("remoteCloseView")}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function RemoteViewButton({ isActive, label, onClick, shortLabel }: { isActive: boolean; label: string; onClick: () => void; shortLabel: string }) {
  return (
    <button
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      className={`${isActive ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "btn-primary-soft"} min-h-9 rounded-md border border-[var(--line)] px-2.5 text-xs font-black sm:min-h-10 sm:px-3 sm:text-sm`}
      type="button"
      onClick={onClick}
    >
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
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

function getRemoteScoreResponseErrorMessage(status: number, apiError: string | undefined, t: (key: TranslationKey) => string): string {
  if (status === 409 || apiError?.toLocaleLowerCase("en").includes("conflict")) {
    return t("remoteScoreConflictError");
  }

  if (status >= 500) {
    return t("remoteScoreSaveError");
  }

  return apiError || t("remoteScoreSaveError");
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
      standings={view.standings}
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
    wins: standing.won,
    draws: 0,
    losses: standing.lost,
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
  const density = getScoreboardDensity(matches.length);
  const standingsDensity = getScoreboardStandingsDensity(standings.length);
  const layoutRowsClass = getScoreboardLayoutRowsClass(density);
  const dashboardHeightClass = density === "high" ? "lg:h-[calc(100vh-0.5rem)] lg:pb-1" : "lg:h-[calc(100vh-2.5rem)] lg:pb-3";

  return (
    <div className={`mx-auto grid min-h-[calc(100vh-1rem)] w-full max-w-[1920px] gap-0.5 overflow-x-hidden pb-2 lg:min-h-0 ${dashboardHeightClass} ${layoutRowsClass} lg:overflow-hidden`} data-layout-density={density} data-standings-space={density === "high" ? "maximum" : "standard"} data-vertical-spacing="tight" data-testid="scoreboard-dashboard">
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
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0.5 lg:overflow-hidden" aria-label={t("liveScore")}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)] lg:text-base">{t("liveScore")}</h2>
          <span className="rounded-md bg-[var(--primary-soft)] px-2 py-1 text-xs font-black uppercase text-[var(--primary-strong)]">{matches.length} {t("courts").toLowerCase()}</span>
        </div>
        <RemoteScoreboardScoreGrid density={density} matches={matches} />
      </section>
      <RemoteScoreboardStandings density={standingsDensity} standings={standings} />
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
  const statusLabel = syncStatus === "reconnecting" ? t("remoteSyncRestoring") : t(statusCopy.label);

  return (
    <header className="grid gap-1.5 rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <h1 className="max-w-full text-[clamp(0.95rem,1.2vw,1.55rem)] font-black uppercase leading-tight" style={{ overflowWrap: "anywhere" }}>
          {t("appBrand")} <span className="text-[var(--muted)]">|</span> {title} <span className="text-[var(--muted)]">|</span> {roundLabel}
        </h1>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[0.68rem] font-black uppercase text-[var(--muted)] lg:text-xs">
          <span>{formatLabel}</span>
          <span aria-hidden="true">·</span>
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${statusCopy.className}`} aria-label={t("remoteSyncStatus")}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
            {statusLabel}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 lg:justify-end">
        <button className="btn-primary-soft min-h-7 px-2 text-[0.68rem]" type="button" onClick={onStandardView}>{t("remoteStandardMode")}</button>
        <button className="btn-secondary min-h-7 px-2 text-[0.68rem]" type="button" onClick={onFullscreen}>{t("remoteFullscreen")}</button>
        <button className="btn-secondary min-h-7 px-2 text-[0.68rem]" type="button" disabled={isLoading} onClick={onRefresh}>{isLoading ? t("remoteLoadingTournament") : t("remoteRefresh")}</button>
        <button className="btn-outline-primary min-h-7 px-2 text-[0.68rem]" type="button" onClick={onClose}>{t("remoteCloseView")}</button>
      </div>
    </header>
  );
}

function RemoteScoreboardScoreGrid({ density, matches }: { density: ScoreboardDensity; matches: ScoreboardMatchCard[] }) {
  const { t } = useAppTranslation();
  const isHighDensity = density === "high";
  const gridGap = isHighDensity ? "gap-0.5" : "gap-1";
  const cardLayoutClass = isHighDensity ? "grid-rows-[auto_minmax(0,1fr)] content-stretch" : "grid-rows-[auto_minmax(0,1fr)] content-between";
  const matchAreaWidthClass = density === "large" ? "w-[62%]" : density === "medium" ? "w-[68%]" : density === "compact" ? "w-[70%]" : "w-[68%]";

  return (
    <div className={`grid min-h-0 ${gridGap} lg:overflow-hidden ${getScoreboardCourtGridClass(matches.length)}`} data-density={density} data-testid="scoreboard-court-grid">
      {matches.map((match) => {
        const score = parseScore(match.score);

        return (
          <UnifiedCourtCard
            key={match.id}
            articleProps={{
              "data-card-density": density,
              "data-card-vertical-density": isHighDensity ? "final-compressed" : "standard",
            }}
            className={`${cardLayoutClass} ${getScoreboardMatchTone(match.status)}`}
            court={match.court}
            density={`scoreboard-${density}`}
            leftPlayers={splitCourtTeamName(match.teamA)}
            leftScore={score?.teamA}
            playerGridProps={{
              className: matchAreaWidthClass,
              "data-horizontal-layout": "33-50-67",
              "data-match-area": "centered",
              "data-match-area-width": density,
              "data-player-size": "enlarged",
              "data-vertical-position": "centered-in-card",
            }}
            rightPlayers={splitCourtTeamName(match.teamB)}
            rightScore={score?.teamB}
            status={match.status}
            testId="scoreboard-court-card"
            testIdPrefix="scoreboard"
            tone="plain"
            unsavedLabel={t("remoteNotSaved")}
          />
        );
      })}
    </div>
  );
}

function RemoteScoreboardStandings({ density, standings }: { density: ScoreboardStandingsDensity; standings: ScoreboardStanding[] }) {
  const { t } = useAppTranslation();
  const groups = chunkScoreboardStandings(standings);
  const labelText = density === "large" ? "text-sm lg:text-base" : density === "medium" ? "text-xs lg:text-sm" : "text-[0.68rem] lg:text-xs";
  const mobilePriorityGrid = "grid-cols-[1.45rem_minmax(7rem,1fr)_1.25rem_1.25rem_1.25rem_2rem_2.7rem] min-[360px]:grid-cols-[1.55rem_minmax(8rem,1fr)_1.35rem_1.35rem_1.35rem_2.2rem_2.9rem] min-[390px]:grid-cols-[1.65rem_minmax(9rem,1fr)_1.45rem_1.45rem_1.45rem_2.35rem_3.1rem]";
  const headerGridClass = density === "large"
    ? `${mobilePriorityGrid} gap-0.5 px-1 py-1 text-[0.58rem] sm:grid-cols-[2.25rem_minmax(12rem,1fr)_2.2rem_2.2rem_2.2rem_3.25rem_3.8rem] sm:gap-1.5 sm:px-2 sm:py-1.5 sm:text-xs lg:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem_2.75rem_2.75rem_4rem_4.75rem] lg:gap-2 lg:px-3 lg:py-2 lg:text-sm`
    : density === "medium"
      ? `${mobilePriorityGrid} gap-0.5 px-1 py-1 text-[0.58rem] sm:grid-cols-[2rem_minmax(11rem,1fr)_1.9rem_1.9rem_1.9rem_2.8rem_3.5rem] sm:gap-1 sm:px-1.5 sm:text-[0.64rem] lg:grid-cols-[2.1rem_minmax(0,1fr)_2.1rem_2.1rem_2.1rem_3.1rem_3.9rem] lg:gap-1.5 lg:px-2 lg:py-1.5 lg:text-xs`
      : `${mobilePriorityGrid} gap-0.5 px-1 py-1 text-[0.58rem] lg:grid-cols-[1.75rem_minmax(0,1fr)_1.8rem_1.8rem_1.8rem_2.6rem_3.25rem] lg:gap-1 lg:px-1.5 lg:text-[0.68rem]`;
  const rowGridClass = density === "large"
    ? `${mobilePriorityGrid} gap-0.5 px-1 py-1 sm:grid-cols-[2.25rem_minmax(12rem,1fr)_2.2rem_2.2rem_2.2rem_3.25rem_3.8rem] sm:gap-1.5 sm:px-2 sm:py-1.5 lg:grid-cols-[2.75rem_minmax(0,1fr)_2.75rem_2.75rem_2.75rem_4rem_4.75rem] lg:gap-2 lg:px-3 lg:py-2`
    : density === "medium"
      ? `${mobilePriorityGrid} gap-0.5 px-1 py-1 sm:grid-cols-[2rem_minmax(11rem,1fr)_1.9rem_1.9rem_1.9rem_2.8rem_3.5rem] sm:gap-1 sm:px-1.5 lg:grid-cols-[2.1rem_minmax(0,1fr)_2.1rem_2.1rem_2.1rem_3.1rem_3.9rem] lg:gap-1.5 lg:px-2 lg:py-1.5`
      : `${mobilePriorityGrid} gap-0.5 px-1 py-1 lg:grid-cols-[1.75rem_minmax(0,1fr)_1.8rem_1.8rem_1.8rem_2.6rem_3.25rem] lg:gap-1 lg:px-1.5`;
  const rankText = density === "large" ? "text-2xl lg:text-3xl" : density === "medium" ? "text-base lg:text-lg" : "text-sm lg:text-base";
  const playerText = density === "large" ? "text-lg lg:text-2xl" : density === "medium" ? "text-sm lg:text-base" : "text-[0.78rem] lg:text-sm";
  const statText = density === "large" ? "text-lg lg:text-2xl" : density === "medium" ? "text-sm lg:text-base" : "text-[0.78rem] lg:text-sm";

  if (!groups.length) {
    return null;
  }

  return (
    <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0.5 overflow-hidden pb-1" aria-label={t("remoteTopStandings")} data-bottom-safe="true">
      <h2 className={`${labelText} font-black uppercase tracking-wide text-[var(--muted)]`}>{t("remoteTopStandings")}</h2>
      <div className={`grid min-h-0 gap-1 overflow-hidden ${getScoreboardStandingsGridClass(groups.length)}`} data-density={density} data-testid="scoreboard-standings-grid">
        {groups.map((group, groupIndex) => (
          <div key={`standings-${groupIndex}`} className="min-h-0 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--card)]" data-testid="scoreboard-standings-column">
            <div className={`grid bg-[var(--primary-soft)] font-black uppercase text-[var(--primary-strong)] ${headerGridClass}`} data-column-layout="player-priority">
              <span>#</span>
              <span data-testid="scoreboard-standings-player-header" style={{ overflowWrap: "normal", wordBreak: "normal" }}>Spiller</span>
              <span className="text-right">V</span>
              <span className="text-right">U</span>
              <span className="text-right">T</span>
              <span className="text-right">MP</span>
              <span className="text-right">Point</span>
            </div>
            {group.map((row) => (
              <article
                key={row.id}
                aria-label={`${row.rank} ${row.name} V ${row.wins} U ${row.draws} T ${row.losses} MP ${row.matchPoints} Point ${row.pointsFor}`}
                className={`grid min-w-0 items-center border-t border-[var(--line)] ${rowGridClass}`}
                data-testid="scoreboard-standings-row"
                data-column-layout="player-priority"
              >
                <span className={`${rankText} font-black text-[var(--primary-strong)]`}>{row.rank}</span>
                <h3 className={`${playerText} min-w-0 font-black leading-tight`} data-testid="scoreboard-standings-player-name" style={{ overflowWrap: "normal", wordBreak: "normal" }}>{row.name}</h3>
                <p className={`${statText} text-right font-black text-[var(--muted)]`}>{row.wins}</p>
                <p className={`${statText} text-right font-black text-[var(--muted)]`}>{row.draws}</p>
                <p className={`${statText} text-right font-black text-[var(--muted)]`}>{row.losses}</p>
                <p className={`${statText} text-right font-black text-[var(--muted)]`}>{row.matchPoints}</p>
                <p className={`${statText} text-right font-black text-[var(--muted)]`}>{row.pointsFor}</p>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function RemoteStandardView({ canEditScore = false, isTvMode, onEditScore, state }: { canEditScore?: boolean; isTvMode: boolean; onEditScore?: (match: ReadOnlyMatchCard) => void; state: LiveTournamentState }) {
  const view = useMemo(() => createReadOnlyTournamentView(state), [state]);

  if (view.poolPlay) {
    return <RemotePoolPlayView view={view} poolPlay={view.poolPlay} isTvMode={isTvMode} />;
  }

  return <RemoteAmericanoView canEditScore={canEditScore} onEditScore={onEditScore} view={view} isTvMode={isTvMode} />;
}

function RemoteAmericanoView({ canEditScore, isTvMode, onEditScore, view }: { canEditScore: boolean; isTvMode: boolean; onEditScore?: (match: ReadOnlyMatchCard) => void; view: ReadOnlyTournamentView }) {
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
      <RemotePanel title={t("liveScore")} isTvMode={isTvMode}>
        <RemoteMatchScoreGrid canEditScore={canEditScore} matches={view.matches} onEditScore={onEditScore} isTvMode={isTvMode} />
      </RemotePanel>
      <RemotePanel title={t("remoteTopStandings")} isTvMode={isTvMode}>
        <RemoteStandingsList standings={topStandings} isTvMode={isTvMode} />
      </RemotePanel>
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
      <RemotePanel title={primaryMatches.length ? t("liveScore") : t("remoteNextPhase")} isTvMode={isTvMode}>
        {primaryMatches.length ? <RemoteMatchScoreGrid matches={primaryMatches} isTvMode={isTvMode} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
      </RemotePanel>
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
      <RemotePanel title={t("liveScore")} isTvMode={isTvMode}>
        {view.matches.length ? <RemoteMatchScoreGrid matches={view.matches} isTvMode={isTvMode} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">{t("remoteNoSavedLineup")}</p>}
      </RemotePanel>
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
  const primaryDetail = getRemotePrimaryHeaderDetail(details);

  if (isTvMode) {
    return (
      <section className="app-card grid min-w-0 max-w-full gap-3 overflow-hidden p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-end lg:p-7">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{eyebrow}</p>
          <h2 className="break-words text-2xl font-black leading-tight sm:text-4xl lg:text-6xl" style={{ overflowWrap: "anywhere", wordBreak: "normal" }}>{title}</h2>
          <p className="mt-2 text-xl font-bold text-[var(--muted)]">{details}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="app-card grid min-w-0 max-w-full gap-1.5 overflow-hidden p-3 sm:p-4" data-testid="remote-tournament-header">
      <div className="min-w-0">
        <h2 aria-label={title} className="break-words text-lg font-black uppercase leading-tight sm:text-2xl" style={{ overflowWrap: "anywhere", wordBreak: "normal" }}>
          LEZGO PADEL <span className="text-[var(--primary-strong)]">|</span> {title}{primaryDetail ? <> <span className="text-[var(--primary-strong)]">|</span> {primaryDetail}</> : null}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold uppercase text-[var(--muted)] sm:text-sm">
          <span>{eyebrow}</span>
          <span className="inline-flex items-center gap-1 text-[var(--primary-strong)]"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />LIVE</span>
          <span>{details}</span>
        </div>
      </div>
    </section>
  );
}

function getRemotePrimaryHeaderDetail(details: string): string {
  return details.match(/(?:Runde|Round)\s+\d+\s*\/\s*\d+/i)?.[0] ?? "";
}

function RemotePanel({ children, isTvMode, title }: { children: ReactNode; isTvMode: boolean; title: string }) {
  return (
    <section className="grid min-w-0 max-w-full gap-3 overflow-hidden">
      <h2 className={`${isTvMode ? "text-3xl lg:text-4xl" : "text-lg sm:text-xl"} font-black leading-tight`}>{title}</h2>
      {children}
    </section>
  );
}

function RemoteMatchScoreGrid({ canEditScore = false, isTvMode, matches, onEditScore }: { canEditScore?: boolean; isTvMode: boolean; matches: ReadOnlyMatchCard[]; onEditScore?: (match: ReadOnlyMatchCard) => void }) {
  const { t } = useAppTranslation();

  return (
    <div className={`grid min-w-0 max-w-full gap-3 ${isTvMode ? "" : "md:grid-cols-2"}`} data-testid="standard-remote-court-grid">
      {matches.map((match) => {
        const score = parseScore(match.score);

        if (isTvMode) {
          return (
            <UnifiedCourtCard
              key={match.id}
              className="lg:grid-cols-[auto_1fr_auto] lg:items-center"
              court={match.court}
              density="tv"
              leftPlayers={splitCourtTeamName(match.teamA)}
              leftScore={score?.teamA}
              rightPlayers={splitCourtTeamName(match.teamB)}
              rightScore={score?.teamB}
              status={match.status}
              testId="remote-tv-court-card"
              testIdPrefix="remote-tv-court"
              unsavedLabel={t("remoteNotSaved")}
            />
          );
        }

        return (
          <UnifiedCourtCard
            key={match.id}
            articleProps={{
              "data-card-style": "scoreboard-mobile",
              "data-dom-structure": "unified-court-card",
            }}
            actionLabel={canEditScore && onEditScore ? (score ? t("editScore") : t("enterScore")) : undefined}
            court={match.court}
            density="mobile"
            leftPlayers={splitCourtTeamName(match.teamA)}
            leftScore={score?.teamA}
            onAction={canEditScore && onEditScore ? () => onEditScore(match) : undefined}
            rightPlayers={splitCourtTeamName(match.teamB)}
            rightScore={score?.teamB}
            status={match.status}
            testId="standard-remote-court-card"
            testIdPrefix="standard-remote"
            unsavedLabel={t("remoteNotSaved")}
          />
        );
      })}
    </div>
  );
}

function RemoteScoreDialog({
  draft,
  error,
  isSaving,
  onCancel,
  onChange,
  onSubmit,
  state,
}: {
  draft: RemoteScoreDraft;
  error: string;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (draft: RemoteScoreDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  state: LiveTournamentState;
}) {
  const { t } = useAppTranslation();
  const leftScoreInputRef = useRef<HTMLInputElement>(null);
  const rightScoreInputRef = useRef<HTMLInputElement>(null);
  const fixedTotalPoints = getFixedTotalPoints(state);
  const parsedTeamAPoints = parseRemoteScoreInput(draft.teamAPoints);
  const fixedTotalCalculation = fixedTotalPoints !== undefined && parsedTeamAPoints !== null ? getRemoteFixedTotalCalculation(fixedTotalPoints, parsedTeamAPoints) : null;
  const calculatedTeamBPoints = fixedTotalCalculation && "score" in fixedTotalCalculation ? fixedTotalCalculation.score.teamBPoints : null;
  const fixedTotalError = fixedTotalCalculation && "error" in fixedTotalCalculation ? fixedTotalCalculation.error : "";
  const title = draft.isEditing ? t("editScore") : t("enterScore");
  const errorId = "remote-score-dialog-error";

  useEffect(() => {
    const input = leftScoreInputRef.current;

    if (!input) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      input.focus({ preventScroll: true });
      input.select();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  function handleScoreInputFocus(event: FocusEvent<HTMLInputElement>) {
    event.currentTarget.select();
  }

  function handleLeftScoreKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || fixedTotalPoints !== undefined || !draft.teamAPoints.trim()) {
      return;
    }

    event.preventDefault();
    rightScoreInputRef.current?.focus({ preventScroll: true });
    rightScoreInputRef.current?.select();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/30 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="remote-score-dialog-heading">
      <form className="grid max-h-[92svh] w-full max-w-2xl gap-4 overflow-y-auto overflow-x-hidden rounded-t-md border border-[var(--line)] bg-white p-4 shadow-2xl sm:rounded-md sm:p-5" data-testid="remote-score-dialog-form" onSubmit={onSubmit}>
        <div className="grid gap-1">
          <p className="text-sm font-black uppercase text-[var(--primary-strong)]">{draft.court}</p>
          <h2 id="remote-score-dialog-heading" className="text-3xl font-black uppercase leading-tight">{title}</h2>
        </div>

        {fixedTotalPoints !== undefined ? (
          <p className="rounded-md bg-[var(--primary-soft)] p-3 text-sm font-bold text-[var(--primary-strong)]">
            Fast samlet score: indtast venstre score. Højre score beregnes automatisk til samlet {fixedTotalPoints}.
          </p>
        ) : null}

        <div className="grid min-w-0 gap-3" data-testid="remote-score-entry-layout">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-end gap-2 text-center sm:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] sm:gap-4">
            <h3 className="min-w-0 text-lg font-black leading-tight sm:text-xl" style={{ overflowWrap: "break-word", wordBreak: "normal" }}>
              {draft.teamA}
            </h3>
            <span className="self-center text-sm font-black uppercase text-[var(--muted)]">VS</span>
            <h3 className="min-w-0 text-lg font-black leading-tight sm:text-xl" style={{ overflowWrap: "break-word", wordBreak: "normal" }}>
              {draft.teamB}
            </h3>
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-start gap-2 text-center sm:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] sm:gap-4">
            <label className="grid min-w-0 gap-2 font-bold">
              <span className="sr-only">{draft.teamA}</span>
              <span className="sr-only">Venstre score</span>
              <input
                ref={leftScoreInputRef}
                required
                inputMode="numeric"
                min="0"
                pattern="[0-9]*"
                aria-describedby={fixedTotalError || error ? errorId : undefined}
                className="field-control min-h-20 w-full text-center text-5xl font-black leading-none outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-soft)] disabled:bg-gray-100 sm:min-h-24 sm:text-6xl"
                disabled={isSaving}
                value={draft.teamAPoints}
                onChange={(event) => onChange({ ...draft, teamAPoints: event.target.value })}
                onFocus={handleScoreInputFocus}
                onKeyDown={handleLeftScoreKeyDown}
                aria-label="Venstre score"
              />
            </label>
            <span className="pt-6 text-lg font-black uppercase text-[var(--muted)] sm:pt-8 sm:text-xl">VS</span>
            <label className="grid min-w-0 gap-2 font-bold">
              <span className="sr-only">{draft.teamB}</span>
              <span className="sr-only">Højre score</span>
              {fixedTotalPoints !== undefined ? (
                <div className="grid min-w-0 gap-1">
                  <output className="field-control flex min-h-20 w-full items-center justify-center text-center text-5xl font-black leading-none sm:min-h-24 sm:text-6xl" aria-label="Højre score">
                    {calculatedTeamBPoints ?? "-"}
                  </output>
                  <span className="text-xs font-black uppercase text-[var(--muted)]">{t("remoteScoreAutomatic")}</span>
                </div>
              ) : (
                <input
                  ref={rightScoreInputRef}
                  required
                  inputMode="numeric"
                  min="0"
                  pattern="[0-9]*"
                  aria-describedby={fixedTotalError || error ? errorId : undefined}
                  className="field-control min-h-20 w-full text-center text-5xl font-black leading-none outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-soft)] disabled:bg-gray-100 sm:min-h-24 sm:text-6xl"
                  disabled={isSaving}
                  value={draft.teamBPoints}
                  onChange={(event) => onChange({ ...draft, teamBPoints: event.target.value })}
                  onFocus={handleScoreInputFocus}
                  aria-label="Højre score"
                />
              )}
            </label>
          </div>
        </div>

        {fixedTotalError || error ? <p id={errorId} className="rounded-md bg-red-50 p-3 font-bold text-red-700">{fixedTotalError || error}</p> : null}
        <div className="grid gap-2">
          <button className="min-h-14 w-full rounded-md bg-[var(--primary)] px-5 text-lg font-black uppercase text-[var(--primary-text)] disabled:bg-gray-300" type="submit" disabled={isSaving || Boolean(fixedTotalError)}>
            {isSaving ? t("remoteScoreSaving") : t("remoteScoreSave")}
          </button>
          <button className="min-h-11 justify-self-center rounded-md px-4 text-sm font-black uppercase text-[var(--muted)] disabled:opacity-50" type="button" disabled={isSaving} onClick={onCancel}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function RemoteStandingsList({ isTvMode, standings }: { isTvMode: boolean; standings: Array<{ id: string; rank: number; name: string; wins: number; draws: number; losses: number; matchPoints: number; pointsFor: number }> }) {
  const gridClass = isTvMode
    ? "grid-cols-[2.75rem_minmax(0,1fr)_2rem_2rem_2rem_3rem_3.5rem] sm:grid-cols-[4rem_minmax(0,1fr)_3.5rem_3.5rem_3.5rem_5rem_5.5rem]"
    : "grid-cols-[2rem_minmax(0,1fr)_1.55rem_1.55rem_1.55rem_2.25rem_2.85rem] min-[390px]:grid-cols-[2.25rem_minmax(0,1fr)_1.75rem_1.75rem_1.75rem_2.6rem_3.25rem]";
  const headerClass = isTvMode ? "px-3 text-xs sm:px-4 sm:text-sm" : "px-2 text-[0.63rem] sm:px-3 sm:text-xs";
  const rowClass = isTvMode ? "px-3 py-3 sm:px-4" : "px-2 py-2 sm:px-3 sm:py-3";
  const rankClass = isTvMode ? "text-4xl" : "text-xl sm:text-2xl";
  const textClass = isTvMode ? "text-2xl" : "text-sm min-[390px]:text-base sm:text-lg";

  return (
    <div className="max-w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--card)]" data-testid="standard-remote-standings">
      <div className={`grid ${gridClass} ${headerClass} gap-1 bg-[var(--primary-soft)] py-2 font-black uppercase text-[var(--primary-strong)] sm:gap-2`}>
        <span>#</span>
        <span>Spiller</span>
        <span className="text-right">V</span>
        <span className="text-right">U</span>
        <span className="text-right">T</span>
        <span className="text-right">MP</span>
        <span className="text-right">Point</span>
      </div>
      {standings.map((row) => (
        <article key={row.id} className={`grid ${gridClass} ${rowClass} items-center gap-1 border-t border-[var(--line)] sm:gap-2`}>
          <span className={`${rankClass} font-black text-[var(--primary-strong)]`}>{row.rank}</span>
          <h3 className={`${textClass} min-w-0 font-black leading-tight`} style={{ overflowWrap: "break-word", wordBreak: "normal" }}>{row.name}</h3>
          <p className={`${textClass} text-right font-black text-[var(--muted)]`}>{row.wins}</p>
          <p className={`${textClass} text-right font-black text-[var(--muted)]`}>{row.draws}</p>
          <p className={`${textClass} text-right font-black text-[var(--muted)]`}>{row.losses}</p>
          <p className={`${textClass} text-right font-black text-[var(--muted)]`}>{row.matchPoints}</p>
          <p className={`${textClass} text-right font-black text-[var(--muted)]`}>{row.pointsFor}</p>
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

function getInitialRemoteTournamentCode(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const code = new URLSearchParams(window.location.search).get("code") ?? "";
  return normalizeTournamentCodeInput(code);
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

function getScoreboardDensity(matchCount: number): ScoreboardDensity {
  if (matchCount <= 2) {
    return "large";
  }

  if (matchCount <= 4) {
    return "medium";
  }

  if (matchCount <= 6) {
    return "compact";
  }

  return "high";
}

function getScoreboardLayoutRowsClass(density: ScoreboardDensity): string {
  if (density === "large") {
    return "lg:grid-rows-[auto_minmax(0,0.56fr)_minmax(0,0.44fr)]";
  }

  if (density === "medium") {
    return "lg:grid-rows-[auto_minmax(0,0.58fr)_minmax(0,0.42fr)]";
  }

  if (density === "compact") {
    return "lg:grid-rows-[auto_minmax(0,0.64fr)_minmax(0,0.36fr)]";
  }

  return "lg:grid-rows-[auto_minmax(0,0.35fr)_minmax(0,0.65fr)]";
}

function getScoreboardStandingsDensity(standingCount: number): ScoreboardStandingsDensity {
  if (standingCount <= 8) {
    return "large";
  }

  if (standingCount <= 16) {
    return "medium";
  }

  return "compact";
}

function getScoreboardCourtGridClass(matchCount: number): string {
  if (matchCount <= 1) {
    return "grid-cols-1";
  }

  if (matchCount === 2) {
    return "md:grid-cols-2";
  }

  if (matchCount === 3) {
    return "md:grid-cols-3";
  }

  if (matchCount === 4) {
    return "sm:grid-cols-2 xl:grid-cols-4";
  }

  if (matchCount <= 6) {
    return "sm:grid-cols-2 xl:grid-cols-3";
  }

  return "sm:grid-cols-2 lg:grid-cols-4";
}

function getScoreboardStandingsGridClass(groupCount: number): string {
  if (groupCount <= 1) {
    return "grid-cols-1";
  }

  if (groupCount === 2) {
    return "lg:grid-cols-2";
  }

  if (groupCount === 3) {
    return "lg:grid-cols-3";
  }

  return "lg:grid-cols-4";
}

function chunkScoreboardStandings(standings: ScoreboardStanding[]): ScoreboardStanding[][] {
  const groups: ScoreboardStanding[][] = [];

  for (let index = 0; index < standings.length; index += 8) {
    groups.push(standings.slice(index, index + 8));
  }

  return groups;
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

function parseRemoteScoreInput(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const score = Number(normalized);

  return Number.isSafeInteger(score) ? score : null;
}

function parseRequiredRemoteScoreInput(value: string): number {
  const score = parseRemoteScoreInput(value);

  if (score === null) {
    throw new Error("Indtast en gyldig score.");
  }

  return score;
}

function getFixedTotalPoints(state: LiveTournamentState): number | undefined {
  return state.scoringMode === "Fast antal point" && state.fixedScoreRule === "total" ? state.fixedScorePoints : undefined;
}

function getRemoteFixedTotalCalculation(fixedScoreTotal: number, enteredScore: number): { score: ReturnType<typeof calculateFixedTotalScore> } | { error: string } {
  try {
    return { score: calculateFixedTotalScore(fixedScoreTotal, enteredScore) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Scoren er ugyldig." };
  }
}

function normalizeTournamentCodeInput(value: string): string {
  return value.trim().toLocaleUpperCase("en").replace(/\s+/g, "");
}

function normalizeRemoteAccessPinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, remoteAccessPinLength);
}

function isValidRemoteAccessPin(value: string): boolean {
  return new RegExp(`^\\d{${remoteAccessPinLength}}$`).test(value);
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

function hasManualScoreCredentials(session: RemoteTournamentSession | StoredRemoteSession): session is RemoteTournamentSession & { tournamentCode: string; shareToken: string } {
  return "accessMode" in session
    && session.accessMode === "manual"
    && typeof session.tournamentCode === "string"
    && session.tournamentCode.trim().length > 0
    && typeof session.shareToken === "string"
    && isValidRemoteAccessPin(session.shareToken);
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
