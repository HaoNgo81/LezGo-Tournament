"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/ui/section";
import {
  deleteCompletedTournament,
  loadActiveTeamVsTeamTournament,
  loadActiveTournament,
  loadCompletedTournaments,
  reopenCompletedTournament,
  restoreCompletedTournament,
  type CompletedTournament,
  type TeamVsTeamTournamentState,
} from "@/lib/tournament-setup";
import type { LiveTournamentState } from "@/lib/live-scoring";

export function TournamentListApp() {
  const [activeTournament] = useState<LiveTournamentState | null>(() => loadActiveTournament());
  const [activeTeamVsTeamTournament] = useState<TeamVsTeamTournamentState | null>(() => loadActiveTeamVsTeamTournament());
  const [completedTournaments, setCompletedTournaments] = useState<CompletedTournament[]>(() => loadCompletedTournaments());
  const activeTournaments = useMemo(() => (activeTournament && activeTournament.status === "active" ? [activeTournament] : []), [activeTournament]);

  function handleOpenFinished(id: string) {
    restoreCompletedTournament(id);
  }

  function handleReopenFinished(id: string) {
    reopenCompletedTournament(id);
  }

  function handleDeleteFinished(id: string) {
    setCompletedTournaments(deleteCompletedTournament(id));
  }

  return (
    <div className="grid gap-5">
      <Section title="Aktive">
        <div className="grid gap-3">
          {activeTournaments.length ? activeTournaments.map((tournament) => (
            <article key={tournament.tournamentName} className="app-card p-4 sm:p-5">
              <h3 className="text-xl font-black">{tournament.tournamentName}</h3>
              <p className="mt-1 font-bold text-[var(--muted)]">{formatTournamentType(tournament.format)} · {tournament.players.length} spillere · {tournament.scoringMode}</p>
              <a className="btn-outline-primary mt-4" href="/live">Åbn live</a>
            </article>
          )) : null}
{activeTeamVsTeamTournament ? <TeamVsTeamCard tournament={activeTeamVsTeamTournament} /> : null}
{!activeTournaments.length && !activeTeamVsTeamTournament ? <EmptyState text="Ingen aktive turneringer." /> : null}
        </div>
      </Section>

      <Section title="Afsluttede">
        <div className="grid gap-3">
          {completedTournaments.length ? completedTournaments.map((completedTournament) => (
            <article key={completedTournament.id} className="app-card p-4 sm:p-5">
              <h3 className="text-xl font-black">{completedTournament.state.tournamentName}</h3>
              <p className="mt-1 font-bold text-[var(--muted)]">
                Afsluttet · {completedTournament.state.players.length} spillere · {formatDate(completedTournament.finishedAt)}
              </p>
              <div className="mt-4 action-grid">
                <a className="btn-outline-primary" href="/finish" onClick={() => handleOpenFinished(completedTournament.id)}>Se slutstilling</a>
                <a className="btn-secondary" href="/live" onClick={() => handleReopenFinished(completedTournament.id)}>Ret resultater</a>
                <button className="btn-danger" type="button" onClick={() => handleDeleteFinished(completedTournament.id)}>Slet</button>
              </div>
            </article>
          )) : <EmptyState text="Ingen afsluttede turneringer endnu." />}
        </div>
      </Section>
    </div>
  );
}

function TeamVsTeamCard({ tournament }: { tournament: TeamVsTeamTournamentState }) {
  return (
    <article className="app-card p-4 sm:p-5">
      <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Team vs. Team</p>
      <h3 className="mt-1 text-xl font-black">{tournament.name}</h3>
      <p className="mt-1 font-bold text-[var(--muted)]">
        {tournament.teams.length} hold · {tournament.teams.length * 4} spillere · {tournament.scoringMode}
      </p>
      <a className="btn-outline-primary mt-4" href="/team-vs-team">Åbn holdkamp</a>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="app-card p-4 font-bold text-[var(--muted)]">{text}</p>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatTournamentType(format: LiveTournamentState["format"]): string {
  const labels: Record<LiveTournamentState["format"], string> = {
    americano: "Americano",
    mexicano: "Mexicano",
    "mixed-americano": "Mixed Americano",
    "fixed-partner-americano": "Fast Makker Americano",
    "fixed-partner-mexicano": "Fast Makker Mexicano",
  };

  return labels[format];
}


