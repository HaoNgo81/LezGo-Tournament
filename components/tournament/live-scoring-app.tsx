"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  calculateLiveStandings,
  canGoToNextRound,
  createMockLiveTournamentState,
  getLiveMatches,
  getPlayerName,
  getRoundProgress,
  goToNextRound,
  goToPreviousRound,
  saveMatchResult,
  setLiveRankingMode,
  startMatch,
  startRoundTimer,
  tickRoundTimer,
  type LiveMatchView,
  type LiveTournamentState,
} from "@/lib/live-scoring";
import { StandingsTable } from "@/components/tournament/standings-table";
import { loadActiveTournament, saveActiveTournament, saveCompletedTournament } from "@/lib/tournament-setup";
import type { MatchResult, StandingsRankingMode, TournamentPlayer } from "@/lib/tournament-engine";

const rankingModeLabels: Record<StandingsRankingMode, string> = {
  matchPointsFirst: "Flest matchpoint",
  partiPointsFirst: "Flest partipoint",
};

export function LiveScoringApp() {
  const [state, setState] = useState<LiveTournamentState>(() => loadActiveTournament() ?? createMockLiveTournamentState());
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const alarmPlayedForRound = useRef<number | null>(null);
  const liveMatches = useMemo(() => getLiveMatches(state), [state]);
  const standings = useMemo(() => calculateLiveStandings(state), [state]);
  const roundProgress = useMemo(() => getRoundProgress(state), [state]);
  const selectedMatch = liveMatches.find((liveMatch) => liveMatch.match.id === selectedMatchId) ?? null;
  const nextRoundIsAvailable = canGoToNextRound(state);

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
    if (state.roundTimer?.status === "expired" && alarmPlayedForRound.current !== state.roundTimer.roundNumber) {
      alarmPlayedForRound.current = state.roundTimer.roundNumber;
      playTimerAlarm();
    }
  }, [state.roundTimer]);function commitState(updater: (currentState: LiveTournamentState) => LiveTournamentState) {
    setState((currentState) => {
      const nextState = updater(currentState);
      saveActiveTournament(nextState);
      if (nextState.status === "finished") {
        saveCompletedTournament(nextState);
      }
      return nextState;
    });
  }

  function handleStartTimer() {
    try {
      commitState((currentState) => startRoundTimer(currentState));
      setToast("Ur startet.");
    } catch (caughtError) {
      setToast(caughtError instanceof Error ? caughtError.message : "Uret kunne ikke startes.");
    }
  }

  function handleStartMatch(matchId: string) {
    commitState((currentState) => startMatch(currentState, matchId));
    setToast("Kamp startet.");
  }

  function handleSave(result: MatchResult) {
    commitState((currentState) => saveMatchResult(currentState, result));
    setSelectedMatchId(null);
    setToast("Resultat gemt.");
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

  return (
    <div className="grid gap-5">
      <div className="app-card p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{state.status === "finished" ? "Afsluttet turnering" : "Aktiv turnering"}</p>
        <h2 className="mt-1 text-2xl font-black">{state.tournamentName}</h2>
        <p className="mt-1 text-sm font-bold text-[var(--muted)]">{state.players.length} spillere · {state.rounds.length} runder</p>
        <div className="mt-4 action-grid">
          <Link className="btn-outline-primary" href="/share">Del turnering</Link>
          <Link className="btn-outline-primary" href="/finish">Afslut turnering</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(220px,1.2fr)]">
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">Runde</p><p className="mt-1 text-2xl font-black">{state.activeRoundNumber} / {state.rounds.length}</p></div>
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">Kampe</p><p className="mt-1 text-2xl font-black">{liveMatches.length}</p></div>
        <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">Gemt i runden</p><p className="mt-1 text-2xl font-black">{roundProgress.completedMatches} / {roundProgress.totalMatches}</p></div>
        <label className="grid gap-2 text-sm font-bold text-[var(--muted)]">
          Sorter stilling efter
          <select className="field-control text-base font-black" value={state.rankingMode} onChange={(event) => handleRankingModeChange(event.target.value as StandingsRankingMode)}>
            {Object.entries(rankingModeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {state.scoringMode === "Spil på tid" ? <RoundTimerPanel state={state} onStart={handleStartTimer} /> : null}
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Runde {state.activeRoundNumber}</h2>
            <p className="text-sm font-bold text-[var(--muted)]">
              {roundProgress.isComplete ? "Runden er færdigscoret." : "Alle kampe skal gemmes før næste runde."}
            </p>
          </div>
          <div className="action-grid">
            <button className="btn-secondary disabled:opacity-40" type="button" disabled={state.activeRoundNumber === 1} onClick={handlePreviousRound}>Forrige</button>
            <button className="btn-primary disabled:bg-gray-300" type="button" disabled={!nextRoundIsAvailable} onClick={handleNextRound}>Næste</button>
          </div>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${(roundProgress.completedMatches / roundProgress.totalMatches) * 100}%` }} />
        </div>
      </section>

      {toast ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{toast}</p> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-black">Kampe</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {liveMatches.map((liveMatch) => (
            <LiveMatchCard key={liveMatch.match.id} liveMatch={liveMatch} players={state.players} onSelect={() => setSelectedMatchId(liveMatch.match.id)} onStart={() => handleStartMatch(liveMatch.match.id)} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-black">Løbende stilling</h2>
          <p className="text-sm font-bold text-[var(--muted)]">{rankingModeLabels[state.rankingMode]}</p>
        </div>
        <StandingsTable standings={standings} />
      </section>

      {selectedMatch ? (
        <ScoreSheet liveMatch={selectedMatch} players={state.players} onClose={() => setSelectedMatchId(null)} onSave={handleSave} />
      ) : null}
    </div>
  );
}

function RoundTimerPanel({ state, onStart }: { state: LiveTournamentState; onStart: () => void }) {
  const timer = state.roundTimer;
  const canStart = !timer || timer.status === "idle" || timer.status === "expired" || timer.roundNumber !== state.activeRoundNumber;
  const label = timer?.status === "countdown" ? `Starter om ${timer.countdownSeconds}s` : timer?.status === "running" ? formatClock(timer.remainingSeconds) : timer?.status === "expired" ? "00:00" : `${state.timeLimitMinutes ?? 0}:00`;

  return (
    <section className="app-card grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Spil på tid</p>
          <h2 className="text-3xl font-black tabular-nums">{label}</h2>
        </div>
        <button className="btn-primary disabled:bg-gray-300" type="button" disabled={!canStart} onClick={onStart}>Start ur</button>
      </div>
      <p className="text-sm font-bold text-[var(--muted)]">15 sekunders nedtælling før uret starter.</p>
    </section>
  );
}
function LiveMatchCard({ liveMatch, players, onSelect, onStart }: { liveMatch: LiveMatchView; players: TournamentPlayer[]; onSelect: () => void; onStart: () => void }) {
  const match = liveMatch.match;
  const scoreText = liveMatch.result ? `${liveMatch.result.teamAPoints} - ${liveMatch.result.teamBPoints}` : "-";
  const statusClass = liveMatch.status === "Afsluttet" ? "bg-green-100 text-[var(--primary-strong)]" : liveMatch.status === "I gang" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-[var(--muted)]";

  return (
    <article className="app-card min-h-44 p-4 text-left transition hover:border-[var(--primary)] focus-within:ring-4 focus-within:ring-green-100">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-black">Bane {match.courtNumber}</h3>
        <span className={`rounded-md px-3 py-1 text-sm font-bold ${statusClass}`}>
          {liveMatch.status}
        </span>
      </div>
      <button className="mt-4 grid w-full gap-2 text-left text-lg font-bold" type="button" onClick={onSelect}>
        <p>{formatTeam(match.teamA.playerIds, players)}</p>
        <p className="text-[var(--muted)]">mod</p>
        <p>{formatTeam(match.teamB.playerIds, players)}</p>
        <span className="mt-2 text-2xl font-black">{scoreText}</span>
      </button>
      <div className="mt-4 action-grid">
        <button className="btn-secondary disabled:opacity-40" type="button" disabled={liveMatch.status !== "Klar"} onClick={onStart}>Start kamp</button>
        <button className="min-h-12 rounded-md bg-[var(--primary)] px-3 font-black text-white" type="button" onClick={onSelect}>{liveMatch.result ? "Rediger" : "Registrer"}</button>
      </div>
    </article>
  );
}

function ScoreSheet({ liveMatch, players, onClose, onSave }: { liveMatch: LiveMatchView; players: TournamentPlayer[]; onClose: () => void; onSave: (result: MatchResult) => void }) {
  const [teamAPoints, setTeamAPoints] = useState(liveMatch.result?.teamAPoints.toString() ?? "0");
  const [teamBPoints, setTeamBPoints] = useState(liveMatch.result?.teamBPoints.toString() ?? "0");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      matchId: liveMatch.match.id,
      teamAPoints: Number(teamAPoints),
      teamBPoints: Number(teamBPoints),
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 max-h-[90svh] overflow-y-auto border-t border-[var(--line)] bg-white p-3 shadow-2xl sm:p-4">
      <form className="mx-auto grid max-w-3xl gap-4" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Bane {liveMatch.match.courtNumber}</p>
            <h2 className="mt-1 text-2xl font-black">Resultat</h2>
          </div>
          <button className="btn-secondary" type="button" onClick={onClose}>Luk</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-base font-bold">
            {formatTeam(liveMatch.match.teamA.playerIds, players)}
            <input inputMode="numeric" pattern="[0-9]*" className="field-control min-h-16 text-center text-3xl font-black" value={teamAPoints} onChange={(event) => setTeamAPoints(event.target.value)} aria-label="Hold A partipoint" />
          </label>
          <label className="grid gap-2 text-base font-bold">
            {formatTeam(liveMatch.match.teamB.playerIds, players)}
            <input inputMode="numeric" pattern="[0-9]*" className="field-control min-h-16 text-center text-3xl font-black" value={teamBPoints} onChange={(event) => setTeamBPoints(event.target.value)} aria-label="Hold B partipoint" />
          </label>
        </div>
        <button className="min-h-14 w-full rounded-md bg-[var(--primary)] px-5 text-lg font-black text-white" type="submit">Gem</button>
      </form>
    </div>
  );
}

function formatTeam(playerIds: readonly string[], players: TournamentPlayer[]): string {
  return playerIds.map((playerId) => getPlayerName(players, playerId)).join(" / ");
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function playTimerAlarm(): void {
  const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = 880;
  gain.gain.value = 0.08;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.6);
}









