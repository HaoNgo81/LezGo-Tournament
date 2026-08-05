"use client";

import { useMemo, useState } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { StandingsTable } from "@/components/tournament/standings-table";
import { Section } from "@/components/ui/section";
import { createMockLiveTournamentState, type LiveTournamentState } from "@/lib/live-scoring";
import { createReadOnlyTournamentView } from "@/lib/read-only-views";
import { loadActiveTournament } from "@/lib/tournament-setup";

export function QrTournamentApp() {
  const [state] = useState<LiveTournamentState>(() => loadActiveTournament() ?? createMockLiveTournamentState());
  const view = useMemo(() => createReadOnlyTournamentView(state), [state]);

  return (
    <div className="grid gap-5">
      <Section title={view.tournamentName}>
        <div className="grid gap-3 app-card p-4 text-lg leading-8">
          <p><strong>Runde:</strong> {view.activeRoundNumber} / {view.totalRounds}</p>
          <p><strong>Spillere:</strong> {view.players}</p>
          <p><strong>Baner:</strong> {view.courts}</p>
        </div>
      </Section>

      <Section title="Alle spillere">
        <div className="grid gap-3">
          {view.playerInfo.map((player) => (
            <article key={player.playerId} className="app-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black">{player.playerName}</h3>
                  <p className="mt-1 text-sm font-bold text-[var(--muted)]">Placering #{player.rank}</p>
                </div>
                <span className="rounded-md bg-green-100 px-3 py-1 text-sm font-bold text-[var(--primary-strong)]">{player.court}</span>
              </div>
              <div className="mt-4 grid gap-2 text-lg leading-7">
                <p><strong>Makker:</strong> {player.partnerName}</p>
                <p><strong>Modstandere:</strong> {player.opponents}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Kampe i aktiv runde">
        <MatchCards matches={view.matches} />
      </Section>

      <Section title="Hele stillingen">
        <StandingsTable standings={view.standings} />
      </Section>

      <Section title="Runder">
        <div className="grid gap-3">
          {view.rounds.map((round) => (
            <article key={round.roundNumber} className="app-card p-4">
              <strong>Runde {round.roundNumber}:</strong> {round.label}
            </article>
          ))}
        </div>
      </Section>

      <Section title="Info">
        <p className="app-card p-4 text-lg leading-7">Visningen er read-only og viser turneringens aktuelle kampe, runder og stilling.</p>
      </Section>
    </div>
  );
}

