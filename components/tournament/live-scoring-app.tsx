"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  getNextPoolPhaseProgress,
  getLiveMatches,
  getPlayerName,
  getRoundProgress,
  goToNextRound,
  goToPreviousRound,
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
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";
import { calculateInitialPoolStandings, loadActiveTournament, saveActiveTournament, saveCompletedTournament, type CrossMatchFinalEncounter, type CrossMatchFinalStage, type PoolMatchResult, type PoolParticipant } from "@/lib/tournament-setup";
import { calculateFixedTotalScore } from "@/lib/tournament-setup/scoring";
import { loadTournamentSettings, playTournamentAlarmSound } from "@/lib/tournament-settings";
import type { MatchResult, StandingsRankingMode, TournamentPlayer } from "@/lib/tournament-engine";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

const rankingModeLabels: Record<StandingsRankingMode, TranslationKey> = {
  matchPointsFirst: "mostMatchPoints",
  partiPointsFirst: "mostScorePoints",
};

export function LiveScoringApp() {
  const { t } = useAppTranslation();
  const [state, setState] = useState<LiveTournamentState>(() => createMockLiveTournamentState());
  const stateRef = useRef(state);
  const hasHydrated = useHasHydrated();
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const alarmPlayedForRound = useRef<number | null>(null);
  const isPoolPlay = Boolean(state.poolPlay);
  const liveMatches = useMemo(() => (isPoolPlay ? [] : getLiveMatches(state)), [isPoolPlay, state]);
  const standings = useMemo(() => (isPoolPlay ? [] : calculateLiveStandings(state)), [isPoolPlay, state]);
  const roundProgress = useMemo(() => (isPoolPlay ? null : getRoundProgress(state)), [isPoolPlay, state]);
  const poolMatchViews = useMemo(() => (state.poolPlay ? getInitialPoolMatchViews(state.poolPlay.initialStage, state.poolPlay.initialResults) : []), [state.poolPlay]);
  const nextPoolMatchViews = useMemo(() => (state.poolPlay ? getNextPoolPhaseMatchViews(state.poolPlay, state.poolPlay.nextStageResults ?? []) : []), [state.poolPlay]);
  const finalPoolMatchViews = useMemo(() => (state.poolPlay ? getPoolFinalMatchViews(state.poolPlay, state.poolPlay.finalResults ?? []) : []), [state.poolPlay]);
  const placementTiebreakMatchViews = useMemo(() => (state.poolPlay ? getPlacementTiebreakMatchViews(state.poolPlay, state.poolPlay.placementTiebreakResults ?? []) : []), [state.poolPlay]);
  const poolProgress = useMemo(() => (state.poolPlay ? getInitialPoolProgress(state.poolPlay) : null), [state.poolPlay]);
  const nextPoolProgress = useMemo(() => (state.poolPlay ? getNextPoolPhaseProgress(state.poolPlay) : null), [state.poolPlay]);
  const finalPoolProgress = useMemo(() => (state.poolPlay ? getPoolFinalProgress(state.poolPlay) : null), [state.poolPlay]);
  const selectedMatch = liveMatches.find((liveMatch) => liveMatch.match.id === selectedMatchId) ?? null;
  const selectedPoolMatch = [...poolMatchViews, ...nextPoolMatchViews, ...finalPoolMatchViews, ...placementTiebreakMatchViews].find((match) => match.id === selectedMatchId) ?? null;
  const nextRoundIsAvailable = !isPoolPlay && canGoToNextRound(state);
  const rankingModeIsLocked = state.format === "mexicano" || state.format === "fixed-partner-mexicano";

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const loadedState = loadActiveTournament() ?? createMockLiveTournamentState();
      stateRef.current = loadedState;
      setState(loadedState);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  useEffect(() => {
    if (state.roundTimer?.status !== "countdown" && state.roundTimer?.status !== "running") {
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
  }, [state.roundTimer?.status]);

  useEffect(() => {
    if (state.scoringMode === "Spil på tid" && state.roundTimer?.status === "expired" && alarmPlayedForRound.current !== state.roundTimer.roundNumber) {
      alarmPlayedForRound.current = state.roundTimer.roundNumber;
      void playTournamentAlarmSound(loadTournamentSettings().alarmSound, 3);
    }
  }, [state.roundTimer, state.scoringMode]);

  function commitState(updater: (currentState: LiveTournamentState) => LiveTournamentState) {
    const nextState = updater(stateRef.current);
    saveActiveTournament(nextState);
    if (nextState.status === "finished") {
      saveCompletedTournament(nextState);
    }
    stateRef.current = nextState;
    setState(nextState);
  }

  if (!hasHydrated) {
    return <div className="app-card p-4 font-bold text-[var(--muted)]">{t("loadingTournament")}</div>;
  }

  function handleStartTimer() {
    try {
      commitState((currentState) => startRoundTimer(currentState));
      setToast("Ur startet.");
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Uret kunne ikke startes.");
    }
  }

  function handleSave(result: MatchResult) {
    try {
      commitState((currentState) => saveMatchResult(currentState, result));
      setSelectedMatchId(null);
      setToast("Resultat gemt.");
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Resultatet kunne ikke gemmes.");
    }
  }

  function handleSavePoolResult(result: PoolMatchResult) {
    commitState((currentState) => saveInitialPoolResult(currentState, result));
    setSelectedMatchId(null);
    setToast("Puljeresultat gemt.");
  }

  function handleSavePoolScore(result: PoolMatchResult) {
    if (selectedPoolMatch?.stage === "placementTiebreak") {
      commitState((currentState) => savePoolPlacementTiebreakResult(currentState, result));
      setSelectedMatchId(null);
      setToast("Tiebreak-resultat gemt.");
      return;
    }

    if (selectedPoolMatch?.stage === "final") {
      commitState((currentState) => savePoolFinalResult(currentState, result));
      setSelectedMatchId(null);
      setToast("Finaleresultat gemt.");
      return;
    }

    if (selectedPoolMatch?.stage === "next") {
      commitState((currentState) => saveNextPoolPhaseResult(currentState, result));
      setSelectedMatchId(null);
      setToast("Næste faseresultat gemt.");
      return;
    }

    handleSavePoolResult(result);
  }

  function handleAdvancePoolPlay() {
    try {
      const phase = state.poolPlay?.phase;
      commitState((currentState) => (
        currentState.poolPlay?.phase === "crossMatches"
          ? advanceLivePoolPlayToFinals(currentState)
          : advanceLivePoolPlayState(currentState)
      ));
      setSelectedMatchId(null);
      setToast(phase === "crossMatches" ? "Finaler oprettet." : "Næste fase oprettet.");
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Fasen kan ikke oprettes endnu.");
    }
  }

  function handleStopTimer() {
    commitState((currentState) => stopRoundTimer(currentState));
    setToast("Uret er stoppet.");
  }

  function handleResetTimer() {
    commitState((currentState) => resetRoundTimer(currentState));
    setToast("Uret er nulstillet.");
  }

  function handleRankingModeChange(rankingMode: StandingsRankingMode) {
    commitState((currentState) => setLiveRankingMode(currentState, rankingMode));
  }

  function handlePreviousRound() {
    commitState((currentState) => goToPreviousRound(currentState));
    setSelectedMatchId(null);
    setToast("");
  }

  function handleNextRound() {
    try {
      commitState((currentState) => goToNextRound(currentState));
      setSelectedMatchId(null);
      setToast("Næste runde åbnet.");
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Næste runde kan ikke åbnes endnu.");
    }
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
        toast={toast}
        onAdvance={handleAdvancePoolPlay}
        onCloseScoreSheet={() => setSelectedMatchId(null)}
        onSaveResult={handleSavePoolScore}
        onSelectMatch={setSelectedMatchId}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <div className="app-card p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{state.status === "finished" ? t("completedTournament") : t("activeTournament")}</p>
        <h2 className="mt-1 text-2xl font-black">{state.tournamentName}</h2>
        <p className="mt-1 text-sm font-bold text-[var(--muted)]">{state.players.length} {t("players").toLowerCase()} · {state.configuredRounds ?? state.rounds.length} {t("rounds").toLowerCase()}</p>
        <div className="mt-4 action-grid">
          <Link className="btn-outline-primary" href="/share">{t("shareTournament")}</Link>
          <Link className="btn-outline-primary" href="/tv">{t("tvMirror")}</Link>
          <Link className="btn-outline-primary" href="/finish">{t("finishTournament")}</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(220px,1.2fr)]">
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">{t("round")}</p><p className="mt-1 text-2xl font-black">{state.activeRoundNumber} / {state.configuredRounds ?? state.rounds.length}</p></div>
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">{t("matches")}</p><p className="mt-1 text-2xl font-black">{liveMatches.length}</p></div>
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">{t("savedInRound")}</p><p className="mt-1 text-2xl font-black">{roundProgress?.completedMatches} / {roundProgress?.totalMatches}</p></div>
        <div className="grid gap-2 text-sm font-bold text-[var(--muted)]">
          <span>{t("rankingSort")}</span>
          {rankingModeIsLocked ? (
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

      {state.scoringMode === "Spil på tid" ? <RoundTimerPanel state={state} onReset={handleResetTimer} onStart={handleStartTimer} onStop={handleStopTimer} /> : null}
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{t("round")} {state.activeRoundNumber}</h2>
            <p className="text-sm font-bold text-[var(--muted)]">
              {roundProgress?.isComplete ? t("roundComplete") : t("roundIncomplete")}
            </p>
          </div>
          <div className="action-grid">
            <button className="btn-secondary disabled:opacity-40" type="button" disabled={state.activeRoundNumber === 1} onClick={handlePreviousRound}>{t("previous")}</button>
            <button className="btn-primary disabled:bg-gray-300" type="button" disabled={!nextRoundIsAvailable} onClick={handleNextRound}>{t("next")}</button>
          </div>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${((roundProgress?.completedMatches ?? 0) / (roundProgress?.totalMatches ?? 1)) * 100}%` }} />
        </div>
      </section>

      {toast ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{toast}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-black">{t("matches")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {liveMatches.map((liveMatch) => (
              <LiveMatchCard key={liveMatch.match.id} liveMatch={liveMatch} players={state.players} onSelect={() => setSelectedMatchId(liveMatch.match.id)} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xl font-black">{t("liveScore")}</h2>
            <p className="text-sm font-bold text-[var(--muted)]">{t(rankingModeLabels[state.rankingMode])}</p>
          </div>
          <StandingsTable standings={standings} />
          <button className="btn-primary min-h-14 disabled:bg-gray-300" type="button" disabled={!nextRoundIsAvailable} onClick={handleNextRound}>{t("next")}</button>
        </section>
      </div>

      {selectedMatch ? (
        <ScoreSheet liveMatch={selectedMatch} players={state.players} state={state} onClose={() => setSelectedMatchId(null)} onSave={handleSave} />
      ) : null}
    </div>
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
      <div className="app-card p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Aktiv turnering</p>
        <h2 className="mt-1 text-2xl font-black">{state.tournamentName}</h2>
        <p className="mt-1 text-sm font-bold text-[var(--muted)]">
          Puljespil · {state.poolPlay.initialStage.participants.length} deltagere · {state.poolPlay.initialStage.pools.length} puljer
        </p>
        <div className="mt-4 action-grid">
          <Link className="btn-outline-primary" href="/share">Del turnering</Link>
          <Link className="btn-outline-primary" href="/tv">TV / Mirror</Link>
          <Link className="btn-outline-primary" href="/finish">Afslut turnering</Link>
        </div>
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
                    <PoolMatchCard key={match.id} match={match} onSelect={() => onSelectMatch(match.id)} />
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
              <PoolMatchCard key={match.id} match={match} onSelect={() => onSelectMatch(match.id)} />
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
                  <PoolMatchCard key={match.id} match={match} onSelect={() => onSelectMatch(match.id)} />
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

      {selectedMatch ? (
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
  onAdvance,
}: {
  poolPlay: NonNullable<LiveTournamentState["poolPlay"]>;
  poolProgress: NonNullable<ReturnType<typeof getInitialPoolProgress>>;
  nextPoolProgress: ReturnType<typeof getNextPoolPhaseProgress>;
  finalPoolProgress: ReturnType<typeof getPoolFinalProgress>;
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
          {poolPlay.crossMatchStage?.participantType !== "player" ? (
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
        {poolPlay.phase === "initial" ? (
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

function PoolMatchCard({ match, onSelect }: { match: PoolMatchView; onSelect: () => void }) {
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
      <button className="mt-4 grid w-full gap-2 text-left text-lg font-bold" type="button" onClick={onSelect}>
        <p className="leading-7">
          <span>{match.teamAName}</span>{" "}
          <span className="text-[var(--muted)]">vs</span>{" "}
          <span>{match.teamBName}</span>
        </p>
        <span className="mt-2 text-2xl font-black">{isCompleted ? formatPoolResultScore(match) : "-"}</span>
      </button>
      <button className="mt-4 min-h-12 w-full rounded-md bg-[var(--primary)] px-3 font-black text-[var(--primary-text)]" type="button" onClick={onSelect}>{isCompleted ? t("editScore") : t("enterScore")}</button>
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

function LiveMatchCard({ liveMatch, players, onSelect }: { liveMatch: LiveMatchView; players: TournamentPlayer[]; onSelect: () => void }) {
  const { t } = useAppTranslation();
  const match = liveMatch.match;
  const scoreText = liveMatch.result ? `${liveMatch.result.teamAPoints} - ${liveMatch.result.teamBPoints}` : "-";
  const statusClass = liveMatch.status === "Afsluttet" ? "bg-green-100 text-[var(--primary-strong)]" : liveMatch.status === "I gang" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-[var(--muted)]";
  const teamAName = formatTeam(match.teamA.playerIds, players);
  const teamBName = formatTeam(match.teamB.playerIds, players);

  return (
    <article className="app-card min-h-44 p-4 text-left transition hover:border-[var(--primary)] focus-within:ring-4 focus-within:ring-green-100">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-black">{t("court")} {match.courtNumber}</h3>
        <span className={`rounded-md px-3 py-1 text-sm font-bold ${statusClass}`}>
          {liveMatch.status === "Afsluttet" ? t("completed") : liveMatch.status === "Klar" ? t("ready") : liveMatch.status}
        </span>
      </div>
      <button className="mt-4 grid w-full gap-2 text-left text-lg font-bold" type="button" onClick={onSelect}>
        <p className="leading-7">
          <span>{teamAName}</span>{" "}
          <span className="text-[var(--muted)]">vs</span>{" "}
          <span>{teamBName}</span>
        </p>
        <span className="mt-2 text-2xl font-black">{scoreText}</span>
      </button>
      <button className="mt-4 min-h-12 w-full rounded-md bg-[var(--primary)] px-3 font-black text-[var(--primary-text)]" type="button" onClick={onSelect}>{liveMatch.result ? t("editScore") : t("enterScore")}</button>
    </article>
  );
}

function ScoreSheet({ liveMatch, players, state, onClose, onSave }: { liveMatch: LiveMatchView; players: TournamentPlayer[]; state: LiveTournamentState; onClose: () => void; onSave: (result: MatchResult) => void }) {
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
      onSave({
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

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}










