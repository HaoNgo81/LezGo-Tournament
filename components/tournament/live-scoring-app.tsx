"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  advanceLivePoolPlayState,
  advanceLivePoolPlayToFinals,
  calculateLiveStandings,
  canGoToNextRound,
  createCrossMatchPlacementTiebreaks,
  createMockLiveTournamentState,
  getPoolFinalProgress,
  getInitialPoolProgress,
  getLiveAmericanoCycleStatus,
  getNextPoolPhaseProgress,
  getLiveMatches,
  getPlayerName,
  getRoundProgress,
  goToNextRound,
  goToPreviousRound,
  isOpenEndedTournament,
  resetRoundTimer,
  saveMatchResult,
  saveInitialPoolResult,
  savePoolFinalResult,
  savePoolPlacementTiebreakResult,
  setLiveRankingMode,
  saveNextPoolPhaseResult,
  startRoundTimer,
  stopRoundTimer,
  tickRoundTimer,
  type LiveMatchView,
  type LiveTournamentState,
} from "@/lib/live-scoring";
import { CrossMatchStagePanel } from "@/components/tournament/cross-match-stage-panel";
import { StandingsTable } from "@/components/tournament/standings-table";
import { UnifiedCourtCard } from "@/components/tournament/unified-court-card";
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";
import { calculateInitialPoolStandings, createStandardShadowSaveLocalId, isLoadableStandardTournamentState, loadActiveCloudTournamentAuthority, loadActiveTournament, loadShadowSaveMetadata, markActiveCloudTournamentAuthority, markCloudTournamentRestored, markRemoteShadowSaveApplied, saveActiveTournament, saveActiveTournamentFromRemoteSync, saveCompletedTournament, type CloudTournamentAuthority, type CrossMatchFinalEncounter, type CrossMatchFinalStage, type PoolMatchResult, type PoolParticipant } from "@/lib/tournament-setup";
import { calculateFixedTotalScore } from "@/lib/tournament-setup/scoring";
import { loadTournamentSettings, playTournamentAlarmSound } from "@/lib/tournament-settings";
import type { MatchResult, StandingsRankingMode, TournamentPlayer } from "@/lib/tournament-engine";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

const rankingModeLabels: Record<StandingsRankingMode, TranslationKey> = {
  matchPointsFirst: "mostMatchPoints",
  partiPointsFirst: "mostScorePoints",
};
const organizerRemoteSyncIntervalMs = 2000;

interface OrganizerRemoteReadResponse {
  ok?: boolean;
  kind?: "standard" | "team-vs-team";
  state?: LiveTournamentState;
  tournamentId?: string;
  updatedAt?: string;
  matchScoreVersions?: Record<string, number>;
  canRead?: boolean;
  canManage?: boolean;
  createdByUserId?: string | null;
  controllerUserId?: string | null;
  ownerUserId?: string | null;
  conflict?: boolean;
  error?: string;
}

interface ShadowSaveWriteResponse {
  ok?: boolean;
  conflict?: boolean;
  kind?: "standard" | "team-vs-team";
  state?: LiveTournamentState;
  tournamentId?: string;
  updatedAt?: string;
  organizerToken?: string;
  matchScoreVersions?: Record<string, number>;
  canRead?: boolean;
  canManage?: boolean;
  createdByUserId?: string | null;
  controllerUserId?: string | null;
  ownerUserId?: string | null;
  error?: string;
}

type CommitResult = boolean | Promise<boolean>;

interface LiveRenderState {
  ok: boolean;
  isPoolPlay: boolean;
  liveMatches: LiveMatchView[];
  standings: ReturnType<typeof calculateLiveStandings>;
  roundProgress: ReturnType<typeof getRoundProgress> | null;
  poolMatchViews: PoolMatchView[];
  nextPoolMatchViews: PoolMatchView[];
  finalPoolMatchViews: PoolMatchView[];
  placementTiebreakMatchViews: PoolMatchView[];
  poolProgress: ReturnType<typeof getInitialPoolProgress> | null;
  nextPoolProgress: ReturnType<typeof getNextPoolPhaseProgress>;
  finalPoolProgress: ReturnType<typeof getPoolFinalProgress>;
  nextRoundIsAvailable: boolean;
}

