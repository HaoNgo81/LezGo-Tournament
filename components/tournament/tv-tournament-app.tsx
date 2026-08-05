"use client";

import { useMemo, useState } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { StandingsTable } from "@/components/tournament/standings-table";
import { createMockLiveTournamentState, type LiveTournamentState } from "@/lib/live-scoring";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView, type TeamVsTeamReadOnlyView } from "@/lib/read-only-views";
import { loadActiveTeamVsTeamTournament, loadActiveTournament, type TeamVsTeamTournamentState } from "@/lib/tournament-setup";

export function TvTournamentApp() {
  const [teamVsTeamState] = useState<TeamVsTeamTournamentState | null>(() => loadActiveTeamVsTeamTournament());
  const [state] = useState<LiveTournamentState>(() => loadActiveTournament() ?? createMockLiveTournamentState());

  if (teamVsTeamState) {
    return <TeamVsTeamTvView view={createTeamVsTeamReadOnlyView(teamVsTeamState)} />;
  }

  return <StandardTvView state={state} />;
}

function StandardTvView({ state }: { state: LiveTournamentState }) {
  const view = useMemo(() => createReadOnlyTournamentView(state), [state]);

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