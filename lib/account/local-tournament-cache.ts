import type { LiveTournamentState } from "@/lib/live-scoring";
import type { TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import {
  createStandardShadowSaveLocalId,
  createTeamVsTeamShadowSaveLocalId,
  loadActiveCloudTournamentAuthority,
  loadShadowSaveMetadata,
  type CloudTournamentAuthority,
} from "@/lib/tournament-setup";

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
