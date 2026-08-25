import { assertAuthUserIdIsActive, readVerifiedAuthUserIdFromAccessToken, AuthError } from "@/lib/auth";
import { canListOwnCreatedAccountTournament, canManageAccountTournament } from "@/lib/account/tournament-authority";
import { readAuthAccessCookie } from "@/lib/auth/cookies";
import { createSupabaseRestClient } from "@/lib/supabase/rest-client";

export const dynamic = "force-dynamic";

interface TournamentListRow {
  id: string;
  name: string;
  format: string;
  status: "setup" | "active" | "finished";
  updated_at: string;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  controller_user_id: string | null;
}

export async function GET(): Promise<Response> {
  const requestStartedAt = Date.now();

  try {
    const authStartedAt = Date.now();
    const userId = await readVerifiedAuthUserIdFromAccessToken(await readAuthAccessCookie());
    const authDuration = Date.now() - authStartedAt;
    const encodedUserId = encodeURIComponent(userId);
    const client = createSupabaseRestClient();
    const dataStartedAt = Date.now();
    const activeAccountCheck = assertAuthUserIdIsActive(userId);
    const tournamentRows = client.select<TournamentListRow>(
      "tournaments",
      `or=(created_by_user_id.eq.${encodedUserId},owner_user_id.eq.${encodedUserId})&select=id,name,format,status,updated_at,owner_user_id,created_by_user_id,controller_user_id&order=updated_at.desc`,
    );
    const [rows] = await Promise.all([tournamentRows, activeAccountCheck]);
    const dataDuration = Date.now() - dataStartedAt;

    return Response.json({
      ok: true,
      tournaments: rows
        .filter((row) => canListOwnCreatedAccountTournament(row, userId))
        .map((row) => toAccountTournamentListItem(row, userId))
        .sort(compareAccountTournamentListItems),
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Server-Timing": formatServerTiming(authDuration, dataDuration, Date.now() - requestStartedAt),
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ ok: false, error: "Authentication was denied." }, { status });
  }
}

function toAccountTournamentListItem(row: TournamentListRow, userId: string) {
  const canManage = canManageAccountTournament(row, userId);

  return {
    id: row.id,
    name: row.name,
    format: row.format,
    status: row.status,
    updatedAt: row.updated_at,
    canManage,
    managementState: row.status === "finished"
      ? "completed"
      : canManage ? "controller" : "readOnly",
  };
}

function compareAccountTournamentListItems(
  left: ReturnType<typeof toAccountTournamentListItem>,
  right: ReturnType<typeof toAccountTournamentListItem>,
): number {
  const groupDifference = getAccountTournamentSortGroup(left) - getAccountTournamentSortGroup(right);

  if (groupDifference !== 0) {
    return groupDifference;
  }

  return getUpdatedAtTime(right.updatedAt) - getUpdatedAtTime(left.updatedAt);
}

function getAccountTournamentSortGroup(tournament: ReturnType<typeof toAccountTournamentListItem>): number {
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

function formatServerTiming(authDuration: number, dataDuration: number, totalDuration: number): string {
  return [
    `auth;dur=${Math.max(0, authDuration)}`,
    `active_data;dur=${Math.max(0, dataDuration)}`,
    `total;dur=${Math.max(0, totalDuration)}`,
  ].join(", ");
}
