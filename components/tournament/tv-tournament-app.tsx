"use client";

import { useEffect, useMemo, useState } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { StandingsTable } from "@/components/tournament/standings-table";
import { createMockLiveTournamentState, type LiveTournamentState } from "@/lib/live-scoring";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView, type ReadOnlyTournamentView, type TeamVsTeamReadOnlyView } from "@/lib/read-only-views";
import { loadActiveTeamVsTeamTournament, loadActiveTournament, type TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

export function TvTournamentApp() {
  const [teamVsTeamState, setTeamVsTeamState] = useState<TeamVsTeamTournamentState | null>(null);
  const [state, setState] = useState<LiveTournamentState>(() => createMockLiveTournamentState());
  const hasHydrated = useHasHydrated();

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setTeamVsTeamState(loadActiveTeamVsTeamTournament());
      setState(loadActiveTournament() ?? createMockLiveTournamentState());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <div className="app-card p-4 font-bold text-[var(--muted)]">Indlæser turnering...</div>;
  }

  if (teamVsTeamState) {
    return <TeamVsTeamTvView view={createTeamVsTeamReadOnlyView(teamVsTeamState)} />;
  }

  return <StandardTvView state={state} />;
}

function StandardTvView({ state }: { state: LiveTournamentState }) {
  const view = useMemo(() => createReadOnlyTournamentView(state), [state]);

  if (view.poolPlay) {
    return <PoolPlayTvView view={view} poolPlay={view.poolPlay} />;
  }

  return (
    <main className="min-h-screen bg-[#0f1b14] p-6 text-white md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/20 pb-5">
        <div>
          <p className="text-lg font-bold uppercase text-[#f7d046]">LEZGO PADEL TV</p>
          <h1 className="mt-2 text-4xl font-black md:text-6xl">{view.tournamentName}</h1>
        </div>
        <div className="grid grid-cols-2 gap-4 text-right md:grid-cols-4">
          <div><p className="text-white/60">Runde</p><p className="text-4xl font-black">{view.activeRoundNumber} / {view.totalRounds}</p></div>
          <div><p className="text-white/60">Spillere</p><p className="text-4xl font-black">{view.players}</p></div>
          <div><p className="text-white/60">Baner</p><p className="text-4xl font-black">{view.courts}</p></div>
        </div>
      </header>
      {view.byePlayers.length ? <p className="mt-5 rounded-md bg-[#f7d046] p-3 text-lg font-black text-[#0f1b14]">Pause: {view.byePlayers.join(" / ")}</p> : null}
      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="[&_article]:bg-white [&_article]:text-[var(--foreground)]">
          <h2 className="mb-3 text-2xl font-black">Alle baner</h2>
          <MatchCards matches={view.matches} />
        </div>
        <div className="[&_table]:bg-white [&_table]:text-[var(--foreground)]">
          <h2 className="mb-3 text-2xl font-black">Hele stillingen</h2>
          <StandingsTable standings={view.standings} />
        </div>
      </section>
    </main>
  );
}

