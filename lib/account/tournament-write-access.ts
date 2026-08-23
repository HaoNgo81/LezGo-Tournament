import { readOptionalAccountFromAccessToken } from "@/lib/auth";
import { readAuthAccessCookie } from "@/lib/auth/cookies";
import { createSupabaseRestClient } from "@/lib/supabase/rest-client";
import { canManageAccountTournament } from "./tournament-authority";

interface TournamentAuthorityRow {
  owner_user_id: string | null;
  created_by_user_id: string | null;
  controller_user_id: string | null;
}

export class TournamentWriteAccessError extends Error {
  readonly status: number;

  constructor(message = "Du har ikke længere styring af denne turnering.", status = 403) {
    super(message);
    this.name = "TournamentWriteAccessError";
    this.status = status;
  }
}

export async function assertAccountTournamentControllerIfRequired(tournamentId: string): Promise<void> {
  if (!isUuid(tournamentId)) {
    throw new TournamentWriteAccessError("Tournament ID is invalid.", 400);
  }

  const [tournament] = await createSupabaseRestClient().select<TournamentAuthorityRow>(
    "tournaments",
    `id=eq.${encodeURIComponent(tournamentId)}&select=owner_user_id,created_by_user_id,controller_user_id`,
  );

  if (!tournament || !isAccountControlledTournament(tournament)) {
    return;
  }

  const account = await readOptionalWriteAccount();

  if (!account?.userId || !canManageAccountTournament(tournament, account.userId)) {
    throw new TournamentWriteAccessError();
  }
}

async function readOptionalWriteAccount() {
  try {
    return await readOptionalAccountFromAccessToken(await readAuthAccessCookie());
  } catch {
    return null;
  }
}

function isAccountControlledTournament(tournament: TournamentAuthorityRow): boolean {
  return Boolean(tournament.owner_user_id || tournament.created_by_user_id || tournament.controller_user_id);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
