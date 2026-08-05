"use client";

import { useMemo, useState } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { StandingsTable } from "@/components/tournament/standings-table";
import { Section } from "@/components/ui/section";
import { createMockLiveTournamentState, type LiveTournamentState } from "@/lib/live-scoring";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView, type TeamVsTeamReadOnlyView } from "@/lib/read-only-views";
import { loadActiveTeamVsTeamTournament, loadActiveTournament, type TeamVsTeamTournamentState } from "@/lib/tournament-setup";

export function QrTournamentApp() {
  const [teamVsTeamState] = useState<TeamVsTeamTournamentState | null>(() => loadActiveTeamVsTeamTournament());
  const [state] = useState<LiveTournamentState>(() => loadActiveTournament() ?? createMockLiveTournamentState());

  if (teamVsTeamState) {
    return <TeamVsTeamQrView view={createTeamVsTeamReadOnlyView(teamVsTeamState)} />;
  }

  return <StandardQrView state={state} />;
}

function StandardQrView({ state }: { state: LiveTournamentState }) {
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

function TeamVsTeamQrView({ view }: { view: TeamVsTeamReadOnlyView }) {
  return (
    <div className="grid gap-5">
      <Section title={view.tournamentName}>
        <div className="grid gap-3 app-card p-4 text-lg leading-8">
          <p><strong>Format:</strong> Team vs. Team</p>
          <p><strong>Holdkamp:</strong> {view.activeMatchLabel}</p>
          <p><strong>Runde:</strong> {view.activeRoundNumber} / {view.totalRounds}</p>
          <p><strong>Hold:</strong> {view.teamsCount}</p>
          <p><strong>Spillere pr. hold:</strong> {view.playersPerTeam}</p>
          <p><strong>Kampformat:</strong> {view.matchFormat}</p>
        </div>
      </Section>

      <Section title="Holdkaptajner">
        <div className="grid gap-3 sm:grid-cols-2">
          {view.teams.map((team) => (
            <article key={team.teamId} className="app-card p-4">
              <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{team.teamName}</p>
              <h3 className="mt-1 text-xl font-black">{team.captainName}</h3>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Aktuelle kampe">
        {view.matches.length ? <MatchCards matches={view.matches} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">Opstilling er ikke gemt endnu.</p>}
      </Section>

      <Section title="Holdstilling">
        <TeamVsTeamStandingCards view={view} />
      </Section>

      <Section title="Info">
        <p className="app-card p-4 text-lg leading-7">Visningen er read-only og viser Team vs. Team-holdkampens aktuelle opstilling, kampe og stilling.</p>
      </Section>
    </div>
  );
}

function TeamVsTeamStandingCards({ view }: { view: TeamVsTeamReadOnlyView }) {
  return (
    <div className="grid gap-3">
      {view.standings.map((standing) => (
        <article key={standing.teamId} className="app-card grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4">
          <span className="text-2xl font-black">#{standing.rank}</span>
          <div>
            <h3 className="text-xl font-black">{standing.teamName}</h3>
            <p className="font-bold text-[var(--muted)]">Holdkampe: {standing.won}-{standing.lost}</p>
          </div>
          <p className="text-right text-lg font-black">{standing.matchWins}-{standing.matchLosses}</p>
        </article>
      ))}
    </div>
  );
}