function PoolPlayTvView({ view, poolPlay }: { view: ReadOnlyTournamentView; poolPlay: NonNullable<ReadOnlyTournamentView["poolPlay"]> }) {
  return (
    <main className="min-h-screen bg-[#0f1b14] p-6 text-white md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/20 pb-5">
        <div>
          <p className="text-lg font-bold uppercase text-[#f7d046]">LEZGO PADEL TV</p>
          <h1 className="mt-2 text-4xl font-black md:text-6xl">{view.tournamentName}</h1>
          <p className="mt-3 text-xl font-bold text-white/70">Puljespil · {poolPlay.phase}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-right md:grid-cols-4">
          <div><p className="text-white/60">Deltagere</p><p className="text-4xl font-black">{poolPlay.participantCount}</p></div>
          <div><p className="text-white/60">Puljer</p><p className="text-4xl font-black">{poolPlay.poolCount}</p></div>
          <div><p className="text-white/60">Næste fase</p><p className="text-4xl font-black">{poolPlay.nextPhaseMatches.length}</p></div>
          <div><p className="text-white/60">Finaler</p><p className="text-4xl font-black">{poolPlay.finalMatches.length}</p></div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-6 [&_article]:bg-white [&_article]:text-[var(--foreground)]">
          {poolPlay.finalMatches.length ? (
            <section>
              <h2 className="mb-3 text-2xl font-black">Finaler</h2>
              <MatchCards matches={poolPlay.finalMatches} />
            </section>
          ) : null}
          {poolPlay.placementTiebreakMatches.length ? (
            <section>
              <h2 className="mb-3 text-2xl font-black">Tiebreak om placering</h2>
              <MatchCards matches={poolPlay.placementTiebreakMatches} />
            </section>
          ) : null}
          <h2 className="mb-3 text-2xl font-black">Næste fase</h2>
          {poolPlay.nextPhaseMatches.length ? <MatchCards matches={poolPlay.nextPhaseMatches} /> : <p className="rounded-md bg-white p-4 text-lg font-black text-[var(--foreground)]">Næste fase er ikke oprettet endnu.</p>}
        </div>

        <div className="grid gap-6 [&_table]:bg-white [&_table]:text-[var(--foreground)]">
          <h2 className="text-2xl font-black">Puljestillinger</h2>
          {poolPlay.initialStandings.map((table) => (
            <section key={table.poolId} className="grid gap-3" aria-labelledby={`${table.poolId}-tv-heading`}>
              <h3 id={`${table.poolId}-tv-heading`} className="text-xl font-black">{table.poolName}</h3>
              <StandingsTable standings={table.rows} />
            </section>
          ))}
        </div>
      </section>

      {poolPlay.finalPlacements.length ? (
        <section className="mt-6">
          <h2 className="mb-3 text-2xl font-black">Slutplaceringer</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {poolPlay.finalPlacements.map((placement) => (
              <article key={`${placement.groupName}-${placement.rank}`} className="rounded-md bg-white p-4 text-[var(--foreground)]">
                <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{placement.groupName}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <h3 className="text-2xl font-black">{placement.participantName}</h3>
                  <span className="text-4xl font-black">{placement.rank}.</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {poolPlay.automaticAdvances.length ? (
        <section className="mt-6">
          <h2 className="mb-3 text-2xl font-black">Automatisk videre</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {poolPlay.automaticAdvances.map((advance) => (
              <article key={advance.id} className="rounded-md bg-white p-4 text-[var(--foreground)]">
                <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{advance.resolution === "bye" ? "Oversidning" : "Walkover"}</p>
                <h3 className="mt-1 text-2xl font-black">{advance.participantName}</h3>
                <p className="mt-2 font-bold text-[var(--muted)]">{advance.sourcePoolName}, nr. {advance.sourceRank}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function TeamVsTeamTvView({ view }: { view: TeamVsTeamReadOnlyView }) {
  return (
    <main className="min-h-screen bg-[#0f1b14] p-6 text-white md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/20 pb-5">
        <div>
          <p className="text-lg font-bold uppercase text-[#f7d046]">LEZGO PADEL TV</p>
          <h1 className="mt-2 text-4xl font-black md:text-6xl">{view.tournamentName}</h1>
          <p className="mt-3 text-xl font-bold text-white/70">Team vs. Team · {view.activeMatchLabel} · Runde {view.activeRoundNumber} / {view.totalRounds}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-right md:grid-cols-4">
          <div><p className="text-white/60">Hold</p><p className="text-4xl font-black">{view.teamsCount}</p></div>
          <div><p className="text-white/60">Spillere/hold</p><p className="text-4xl font-black">{view.playersPerTeam}</p></div>
          <div><p className="text-white/60">Kampformat</p><p className="text-3xl font-black">{view.matchFormat}</p></div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-6">
          <div className="[&_article]:bg-white [&_article]:text-[var(--foreground)]">
            <h2 className="mb-3 text-2xl font-black">Aktuelle kampe</h2>
            {view.matches.length ? <MatchCards matches={view.matches} /> : <p className="rounded-md bg-white p-4 text-lg font-black text-[var(--foreground)]">Opstilling er ikke gemt endnu.</p>}
          </div>
          <div>
            <h2 className="mb-3 text-2xl font-black">Holdkaptajner</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {view.teams.map((team) => (
                <article key={team.teamId} className="rounded-md bg-white p-4 text-[var(--foreground)]">
                  <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{team.teamName}</p>
                  <h3 className="mt-1 text-2xl font-black">{team.captainName}</h3>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-2xl font-black">Holdstilling</h2>
          <div className="grid gap-3">
            {view.standings.map((standing) => (
              <article key={standing.teamId} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-md bg-white p-4 text-[var(--foreground)]">
                <span className="text-4xl font-black text-[var(--primary-strong)]">#{standing.rank}</span>
                <div>
                  <h3 className="text-2xl font-black">{standing.teamName}</h3>
                  <p className="font-bold text-[var(--muted)]">Holdkampe: {standing.won}-{standing.lost}</p>
                </div>
                <p className="text-right text-3xl font-black">{standing.matchWins}-{standing.matchLosses}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
