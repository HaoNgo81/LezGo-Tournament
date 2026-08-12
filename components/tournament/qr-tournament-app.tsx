"use client";

import { useEffect, useMemo, useState } from "react";
import { MatchCards } from "@/components/tournament/match-cards";
import { StandingsTable } from "@/components/tournament/standings-table";
import { Section } from "@/components/ui/section";
import { createMockLiveTournamentState, type LiveTournamentState } from "@/lib/live-scoring";
import { createReadOnlyTournamentView, createTeamVsTeamReadOnlyView, type ReadOnlyTournamentView, type TeamVsTeamReadOnlyView } from "@/lib/read-only-views";
import { loadActiveTeamVsTeamTournament, loadActiveTournament, type TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import { useAppTranslation } from "@/lib/preferences/client";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

export function QrTournamentApp() {
  const { t } = useAppTranslation();
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
    return <div className="app-card p-4 font-bold text-[var(--muted)]">{t("loadingTournament")}</div>;
  }

  if (teamVsTeamState) {
    return <TeamVsTeamQrView view={createTeamVsTeamReadOnlyView(teamVsTeamState)} />;
  }

  return <StandardQrView state={state} />;
}

function StandardQrView({ state }: { state: LiveTournamentState }) {
  const { t } = useAppTranslation();
  const view = useMemo(() => createReadOnlyTournamentView(state), [state]);

  if (view.poolPlay) {
    return <PoolPlayQrView view={view} poolPlay={view.poolPlay} />;
  }

  return (
    <div className="grid gap-5">
      <Section title={view.tournamentName}>
        <div className="grid gap-3 app-card p-4 text-lg leading-8">
          <p><strong>{t("round")}:</strong> {view.activeRoundNumber} / {view.totalRounds}</p>
          <p><strong>{t("players")}:</strong> {view.players}</p>
          <p><strong>{t("courts")}:</strong> {view.courts}</p>
        </div>
      </Section>

      <Section title={t("allPlayers")}>
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

      <Section title={t("matchesInActiveRound")}>
        <MatchCards matches={view.matches} />
      </Section>

      <Section title={t("fullStandings")}>
        <StandingsTable standings={view.standings} />
      </Section>

      <Section title={t("rounds")}>
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

function PoolPlayQrView({ view, poolPlay }: { view: ReadOnlyTournamentView; poolPlay: NonNullable<ReadOnlyTournamentView["poolPlay"]> }) {
  return (
    <div className="grid gap-5">
      <Section title={view.tournamentName}>
        <div className="grid gap-3 app-card p-4 text-lg leading-8">
          <p><strong>Format:</strong> Puljespil</p>
          <p><strong>Fase:</strong> {poolPlay.phase}</p>
          <p><strong>Deltagere:</strong> {poolPlay.participantCount}</p>
          <p><strong>Puljer:</strong> {poolPlay.poolCount}</p>
        </div>
      </Section>

      <Section title="Puljestillinger">
        <div className="grid gap-4">
          {poolPlay.initialStandings.map((table) => (
            <section key={table.poolId} className="grid gap-3" aria-labelledby={`${table.poolId}-qr-heading`}>
              <h3 id={`${table.poolId}-qr-heading`} className="text-lg font-black">{table.poolName}</h3>
              <StandingsTable standings={table.rows} />
            </section>
          ))}
        </div>
      </Section>

      {poolPlay.finalPlacements.length ? (
        <Section title="Slutplaceringer">
          <div className="grid gap-3 sm:grid-cols-2">
            {poolPlay.finalPlacements.map((placement) => (
              <article key={`${placement.groupName}-${placement.rank}`} className="app-card flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{placement.groupName}</p>
                  <h3 className="mt-1 text-xl font-black">{placement.participantName}</h3>
                </div>
                <span className="text-3xl font-black">{placement.rank}.</span>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Næste fase">
        {poolPlay.nextPhaseMatches.length ? <MatchCards matches={poolPlay.nextPhaseMatches} /> : <p className="app-card p-4 font-bold text-[var(--muted)]">Næste fase er ikke oprettet endnu.</p>}
      </Section>

      {poolPlay.finalMatches.length ? (
        <Section title="Finaler">
          <MatchCards matches={poolPlay.finalMatches} />
        </Section>
      ) : null}

      {poolPlay.placementTiebreakMatches.length ? (
        <Section title="Tiebreak om placering">
          <MatchCards matches={poolPlay.placementTiebreakMatches} />
        </Section>
      ) : null}

      {poolPlay.automaticAdvances.length ? (
        <Section title="Automatisk videre">
          <div className="grid gap-3 sm:grid-cols-2">
            {poolPlay.automaticAdvances.map((advance) => (
              <article key={advance.id} className="app-card p-4">
                <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{advance.resolution === "bye" ? "Oversidning" : "Walkover"}</p>
                <h3 className="mt-1 text-xl font-black">{advance.participantName}</h3>
                <p className="mt-2 font-bold text-[var(--muted)]">{advance.sourcePoolName}, nr. {advance.sourceRank}</p>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Info">
        <p className="app-card p-4 text-lg leading-7">Visningen er read-only og viser puljespillets aktuelle stillinger, næste fase og finaler.</p>
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
