"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateLiveStandings,
  createMockLiveTournamentState,
  createPoolPlaySummary,
  finishTournament,
  type PoolPlaySummary,
  type LiveTournamentState,
} from "@/lib/live-scoring";
import { createTournamentResultFileName, createTournamentResultPdf } from "@/lib/results-export";
import {
  loadActiveTournament,
  saveActiveTournament,
  saveCompletedTournament,
} from "@/lib/tournament-setup";
import { StandingsTable } from "@/components/tournament/standings-table";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

const rankingModeLabels = {
  matchPointsFirst: "Flest matchpoint",
  partiPointsFirst: "Flest scorepoint",
} as const;

export function FinishTournamentApp() {
  const [state, setState] = useState<LiveTournamentState>(() => createMockLiveTournamentState());
  const hasHydrated = useHasHydrated();
  const standings = useMemo(() => calculateLiveStandings(state), [state]);
  const poolSummary = useMemo(() => (state.poolPlay ? createPoolPlaySummary(state.poolPlay, state.rankingMode) : null), [state.poolPlay, state.rankingMode]);
  const isFinished = state.status === "finished";

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setState(loadActiveTournament() ?? createMockLiveTournamentState());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <div className="app-card p-4 font-bold text-[var(--muted)]">Indlæser turnering...</div>;
  }

  function handleFinish() {
    const finishedState = finishTournament(state);
    saveActiveTournament(finishedState);
    saveCompletedTournament(finishedState);
    setState(finishedState);
  }

  function handleDownloadPdf() {
    const pdf = createTournamentResultPdf(state);
    const pdfBytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = createTournamentResultFileName(state);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-5">
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{isFinished ? "Turneringen er afsluttet" : "Afslut turnering"}</p>
        <h2 className="text-2xl font-black">{state.tournamentName}</h2>
        <p className="text-sm font-bold text-[var(--muted)]">
          Slutstilling sorteres efter {rankingModeLabels[state.rankingMode].toLocaleLowerCase("da")}. Resultater kan stadig rettes fra live-skærmen efter afslutning.
        </p>
        <div className="action-grid">
          <Link className="btn-secondary min-h-14 text-lg" href="/live">
            Ret resultater
          </Link>
          <button className="btn-outline-primary min-h-14 text-lg" type="button" onClick={handleDownloadPdf}>
            Download PDF
          </button>
          <button className="min-h-14 rounded-md bg-red-600 px-5 text-lg font-black text-white disabled:bg-gray-300" type="button" disabled={isFinished} onClick={handleFinish}>
            {isFinished ? "Afsluttet" : "Afslut turnering nu"}
          </button>
        </div>
      </section>

      {poolSummary ? <PoolPlayFinishSummary summary={poolSummary} /> : (
        <section className="grid gap-3">
          <h2 className="text-xl font-black">Slutstilling</h2>
          <StandingsTable standings={standings} />
        </section>
      )}
    </div>
  );
}

function PoolPlayFinishSummary({ summary }: { summary: PoolPlaySummary }) {
  return (
    <div className="grid gap-5">
      {summary.finalPlacements.length > 0 ? (
        <section className="grid gap-3" aria-label="Slutplaceringer">
          <h2 className="text-xl font-black">Slutplaceringer</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.finalPlacements.map((placement) => (
              <article key={`${placement.groupName}-${placement.rank}`} className="app-card flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{placement.groupName}</p>
                  <h3 className="mt-1 text-lg font-black">{placement.participantName}</h3>
                </div>
                <span className="text-3xl font-black">{placement.rank}.</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="text-xl font-black">Puljestillinger</h2>
        <div className="grid gap-4">
          {summary.initialStandings.map((table) => (
            <section key={table.poolId} className="grid gap-3" aria-labelledby={`${table.poolId}-finish-heading`}>
              <h3 id={`${table.poolId}-finish-heading`} className="text-lg font-black">{table.poolName}</h3>
              <StandingsTable standings={table.rows} />
            </section>
          ))}
        </div>
      </section>

      {summary.nextPhaseMatches.length > 0 ? (
        <section className="grid gap-3" aria-label="Næste fase">
          <h2 className="text-xl font-black">Næste fase</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.nextPhaseMatches.map((match) => (
              <article key={match.id} className="app-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{match.groupName}</p>
                    <h3 className="mt-1 text-lg font-black">{match.label}</h3>
                  </div>
                  {match.matchesPerTeam ? <span className="rounded-md bg-[var(--primary-soft)] px-3 py-1 text-sm font-black text-[var(--primary-strong)]">{match.matchesPerTeam} delkampe</span> : null}
                </div>
                <p className="mt-3 font-bold">{match.teamAName}</p>
                <p className="text-sm font-bold uppercase text-[var(--muted)]">mod</p>
                <p className="font-bold">{match.teamBName}</p>
                <p className="mt-3 text-2xl font-black">{match.result ? formatPoolResultScore(match.result) : "Ikke spillet"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {summary.finalMatches.length > 0 ? (
        <section className="grid gap-3" aria-label="Finaler">
          <h2 className="text-xl font-black">Finaler</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.finalMatches.map((match) => (
              <article key={match.id} className="app-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{match.groupName}</p>
                    <h3 className="mt-1 text-lg font-black">{match.label}</h3>
                  </div>
                  {match.matchesPerTeam ? <span className="rounded-md bg-[var(--primary-soft)] px-3 py-1 text-sm font-black text-[var(--primary-strong)]">{match.matchesPerTeam} delkampe</span> : null}
                </div>
                <p className="mt-3 font-bold">{match.teamAName}</p>
                <p className="text-sm font-bold uppercase text-[var(--muted)]">mod</p>
                <p className="font-bold">{match.teamBName}</p>
                <p className="mt-3 text-2xl font-black">{match.result ? formatPoolResultScore(match.result) : "Ikke spillet"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {summary.placementTiebreakMatches.length > 0 ? (
        <section className="grid gap-3" aria-label="Tiebreak om placering">
          <h2 className="text-xl font-black">Tiebreak om placering</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.placementTiebreakMatches.map((match) => (
              <article key={match.id} className="app-card p-4">
                <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{match.groupName}</p>
                <h3 className="mt-1 text-lg font-black">{match.label}</h3>
                <p className="mt-3 font-bold">{match.teamAName}</p>
                <p className="text-sm font-bold uppercase text-[var(--muted)]">mod</p>
                <p className="font-bold">{match.teamBName}</p>
                <p className="mt-3 text-2xl font-black">{match.result ? formatPoolResultScore(match.result) : "Ikke spillet"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {summary.automaticAdvances.length > 0 ? (
        <section className="grid gap-3" aria-label="Automatisk videre">
          <h2 className="text-xl font-black">Automatisk videre</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.automaticAdvances.map((advance) => (
              <article key={advance.id} className="app-card p-4">
                <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{advance.resolution === "bye" ? "Oversidning" : "Walkover"}</p>
                <h3 className="mt-1 text-lg font-black">{advance.participantName}</h3>
                <p className="mt-2 text-sm font-bold text-[var(--muted)]">{advance.sourcePoolName}, nr. {advance.sourceRank}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatPoolResultScore(result: NonNullable<PoolPlaySummary["nextPhaseMatches"][number]["result"]>): string {
  const baseScore = `${result.teamAPoints} - ${result.teamBPoints}`;

  return result.tieBreakWinner ? `${baseScore} (MTB: ${result.tieBreakWinner === "teamA" ? "hold A" : "hold B"})` : baseScore;
}
