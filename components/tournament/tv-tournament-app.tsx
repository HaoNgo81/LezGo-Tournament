"use client";

import { useMemo, useState } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { StandingsTable } from "@/components/tournament/standings-table";
import { createMockLiveTournamentState, type LiveTournamentState } from "@/lib/live-scoring";
import { createReadOnlyTournamentView } from "@/lib/read-only-views";
import { loadActiveTournament } from "@/lib/tournament-setup";

export function TvTournamentApp() {
  const [state] = useState<LiveTournamentState>(() => loadActiveTournament() ?? createMockLiveTournamentState());
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

