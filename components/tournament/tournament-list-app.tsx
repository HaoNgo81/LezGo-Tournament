"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Section } from "@/components/ui/section";
import {
  deleteCompletedTeamVsTeamTournament,
  deleteCompletedTournament,
  loadActiveTeamVsTeamTournament,
  loadActiveTournament,
  loadActiveTournaments,
  loadCompletedTeamVsTeamTournaments,
  loadCompletedTournaments,
  reopenCompletedTeamVsTeamTournament,
  reopenCompletedTournament,
  restoreCompletedTeamVsTeamTournament,
  restoreCompletedTournament,
  selectActiveTournament,
  type CompletedTeamVsTeamTournament,
  type CompletedTournament,
  type TeamVsTeamTournamentState,
} from "@/lib/tournament-setup";
import { createPoolPlaySummary, type LiveTournamentState } from "@/lib/live-scoring";
import { getTeamVsTeamCaptainName } from "@/lib/team-vs-team";
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

export function TournamentListApp() {
  const { t } = useAppTranslation();
  const hasHydrated = useHasHydrated();
  const [activeTournament, setActiveTournament] = useState<LiveTournamentState | null>(null);
  const [activeTournamentList, setActiveTournamentList] = useState<LiveTournamentState[]>([]);
  const [activeTeamVsTeamTournament, setActiveTeamVsTeamTournament] = useState<TeamVsTeamTournamentState | null>(null);
  const [completedTournaments, setCompletedTournaments] = useState<CompletedTournament[]>([]);
  const [completedTeamVsTeamTournaments, setCompletedTeamVsTeamTournaments] = useState<CompletedTeamVsTeamTournament[]>([]);
  const activeTournaments = useMemo(() => {
    if (activeTournamentList.length) {
      return activeTournamentList;
    }

    return activeTournament && activeTournament.status === "active" ? [activeTournament] : [];
  }, [activeTournament, activeTournamentList]);
  const activeTeamVsTeamTournaments = useMemo(() => (activeTeamVsTeamTournament && activeTeamVsTeamTournament.status === "active" ? [activeTeamVsTeamTournament] : []), [activeTeamVsTeamTournament]);

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setActiveTournament(loadActiveTournament());
      setActiveTournamentList(loadActiveTournaments());
      setActiveTeamVsTeamTournament(loadActiveTeamVsTeamTournament());
      setCompletedTournaments(loadCompletedTournaments());
      setCompletedTeamVsTeamTournaments(loadCompletedTeamVsTeamTournaments());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">{t("loadingTournaments")}</p>;
  }

  function handleOpenFinished(id: string) {
    restoreCompletedTournament(id);
  }

  function handleOpenActive(tournament: LiveTournamentState) {
    selectActiveTournament(createActiveTournamentId(tournament));
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
      <Section title={t("active")}>
        <div className="grid gap-3">
          {activeTournaments.length ? activeTournaments.map((tournament) => (
            <article key={tournament.tournamentName} className="app-card p-4 sm:p-5">
              <h3 className="text-xl font-black">{tournament.tournamentName}</h3>
              <p className="mt-1 font-bold text-[var(--muted)]">{formatLiveTournamentSummary(tournament, t)}</p>
              <Link className="btn-outline-primary mt-4" href="/live" onClick={() => handleOpenActive(tournament)}>{t("openLive")}</Link>
            </article>
          )) : null}
          {activeTeamVsTeamTournaments.length ? activeTeamVsTeamTournaments.map((tournament) => <TeamVsTeamCard key={tournament.name} tournament={tournament} t={t} />) : null}
          {!activeTournaments.length && !activeTeamVsTeamTournaments.length ? <EmptyState text={t("noActiveTournaments")} /> : null}
        </div>
      </Section>

      <Section title={t("completed")}>
        <div className="grid gap-3">
          {completedTournaments.map((completedTournament) => (
            <CompletedTournamentCard
              key={completedTournament.id}
              completedTournament={completedTournament}
              t={t}
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
                {t("completed")} · {completedTournament.state.teams.length} {t("teams").toLowerCase()} · {completedTournament.state.playersPerTeam} {t("players").toLowerCase()} / {t("team").toLowerCase()} · {formatDate(completedTournament.finishedAt)}
              </p>
              <TeamCaptainSummary teams={completedTournament.state.teams} />
              <div className="mt-4 action-grid">
                <Link className="btn-outline-primary" href="/team-vs-team" onClick={() => handleOpenFinishedTeamVsTeam(completedTournament.id)}>{t("seeFinalStandings")}</Link>
                <Link className="btn-secondary" href="/team-vs-team" onClick={() => handleReopenFinishedTeamVsTeam(completedTournament.id)}>{t("editScore")}</Link>
                <button className="btn-danger" type="button" onClick={() => handleDeleteFinishedTeamVsTeam(completedTournament.id)}>{t("delete")}</button>
              </div>
            </article>
          ))}
          {!completedTournaments.length && !completedTeamVsTeamTournaments.length ? <EmptyState text={t("noCompletedTournaments")} /> : null}
        </div>
      </Section>
    </div>
  );
}

