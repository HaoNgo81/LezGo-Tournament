import type { LiveTournamentState } from "@/lib/live-scoring";
import type { TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import {
  createStandardShadowSaveLocalId,
  createTeamVsTeamShadowSaveLocalId,
  loadActiveCloudTournamentAuthority,
  loadActiveTeamVsTeamTournament,
  loadActiveTournament,
  loadActiveTournaments,
  loadCompletedTeamVsTeamTournaments,
  loadCompletedTournaments,
  loadShadowSaveMetadata,
  type CloudTournamentAuthority,
} from "@/lib/tournament-setup";

export interface LocalAccountTournamentSummary {
  id: string;
  name: string;
  format: string;
  status: "setup" | "active" | "finished";
  updatedAt?: string;
  canManage: boolean;
  managementState: "controller" | "readOnly" | "completed";
}

export function getVerifiedLocalStandardTournamentId(tournament: LiveTournamentState, userId: string): string | undefined {
  return getVerifiedLocalTournamentId({
    kind: "standard",
    localId: createStandardShadowSaveLocalId(tournament),
    userId,
  });
}

export function getVerifiedLocalTeamVsTeamTournamentId(tournament: TeamVsTeamTournamentState, userId: string): string | undefined {
  return getVerifiedLocalTournamentId({
    kind: "team-vs-team",
    localId: createTeamVsTeamShadowSaveLocalId(tournament),
    userId,
  });
}

export function loadVerifiedLocalAccountTournamentSummaries(userId: string): LocalAccountTournamentSummary[] {
  const summaries = new Map<string, LocalAccountTournamentSummary>();

  for (const tournament of getLocalStandardActiveTournaments()) {
    const summary = toVerifiedStandardSummary(tournament, userId, "active");

    if (summary) {
      summaries.set(summary.id, summary);
    }
  }

  const activeTeamVsTeam = loadActiveTeamVsTeamTournament();
  const activeTeamVsTeamSummary = activeTeamVsTeam?.status === "active"
    ? toVerifiedTeamVsTeamSummary(activeTeamVsTeam, userId, "active")
    : null;

  if (activeTeamVsTeamSummary) {
    summaries.set(activeTeamVsTeamSummary.id, activeTeamVsTeamSummary);
  }

  for (const completed of loadCompletedTournaments()) {
    const summary = toVerifiedStandardSummary(completed.state, userId, "finished", completed.finishedAt);

    if (summary) {
      summaries.set(summary.id, summary);
    }
  }

  for (const completed of loadCompletedTeamVsTeamTournaments()) {
    const summary = toVerifiedTeamVsTeamSummary(completed.state, userId, "finished", completed.finishedAt);

    if (summary) {
      summaries.set(summary.id, summary);
    }
  }

  return [...summaries.values()].sort(compareLocalAccountTournamentSummaries);
}

function getLocalStandardActiveTournaments(): LiveTournamentState[] {
  const activeTournamentList = loadActiveTournaments();

  if (activeTournamentList.length) {
    return activeTournamentList;
  }

  const activeTournament = loadActiveTournament();
  return activeTournament?.status === "active" ? [activeTournament] : [];
}

function toVerifiedStandardSummary(tournament: LiveTournamentState, userId: string, status: "active" | "finished", finishedAt?: string): LocalAccountTournamentSummary | null {
  const localId = createStandardShadowSaveLocalId(tournament);
  const authority = loadActiveCloudTournamentAuthority("standard", localId);
  const tournamentId = getVerifiedLocalTournamentId({ kind: "standard", localId, userId });

  if (!authority || !tournamentId) {
    return null;
  }

  return {
    id: tournamentId,
    name: tournament.tournamentName,
    format: tournament.format,
    status,
    updatedAt: getVerifiedLocalUpdatedAt(localId, finishedAt),
    canManage: authority.canManage,
    managementState: status === "finished" ? "completed" : authority.canManage ? "controller" : "readOnly",
  };
}

function toVerifiedTeamVsTeamSummary(tournament: TeamVsTeamTournamentState, userId: string, status: "active" | "finished", finishedAt?: string): LocalAccountTournamentSummary | null {
  const localId = createTeamVsTeamShadowSaveLocalId(tournament);
  const authority = loadActiveCloudTournamentAuthority("team-vs-team", localId);
  const tournamentId = getVerifiedLocalTournamentId({ kind: "team-vs-team", localId, userId });

  if (!authority || !tournamentId) {
    return null;
  }

  return {
    id: tournamentId,
    name: tournament.name,
    format: "team-vs-team",
    status,
    updatedAt: getVerifiedLocalUpdatedAt(localId, finishedAt),
    canManage: authority.canManage,
    managementState: status === "finished" ? "completed" : authority.canManage ? "controller" : "readOnly",
  };
}

function getVerifiedLocalTournamentId(input: { kind: CloudTournamentAuthority["kind"]; localId: string; userId: string }): string | undefined {
  const metadata = loadShadowSaveMetadata(input.localId);
  const authority = loadActiveCloudTournamentAuthority(input.kind, input.localId);

  if (
    !metadata?.supabaseTournamentId
    || !authority
    || authority.tournamentId !== metadata.supabaseTournamentId
    || !canListAuthorityForUser(authority, input.userId)
  ) {
    return undefined;
  }

  return metadata.supabaseTournamentId;
}

function canListAuthorityForUser(authority: CloudTournamentAuthority, userId: string): boolean {
  return authority.createdByUserId === userId
    || (!authority.createdByUserId && authority.ownerUserId === userId);
}

function getVerifiedLocalUpdatedAt(localId: string, fallback?: string): string | undefined {
  const metadata = loadShadowSaveMetadata(localId);
  return metadata?.lastSuccessfulShadowSaveAt ?? metadata?.lastLocalSaveAt ?? fallback;
}

function compareLocalAccountTournamentSummaries(left: LocalAccountTournamentSummary, right: LocalAccountTournamentSummary): number {
  const groupDifference = getSortGroup(left) - getSortGroup(right);

  if (groupDifference !== 0) {
    return groupDifference;
  }

  return getUpdatedAtTime(right.updatedAt) - getUpdatedAtTime(left.updatedAt);
}

function getSortGroup(tournament: LocalAccountTournamentSummary): number {
  if (tournament.managementState === "completed" || tournament.status === "finished") {
    return 2;
  }

  if (tournament.managementState === "readOnly" || tournament.canManage === false) {
    return 1;
  }

  return 0;
}

function getUpdatedAtTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}