export function LiveScoringApp() {
  const { t } = useAppTranslation();
  const [state, setState] = useState<LiveTournamentState>(() => createMockLiveTournamentState());
  const [hasActiveTournament, setHasActiveTournament] = useState(true);
  const [cloudAuthority, setCloudAuthority] = useState<CloudTournamentAuthority | null>(null);
  const stateRef = useRef(state);
  const hasHydrated = useHasHydrated();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const alarmPlayedForRound = useRef<number | null>(null);
  const controllerMutationInFlightRef = useRef(false);
  const renderState = useMemo(() => createLiveRenderState(state), [state]);
  const liveMatches = renderState.liveMatches;
  const standings = renderState.standings;
  const roundProgress = renderState.roundProgress;
  const poolMatchViews = renderState.poolMatchViews;
  const nextPoolMatchViews = renderState.nextPoolMatchViews;
  const finalPoolMatchViews = renderState.finalPoolMatchViews;
  const placementTiebreakMatchViews = renderState.placementTiebreakMatchViews;
  const poolProgress = renderState.poolProgress;
  const nextPoolProgress = renderState.nextPoolProgress;
  const finalPoolProgress = renderState.finalPoolProgress;
  const selectedMatch = liveMatches.find((liveMatch) => liveMatch.match.id === selectedMatchId) ?? null;
  const selectedPoolMatch = [...poolMatchViews, ...nextPoolMatchViews, ...finalPoolMatchViews, ...placementTiebreakMatchViews].find((match) => match.id === selectedMatchId) ?? null;
  const nextRoundIsAvailable = renderState.nextRoundIsAvailable;
  const rankingModeIsLocked = state.format === "mexicano" || state.format === "fixed-partner-mexicano";
  const currentLocalId = createStandardShadowSaveLocalId(state);
  const activeCloudAuthority = cloudAuthority?.kind === "standard" && cloudAuthority.localId === currentLocalId ? cloudAuthority : null;
  const isControllerReadOnly = Boolean(activeCloudAuthority && activeCloudAuthority.canManage === false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const loadedTournament = loadActiveTournament();
      const loadedState = loadedTournament ?? createMockLiveTournamentState();
      const loadedLocalId = createStandardShadowSaveLocalId(loadedState);
      setHasActiveTournament(Boolean(loadedTournament));
      stateRef.current = loadedState;
      setState(loadedState);
      setCloudAuthority(loadActiveCloudTournamentAuthority("standard", loadedLocalId));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  useEffect(() => {
    if (isControllerReadOnly || (state.roundTimer?.status !== "countdown" && state.roundTimer?.status !== "running")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setState((currentState) => {
        const nextState = tickRoundTimer(currentState);
        saveActiveTournament(nextState);
        return nextState;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isControllerReadOnly, state.roundTimer?.status]);

  const applyOrganizerRemoteAuthority = useCallback((localId: string, body: OrganizerRemoteReadResponse | ShadowSaveWriteResponse): void => {
    if (body.kind !== "standard" || !body.tournamentId || typeof body.canManage !== "boolean") {
      return;
    }

    markActiveCloudTournamentAuthority({
      source: "server",
      kind: "standard",
      localId,
      tournamentId: body.tournamentId,
      canRead: body.canRead ?? true,
      canManage: body.canManage,
      createdByUserId: body.createdByUserId,
      controllerUserId: body.controllerUserId,
      ownerUserId: body.ownerUserId,
    });
    setCloudAuthority(loadActiveCloudTournamentAuthority("standard", localId));
  }, []);

  const applyOrganizerRemoteBody = useCallback((localId: string, body: OrganizerRemoteReadResponse | ShadowSaveWriteResponse): void => {
    if (body.kind !== "standard" || !body.state || !body.tournamentId) {
      return;
    }

    if (!isLoadableStandardTournamentState(body.state)) {
      applyOrganizerRemoteAuthority(localId, body);
      return;
    }

    saveActiveTournamentFromRemoteSync(body.state);
    markCloudTournamentRestored({
      localId,
      legacyLocalId: localId,
      kind: "standard",
      tournamentId: body.tournamentId,
      updatedAt: body.updatedAt,
      canManage: body.canManage,
      matchScoreVersions: body.matchScoreVersions,
    });

    applyOrganizerRemoteAuthority(localId, body);

    stateRef.current = body.state;
    setState(body.state);

    if (selectedMatchId && !doesStateContainSelectedMatch(body.state, selectedMatchId)) {
      setSelectedMatchId(null);
    }
  }, [applyOrganizerRemoteAuthority, selectedMatchId]);

  useEffect(() => {
    if (!hasHydrated || state.status !== "active") {
      return undefined;
    }

    let isDisposed = false;
    let timeoutId: number | undefined;
    let isInFlight = false;

    async function pollOrganizerRemoteState() {
      if (isDisposed || isInFlight) {
        return;
      }

      const currentState = stateRef.current;
      const localId = createStandardShadowSaveLocalId(currentState);
      const metadata = loadShadowSaveMetadata(localId);

      if (!metadata?.supabaseTournamentId || metadata.kind !== "standard" || metadata.status === "conflict") {
        scheduleNextPoll();
        return;
      }

      isInFlight = true;

      try {
        const { response, body } = await readOrganizerRemoteState(metadata, localId);

        if (!isUsableOrganizerRemoteBody(response, body, metadata.supabaseTournamentId)) {
          return;
        }

        const latestMetadata = loadShadowSaveMetadata(localId);

        if (latestMetadata?.status && latestMetadata.status !== "synced") {
          return;
        }

        if (shouldApplyOrganizerRemoteBody(latestMetadata?.lastShadowSaveVersion, body, currentState, latestMetadata?.matchScoreVersions)) {
          applyOrganizerRemoteBody(localId, body);
        } else if (typeof body.canManage === "boolean") {
          applyOrganizerRemoteAuthority(localId, body);
        }
      } catch {
        // Organizer sync is best-effort; the local tournament remains primary if remote read fails.
      } finally {
        isInFlight = false;
        scheduleNextPoll();
      }
    }

    function scheduleNextPoll() {
      if (!isDisposed) {
        timeoutId = window.setTimeout(pollOrganizerRemoteState, organizerRemoteSyncIntervalMs);
      }
    }

    function triggerImmediatePoll() {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }

      void pollOrganizerRemoteState();
    }

    function handleOnline() {
      triggerImmediatePoll();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        triggerImmediatePoll();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    triggerImmediatePoll();

    return () => {
      isDisposed = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [applyOrganizerRemoteAuthority, applyOrganizerRemoteBody, hasHydrated, state.status, state.tournamentName, state.format]);

  useEffect(() => {
    if (state.scoringMode === "Spil på tid" && state.roundTimer?.status === "expired" && alarmPlayedForRound.current !== state.roundTimer.roundNumber) {
      alarmPlayedForRound.current = state.roundTimer.roundNumber;
      void playTournamentAlarmSound(loadTournamentSettings().alarmSound, 3);
    }
  }, [state.roundTimer, state.scoringMode]);

  function commitState(updater: (currentState: LiveTournamentState) => LiveTournamentState): CommitResult {
    if (isControllerReadOnly) {
      setToast(t("remoteControlledByOtherUser"));
      return false;
    }

    const nextState = updater(stateRef.current);
    const cloudSaveAccepted = saveControlledCloudSnapshot(nextState);

    if (cloudSaveAccepted instanceof Promise) {
      return cloudSaveAccepted.then((accepted) => {
        if (!accepted) {
          return false;
        }

        if (nextState.status === "finished") {
          saveCompletedTournament(nextState);
        }
        stateRef.current = nextState;
        setState(nextState);
        return true;
      });
    }

    if (!cloudSaveAccepted) {
      return false;
    }

    if (nextState.status === "finished") {
      saveCompletedTournament(nextState);
    }
    stateRef.current = nextState;
    setState(nextState);
    return true;
  }

  function afterCommit(result: CommitResult, onSuccess: () => void): void {
    if (typeof result === "boolean") {
      if (result) {
        onSuccess();
      }
      return;
    }

    void result.then((committed) => {
      if (committed) {
        onSuccess();
      }
    }).catch((caughtError) => {
      setToast(caughtError instanceof Error ? caughtError.message : "Handlingen kunne ikke gemmes.");
    });
  }

  if (!hasHydrated) {
    return <div className="app-card p-4 font-bold text-[var(--muted)]">{t("loadingTournament")}</div>;
  }

  function handleStartTimer() {
    try {
      afterCommit(commitState((currentState) => startRoundTimer(currentState)), () => setToast("Ur startet."));
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Uret kunne ikke startes.");
    }
  }

  function handleSave(result: MatchResult) {
    try {
      const ownedCloudSave = saveOwnedCloudMatchResult(result);

      if (ownedCloudSave) {
        void ownedCloudSave.catch((error) => {
          setToast(error instanceof Error ? error.message : "Resultatet kunne ikke gemmes.");
        });
        return;
      }

      afterCommit(commitState((currentState) => saveMatchResult(currentState, result)), () => {
        setSelectedMatchId(null);
        setToast("Resultat gemt.");
      });
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Resultatet kunne ikke gemmes.");
    }
  }

  function saveOwnedCloudMatchResult(result: MatchResult): Promise<void | false> | null {
    const currentState = stateRef.current;
    const localId = createStandardShadowSaveLocalId(currentState);
    const metadata = loadShadowSaveMetadata(localId);

    if (!metadata?.supabaseTournamentId || metadata.kind !== "standard" || metadata.status !== "synced") {
      return null;
    }

    const tournamentId = metadata.supabaseTournamentId;
    const expectedScoreVersion = metadata.matchScoreVersions?.[result.matchId];

    if (!expectedScoreVersion) {
      if (hasKnownMatchScoreVersions(metadata.matchScoreVersions) && doesStateContainSelectedMatch(currentState, result.matchId)) {
        return runControllerMutation(async () => {
          const synced = await performControlledCloudSnapshotSave(currentState, localId, tournamentId, metadata);

          if (!synced) {
            return false;
          }

          const refreshedMetadata = loadShadowSaveMetadata(localId);
          const refreshedScoreVersion = refreshedMetadata?.matchScoreVersions?.[result.matchId];

          if (!refreshedScoreVersion) {
            await reconcileSameControllerConflict(localId, tournamentId, {});
            setSelectedMatchId(null);
            setToast(t("ownerTournamentConflictMessage"));
            return false;
          }

          return performOwnedCloudMatchSave(result, localId, tournamentId, refreshedScoreVersion);
        });
      }

      return reconcileSameControllerConflict(localId, tournamentId, {})
        .then(() => {
          setSelectedMatchId(null);
          setToast(t("ownerTournamentConflictMessage"));
        });
    }

    return runControllerMutation(() => performOwnedCloudMatchSave(result, localId, tournamentId, expectedScoreVersion));
  }

  async function performOwnedCloudMatchSave(result: MatchResult, localId: string, tournamentId: string, expectedScoreVersion: number): Promise<void> {
    const response = await fetch(`/api/account/tournaments/${encodeURIComponent(tournamentId)}/score`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId: result.matchId,
        teamAPoints: result.teamAPoints,
        teamBPoints: result.teamBPoints,
        expectedScoreVersion,
      }),
    });
    const body = await response.json() as OrganizerRemoteReadResponse;

    if (response.status === 409 && body.state && body.updatedAt) {
      saveActiveTournamentFromRemoteSync(body.state);
      markRemoteShadowSaveApplied(localId, "standard", body.updatedAt, new Date().toISOString(), body.matchScoreVersions);
      stateRef.current = body.state;
      setState(body.state);
      setSelectedMatchId(null);
      setToast(t("ownerScoreConflictMessage"));
      return;
    }

    if (response.status === 401 || response.status === 403) {
      void reconcileControlLost(localId, tournamentId);
      setSelectedMatchId(null);
      setToast(t("remoteControlledByOtherUser"));
      return;
    }

    if (!response.ok || !body.ok || body.kind !== "standard" || !body.state || !body.updatedAt) {
      throw new Error(body.error ?? "Resultatet kunne ikke gemmes.");
    }

    saveActiveTournamentFromRemoteSync(body.state);
    markRemoteShadowSaveApplied(localId, "standard", body.updatedAt, new Date().toISOString(), body.matchScoreVersions);
    stateRef.current = body.state;
    setState(body.state);
    setSelectedMatchId(null);
    setToast("Resultat gemt.");
  }

  function saveControlledCloudSnapshot(nextState: LiveTournamentState): CommitResult {
    const localId = createStandardShadowSaveLocalId(stateRef.current);
    const metadata = loadShadowSaveMetadata(localId);

    if (!metadata?.supabaseTournamentId || metadata.kind !== "standard") {
      saveActiveTournament(nextState);
      return true;
    }

    const tournamentId = metadata.supabaseTournamentId;

    if (metadata.canManage === false) {
      setToast(t("remoteControlledByOtherUser"));
      return false;
    }

    return runControllerMutation(() => performControlledCloudSnapshotSave(nextState, localId, tournamentId, metadata));
  }

  async function performControlledCloudSnapshotSave(
    nextState: LiveTournamentState,
    localId: string,
    tournamentId: string,
    metadata: NonNullable<ReturnType<typeof loadShadowSaveMetadata>>,
  ): Promise<boolean> {
    const response = await fetch("/api/supabase/shadow-save", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: metadata.legacyLocalId ?? localId,
        tournamentId,
        expectedUpdatedAt: metadata.lastShadowSaveVersion,
        state: nextState,
      }),
    });
    const body = await parseShadowSaveWriteResponse(response);

    if (response.status === 401 || response.status === 403) {
      await reconcileControlLost(localId, tournamentId);
      setToast(t("remoteControlledByOtherUser"));
      return false;
    }

    if (response.status === 409) {
      await reconcileSameControllerConflict(localId, tournamentId, body);
      setToast(t("ownerTournamentConflictMessage"));
      return false;
    }

    if (!response.ok || !body.ok || !body.tournamentId) {
      setToast(body.error ?? "Synchronization failed. Local tournament is preserved.");
      return false;
    }

    saveActiveTournamentFromRemoteSync(nextState);
    markRemoteShadowSaveApplied(localId, "standard", body.updatedAt, new Date().toISOString(), body.matchScoreVersions);
    return true;
  }

  async function runControllerMutation<T>(operation: () => Promise<T>): Promise<T | false> {
    if (controllerMutationInFlightRef.current) {
      setToast("Gemmer allerede. Vent et øjeblik.");
      return false;
    }

    controllerMutationInFlightRef.current = true;

    try {
      return await operation();
    } finally {
      controllerMutationInFlightRef.current = false;
    }
  }

  async function reconcileSameControllerConflict(localId: string, tournamentId: string, conflictBody: ShadowSaveWriteResponse): Promise<void> {
    if (conflictBody.kind === "standard" && conflictBody.state && conflictBody.updatedAt) {
      applyOrganizerRemoteBody(localId, conflictBody);
      return;
    }

    try {
      const response = await fetch(`/api/account/tournaments/${encodeURIComponent(tournamentId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json() as OrganizerRemoteReadResponse;

      if (response.ok && body.ok && body.kind === "standard" && body.state) {
        applyOrganizerRemoteBody(localId, body);
      }
    } catch {
      // The stale write is still rejected server-side; the next remote poll can refresh the UI.
    }
  }

  function markCurrentCloudAuthorityReadOnly(localId: string, tournamentId: string) {
    const authority: CloudTournamentAuthority = {
      ...(activeCloudAuthority ?? {
        source: "server",
        kind: "standard",
        localId,
        tournamentId,
        canRead: true,
        canManage: true,
      }),
      source: "server",
      kind: "standard",
      localId,
      tournamentId,
      canRead: true,
      canManage: false,
    };

    markActiveCloudTournamentAuthority(authority);
    markCloudTournamentRestored({
      localId,
      kind: "standard",
      tournamentId,
      canManage: false,
    });
    setCloudAuthority(authority);
  }

  async function reconcileControlLost(localId: string, tournamentId: string): Promise<void> {
    try {
      const response = await fetch(`/api/account/tournaments/${encodeURIComponent(tournamentId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json() as OrganizerRemoteReadResponse;

      if (response.ok && body.ok && body.kind === "standard" && body.state) {
        saveActiveTournamentFromRemoteSync(body.state);
        markCloudTournamentRestored({
          localId,
          legacyLocalId: localId,
          kind: "standard",
          tournamentId,
          updatedAt: body.updatedAt,
          canManage: false,
          matchScoreVersions: body.matchScoreVersions,
        });
        stateRef.current = body.state;
        setState(body.state);
      }
    } catch {
      // Losing control should still make the stale client read-only even if the refresh is unavailable.
    } finally {
      markCurrentCloudAuthorityReadOnly(localId, tournamentId);
    }
  }

  function handleSavePoolResult(result: PoolMatchResult) {
    afterCommit(commitState((currentState) => saveInitialPoolResult(currentState, result)), () => {
      setSelectedMatchId(null);
      setToast("Puljeresultat gemt.");
    });
  }

  function handleSavePoolScore(result: PoolMatchResult) {
    if (selectedPoolMatch?.stage === "placementTiebreak") {
      afterCommit(commitState((currentState) => savePoolPlacementTiebreakResult(currentState, result)), () => {
        setSelectedMatchId(null);
        setToast("Tiebreak-resultat gemt.");
      });
      return;
    }

    if (selectedPoolMatch?.stage === "final") {
      afterCommit(commitState((currentState) => savePoolFinalResult(currentState, result)), () => {
        setSelectedMatchId(null);
        setToast("Finaleresultat gemt.");
      });
      return;
    }

    if (selectedPoolMatch?.stage === "next") {
      afterCommit(commitState((currentState) => saveNextPoolPhaseResult(currentState, result)), () => {
        setSelectedMatchId(null);
        setToast("Næste faseresultat gemt.");
      });
      return;
    }

    handleSavePoolResult(result);
  }

  function handleAdvancePoolPlay() {
    try {
      const phase = state.poolPlay?.phase;
      afterCommit(commitState((currentState) => (
        currentState.poolPlay?.phase === "crossMatches"
          ? advanceLivePoolPlayToFinals(currentState)
          : advanceLivePoolPlayState(currentState)
      )), () => {
        setSelectedMatchId(null);
        setToast(phase === "crossMatches" ? "Finaler oprettet." : "Næste fase oprettet.");
      });
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Fasen kan ikke oprettes endnu.");
    }
  }

  function handleStopTimer() {
    afterCommit(commitState((currentState) => stopRoundTimer(currentState)), () => setToast("Uret er stoppet."));
  }

  function handleResetTimer() {
    afterCommit(commitState((currentState) => resetRoundTimer(currentState)), () => setToast("Uret er nulstillet."));
  }

  function handleRankingModeChange(rankingMode: StandingsRankingMode) {
    afterCommit(commitState((currentState) => setLiveRankingMode(currentState, rankingMode)), () => undefined);
  }

  function handlePreviousRound() {
    afterCommit(commitState((currentState) => goToPreviousRound(currentState)), () => {
      setSelectedMatchId(null);
      setToast("");
    });
  }

  function handleNextRound() {
    try {
      afterCommit(commitState((currentState) => goToNextRound(currentState)), () => {
        setSelectedMatchId(null);
        setToast("Næste runde åbnet.");
      });
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Næste runde kan ikke åbnes endnu.");
    }
  }

  if (hasHydrated && (!hasActiveTournament || !renderState.ok)) {
    return <EmptyLiveTournamentState />;
  }

  if (state.poolPlay && poolProgress) {
    return (
      <PoolPlayLiveView
        state={state as LiveTournamentState & { poolPlay: NonNullable<LiveTournamentState["poolPlay"]> }}
        poolMatchViews={poolMatchViews}
        nextPoolMatchViews={nextPoolMatchViews}
        finalPoolMatchViews={finalPoolMatchViews}
        placementTiebreakMatchViews={placementTiebreakMatchViews}
        poolProgress={poolProgress}
        nextPoolProgress={nextPoolProgress}
        finalPoolProgress={finalPoolProgress}
        selectedMatch={selectedPoolMatch}
        isControllerReadOnly={isControllerReadOnly}
        toast={toast}
        onAdvance={handleAdvancePoolPlay}
        onCloseScoreSheet={() => setSelectedMatchId(null)}
        onSaveResult={handleSavePoolScore}
        onSelectMatch={setSelectedMatchId}
      />
    );
  }

  return (
    <div className="grid gap-3 sm:gap-5" data-testid="live-layout">
      {(() => {
        const americanoCycleStatus = getLiveAmericanoCycleStatus(state);
        const openEndedMexicano = state.format === "mexicano" && isOpenEndedTournament(state);
        const totalRoundLabel = openEndedMexicano ? null : `${state.configuredRounds ?? state.rounds.length} ${t("rounds").toLowerCase()}`;
        const activeRoundLabel = openEndedMexicano || americanoCycleStatus ? `${state.activeRoundNumber}` : `${state.activeRoundNumber} / ${state.configuredRounds ?? state.rounds.length}`;
        const rotationLabel = americanoCycleStatus
          ? `Rotation ${americanoCycleStatus.cycleNumber} · ${americanoCycleStatus.roundInCycle}/${americanoCycleStatus.cycleLength}`
          : null;
        const activeRound = state.rounds.find((round) => round.roundNumber === state.activeRoundNumber) ?? null;
        const byeLabel = createByeLabel(state, activeRound?.byePlayerIds ?? []);
        const roundStatusLabel = americanoCycleStatus?.isCycleComplete && roundProgress?.isComplete
          ? `Rotation ${americanoCycleStatus.cycleNumber} færdig`
          : roundProgress?.isComplete ? t("roundComplete") : t("roundIncomplete");

        return (
          <>
      <div className="app-card p-3 sm:px-4 sm:py-3" data-testid="live-compact-mobile-header">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-[0.72rem] font-bold uppercase leading-none text-[var(--primary-strong)] sm:text-xs">{state.status === "finished" ? t("completedTournament") : t("activeTournament")}</p>
            <h2 className="mt-1 text-xl font-black leading-tight sm:text-2xl">{state.tournamentName}</h2>
            <p className="mt-0.5 text-xs font-bold text-[var(--muted)] sm:text-sm">{state.players.length} {t("players").toLowerCase()}{totalRoundLabel ? ` · ${totalRoundLabel}` : null}</p>
            {rotationLabel ? <p className="mt-1 text-xs font-black text-[var(--primary-strong)] sm:text-sm">{rotationLabel}</p> : null}
          </div>
          {!isControllerReadOnly ? <ScreenMirroringControl /> : null}
        </div>
        {isControllerReadOnly ? <div className="mt-2 sm:mt-3"><ControllerReadOnlyNotice /></div> : null}
      </div>

      <div className="grid gap-2 sm:gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(220px,1.2fr)]">
        <div className="app-card grid grid-cols-3 divide-x divide-[var(--line)] overflow-hidden text-center sm:contents" data-testid="live-mobile-round-summary">
          <MetricBlock label={t("round")} value={activeRoundLabel} />
          <MetricBlock label={t("matches")} value={`${liveMatches.length}`} />
          <MetricBlock label={t("savedShort")} value={`${roundProgress?.completedMatches ?? 0} / ${roundProgress?.totalMatches ?? 0}`} />
        </div>
        <div className="grid gap-2 text-sm font-bold text-[var(--muted)]">
          <span>{t("rankingSort")}</span>
          {rankingModeIsLocked || isControllerReadOnly ? (
            <p className="field-control flex items-center text-base font-black">{t(rankingModeLabels[state.rankingMode])}</p>
          ) : (
            <select className="field-control text-base font-black" value={state.rankingMode} onChange={(event) => handleRankingModeChange(event.target.value as StandingsRankingMode)}>
              {Object.entries(rankingModeLabels).map(([value, labelKey]) => (
                <option key={value} value={value}>{t(labelKey)}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {state.scoringMode === "Spil på tid" && !isControllerReadOnly ? <RoundTimerPanel state={state} onReset={handleResetTimer} onStart={handleStartTimer} onStop={handleStopTimer} /> : null}
      <section className="app-card grid gap-1.5 p-2.5 sm:gap-3 sm:p-5" data-testid="live-round-navigation-card">
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div>
            <h2 className="text-lg font-black sm:text-xl">{t("round")} {state.activeRoundNumber}</h2>
            <p className="text-xs font-bold text-[var(--muted)] sm:text-sm">
              {roundStatusLabel}
            </p>
            {byeLabel ? <p className="mt-1 text-xs font-black text-[var(--primary-strong)] sm:text-sm" data-testid="live-round-byes">{byeLabel}</p> : null}
          </div>
          {!isControllerReadOnly ? <RoundNavigationButtons canGoPrevious={state.activeRoundNumber > 1} canGoNext={nextRoundIsAvailable} onNext={handleNextRound} onPrevious={handlePreviousRound} /> : null}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 sm:h-3">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${((roundProgress?.completedMatches ?? 0) / (roundProgress?.totalMatches ?? 1)) * 100}%` }} />
        </div>
      </section>

      {toast ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{toast}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start" data-testid="live-desktop-content-grid">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-black">{t("matches")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" data-testid="live-match-card-grid">
            {liveMatches.map((liveMatch) => (
              <LiveMatchCard key={liveMatch.match.id} liveMatch={liveMatch} players={state.players} isReadOnly={isControllerReadOnly} onSelect={() => setSelectedMatchId(liveMatch.match.id)} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2" data-testid="live-standings-section">
          <h2 className="text-xl font-black uppercase">{t("remoteTopStandings")}</h2>
          <StandingsTable standings={standings} variant="compactLive" />
          {!isControllerReadOnly ? <RoundNavigationButtons canGoPrevious={state.activeRoundNumber > 1} canGoNext={nextRoundIsAvailable} onNext={handleNextRound} onPrevious={handlePreviousRound} testId="live-bottom-round-navigation" /> : null}
        </section>
      </div>

      {selectedMatch && !isControllerReadOnly ? (
        <ScoreSheet liveMatch={selectedMatch} players={state.players} state={state} onClose={() => setSelectedMatchId(null)} onSave={handleSave} />
      ) : null}
          </>
        );
      })()}
    </div>
  );
}

function EmptyLiveTournamentState() {
  return (
    <div className="app-card grid gap-4 p-5 text-center sm:p-8" data-testid="live-empty-state">
      <div>
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Live turnering</p>
        <h2 className="mt-1 text-2xl font-black">Ingen aktiv turnering til visning</h2>
        <p className="mt-2 font-bold text-[var(--muted)]">Åbn en turnering fra din konto eller opret en ny turnering for at bruge livescore.</p>
      </div>
      <div className="mx-auto grid w-full max-w-md gap-2 sm:grid-cols-2">
        <Link className="btn-primary" href="/tournaments">Turneringer</Link>
        <Link className="btn-secondary" href="/new-tournament">Ny turnering</Link>
      </div>
    </div>
  );
}

function createLiveRenderState(state: LiveTournamentState): LiveRenderState {
  const emptyState: LiveRenderState = {
    ok: false,
    isPoolPlay: Boolean(state.poolPlay),
    liveMatches: [],
    standings: [],
    roundProgress: null,
    poolMatchViews: [],
    nextPoolMatchViews: [],
    finalPoolMatchViews: [],
    placementTiebreakMatchViews: [],
    poolProgress: null,
    nextPoolProgress: null,
    finalPoolProgress: null,
    nextRoundIsAvailable: false,
  };

  try {
    if (state.poolPlay) {
      const poolProgress = getInitialPoolProgress(state.poolPlay);

      return {
        ...emptyState,
        ok: Boolean(poolProgress),
        isPoolPlay: true,
        poolMatchViews: getInitialPoolMatchViews(state.poolPlay.initialStage, state.poolPlay.initialResults),
        nextPoolMatchViews: getNextPoolPhaseMatchViews(state.poolPlay, state.poolPlay.nextStageResults ?? []),
        finalPoolMatchViews: getPoolFinalMatchViews(state.poolPlay, state.poolPlay.finalResults ?? []),
        placementTiebreakMatchViews: getPlacementTiebreakMatchViews(state.poolPlay, state.poolPlay.placementTiebreakResults ?? []),
        poolProgress,
        nextPoolProgress: getNextPoolPhaseProgress(state.poolPlay),
        finalPoolProgress: getPoolFinalProgress(state.poolPlay),
      };
    }

    const liveMatches = getLiveMatches(state);

    return {
      ...emptyState,
      ok: true,
      isPoolPlay: false,
      liveMatches,
      standings: calculateLiveStandings(state),
      roundProgress: getRoundProgress(state),
      nextRoundIsAvailable: canGoToNextRound(state),
    };
  } catch {
    return emptyState;
  }
}

function ControllerReadOnlyNotice() {
  const { t } = useAppTranslation();

  return (
    <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm font-bold text-yellow-900" data-testid="controller-read-only-notice">
      <p className="font-black">{t("remoteControlledByOtherUser")}</p>
      <p className="mt-1">{t("remoteControlledByOtherUserHelp")}</p>
    </div>
  );
}

function ScreenMirroringControl() {
  const { t } = useAppTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="grid justify-items-stretch gap-2 sm:justify-items-end" data-testid="screen-mirroring-control">
      <button className="btn-outline-primary min-h-10 whitespace-nowrap px-3 text-sm" type="button" onClick={() => setIsOpen(true)}>
        <DisplayIcon />
        {t("screenMirroring")}
      </button>
      {isOpen ? <ScreenMirroringDialog onClose={() => setIsOpen(false)} /> : null}
    </div>
  );
}

type ScreenMirroringPlatform = "chromeDesktop" | "windows" | "apple" | "mobile" | "generic";

const screenMirroringGuidance: Record<ScreenMirroringPlatform, { title: TranslationKey; body: TranslationKey }> = {
  chromeDesktop: {
    title: "screenMirroringChromeDesktopTitle",
    body: "screenMirroringChromeDesktopBody",
  },
  windows: {
    title: "screenMirroringWindowsTitle",
    body: "screenMirroringWindowsBody",
  },
  apple: {
    title: "screenMirroringAppleTitle",
    body: "screenMirroringAppleBody",
  },
  mobile: {
    title: "screenMirroringMobileTitle",
    body: "screenMirroringMobileBody",
  },
  generic: {
    title: "screenMirroringGenericTitle",
    body: "screenMirroringGenericBody",
  },
};

function ScreenMirroringDialog({ onClose }: { onClose: () => void }) {
  const { t } = useAppTranslation();
  const platform = getScreenMirroringPlatform();
  const primaryGuidance = screenMirroringGuidance[platform];
  const extraGuidance = (Object.entries(screenMirroringGuidance) as Array<[ScreenMirroringPlatform, { title: TranslationKey; body: TranslationKey }]>)
    .filter(([key]) => key !== platform && key !== "generic");

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/35 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="screen-mirroring-heading">
      <div className="grid max-h-[92svh] w-full max-w-lg gap-3 overflow-y-auto overflow-x-hidden rounded-t-md border border-[var(--line)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-2xl sm:rounded-md sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-[var(--primary-strong)]">{t("screenMirroring").toLocaleUpperCase()}</p>
            <h2 id="screen-mirroring-heading" className="text-2xl font-black leading-tight">{t("screenMirroring")}</h2>
            <p className="mt-1 text-sm font-bold text-[var(--muted)]">{t("screenMirroringSubtitle")}</p>
          </div>
          <button className="btn-secondary min-h-9 px-3 text-sm" type="button" onClick={onClose}>
            {t("close")}
          </button>
        </div>

        <div className="rounded-md border border-[var(--primary)] bg-[var(--primary-soft)]/50 p-3">
          <p className="text-sm font-black text-[var(--primary-strong)]">{t("screenMirroringDirectUnavailableTitle")}</p>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">{t("screenMirroringDirectUnavailableBody")}</p>
        </div>

        <ScreenMirroringStep title={t(primaryGuidance.title)} body={t(primaryGuidance.body)} emphasis />

        <details className="rounded-md border border-[var(--line)] bg-[var(--primary-soft)]/40 p-3">
          <summary className="cursor-pointer text-sm font-black text-[var(--primary-strong)]">{t("screenMirroringOtherDevices")}</summary>
          <div className="mt-3 grid gap-2">
            {extraGuidance.map(([key, guidance]) => (
              <ScreenMirroringStep key={key} title={t(guidance.title)} body={t(guidance.body)} />
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function ScreenMirroringStep({ title, body, emphasis = false }: { title: string; body: string; emphasis?: boolean }) {
  return (
    <section className={`rounded-md border p-3 ${emphasis ? "border-[var(--primary)] bg-white" : "border-[var(--line)] bg-white/70"}`}>
      <h3 className="text-sm font-black text-[var(--foreground)]">{title}</h3>
      <p className={`mt-1 text-sm font-bold ${emphasis ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>{body}</p>
    </section>
  );
}

function getScreenMirroringPlatform(): ScreenMirroringPlatform {
  if (typeof navigator === "undefined") {
    return "generic";
  }

  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const userAgent = nav.userAgent.toLowerCase();
  const platform = nav.platform.toLowerCase();
  const userAgentDataPlatform = typeof nav.userAgentData?.platform === "string" ? nav.userAgentData.platform.toLowerCase() : "";
  const platformText = `${userAgent} ${platform} ${userAgentDataPlatform}`;

  if (/iphone|ipad|ipod|macintosh|mac os/.test(platformText)) {
    return "apple";
  }

  if (/android|mobile|tablet/.test(platformText)) {
    return "mobile";
  }

  if (/windows|win32|win64/.test(platformText)) {
    return "windows";
  }

  if (/chrome|chromium|crios|edg\//.test(platformText)) {
    return "chromeDesktop";
  }

  return "generic";
}

function DisplayIcon() {
  return (
    <svg aria-hidden="true" className="mr-2 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function RoundTimerPanel({ state, onReset, onStart, onStop }: { state: LiveTournamentState; onReset: () => void; onStart: () => void; onStop: () => void }) {
  const { t } = useAppTranslation();
  const timer = state.roundTimer;
  const canStart = !timer || timer.status === "idle" || timer.status === "paused" || timer.status === "expired" || timer.roundNumber !== state.activeRoundNumber;
  const canStop = timer?.roundNumber === state.activeRoundNumber && (timer.status === "countdown" || timer.status === "running");
  const label = timer?.status === "countdown" ? `${t("startTimer")} ${timer.countdownSeconds}s` : timer?.status === "running" || timer?.status === "paused" ? formatClock(timer.remainingSeconds) : timer?.status === "expired" ? "00:00" : formatClock((state.timeLimitMinutes ?? 0) * 60);

  return (
    <section className="app-card grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{t("playByTime")}</p>
          <h2 className="text-3xl font-black tabular-nums">{label}</h2>
        </div>
        <div className="action-grid">
          <button className="btn-primary disabled:bg-gray-300" type="button" disabled={!canStart} onClick={onStart}>{timer?.status === "paused" ? t("resumeTimer") : t("startTimer")}</button>
          <button className="btn-secondary disabled:opacity-40" type="button" disabled={!canStop} onClick={onStop}>{t("stopTimer")}</button>
          <button className="btn-secondary" type="button" onClick={onReset}>{t("timerReset")}</button>
        </div>
      </div>
      <p className="text-sm font-bold text-[var(--muted)]">{timer?.status === "paused" ? t("timerStoppedCanResume") : t("timerStartsAfterCountdown")}</p>
    </section>
  );
}

interface PoolMatchView {
  stage: "initial" | "next" | "final" | "placementTiebreak";
  id: string;
  poolId: string;
  poolName: string;
  label: string;
  teamAName: string;
  teamBName: string;
  teamAPoints?: number;
  teamBPoints?: number;
  tieBreakWinner?: "teamA" | "teamB";
  matchesPerTeam?: 2 | 3;
}

function PoolPlayLiveView({
  state,
  poolMatchViews,
  nextPoolMatchViews,
  finalPoolMatchViews,
  placementTiebreakMatchViews,
  poolProgress,
  nextPoolProgress,
  finalPoolProgress,
  selectedMatch,
  isControllerReadOnly,
  toast,
  onAdvance,
  onCloseScoreSheet,
  onSaveResult,
  onSelectMatch,
}: {
  state: LiveTournamentState & { poolPlay: NonNullable<LiveTournamentState["poolPlay"]> };
  poolMatchViews: PoolMatchView[];
  nextPoolMatchViews: PoolMatchView[];
  finalPoolMatchViews: PoolMatchView[];
  placementTiebreakMatchViews: PoolMatchView[];
  poolProgress: NonNullable<ReturnType<typeof getInitialPoolProgress>>;
  nextPoolProgress: ReturnType<typeof getNextPoolPhaseProgress>;
  finalPoolProgress: ReturnType<typeof getPoolFinalProgress>;
  selectedMatch: PoolMatchView | null;
  isControllerReadOnly: boolean;
  toast: string;
  onAdvance: () => void;
  onCloseScoreSheet: () => void;
  onSaveResult: (result: PoolMatchResult) => void;
  onSelectMatch: (matchId: string) => void;
}) {
  const standings = calculateInitialPoolStandings(state.poolPlay.initialStage, state.poolPlay.initialResults, state.rankingMode);
  const placementTiebreakCompletedCount = placementTiebreakMatchViews.filter((match) => match.teamAPoints !== undefined && match.teamBPoints !== undefined).length;

  return (
    <div className="grid gap-5">
      <div className="app-card p-3 sm:px-4 sm:py-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-[0.72rem] font-bold uppercase leading-none text-[var(--primary-strong)] sm:text-xs">Aktiv turnering</p>
            <h2 className="mt-1 text-xl font-black leading-tight sm:text-2xl">{state.tournamentName}</h2>
            <p className="mt-0.5 text-xs font-bold text-[var(--muted)] sm:text-sm">
              Puljespil · {state.poolPlay.initialStage.participants.length} deltagere · {state.poolPlay.initialStage.pools.length} puljer
            </p>
          </div>
          {!isControllerReadOnly ? (
            <div className="grid gap-2 sm:grid-flow-col sm:items-center">
              <Link className="btn-outline-primary min-h-10 whitespace-nowrap px-3 text-sm" href="/finish">Afslut turnering</Link>
              <ScreenMirroringControl />
            </div>
          ) : null}
        </div>
        {isControllerReadOnly ? <div className="mt-3"><ControllerReadOnlyNotice /></div> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">Fase</p><p className="mt-1 text-2xl font-black">{formatPoolPhase(state.poolPlay.phase)}</p></div>
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">Puljekampe</p><p className="mt-1 text-2xl font-black">{poolProgress.completedMatches} / {poolProgress.totalMatches}</p></div>
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">Næste fase</p><p className="mt-1 text-2xl font-black">{nextPoolProgress ? `${nextPoolProgress.completedMatches} / ${nextPoolProgress.totalMatches}` : "-"}</p></div>
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">Progression</p><p className="mt-1 text-2xl font-black">{state.poolPlay.advancementMode === "crossMatches" ? "Krydskampe" : "Placeringspuljer"}</p></div>
      </div>

      <PoolPhaseActionPanel
        poolPlay={state.poolPlay}
        poolProgress={poolProgress}
        nextPoolProgress={nextPoolProgress}
        finalPoolProgress={finalPoolProgress}
        isReadOnly={isControllerReadOnly}
        onAdvance={onAdvance}
      />

      {toast ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{toast}</p> : null}

      {state.poolPlay.phase === "crossMatches" && state.poolPlay.crossMatchStage ? (
        <CrossMatchStagePanel stage={state.poolPlay.crossMatchStage} />
      ) : state.poolPlay.phase === "finals" && state.poolPlay.crossMatchFinalStage ? (
        <CrossMatchFinalStagePanel
          stage={state.poolPlay.crossMatchFinalStage}
          finalPoolMatchViews={finalPoolMatchViews}
          onSelectMatch={onSelectMatch}
        />
      ) : state.poolPlay.phase === "placementPools" && state.poolPlay.placementStage ? (
        <section className="grid gap-3" aria-label="Placeringspuljer">
          <h2 className="text-xl font-black">Placeringspuljer</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {state.poolPlay.placementStage.pools.map((pool) => (
              <article key={pool.id} className="app-card p-4">
                <h3 className="text-lg font-black">{pool.name}</h3>
                <p className="mt-1 text-sm font-bold text-[var(--muted)]">Placering {pool.finalPlacementFrom}-{pool.finalPlacementTo}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {nextPoolMatchViews.length > 0 ? (
        <section className="app-card grid gap-3 p-4 sm:p-5" aria-label="Næste fasekampe">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Næste fasekampe</h2>
              <p className="text-sm font-bold text-[var(--muted)]">
                {nextPoolProgress?.isComplete ? "Alle kampe i næste fase er gemt." : "Registrer scorepoint for de oprettede kampe."}
              </p>
            </div>
            <p className="text-lg font-black">{nextPoolProgress?.completedMatches ?? 0} / {nextPoolProgress?.totalMatches ?? 0}</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${((nextPoolProgress?.completedMatches ?? 0) / (nextPoolProgress?.totalMatches ?? 1)) * 100}%` }} />
          </div>
          <div className="grid gap-4">
            {getNextPhaseGroups(nextPoolMatchViews).map((group) => (
              <section key={group.poolId} className="grid gap-3" aria-labelledby={`${group.poolId}-next-heading`}>
                <h3 id={`${group.poolId}-next-heading`} className="border-b border-[var(--line)] pb-2 text-lg font-black">{group.poolName}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.matches.map((match) => (
                    <PoolMatchCard key={match.id} match={match} isReadOnly={isControllerReadOnly} onSelect={() => onSelectMatch(match.id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {placementTiebreakMatchViews.length > 0 ? (
        <section className="app-card grid gap-3 p-4 sm:p-5" aria-label="Tiebreak om placering">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Tiebreak om placering</h2>
              <p className="text-sm font-bold text-[var(--muted)]">
                {placementTiebreakCompletedCount === placementTiebreakMatchViews.length ? "Alle placerings-tiebreaks er gemt." : "Registrer separate tiebreaks for spillere med lige scorepoint."}
              </p>
            </div>
            <p className="text-lg font-black">{placementTiebreakCompletedCount} / {placementTiebreakMatchViews.length}</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${(placementTiebreakCompletedCount / placementTiebreakMatchViews.length) * 100}%` }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {placementTiebreakMatchViews.map((match) => (
              <PoolMatchCard key={match.id} match={match} isReadOnly={isControllerReadOnly} onSelect={() => onSelectMatch(match.id)} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="text-xl font-black">Puljekampe</h2>
        <div className="grid gap-4">
          {state.poolPlay.initialStage.pools.map((pool) => (
            <section key={pool.id} className="grid gap-3" aria-labelledby={`${pool.id}-heading`}>
              <h3 id={`${pool.id}-heading`} className="border-b border-[var(--line)] pb-2 text-lg font-black">{pool.name}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {poolMatchViews.filter((match) => match.poolId === pool.id).map((match) => (
                  <PoolMatchCard key={match.id} match={match} isReadOnly={isControllerReadOnly} onSelect={() => onSelectMatch(match.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-xl font-black">Puljestillinger</h2>
        <div className="grid gap-4">
          {standings.map((table) => (
            <section key={table.poolId} className="grid gap-3" aria-labelledby={`${table.poolId}-standings-heading`}>
              <h3 id={`${table.poolId}-standings-heading`} className="text-lg font-black">{table.poolName}</h3>
              <StandingsTable standings={table.rows} />
            </section>
          ))}
        </div>
      </section>

      {selectedMatch && !isControllerReadOnly ? (
        <PoolScoreSheet match={selectedMatch} onClose={onCloseScoreSheet} onSave={onSaveResult} />
      ) : null}
    </div>
  );
}

function PoolPhaseActionPanel({
  poolPlay,
  poolProgress,
  nextPoolProgress,
  finalPoolProgress,
  isReadOnly,
  onAdvance,
}: {
  poolPlay: NonNullable<LiveTournamentState["poolPlay"]>;
  poolProgress: NonNullable<ReturnType<typeof getInitialPoolProgress>>;
  nextPoolProgress: ReturnType<typeof getNextPoolPhaseProgress>;
  finalPoolProgress: ReturnType<typeof getPoolFinalProgress>;
  isReadOnly: boolean;
  onAdvance: () => void;
}) {
  if (poolPlay.phase === "crossMatches") {
    const canCreateFinals = Boolean(nextPoolProgress?.isComplete && poolPlay.crossMatchStage?.participantType !== "player");

    return (
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Krydskampe</h2>
            <p className="text-sm font-bold text-[var(--muted)]">
              {poolPlay.crossMatchStage?.participantType === "player"
                ? "Individuelle krydskampe afgøres via Americano-stillingen."
                : nextPoolProgress?.isComplete
                  ? "Alle krydskampe er gemt. Opret finale og bronzekamp."
                  : "Alle krydskampe skal gemmes før finalerne kan oprettes."}
            </p>
          </div>
          {poolPlay.crossMatchStage?.participantType !== "player" && !isReadOnly ? (
            <button className="btn-primary disabled:bg-gray-300" type="button" disabled={!canCreateFinals} onClick={onAdvance}>Opret finaler</button>
          ) : null}
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${((nextPoolProgress?.completedMatches ?? 0) / (nextPoolProgress?.totalMatches ?? 1)) * 100}%` }} />
        </div>
      </section>
    );
  }

  if (poolPlay.phase === "finals") {
    return (
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Finaler</h2>
            <p className="text-sm font-bold text-[var(--muted)]">
              {finalPoolProgress?.isComplete ? "Finale og bronzekamp er gemt." : "Registrer finale og bronzekamp."}
            </p>
          </div>
          <p className="text-lg font-black">{finalPoolProgress?.completedMatches ?? 0} / {finalPoolProgress?.totalMatches ?? 0}</p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${((finalPoolProgress?.completedMatches ?? 0) / (finalPoolProgress?.totalMatches ?? 1)) * 100}%` }} />
        </div>
      </section>
    );
  }

  return (
    <section className="app-card grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Indledende puljer</h2>
          <p className="text-sm font-bold text-[var(--muted)]">
            {poolProgress.isComplete ? "Alle indledende puljekampe er gemt." : "Alle puljekampe skal gemmes før næste fase."}
          </p>
        </div>
        {poolPlay.phase === "initial" && !isReadOnly ? (
          <button className="btn-primary disabled:bg-gray-300" type="button" disabled={!poolProgress.isComplete} onClick={onAdvance}>Opret næste fase</button>
        ) : null}
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${(poolProgress.completedMatches / poolProgress.totalMatches) * 100}%` }} />
      </div>
    </section>
  );
}

function CrossMatchFinalStagePanel({
  stage,
  finalPoolMatchViews,
  onSelectMatch,
}: {
  stage: CrossMatchFinalStage;
  finalPoolMatchViews: PoolMatchView[];
  onSelectMatch: (matchId: string) => void;
}) {
  return (
    <section className="grid gap-5" aria-label="Finaler">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-[var(--muted)]">Afgørende kampe</p>
          <h2 className="text-2xl font-black">Finaler</h2>
        </div>
        <span className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-black text-[var(--primary-strong)]">
          {stage.groups.length} finalespil
        </span>
      </div>

      {stage.groups.map((group) => {
        const groupMatches = finalPoolMatchViews.filter((match) => match.poolId === group.id);

        return (
          <section key={group.id} className="grid gap-3" aria-labelledby={`${group.id}-heading`}>
            <h3 id={`${group.id}-heading`} className="border-b border-[var(--line)] pb-2 text-xl font-black">{group.name}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {groupMatches.map((match) => (
                <PoolMatchCard key={match.id} match={match} onSelect={() => onSelectMatch(match.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}

function PoolMatchCard({ isReadOnly, match, onSelect }: { isReadOnly?: boolean; match: PoolMatchView; onSelect: () => void }) {
  const { t } = useAppTranslation();
  const isCompleted = match.teamAPoints !== undefined && match.teamBPoints !== undefined;

  return (
    <article className="app-card min-h-44 p-4 text-left transition hover:border-[var(--primary)] focus-within:ring-4 focus-within:ring-green-100">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xl font-black">{match.label}</h4>
        <span className={`rounded-md px-3 py-1 text-sm font-bold ${isCompleted ? "bg-green-100 text-[var(--primary-strong)]" : "bg-gray-100 text-[var(--muted)]"}`}>
          {isCompleted ? t("completed") : t("ready")}
        </span>
      </div>
      {match.matchesPerTeam ? <p className="mt-2 text-sm font-black text-[var(--primary-strong)]">{match.matchesPerTeam} delkampe</p> : null}
      <button className="mt-4 grid w-full gap-2 text-left text-lg font-bold disabled:cursor-default" type="button" disabled={isReadOnly} onClick={onSelect}>
        <p className="leading-7">
          <span>{match.teamAName}</span>{" "}
          <span className="text-[var(--muted)]">vs</span>{" "}
          <span>{match.teamBName}</span>
        </p>
        <span className="mt-2 text-2xl font-black">{isCompleted ? formatPoolResultScore(match) : "-"}</span>
      </button>
      {!isReadOnly ? <button className="mt-4 min-h-12 w-full rounded-md bg-[var(--primary)] px-3 font-black text-[var(--primary-text)]" type="button" onClick={onSelect}>{isCompleted ? t("editScore") : t("enterScore")}</button> : null}
    </article>
  );
}

function PoolScoreSheet({ match, onClose, onSave }: { match: PoolMatchView; onClose: () => void; onSave: (result: PoolMatchResult) => void }) {
  const { t } = useAppTranslation();
  const [teamAPoints, setTeamAPoints] = useState(match.teamAPoints?.toString() ?? "");
  const [teamBPoints, setTeamBPoints] = useState(match.teamBPoints?.toString() ?? "");
  const [tieBreakWinner, setTieBreakWinner] = useState<"" | "teamA" | "teamB">(match.tieBreakWinner ?? "");
  const isDraw = teamAPoints !== "" && teamBPoints !== "" && Number(teamAPoints) === Number(teamBPoints);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      matchId: match.id,
      teamAPoints: Number(teamAPoints),
      teamBPoints: Number(teamBPoints),
      ...(isDraw && tieBreakWinner ? { tieBreakWinner } : {}),
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 max-h-[90svh] overflow-y-auto border-t border-[var(--line)] bg-white p-3 shadow-2xl sm:p-4">
      <form className="mx-auto grid max-w-3xl gap-4" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{match.poolName} · {match.label}</p>
            <h2 className="mt-1 text-2xl font-black">{t("registerScorePoints")}</h2>
          </div>
          <button className="btn-secondary" type="button" onClick={onClose}>{t("close")}</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-base font-bold">
            {match.teamAName}
            <input required inputMode="numeric" pattern="[0-9]*" className="field-control min-h-16 text-center text-3xl font-black" value={teamAPoints} onChange={(event) => setTeamAPoints(event.target.value)} aria-label="Hold A scorepoint" />
          </label>
          <label className="grid gap-2 text-base font-bold">
            {match.teamBName}
            <input required inputMode="numeric" pattern="[0-9]*" className="field-control min-h-16 text-center text-3xl font-black" value={teamBPoints} onChange={(event) => setTeamBPoints(event.target.value)} aria-label="Hold B scorepoint" />
          </label>
        </div>
        {isDraw ? (
          <label className="grid gap-2 text-base font-bold">
            Match tiebreak
            <select className="field-control min-h-14 text-base font-black" value={tieBreakWinner} onChange={(event) => setTieBreakWinner(event.target.value as "" | "teamA" | "teamB")}>
              <option value="">Ikke afgjort</option>
              <option value="teamA">{match.teamAName}</option>
              <option value="teamB">{match.teamBName}</option>
            </select>
          </label>
        ) : null}
        <button className="min-h-14 w-full rounded-md bg-[var(--primary)] px-5 text-lg font-black text-white" type="submit">{t("save")}</button>
      </form>
    </div>
  );
}

function getInitialPoolMatchViews(initialStage: NonNullable<LiveTournamentState["poolPlay"]>["initialStage"], results: PoolMatchResult[]): PoolMatchView[] {
  const resultByMatchId = new Map(results.map((result) => [result.matchId, result]));
  const participantById = new Map(initialStage.participants.map((participant) => [participant.id, participant]));

  return initialStage.pools.flatMap((pool) => (
    pool.scheduleType === "americanoRotation"
      ? pool.americanoRounds.flatMap((round) => round.matches.map((match) => {
          const result = resultByMatchId.get(match.id);

          return {
            stage: "initial",
            id: match.id,
            poolId: pool.id,
            poolName: pool.name,
            label: `Runde ${round.roundNumber}, bane ${match.courtNumber}`,
            teamAName: formatPoolTeam(match.teamA.playerIds, participantById),
            teamBName: formatPoolTeam(match.teamB.playerIds, participantById),
            ...(result ? { teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints } : {}),
            ...(result?.tieBreakWinner ? { tieBreakWinner: result.tieBreakWinner } : {}),
          };
        }))
      : pool.encounters.map((encounter, index) => {
          const result = resultByMatchId.get(encounter.id);

          return {
            stage: "initial",
            id: encounter.id,
            poolId: pool.id,
            poolName: pool.name,
            label: `Kamp ${index + 1}`,
            teamAName: getPoolParticipantName(participantById, encounter.participantAId),
            teamBName: getPoolParticipantName(participantById, encounter.participantBId),
            ...(encounter.matchesPerTeam ? { matchesPerTeam: encounter.matchesPerTeam } : {}),
            ...(result ? { teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints } : {}),
            ...(result?.tieBreakWinner ? { tieBreakWinner: result.tieBreakWinner } : {}),
          };
        })
  ));
}

function getNextPoolPhaseMatchViews(poolPlay: NonNullable<LiveTournamentState["poolPlay"]>, results: PoolMatchResult[]): PoolMatchView[] {
  const participantSource = poolPlay.placementStage?.participants ?? poolPlay.crossMatchStage?.participants ?? poolPlay.initialStage.participants;
  const participantById = new Map(participantSource.map((participant) => [participant.id, participant]));
  const resultByMatchId = new Map(results.map((result) => [result.matchId, result]));

  if (poolPlay.phase === "placementPools" && poolPlay.placementStage) {
    return poolPlay.placementStage.pools.flatMap((pool) => (
      pool.scheduleType === "americanoRotation"
        ? pool.americanoRounds.flatMap((round) => round.matches.map((match) => {
            const result = resultByMatchId.get(match.id);

            return {
              stage: "next",
              id: match.id,
              poolId: pool.id,
              poolName: pool.name,
              label: `Runde ${round.roundNumber}, bane ${match.courtNumber}`,
              teamAName: formatPoolTeam(match.teamA.playerIds, participantById),
              teamBName: formatPoolTeam(match.teamB.playerIds, participantById),
              ...(result ? { teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints } : {}),
              ...(result?.tieBreakWinner ? { tieBreakWinner: result.tieBreakWinner } : {}),
            };
          }))
        : pool.encounters.map((encounter, index) => {
            const result = resultByMatchId.get(encounter.id);

            return {
              stage: "next",
              id: encounter.id,
              poolId: pool.id,
              poolName: pool.name,
              label: `Kamp ${index + 1}`,
              teamAName: getPoolParticipantName(participantById, encounter.participantAId),
              teamBName: getPoolParticipantName(participantById, encounter.participantBId),
              ...(encounter.matchesPerTeam ? { matchesPerTeam: encounter.matchesPerTeam } : {}),
              ...(result ? { teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints } : {}),
              ...(result?.tieBreakWinner ? { tieBreakWinner: result.tieBreakWinner } : {}),
            };
          })
    ));
  }

  if (poolPlay.phase === "crossMatches" && poolPlay.crossMatchStage) {
    const pairedMatches: PoolMatchView[] = poolPlay.crossMatchStage.groups.flatMap((group) => (
      group.scheduleType === "americanoRotation"
        ? group.americanoRounds.flatMap((round) => round.matches.map((match) => {
            const result = resultByMatchId.get(match.id);

            return {
              stage: "next",
              id: match.id,
              poolId: group.id,
              poolName: group.name,
              label: `Runde ${round.roundNumber}, bane ${match.courtNumber}`,
              teamAName: formatPoolTeam(match.teamA.playerIds, participantById),
              teamBName: formatPoolTeam(match.teamB.playerIds, participantById),
              ...(result ? { teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints } : {}),
              ...(result?.tieBreakWinner ? { tieBreakWinner: result.tieBreakWinner } : {}),
            };
          }))
        : group.encounters.map((encounter, index) => {
            const result = resultByMatchId.get(encounter.id);

            return {
              stage: "next",
              id: encounter.id,
              poolId: group.id,
              poolName: group.name,
              label: `Kamp ${index + 1}`,
              teamAName: getPoolParticipantName(participantById, encounter.participantAId),
              teamBName: getPoolParticipantName(participantById, encounter.participantBId),
              ...(encounter.matchesPerTeam ? { matchesPerTeam: encounter.matchesPerTeam } : {}),
              ...(result ? { teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints } : {}),
              ...(result?.tieBreakWinner ? { tieBreakWinner: result.tieBreakWinner } : {}),
            };
          })
    ));

    const unmatchedMatches: PoolMatchView[] = (poolPlay.crossMatchStage.unmatchedPlacementGroups ?? []).flatMap((group) => (
      group.americanoRounds.flatMap((round) => round.matches.map((match) => {
        const result = resultByMatchId.get(match.id);

        return {
          stage: "next" as const,
          id: match.id,
          poolId: group.id,
          poolName: group.name,
          label: `Runde ${round.roundNumber}, bane ${match.courtNumber}`,
          teamAName: formatPoolTeam(match.teamA.playerIds, participantById),
          teamBName: formatPoolTeam(match.teamB.playerIds, participantById),
          ...(result ? { teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints } : {}),
          ...(result?.tieBreakWinner ? { tieBreakWinner: result.tieBreakWinner } : {}),
        };
      }))
    ));

    return [...pairedMatches, ...unmatchedMatches];
  }

  return [];
}

function getPoolFinalMatchViews(poolPlay: NonNullable<LiveTournamentState["poolPlay"]>, results: PoolMatchResult[]): PoolMatchView[] {
  if (poolPlay.phase !== "finals" || !poolPlay.crossMatchFinalStage) {
    return [];
  }

  const participantById = new Map(poolPlay.crossMatchFinalStage.participants.map((participant) => [participant.id, participant]));
  const resultByMatchId = new Map(results.map((result) => [result.matchId, result]));

  return poolPlay.crossMatchFinalStage.groups.flatMap((group) => [
    getPoolFinalMatchView(group.final, group.id, group.name, participantById, resultByMatchId),
    getPoolFinalMatchView(group.bronze, group.id, group.name, participantById, resultByMatchId),
  ]);
}

function getPlacementTiebreakMatchViews(poolPlay: NonNullable<LiveTournamentState["poolPlay"]>, results: PoolMatchResult[]): PoolMatchView[] {
  if (poolPlay.phase !== "crossMatches" || !poolPlay.crossMatchStage) {
    return [];
  }

  return createCrossMatchPlacementTiebreaks(
    poolPlay.crossMatchStage,
    poolPlay.nextStageResults ?? [],
    results,
  ).map((match) => ({
    stage: "placementTiebreak",
    id: match.id,
    poolId: match.groupId,
    poolName: match.groupName,
    label: `Tiebreak om ${match.rankFrom}. / ${match.rankTo}. plads`,
    teamAName: match.participantAName,
    teamBName: match.participantBName,
    ...(match.result ? { teamAPoints: match.result.teamAPoints, teamBPoints: match.result.teamBPoints } : {}),
    ...(match.result?.tieBreakWinner ? { tieBreakWinner: match.result.tieBreakWinner } : {}),
  }));
}

function getPoolFinalMatchView(
  encounter: CrossMatchFinalEncounter,
  poolId: string,
  poolName: string,
  participantById: Map<string, PoolParticipant>,
  resultByMatchId: Map<string, PoolMatchResult>,
): PoolMatchView {
  const result = resultByMatchId.get(encounter.id);

  return {
    stage: "final",
    id: encounter.id,
    poolId,
    poolName,
    label: encounter.placement === "final" ? "Finale" : "Bronzekamp",
    teamAName: getPoolParticipantName(participantById, encounter.participantAId),
    teamBName: getPoolParticipantName(participantById, encounter.participantBId),
    ...(encounter.matchesPerTeam ? { matchesPerTeam: encounter.matchesPerTeam } : {}),
    ...(result ? { teamAPoints: result.teamAPoints, teamBPoints: result.teamBPoints } : {}),
    ...(result?.tieBreakWinner ? { tieBreakWinner: result.tieBreakWinner } : {}),
  };
}

function formatPoolResultScore(match: PoolMatchView): string {
  const baseScore = `${match.teamAPoints} - ${match.teamBPoints}`;

  return match.tieBreakWinner ? `${baseScore} (MTB: ${match.tieBreakWinner === "teamA" ? "hold A" : "hold B"})` : baseScore;
}

function getNextPhaseGroups(matches: PoolMatchView[]): Array<{ poolId: string; poolName: string; matches: PoolMatchView[] }> {
  const groups = new Map<string, { poolId: string; poolName: string; matches: PoolMatchView[] }>();

  for (const match of matches) {
    const group = groups.get(match.poolId) ?? { poolId: match.poolId, poolName: match.poolName, matches: [] };
    group.matches.push(match);
    groups.set(match.poolId, group);
  }

  return Array.from(groups.values());
}

function formatPoolTeam(participantIds: readonly string[], participants: Map<string, PoolParticipant>): string {
  return participantIds.map((participantId) => getPoolParticipantName(participants, participantId)).join(" / ");
}

function getPoolParticipantName(participants: Map<string, PoolParticipant>, participantId: string): string {
  return participants.get(participantId)?.name ?? participantId;
}

function formatPoolPhase(phase: NonNullable<LiveTournamentState["poolPlay"]>["phase"]): string {
  switch (phase) {
    case "initial":
      return "Puljer";
    case "placementPools":
      return "Placering";
    case "crossMatches":
      return "Krydskampe";
    case "finals":
      return "Finaler";
  }
}

function LiveMatchCard({ isReadOnly, liveMatch, players, onSelect }: { isReadOnly?: boolean; liveMatch: LiveMatchView; players: TournamentPlayer[]; onSelect: () => void }) {
  const { t } = useAppTranslation();
  const match = liveMatch.match;
  const leftPlayers = formatTeamPlayers(match.teamA.playerIds, players);
  const rightPlayers = formatTeamPlayers(match.teamB.playerIds, players);

  return (
    <UnifiedCourtCard
      actionLabel={isReadOnly ? undefined : liveMatch.result ? t("editScore") : t("enterScore")}
      className="text-left transition hover:border-[var(--primary)] focus-within:ring-4 focus-within:ring-green-100"
      court={`${t("court")} ${match.courtNumber}`}
      density="standard"
      leftPlayers={leftPlayers}
      leftScore={liveMatch.result?.teamAPoints}
      onAction={isReadOnly ? undefined : onSelect}
      rightPlayers={rightPlayers}
      rightScore={liveMatch.result?.teamBPoints}
      status={liveMatch.status === "Afsluttet" ? t("completed") : liveMatch.status === "Klar" ? t("ready") : liveMatch.status}
      testId="live-court-card"
      testIdPrefix="live-court"
      tone={liveMatch.status === "Afsluttet" ? "completed" : liveMatch.status === "I gang" ? "active" : "ready"}
      unsavedLabel={t("remoteNotSaved")}
    />
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2 sm:rounded-md sm:border sm:border-[var(--line)] sm:bg-[var(--surface)] sm:p-4 sm:text-center" data-testid="live-summary-metric">
      <p className="text-[0.68rem] font-bold uppercase text-[var(--muted)] sm:text-sm sm:normal-case">{label}</p>
      <p className="mt-0.5 text-lg font-black sm:mt-1 sm:text-2xl">{value}</p>
    </div>
  );
}

function RoundNavigationButtons({
  canGoNext,
  canGoPrevious,
  onNext,
  onPrevious,
  testId = "live-round-navigation-actions",
}: {
  canGoNext: boolean;
  canGoPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  testId?: string;
}) {
  const { t } = useAppTranslation();

  return (
    <div className="grid grid-cols-1 gap-2 sm:min-w-[26rem] sm:max-w-xl sm:flex-1 sm:grid-cols-3" data-testid={testId}>
      <button className="btn-secondary min-h-11 px-3 py-2 text-sm disabled:opacity-40 sm:min-h-12 sm:text-base" type="button" disabled={!canGoPrevious} onClick={onPrevious}>{t("previous")}</button>
      <button className="btn-primary min-h-11 px-3 py-2 text-sm disabled:bg-gray-300 sm:min-h-12 sm:text-base" type="button" disabled={!canGoNext} onClick={onNext}>{t("next")}</button>
      <Link className="btn-danger min-h-11 px-3 py-2 text-sm sm:min-h-12 sm:text-base" href="/finish">{t("finishTournament")}</Link>
    </div>
  );
}

function ScoreSheet({ liveMatch, players, state, onClose, onSave }: { liveMatch: LiveMatchView; players: TournamentPlayer[]; state: LiveTournamentState; onClose: () => void; onSave: (result: MatchResult) => void | Promise<void> }) {
  const { t } = useAppTranslation();
  const fixedTotalPoints = state.scoringMode === "Fast antal point" && state.fixedScoreRule === "total" ? state.fixedScorePoints : undefined;
  const [teamAPoints, setTeamAPoints] = useState(liveMatch.result?.teamAPoints.toString() ?? "");
  const [teamBPoints, setTeamBPoints] = useState(liveMatch.result?.teamBPoints.toString() ?? (fixedTotalPoints !== undefined && teamAPoints !== "" ? String(fixedTotalPoints - Number(teamAPoints)) : ""));
  const [formError, setFormError] = useState("");
  const parsedTeamAPoints = parseScoreInput(teamAPoints);
  const fixedTotalCalculation = fixedTotalPoints !== undefined && parsedTeamAPoints !== null ? getFixedTotalCalculation(fixedTotalPoints, parsedTeamAPoints) : null;
  const calculatedTeamBPoints = fixedTotalCalculation && "score" in fixedTotalCalculation ? fixedTotalCalculation.score.teamBPoints : null;
  const fixedTotalError = fixedTotalCalculation && "error" in fixedTotalCalculation ? fixedTotalCalculation.error : "";
  const isFixedTotalScoring = fixedTotalPoints !== undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const teamAScore = parseRequiredScoreInput(teamAPoints);
      const score = isFixedTotalScoring
        ? calculateFixedTotalScore(fixedTotalPoints, teamAScore)
        : {
            teamAPoints: teamAScore,
            teamBPoints: parseRequiredScoreInput(teamBPoints),
          };

      setFormError("");
      void onSave({
        matchId: liveMatch.match.id,
        teamAPoints: score.teamAPoints,
        teamBPoints: score.teamBPoints,
      });
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : "Resultatet kunne ikke gemmes.");
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 max-h-[90svh] overflow-y-auto border-t border-[var(--line)] bg-white p-3 shadow-2xl sm:p-4">
      <form className="mx-auto grid max-w-3xl gap-4" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{t("court")} {liveMatch.match.courtNumber}</p>
            <h2 className="mt-1 text-2xl font-black">{t("registerScorePoints")}</h2>
          </div>
          <button className="btn-secondary" type="button" onClick={onClose}>{t("close")}</button>
        </div>
        {isFixedTotalScoring ? (
          <p className="rounded-md bg-[var(--primary-soft)] p-3 text-sm font-bold text-[var(--primary-strong)]">
            Fast samlet score: indtast én score. Modstanderens score beregnes automatisk til samlet {fixedTotalPoints}.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-base font-bold">
            {formatTeam(liveMatch.match.teamA.playerIds, players)}
            <input
              required
              inputMode="numeric"
              max={fixedTotalPoints}
              min="0"
              pattern="[0-9]*"
              className="field-control min-h-16 text-center text-3xl font-black"
              value={teamAPoints}
              onChange={(event) => setTeamAPoints(event.target.value)}
              aria-label="Hold A scorepoint"
            />
          </label>
          <label className="grid gap-2 text-base font-bold">
            {formatTeam(liveMatch.match.teamB.playerIds, players)}
            {isFixedTotalScoring ? (
              <output className="field-control flex min-h-16 items-center justify-center text-center text-3xl font-black" aria-label="Hold B scorepoint">
                {calculatedTeamBPoints ?? "-"}
              </output>
            ) : (
              <input required inputMode="numeric" min="0" pattern="[0-9]*" className="field-control min-h-16 text-center text-3xl font-black" value={teamBPoints} onChange={(event) => setTeamBPoints(event.target.value)} aria-label="Hold B scorepoint" />
            )}
          </label>
        </div>
        {fixedTotalError || formError ? <p className="rounded-md bg-red-50 p-3 font-bold text-red-700">{fixedTotalError || formError}</p> : null}
        <button className="min-h-14 w-full rounded-md bg-[var(--primary)] px-5 text-lg font-black text-white disabled:bg-gray-300" type="submit" disabled={Boolean(fixedTotalError)}>{t("save")}</button>
      </form>
    </div>
  );
}

function formatTeam(playerIds: readonly string[], players: TournamentPlayer[]): string {
  return playerIds.map((playerId) => getPlayerName(players, playerId)).join(" / ");
}

function formatTeamPlayers(playerIds: readonly string[], players: TournamentPlayer[]): string[] {
  return playerIds.map((playerId) => getPlayerName(players, playerId));
}

function parseScoreInput(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) ? parsedValue : null;
}

function parseRequiredScoreInput(value: string): number {
  const parsedValue = parseScoreInput(value);

  if (parsedValue === null) {
    throw new Error("Indtast en gyldig score.");
  }

  return parsedValue;
}

function getFixedTotalCalculation(fixedScoreTotal: number, enteredScore: number): { score: ReturnType<typeof calculateFixedTotalScore> } | { error: string } {
  try {
    return { score: calculateFixedTotalScore(fixedScoreTotal, enteredScore) };
  } catch (caughtError) {
    return { error: caughtError instanceof Error ? caughtError.message : "Scoren er ugyldig." };
  }
}

function isNewerOrganizerRemoteVersion(currentUpdatedAt: string | undefined, nextUpdatedAt: string): boolean {
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

function isOlderOrganizerRemoteVersion(currentUpdatedAt: string | undefined, nextUpdatedAt: string | undefined): boolean {
  if (!currentUpdatedAt || !nextUpdatedAt) {
    return false;
  }

  const currentTime = Date.parse(currentUpdatedAt);
  const nextTime = Date.parse(nextUpdatedAt);

  if (Number.isNaN(currentTime) || Number.isNaN(nextTime)) {
    return false;
  }

  return nextTime < currentTime;
}

function isUsableOrganizerRemoteBody(response: Response, body: OrganizerRemoteReadResponse, expectedTournamentId: string): body is OrganizerRemoteReadResponse & { kind: "standard"; state: LiveTournamentState; tournamentId: string } {
  return Boolean(
    response.ok
    && body.ok
    && body.kind === "standard"
    && body.state
    && body.tournamentId === expectedTournamentId,
  );
}

function shouldApplyOrganizerRemoteBody(currentUpdatedAt: string | undefined, body: OrganizerRemoteReadResponse, currentState: LiveTournamentState, currentScoreVersions: Record<string, number> | undefined): boolean {
  if (body.updatedAt && isNewerOrganizerRemoteVersion(currentUpdatedAt, body.updatedAt)) {
    return true;
  }

  if (isOlderOrganizerRemoteVersion(currentUpdatedAt, body.updatedAt)) {
    return false;
  }

  return haveOrganizerMatchScoreVersionsChanged(currentScoreVersions, body.matchScoreVersions)
    || getOrganizerStateSyncSignature(currentState) !== getOrganizerStateSyncSignature(body.state);
}

function haveOrganizerMatchScoreVersionsChanged(currentScoreVersions: Record<string, number> | undefined, nextScoreVersions: Record<string, number> | undefined): boolean {
  if (!nextScoreVersions) {
    return false;
  }

  const currentEntries = Object.entries(currentScoreVersions ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const nextEntries = Object.entries(nextScoreVersions).sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify(currentEntries) !== JSON.stringify(nextEntries);
}

function hasKnownMatchScoreVersions(matchScoreVersions: Record<string, number> | undefined): boolean {
  return Boolean(matchScoreVersions && Object.keys(matchScoreVersions).length > 0);
}

function createByeLabel(state: LiveTournamentState, byePlayerIds: string[]): string | null {
  if (byePlayerIds.length === 0) {
    return null;
  }

  if (state.format === "fixed-partner-americano") {
    const byePlayerIdSet = new Set(byePlayerIds);
    const byePairs: string[] = [];

    for (let index = 0; index < state.players.length; index += 2) {
      const first = state.players[index];
      const second = state.players[index + 1];

      if (first && second && byePlayerIdSet.has(first.id) && byePlayerIdSet.has(second.id)) {
        byePairs.push(`${first.name} / ${second.name}`);
      }
    }

    return byePairs.length ? `Oversidderpar: ${byePairs.join(", ")}` : null;
  }

  const byePlayerNames = byePlayerIds.map((playerId) => getPlayerName(state.players, playerId));
  return byePlayerNames.length === 1
    ? `Oversidder: ${byePlayerNames[0]}`
    : `Oversiddere: ${byePlayerNames.join(", ")}`;
}

function getOrganizerStateSyncSignature(state: LiveTournamentState | undefined): string {
  if (!state) {
    return "";
  }

  return JSON.stringify({
    activeRoundNumber: state.activeRoundNumber,
    finishedAt: state.finishedAt ?? null,
    finalResults: sortMatchResults(state.poolPlay?.finalResults),
    initialResults: sortMatchResults(state.poolPlay?.initialResults),
    nextStageResults: sortMatchResults(state.poolPlay?.nextStageResults),
    placementTiebreakResults: sortMatchResults(state.poolPlay?.placementTiebreakResults),
    results: sortMatchResults(state.results),
    startedMatchIds: [...(state.startedMatchIds ?? [])].sort(),
    status: state.status,
  });
}

function sortMatchResults(results: readonly MatchResult[] | readonly PoolMatchResult[] | undefined): Array<MatchResult | PoolMatchResult> {
  return [...(results ?? [])].sort((left, right) => left.matchId.localeCompare(right.matchId));
}

function doesStateContainSelectedMatch(state: LiveTournamentState, matchId: string): boolean {
  if (state.rounds.some((round) => round.matches.some((match) => match.id === matchId))) {
    return true;
  }

  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    return false;
  }

  return [
    ...poolPlay.initialStage.pools.flatMap((pool) => pool.encounters),
    ...(poolPlay.crossMatchStage?.groups.flatMap((group) => group.encounters) ?? []),
    ...(poolPlay.crossMatchFinalStage?.groups.flatMap((group) => [group.final, group.bronze]) ?? []),
  ].some((encounter) => encounter.id === matchId);
}

async function readOrganizerRemoteState(metadata: { supabaseTournamentId?: string; organizerToken?: string; legacyLocalId?: string }, localId: string): Promise<{ response: Response; body: OrganizerRemoteReadResponse }> {
  if (metadata.supabaseTournamentId) {
    const response = await fetch(`/api/account/tournaments/${encodeURIComponent(metadata.supabaseTournamentId)}`, {
      cache: "no-store",
    });
    const body = await response.json() as OrganizerRemoteReadResponse;

    if (response.ok && body.ok) {
      return { response, body };
    }
  }

  if (!metadata.supabaseTournamentId || !metadata.organizerToken) {
    return {
      response: new Response(JSON.stringify({ ok: false, error: "Missing organizer sync metadata." }), { status: 400 }),
      body: { ok: false, error: "Missing organizer sync metadata." },
    };
  }

  const response = await fetch("/api/supabase/organizer-tournament/read", {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "standard",
      legacyLocalId: metadata.legacyLocalId ?? localId,
      organizerToken: metadata.organizerToken,
      tournamentId: metadata.supabaseTournamentId,
    }),
  });
  const body = await response.json() as OrganizerRemoteReadResponse;
  return { response, body };
}

async function parseShadowSaveWriteResponse(response: Response): Promise<ShadowSaveWriteResponse> {
  try {
    return await response.json() as ShadowSaveWriteResponse;
  } catch {
    return { ok: false, error: "Synchronization failed. Local tournament is preserved." };
  }
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}










