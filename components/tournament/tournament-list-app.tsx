"use client";

import { useEffect, useMemo, useState } from "react";
import { Section } from "@/components/ui/section";
import {
  deleteCompletedTeamVsTeamTournament,
  deleteCompletedTournament,
  loadActiveTeamVsTeamTournament,
  loadActiveTournament,
  loadCompletedTeamVsTeamTournaments,
  loadCompletedTournaments,
  reopenCompletedTeamVsTeamTournament,
  reopenCompletedTournament,
  restoreCompletedTeamVsTeamTournament,
  restoreCompletedTournament,
  type CompletedTeamVsTeamTournament,
  type CompletedTournament,
  type TeamVsTeamTournamentState,
} from "@/lib/tournament-setup";
import { createPoolPlaySummary, type LiveTournamentState } from "@/lib/live-scoring";
import { getTeamVsTeamCaptainName } from "@/lib/team-vs-team";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

export function TournamentListApp() {
  const hasHydrated = useHasHydrated();
  const [activeTournament, setActiveTournament] = useState<LiveTournamentState | null>(null);
  const [activeTeamVsTeamTournament, setActiveTeamVsTeamTournament] = useState<TeamVsTeamTournamentState | null>(null);
  const [completedTournaments, setCompletedTournaments] = useState<CompletedTournament[]>([]);
  const [completedTeamVsTeamTournaments, setCompletedTeamVsTeamTournaments] = useState<CompletedTeamVsTeamTournament[]>([]);
  const activeTournaments = useMemo(() => (activeTournament && activeTournament.status === "active" ? [activeTournament] : []), [activeTournament]);
  const activeTeamVsTeamTournaments = useMemo(() => (activeTeamVsTeamTournament && activeTeamVsTeamTournament.status === "active" ? [activeTeamVsTeamTournament] : []), [activeTeamVsTeamTournament]);

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setActiveTournament(loadActiveTournament());
      setActiveTeamVsTeamTournament(loadActiveTeamVsTeamTournament());
      setCompletedTournaments(loadCompletedTournaments());
      setCompletedTeamVsTeamTournaments(loadCompletedTeamVsTeamTournaments());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">Indlæser turneringer...</p>;
  }

  function handleOpenFinished(id: string) {
    restoreCompletedTournament(id);
  }

  function handleReopenFinished(id: string) {
    reopenCompletedTournament(id);
  }

  function handleDeleteFinished(id: string) {
    setCompletedTournaments(deleteCompletedTournament(id));
  }

  function handleOpenFinishedTeamVsTeam(id: string) {
    restoreCompletedTeamVsTeamTournament(id);
  }

  function handleReopenFinishedTeamVsTeam(id: string) {
    reopenCompletedTeamVsTeamTournament(id);
  }

  function handleDeleteFinishedTeamVsTeam(id: string) {
    setCompletedTeamVsTeamTournaments(deleteCompletedTeamVsTeamTournament(id));
  }

  return (
    <div className="grid gap-5">
      <Section title="Aktive">
        <div className="grid gap-3">
          {activeTournaments.length ? activeTournaments.map((tournament) => (
            <article key={tournament.tournamentName} className="app-card p-4 sm:p-5">
              <h3 className="text-xl font-black">{tournament.tournamentName}</h3>
              <p className="mt-1 font-bold text-[var(--muted)]">{formatLiveTournamentSummary(tournament)}</p>
              <a className="btn-outline-primary mt-4" href="/live">Åbn live</a>
            </article>
          )) : null}
          {activeTeamVsTeamTournaments.length ? activeTeamVsTeamTournaments.map((tournament) => <TeamVsTeamCard key={tournament.name} tournament={tournament} />) : null}
          {!activeTournaments.length && !activeTeamVsTeamTournaments.length ? <EmptyState text="Ingen aktive turneringer." /> : null}
        </div>
      </Section>

      <Section title="Afsluttede">
        <div className="grid gap-3">
          {completedTournaments.map((completedTournament) => (
            <CompletedTournamentCard
              key={completedTournament.id}
              completedTournament={completedTournament}
              onDelete={handleDeleteFinished}
              onOpen={handleOpenFinished}
              onReopen={handleReopenFinished}
            />
          ))}
          {completedTeamVsTeamTournaments.map((completedTournament) => (
            <article key={completedTournament.id} className="app-card p-4 sm:p-5">
              <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Team vs. Team</p>
              <h3 className="mt-1 text-xl font-black">{completedTournament.state.name}</h3>
              <p className="mt-1 font-bold text-[var(--muted)]">
                Afsluttet · {completedTournament.state.teams.length} hold · {completedTournament.state.playersPerTeam} spillere pr. hold · {formatDate(completedTournament.finishedAt)}
              </p>
              <TeamCaptainSummary teams={completedTournament.state.teams} />
              <div className="mt-4 action-grid">
                <a className="btn-outline-primary" href="/team-vs-team" onClick={() => handleOpenFinishedTeamVsTeam(completedTournament.id)}>Se slutstilling</a>
                <a className="btn-secondary" href="/team-vs-team" onClick={() => handleReopenFinishedTeamVsTeam(completedTournament.id)}>Ret resultater</a>
                <button className="btn-danger" type="button" onClick={() => handleDeleteFinishedTeamVsTeam(completedTournament.id)}>Slet</button>
              </div>
            </article>
          ))}
          {!completedTournaments.length && !completedTeamVsTeamTournaments.length ? <EmptyState text="Ingen afsluttede turneringer endnu." /> : null}
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
        {tournament.teams.length} hold · {tournament.playersPerTeam} spillere pr. hold · {tournament.teams.length * tournament.playersPerTeam} spillere i alt · {tournament.scoringMode}
      </p>
      <TeamCaptainSummary teams={tournament.teams} />
      <a className="btn-outline-primary mt-4" href="/team-vs-team">Åbn holdkamp</a>
    </article>
  );
}

