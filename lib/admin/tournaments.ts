import { AuthError, type AuthenticatedAccount } from "@/lib/auth";
import { createSupabaseRestClient, type SupabaseRestClient } from "@/lib/supabase/rest-client";

export type ManagedTournamentStatus = "setup" | "active" | "finished";

export interface ManagedTournamentPerson {
  userId?: string;
  displayName: string;
  username?: string;
}

export interface ManagedTournament {
  id: string;
  name: string;
  format: string;
  status: ManagedTournamentStatus;
  activeRoundNumber?: number;
  courtCount?: number;
  configuredRounds?: number;
  createdAt?: string;
  updatedAt?: string;
  creator: ManagedTournamentPerson;
  controller: ManagedTournamentPerson;
  isControlledByCurrentAdmin: boolean;
}

interface TournamentRow {
  id: string;
  name: string;
  format: string;
  status: ManagedTournamentStatus;
  active_round_number: number | null;
  court_count: number | null;
  configured_rounds: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  controller_user_id: string | null;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
}

interface AdminTournamentServiceOptions {
  client?: SupabaseRestClient;
}

const legacyTournamentUser = "Ældre turnering";
const unknownUser = "Ukendt bruger";

export async function listManagedTournaments(actor: AuthenticatedAccount, options: AdminTournamentServiceOptions = {}): Promise<ManagedTournament[]> {
  assertAdminActor(actor);
  const client = options.client ?? createSupabaseRestClient();
  const rows = await client.select<TournamentRow>(
    "tournaments",
    "select=id,name,format,status,active_round_number,court_count,configured_rounds,created_at,updated_at,owner_user_id,created_by_user_id,controller_user_id&order=updated_at.desc",
  );
  const profilesById = await readProfilesById(collectUserIds(rows), client);

  return rows.map((row) => toManagedTournament(row, actor.userId, profilesById));
}

export async function takeoverManagedTournament(input: {
  actor: AuthenticatedAccount;
  tournamentId: string;
}, options: AdminTournamentServiceOptions = {}): Promise<ManagedTournament> {
  assertAdminActor(input.actor);
  assertUuid(input.tournamentId);

  const client = options.client ?? createSupabaseRestClient();
  const [existing] = await client.select<TournamentRow>(
    "tournaments",
    `id=eq.${encodeURIComponent(input.tournamentId)}&select=id,name,format,status,active_round_number,court_count,configured_rounds,created_at,updated_at,owner_user_id,created_by_user_id,controller_user_id&limit=1`,
  );

  if (!existing) {
    throw new AuthError("Tournament was not found.", 404);
  }

  const updated = await client.rpc<TournamentRow>("lezgo_admin_takeover_tournament_v1", {
    p_tournament_id: input.tournamentId,
    p_admin_user_id: input.actor.userId,
  });

  const profilesById = await readProfilesById(collectUserIds([updated]), client);

  return toManagedTournament(updated, input.actor.userId, profilesById);
}

function assertAdminActor(actor: AuthenticatedAccount): void {
  if (actor.role !== "admin") {
    throw new AuthError("Admin access was denied.", 403);
  }
}

function collectUserIds(rows: TournamentRow[]): string[] {
  return Array.from(new Set(rows.flatMap((row) => [
    row.created_by_user_id ?? row.owner_user_id,
    row.controller_user_id ?? row.owner_user_id,
  ]).filter((value): value is string => Boolean(value))));
}

async function readProfilesById(userIds: string[], client: SupabaseRestClient): Promise<Map<string, ProfileRow>> {
  if (!userIds.length) {
    return new Map();
  }

  const rows = await client.select<ProfileRow>(
    "profiles",
    `user_id=in.(${userIds.map(encodeURIComponent).join(",")})&select=user_id,display_name,username,email`,
  );
  return new Map(rows.map((row) => [row.user_id, row]));
}

function toManagedTournament(row: TournamentRow, adminUserId: string, profilesById: Map<string, ProfileRow>): ManagedTournament {
  const creatorUserId = row.created_by_user_id ?? row.owner_user_id ?? undefined;
  const controllerUserId = row.controller_user_id ?? row.owner_user_id ?? undefined;

  return {
    id: row.id,
    name: row.name,
    format: row.format,
    status: row.status,
    activeRoundNumber: row.active_round_number ?? undefined,
    courtCount: row.court_count ?? undefined,
    configuredRounds: row.configured_rounds ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    creator: toPerson(creatorUserId, profilesById),
    controller: toPerson(controllerUserId, profilesById),
    isControlledByCurrentAdmin: controllerUserId === adminUserId,
  };
}

function toPerson(userId: string | undefined, profilesById: Map<string, ProfileRow>): ManagedTournamentPerson {
  if (!userId) {
    return { displayName: legacyTournamentUser };
  }

  const profile = profilesById.get(userId);
  if (!profile) {
    return { userId, displayName: unknownUser };
  }

  return {
    userId,
    displayName: profile.display_name || profile.username || profile.email?.split("@")[0] || unknownUser,
    username: profile.username ?? undefined,
  };
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AuthError("Tournament id is invalid.", 400);
  }
}
