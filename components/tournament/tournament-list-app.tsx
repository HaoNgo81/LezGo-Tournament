"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Section } from "@/components/ui/section";
import {
  createStandardShadowSaveLocalId,
  createTeamVsTeamShadowSaveLocalId,
  deleteCompletedTeamVsTeamTournament,
  deleteCompletedTournament,
  loadActiveTeamVsTeamTournament,
  loadActiveTournament,
  loadActiveTournaments,
  loadCompletedTeamVsTeamTournaments,
  loadCompletedTournaments,
  loadShadowSaveMetadata,
  markActiveCloudTournamentAuthority,
  markCloudTournamentRestored,
  reopenCompletedTeamVsTeamTournament,
  reopenCompletedTournament,
  restoreCompletedTeamVsTeamTournament,
  restoreCompletedTournament,
  saveActiveTeamVsTeamTournamentFromRemoteSync,
  saveActiveTournamentFromRemoteSync,
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
import type { Account } from "@/components/auth/account-panel";
import { getVerifiedLocalStandardTournamentId, getVerifiedLocalTeamVsTeamTournamentId } from "@/lib/account/local-tournament-cache";

interface AccountTournament {
  id: string;
  name: string;
  format: string;
  status: "setup" | "active" | "finished";
  updatedAt?: string;
  canManage?: boolean;
  managementState?: "controller" | "readOnly" | "completed";
}

type CloudTournamentOpenResponse =
  | {
      ok: true;
      kind: "standard";
      state: LiveTournamentState;
      tournamentId: string;
      updatedAt?: string;
      legacyLocalId?: string;
      organizerToken?: string;
      canManage?: boolean;
      canRead?: boolean;
      createdByUserId?: string | null;
      controllerUserId?: string | null;
      ownerUserId?: string | null;
      matchScoreVersions?: Record<string, number>;
    }
  | {
      ok: true;
      kind: "team-vs-team";
      state: TeamVsTeamTournamentState;
      tournamentId: string;
      updatedAt?: string;
      legacyLocalId?: string;
      organizerToken?: string;
      canManage?: boolean;
      canRead?: boolean;
      createdByUserId?: string | null;
      controllerUserId?: string | null;
      ownerUserId?: string | null;
    }
  | {
      ok?: false;
      error?: string;
    };

export function TournamentListApp({ account, accountRevision = 0 }: { account?: Account | null; accountRevision?: number }) {
  const { t } = useAppTranslation();
  const router = useRouter();
  const hasHydrated = useHasHydrated();
  const [accountStatus, setAccountStatus] = useState<"loading" | "anonymous" | "authenticated">("loading");
  const [cloudTournaments, setCloudTournaments] = useState<AccountTournament[]>([]);
  const [activeTournament, setActiveTournament] = useState<LiveTournamentState | null>(null);
  const [activeTournamentList, setActiveTournamentList] = useState<LiveTournamentState[]>([]);
  const [activeTeamVsTeamTournament, setActiveTeamVsTeamTournament] = useState<TeamVsTeamTournamentState | null>(null);
  const [completedTournaments, setCompletedTournaments] = useState<CompletedTournament[]>([]);
  const [completedTeamVsTeamTournaments, setCompletedTeamVsTeamTournaments] = useState<CompletedTeamVsTeamTournament[]>([]);
  const [openingCloudTournamentId, setOpeningCloudTournamentId] = useState<string | null>(null);
  const accountUserId = account?.userId ?? null;
  const ownedCloudTournamentIds = useMemo(() => {
    const ids = new Set(cloudTournaments.map((tournament) => tournament.id));

    if (!accountUserId) {
      return ids;
    }

    for (const tournament of activeTournamentList) {
      const tournamentId = getVerifiedLocalStandardTournamentId(tournament, accountUserId);

      if (tournamentId) {
        ids.add(tournamentId);
      }
    }

    if (activeTournament) {
      const tournamentId = getVerifiedLocalStandardTournamentId(activeTournament, accountUserId);

      if (tournamentId) {
        ids.add(tournamentId);
      }
    }

    if (activeTeamVsTeamTournament) {
      const tournamentId = getVerifiedLocalTeamVsTeamTournamentId(activeTeamVsTeamTournament, accountUserId);

      if (tournamentId) {
        ids.add(tournamentId);
      }
    }

    for (const tournament of completedTournaments) {
      const tournamentId = getVerifiedLocalStandardTournamentId(tournament.state, accountUserId);

      if (tournamentId) {
        ids.add(tournamentId);
      }
    }

    for (const tournament of completedTeamVsTeamTournaments) {
      const tournamentId = getVerifiedLocalTeamVsTeamTournamentId(tournament.state, accountUserId);

      if (tournamentId) {
        ids.add(tournamentId);
      }
    }

    return ids;
  }, [accountUserId, activeTeamVsTeamTournament, activeTournament, activeTournamentList, cloudTournaments, completedTeamVsTeamTournaments, completedTournaments]);
  const activeTournaments = useMemo(() => {
    const candidates = activeTournamentList.length
      ? activeTournamentList
      : activeTournament && activeTournament.status === "active" ? [activeTournament] : [];

    return candidates.filter((tournament) => isOwnedStandardTournament(tournament, ownedCloudTournamentIds));
  }, [activeTournament, activeTournamentList, ownedCloudTournamentIds]);
  const activeTeamVsTeamTournaments = useMemo(() => (
    activeTeamVsTeamTournament && activeTeamVsTeamTournament.status === "active" && isOwnedTeamVsTeamTournament(activeTeamVsTeamTournament, ownedCloudTournamentIds)
      ? [activeTeamVsTeamTournament]
      : []
  ), [activeTeamVsTeamTournament, ownedCloudTournamentIds]);
  const completedVisibleTournaments = useMemo(
    () => completedTournaments.filter((tournament) => isOwnedStandardTournament(tournament.state, ownedCloudTournamentIds)),
    [completedTournaments, ownedCloudTournamentIds],
  );
  const completedVisibleTeamVsTeamTournaments = useMemo(
    () => completedTeamVsTeamTournaments.filter((tournament) => isOwnedTeamVsTeamTournament(tournament.state, ownedCloudTournamentIds)),
    [completedTeamVsTeamTournaments, ownedCloudTournamentIds],
  );
  const localCloudTournamentIds = useMemo(() => new Set([
    ...activeTournaments.map(getStandardSupabaseTournamentId).filter(isDefined),
    ...activeTeamVsTeamTournaments.map(getTeamVsTeamSupabaseTournamentId).filter(isDefined),
    ...completedVisibleTournaments.map((tournament) => getStandardSupabaseTournamentId(tournament.state)).filter(isDefined),
    ...completedVisibleTeamVsTeamTournaments.map((tournament) => getTeamVsTeamSupabaseTournamentId(tournament.state)).filter(isDefined),
  ]), [activeTournaments, activeTeamVsTeamTournaments, completedVisibleTournaments, completedVisibleTeamVsTeamTournaments]);
  const cloudOnlyActiveTournaments = useMemo(
    () => cloudTournaments.filter((tournament) => tournament.status !== "finished" && !localCloudTournamentIds.has(tournament.id)),
    [cloudTournaments, localCloudTournamentIds],
  );
  const cloudOnlyCompletedTournaments = useMemo(
    () => cloudTournaments.filter((tournament) => tournament.status === "finished" && !localCloudTournamentIds.has(tournament.id)),
    [cloudTournaments, localCloudTournamentIds],
  );

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    let isDisposed = false;

    async function loadPrivateTournaments() {
      try {
        const tournamentResponse = await fetch("/api/account/tournaments", { cache: "no-store" });
        const tournamentBody = await tournamentResponse.json() as { ok?: boolean; tournaments?: AccountTournament[] };

        if (!tournamentResponse.ok || !tournamentBody.ok || !Array.isArray(tournamentBody.tournaments)) {
          throw new Error("Authentication required.");
        }

        if (isDisposed) {
          return;
        }

        setCloudTournaments(tournamentBody.tournaments);
        setAccountStatus("authenticated");
      } catch {
        if (isDisposed) {
          return;
        }

        setCloudTournaments([]);
        setActiveTournament(null);
        setActiveTournamentList([]);
        setActiveTeamVsTeamTournament(null);
        setCompletedTournaments([]);
        setCompletedTeamVsTeamTournaments([]);
        setAccountStatus("anonymous");
      }
    }

    const timeoutId = window.setTimeout(() => {
      setActiveTournament(loadActiveTournament());
      setActiveTournamentList(loadActiveTournaments());
      setActiveTeamVsTeamTournament(loadActiveTeamVsTeamTournament());
      setCompletedTournaments(loadCompletedTournaments());
      setCompletedTeamVsTeamTournaments(loadCompletedTeamVsTeamTournaments());
      void loadPrivateTournaments();
    }, 0);

    return () => {
      isDisposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [accountRevision, hasHydrated]);

  if (!hasHydrated) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">{t("loadingTournaments")}</p>;
  }

  const canRenderVerifiedLocalCache = Boolean(accountUserId);
  const isReconcilingAccountTournaments = accountStatus === "loading";

  if (isReconcilingAccountTournaments && !canRenderVerifiedLocalCache) {
    return (
      <div className="grid gap-5">
        <Section title={t("active")}>
          <EmptyState text={t("loadingTournaments")} />
        </Section>
        <Section title={t("completed")}>
          <EmptyState text={t("loadingTournaments")} />
        </Section>
      </div>
    );
  }

  if (accountStatus === "anonymous") {
    return (
      <div className="grid gap-5">
        <p className="app-card p-4 font-bold text-[var(--muted)]">{t("tournamentsLoginRequired")}</p>
        <Section title={t("active")}>
          <EmptyState text={t("noActiveTournaments")} />
        </Section>
        <Section title={t("completed")}>
          <EmptyState text={t("noCompletedTournaments")} />
        </Section>
      </div>
    );
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

  async function handleOpenCloudTournament(tournamentId: string) {
    setOpeningCloudTournamentId(tournamentId);

    try {
      const response = await fetch(`/api/account/tournaments/${encodeURIComponent(tournamentId)}`, { cache: "no-store" });
      const body = await response.json() as CloudTournamentOpenResponse;

      if (!response.ok || !body.ok) {
        return;
      }

      if (body.kind === "standard") {
        const localId = createStandardShadowSaveLocalId(body.state);
        saveActiveTournamentFromRemoteSync(body.state);
        markCloudTournamentRestored({
          localId,
          legacyLocalId: body.legacyLocalId,
          kind: "standard",
          tournamentId: body.tournamentId,
          updatedAt: body.updatedAt,
          organizerToken: body.organizerToken,
          canManage: body.canManage,
          matchScoreVersions: body.matchScoreVersions,
        });
        markActiveCloudTournamentAuthority({
          source: "server",
          kind: "standard",
          localId,
          tournamentId: body.tournamentId,
          canRead: body.canRead ?? true,
          canManage: body.canManage === true,
          createdByUserId: body.createdByUserId,
          controllerUserId: body.controllerUserId,
          ownerUserId: body.ownerUserId,
        });
        router.push(body.state.status === "finished" ? "/finish" : "/live");
        return;
      }

      const localId = createTeamVsTeamShadowSaveLocalId(body.state);
      saveActiveTeamVsTeamTournamentFromRemoteSync(body.state);
      markCloudTournamentRestored({
        localId,
        legacyLocalId: body.legacyLocalId,
        kind: "team-vs-team",
        tournamentId: body.tournamentId,
        updatedAt: body.updatedAt,
        organizerToken: body.organizerToken,
        canManage: body.canManage,
      });
      markActiveCloudTournamentAuthority({
        source: "server",
        kind: "team-vs-team",
        localId,
        tournamentId: body.tournamentId,
        canRead: body.canRead ?? true,
        canManage: body.canManage === true,
        createdByUserId: body.createdByUserId,
        controllerUserId: body.controllerUserId,
        ownerUserId: body.ownerUserId,
      });
      router.push("/team-vs-team");
    } finally {
      setOpeningCloudTournamentId(null);
    }
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
          {cloudOnlyActiveTournaments.map((tournament) => (
            <CloudTournamentCard
              key={tournament.id}
              tournament={tournament}
              actionLabel={openingCloudTournamentId === tournament.id ? t("loadingTournament") : t("openLive")}
              disabled={Boolean(openingCloudTournamentId)}
              onOpen={handleOpenCloudTournament}
              t={t}
            />
          ))}
          {activeTeamVsTeamTournaments.length ? activeTeamVsTeamTournaments.map((tournament) => <TeamVsTeamCard key={tournament.name} tournament={tournament} t={t} />) : null}
          {!activeTournaments.length && !cloudOnlyActiveTournaments.length && !activeTeamVsTeamTournaments.length ? <EmptyState text={isReconcilingAccountTournaments ? t("loadingTournaments") : t("noActiveTournaments")} /> : null}
        </div>
      </Section>

      <Section title={t("completed")}>
        <div className="grid gap-3">
          {completedVisibleTournaments.map((completedTournament) => (
            <CompletedTournamentCard
              key={completedTournament.id}
              completedTournament={completedTournament}
              t={t}
              onDelete={handleDeleteFinished}
              onOpen={handleOpenFinished}
              onReopen={handleReopenFinished}
            />
          ))}
          {cloudOnlyCompletedTournaments.map((tournament) => (
            <CloudTournamentCard
              key={tournament.id}
              tournament={tournament}
              actionLabel={openingCloudTournamentId === tournament.id ? t("loadingTournament") : t("seeFinalStandings")}
              disabled={Boolean(openingCloudTournamentId)}
              onOpen={handleOpenCloudTournament}
              t={t}
            />
          ))}
          {completedVisibleTeamVsTeamTournaments.map((completedTournament) => (
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
          {!completedVisibleTournaments.length && !cloudOnlyCompletedTournaments.length && !completedVisibleTeamVsTeamTournaments.length ? <EmptyState text={isReconcilingAccountTournaments ? t("loadingTournaments") : t("noCompletedTournaments")} /> : null}
        </div>
      </Section>
    </div>
  );
}

function CloudTournamentCard({ actionLabel, disabled, onOpen, tournament, t }: { actionLabel: string; disabled: boolean; onOpen: (id: string) => void; tournament: AccountTournament; t: (key: TranslationKey) => string }) {
  return (
    <article className="app-card p-4 sm:p-5">
      <h3 className="text-xl font-black">{tournament.name}</h3>
      <p className="mt-1 font-bold text-[var(--muted)]">
        {formatCloudTournamentSummary(tournament, t)}
      </p>
      <button className="btn-outline-primary mt-4" type="button" disabled={disabled} onClick={() => onOpen(tournament.id)}>{actionLabel}</button>
    </article>
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

function formatCloudTournamentSummary(tournament: AccountTournament, t: (key: TranslationKey) => string): string {
  return `${formatAccountTournamentStatus(tournament.status, t)} · ${formatAccountTournamentType(tournament.format, t)}`;
}

function formatAccountTournamentStatus(status: AccountTournament["status"], t: (key: TranslationKey) => string): string {
  if (status === "finished") {
    return t("completed");
  }

  if (status === "setup") {
    return t("accountTournamentStatusSetup");
  }

  return t("active");
}

function formatAccountTournamentType(format: string, t: (key: TranslationKey) => string): string {
  if (isStandardTournamentFormat(format)) {
    return formatTournamentType(format, t);
  }

  return format === "team-vs-team" ? "Team vs. Team" : format;
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

function isOwnedStandardTournament(tournament: LiveTournamentState, ownedCloudTournamentIds: Set<string>): boolean {
  const supabaseTournamentId = getStandardSupabaseTournamentId(tournament);
  return Boolean(supabaseTournamentId && ownedCloudTournamentIds.has(supabaseTournamentId));
}

function isOwnedTeamVsTeamTournament(tournament: TeamVsTeamTournamentState, ownedCloudTournamentIds: Set<string>): boolean {
  const supabaseTournamentId = getTeamVsTeamSupabaseTournamentId(tournament);
  return Boolean(supabaseTournamentId && ownedCloudTournamentIds.has(supabaseTournamentId));
}

function getStandardSupabaseTournamentId(tournament: LiveTournamentState): string | undefined {
  return loadShadowSaveMetadata(createStandardShadowSaveLocalId(tournament))?.supabaseTournamentId;
}

function getTeamVsTeamSupabaseTournamentId(tournament: TeamVsTeamTournamentState): string | undefined {
  return loadShadowSaveMetadata(createTeamVsTeamShadowSaveLocalId(tournament))?.supabaseTournamentId;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isStandardTournamentFormat(format: string): format is LiveTournamentState["format"] {
  return format === "americano"
    || format === "mexicano"
    || format === "mixed-americano"
    || format === "fixed-partner-americano"
    || format === "fixed-partner-mexicano"
    || format === "pool-play";
}

function createActiveTournamentId(tournament: LiveTournamentState): string {
  return createStandardShadowSaveLocalId(tournament);
}