function TeamCaptainSummary({ teams }: { teams: TeamVsTeamTournamentState["teams"] }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {teams.map((team) => (
        <p key={team.id} className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-bold text-[var(--muted)]">
          <span className="text-[var(--foreground)]">{team.name}</span>: {getTeamVsTeamCaptainName(team)}
        </p>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="app-card p-4 font-bold text-[var(--muted)]">{text}</p>;
}

function CompletedTournamentCard({
  completedTournament,
  onDelete,
  onOpen,
  onReopen,
}: {
  completedTournament: CompletedTournament;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onReopen: (id: string) => void;
}) {
  const placements = completedTournament.state.poolPlay
    ? createPoolPlaySummary(completedTournament.state.poolPlay, completedTournament.state.rankingMode).finalPlacements
    : [];

  return (
    <article className="app-card p-4 sm:p-5">
      <h3 className="text-xl font-black">{completedTournament.state.tournamentName}</h3>
      <p className="mt-1 font-bold text-[var(--muted)]">
        {formatCompletedTournamentSummary(completedTournament)}
      </p>
      {placements.length ? <CompletedPoolPlacements placements={placements} /> : null}
      <div className="mt-4 action-grid">
        <a className="btn-outline-primary" href="/finish" onClick={() => onOpen(completedTournament.id)}>Se slutstilling</a>
        <a className="btn-secondary" href="/live" onClick={() => onReopen(completedTournament.id)}>Ret resultater</a>
        <button className="btn-danger" type="button" onClick={() => onDelete(completedTournament.id)}>Slet</button>
      </div>
    </article>
  );
}

function CompletedPoolPlacements({ placements }: { placements: ReturnType<typeof createPoolPlaySummary>["finalPlacements"] }) {
  return (
    <section className="mt-4 grid gap-2" aria-label="Slutplaceringer">
      <h4 className="text-sm font-black uppercase text-[var(--primary-strong)]">Slutplaceringer</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {placements.map((placement) => (
          <p key={`${placement.groupName}-${placement.rank}`} className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-bold">
            <span>{placement.rank}. {placement.participantName}</span>
            <span className="text-[var(--muted)]">{placement.groupName}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatLiveTournamentSummary(tournament: LiveTournamentState): string {
  if (tournament.poolPlay) {
    return [
      formatTournamentType(tournament.format),
      formatPoolParticipantTotal(tournament.poolPlay),
      `${tournament.poolPlay.initialStage.pools.length} puljer`,
      tournament.poolPlay.advancementMode === "crossMatches" ? "Krydskampe" : "Placeringspuljer",
      tournament.scoringMode,
    ].join(" · ");
  }

  return `${formatTournamentType(tournament.format)} · ${tournament.players.length} spillere · ${tournament.scoringMode}`;
}

function formatCompletedTournamentSummary(completedTournament: CompletedTournament): string {
  const state = completedTournament.state;

  if (state.poolPlay) {
    return [
      "Afsluttet",
      formatTournamentType(state.format),
      formatPoolParticipantTotal(state.poolPlay),
      `${state.poolPlay.initialStage.pools.length} puljer`,
      formatDate(completedTournament.finishedAt),
    ].join(" · ");
  }

  return `Afsluttet · ${state.players.length} spillere · ${formatDate(completedTournament.finishedAt)}`;
}

function formatPoolParticipantTotal(poolPlay: NonNullable<LiveTournamentState["poolPlay"]>): string {
  const count = poolPlay.initialStage.participants.length;

  switch (poolPlay.initialStage.participantType) {
    case "player":
      return `${count} spillere`;
    case "pair":
      return `${count} par`;
    case "team":
      return `${count} hold`;
  }
}

function formatTournamentType(format: LiveTournamentState["format"]): string {
  const labels: Record<LiveTournamentState["format"], string> = {
    americano: "Americano",
    mexicano: "Mexicano",
    "mixed-americano": "Mixed Americano",
    "fixed-partner-americano": "Fast Makker Americano",
    "fixed-partner-mexicano": "Fast Makker Mexicano",
    "pool-play": "Puljespil",
  };

  return labels[format];
}
