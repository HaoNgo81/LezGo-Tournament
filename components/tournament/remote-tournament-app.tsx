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

interface RemoteTournamentSession {
  accessMode: "manual" | "handoff";
  tournamentCode?: string;
  shareToken?: string;
  handoffReference?: string;
  kind: RemoteTournamentKind;
  state: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
}

interface RemoteReadResponse {
  ok?: boolean;
  kind?: RemoteTournamentKind;
  state?: LiveTournamentState | TeamVsTeamTournamentState;
  updatedAt?: string;
}

const remotePollIntervalMs = 4000;

export function RemoteTournamentApp({ initialHandoffReference }: { initialHandoffReference?: string } = {}) {
  const { t } = useAppTranslation();
  const autoOpenAttempted = useRef(false);
  const [tournamentCode, setTournamentCode] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [session, setSession] = useState<RemoteTournamentSession | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<RemoteSyncStatus>("connecting");

  const readRemoteTournament = useCallback(async (code: string, token: string): Promise<RemoteTournamentSession> => {
    const normalizedCode = normalizeTournamentCodeInput(code);
    const normalizedToken = token.trim();

    if (!normalizedCode || !normalizedToken) {
      throw new Error(t("remoteAccessDenied"));
    }

    const response = await fetch("/api/supabase/tournament-access/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentCode: normalizedCode, shareToken: normalizedToken }),
    });
    const body = await response.json() as RemoteReadResponse;

    if (!response.ok || !body.ok || !body.kind || !body.state) {
      throw new Error(t("remoteAccessDenied"));
    }

    return {
      accessMode: "manual",
      tournamentCode: normalizedCode,
      shareToken: normalizedToken,
      kind: body.kind,
      state: body.state,
      updatedAt: body.updatedAt,
    };
  }, [t]);

  const readRemoteHandoff = useCallback(async (handoffReference: string): Promise<RemoteTournamentSession> => {
    const normalizedReference = handoffReference.trim();

    if (!normalizedReference) {
      throw new Error(t("remoteHandoffDenied"));
    }

    try {
      const response = await fetch("/api/supabase/tournament-handoff/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffReference: normalizedReference }),
      });
      const body = await response.json() as RemoteReadResponse;

      if (!response.ok || !body.ok || !body.kind || !body.state) {
        throw new Error(response.status === 410 ? t("remoteHandoffExpired") : t("remoteHandoffDenied"));
      }

      return {
        accessMode: "handoff",
        handoffReference: normalizedReference,
        kind: body.kind,
        state: body.state,
        updatedAt: body.updatedAt,
      };
    } catch (caughtError) {
      throw caughtError instanceof Error ? caughtError : new Error(t("remoteHandoffDenied"));
    }
  }, [t]);

  const refreshRemoteSession = useCallback(async (currentSession: RemoteTournamentSession): Promise<RemoteTournamentSession> => {
    if (currentSession.accessMode === "handoff" && currentSession.handoffReference) {
      return readRemoteHandoff(currentSession.handoffReference);
    }

    return readRemoteTournament(currentSession.tournamentCode ?? "", currentSession.shareToken ?? "");
  }, [readRemoteHandoff, readRemoteTournament]);

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
      setSyncStatus("live");
      setMessage(keepPreviousOnFailure ? t("remoteLatestLoaded") : t("remoteTournamentOpened"));
    } catch {
      setSyncStatus(keepPreviousOnFailure ? "error" : "connecting");
      setError(keepPreviousOnFailure ? t("remoteFetchError") : t("remoteAccessDenied"));
    } finally {
      setIsLoading(false);
    }
  }, [applyRemoteSession, readRemoteTournament, t]);

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
      setSyncStatus("live");
      setMessage(keepPreviousOnFailure ? t("remoteLatestLoaded") : t("remoteTournamentOpened"));
    } catch (caughtError) {
      const fallbackMessage = keepPreviousOnFailure ? t("remoteFetchError") : t("remoteHandoffDenied");
      setSyncStatus(keepPreviousOnFailure ? "error" : "connecting");
      setError(caughtError instanceof Error ? caughtError.message : fallbackMessage);
      if (!keepPreviousOnFailure) {
        setMessage("");
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyRemoteSession, readRemoteHandoff, t]);

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    const activeSession = session;
    let isDisposed = false;
    let timeoutId: number | undefined;
    let isInFlight = false;

    async function poll() {
      if (isDisposed || isInFlight) {
        return;
      }

      isInFlight = true;

      try {
        const nextSession = await refreshRemoteSession(activeSession);

        if (isDisposed) {
          return;
        }

        applyRemoteSession(nextSession);
        setSyncStatus("live");
        setError("");
      } catch {
        if (isDisposed) {
          return;
        }

        setSyncStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error");
        setError(t("remoteAutoSyncError"));
      } finally {
        isInFlight = false;

        if (!isDisposed) {
          timeoutId = window.setTimeout(poll, remotePollIntervalMs);
        }
      }
    }

    timeoutId = window.setTimeout(poll, remotePollIntervalMs);

    return () => {
      isDisposed = true;

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [applyRemoteSession, refreshRemoteSession, session, t]);

  useEffect(() => {
    if (!initialHandoffReference || autoOpenAttempted.current) {
      return;
    }

    autoOpenAttempted.current = true;
    void openRemoteHandoff(initialHandoffReference, false);
  }, [initialHandoffReference, openRemoteHandoff]);

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await openRemoteTournament(tournamentCode, shareToken, false);
  }

  async function handleRefresh() {
    if (!session) {
      return;
    }

    if (session.accessMode === "handoff" && session.handoffReference) {
      await openRemoteHandoff(session.handoffReference, true);
      return;
    }

    await openRemoteTournament(session.tournamentCode ?? "", session.shareToken ?? "", true);
  }

  function handleClose() {
    setSession(null);
    setMessage("");
    setError("");
  }

  if (session) {
    return (
      <div className="grid gap-5">
        <RemoteReadOnlyBanner onClose={handleClose} onRefresh={handleRefresh} isLoading={isLoading} syncStatus={syncStatus} />
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

function RemoteReadOnlyBanner({ isLoading, onClose, onRefresh, syncStatus }: { isLoading: boolean; onClose: () => void; onRefresh: () => void; syncStatus: RemoteSyncStatus }) {
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
  if (currentSession.accessMode !== nextSession.accessMode) {
    return false;
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