function TeamVsTeamCard({ tournament, t }: { tournament: TeamVsTeamTournamentState; t: (key: TranslationKey) => string }) {
  return (
    <article className="app-card p-4 sm:p-5">
      <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Team vs. Team</p>
      <h3 className="mt-1 text-xl font-black">{tournament.name}</h3>
      <p className="mt-1 font-bold text-[var(--muted)]">
        {tournament.teams.length} {t("teams").toLowerCase()} · {tournament.playersPerTeam} {t("players").toLowerCase()} / {t("team").toLowerCase()} · {tournament.teams.length * tournament.playersPerTeam} {t("players").toLowerCase()} · {tournament.scoringMode}
      </p>
      <TeamCaptainSummary teams={tournament.teams} />
      <Link className="btn-outline-primary mt-4" href="/team-vs-team">{t("openTeamMatch")}</Link>
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
  t,
}: {
  completedTournament: CompletedTournament;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onReopen: (id: string) => void;
  t: (key: TranslationKey) => string;
}) {
  const placements = completedTournament.state.poolPlay
    ? createPoolPlaySummary(completedTournament.state.poolPlay, completedTournament.state.rankingMode).finalPlacements
    : [];

  return (
    <article className="app-card p-4 sm:p-5">
      <h3 className="text-xl font-black">{completedTournament.state.tournamentName}</h3>
      <p className="mt-1 font-bold text-[var(--muted)]">
        {formatCompletedTournamentSummary(completedTournament, t)}
      </p>
      {placements.length ? <CompletedPoolPlacements placements={placements} t={t} /> : null}
      <div className="mt-4 action-grid">
        <Link className="btn-outline-primary" href="/finish" onClick={() => onOpen(completedTournament.id)}>{t("seeFinalStandings")}</Link>
        <Link className="btn-secondary" href="/live" onClick={() => onReopen(completedTournament.id)}>{t("editScore")}</Link>
        <button className="btn-danger" type="button" onClick={() => onDelete(completedTournament.id)}>{t("delete")}</button>
      </div>
    </article>
  );
}

function CompletedPoolPlacements({ placements, t }: { placements: ReturnType<typeof createPoolPlaySummary>["finalPlacements"]; t: (key: TranslationKey) => string }) {
  return (
    <section className="mt-4 grid gap-2" aria-label={t("finalPlacements")}>
      <h4 className="text-sm font-black uppercase text-[var(--primary-strong)]">{t("finalPlacements")}</h4>
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

function formatLiveTournamentSummary(tournament: LiveTournamentState, t: (key: TranslationKey) => string): string {
  if (tournament.poolPlay) {
    return [
      formatTournamentType(tournament.format, t),
      formatPoolParticipantTotal(tournament.poolPlay, t),
      `${tournament.poolPlay.initialStage.pools.length} puljer`,
      tournament.poolPlay.advancementMode === "crossMatches" ? "Krydskampe" : "Placeringspuljer",
      tournament.scoringMode,
    ].join(" · ");
  }

  return `${formatTournamentType(tournament.format, t)} · ${tournament.players.length} ${t("players").toLowerCase()} · ${tournament.scoringMode}`;
}

function formatCompletedTournamentSummary(completedTournament: CompletedTournament, t: (key: TranslationKey) => string): string {
  const state = completedTournament.state;

  if (state.poolPlay) {
    return [
      t("completed"),
      formatTournamentType(state.format, t),
      formatPoolParticipantTotal(state.poolPlay, t),
      `${state.poolPlay.initialStage.pools.length} puljer`,
      formatDate(completedTournament.finishedAt),
    ].join(" · ");
  }

  return `${t("completed")} · ${state.players.length} ${t("players").toLowerCase()} · ${formatDate(completedTournament.finishedAt)}`;
}

function formatPoolParticipantTotal(poolPlay: NonNullable<LiveTournamentState["poolPlay"]>, t: (key: TranslationKey) => string): string {
  const count = poolPlay.initialStage.participants.length;

  switch (poolPlay.initialStage.participantType) {
    case "player":
      return `${count} ${t("players").toLowerCase()}`;
    case "pair":
      return `${count} par`;
    case "team":
      return `${count} ${t("teams").toLowerCase()}`;
  }
}

function formatTournamentType(format: LiveTournamentState["format"], t: (key: TranslationKey) => string): string {
  const labels: Record<LiveTournamentState["format"], string> = {
    americano: "Americano",
    mexicano: "Mexicano",
    "mixed-americano": "Mixed Americano",
    "fixed-partner-americano": t("fixedPartnerAmericano"),
    "fixed-partner-mexicano": t("fixedPartnerMexicano"),
    "pool-play": "Puljespil",
  };

  return labels[format];
}

function createActiveTournamentId(tournament: LiveTournamentState): string {
  return `${tournament.tournamentName.trim().toLocaleLowerCase("da")}-${tournament.format}`;
}
