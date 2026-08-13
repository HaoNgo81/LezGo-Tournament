import { createStandardTournamentRepository, createTeamVsTeamTournamentRepository } from "@/lib/database";
import type { LiveTournamentState } from "@/lib/live-scoring";
import type { TeamVsTeamTournamentState } from "@/lib/tournament-setup";

export const dynamic = "force-dynamic";

interface ShadowSaveRequest {
  kind: "standard" | "team-vs-team";
  legacyLocalId: string;
  tournamentId?: string;
  expectedUpdatedAt?: string;
  state: unknown;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.LEZGO_ENABLE_SUPABASE_SHADOW_SAVE !== "1") {
    return Response.json({ ok: false, error: "Supabase shadow-save is disabled." }, { status: 503 });
  }

  let body: ShadowSaveRequest;

  try {
    body = await request.json() as ShadowSaveRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.legacyLocalId?.trim()) {
    return Response.json({ ok: false, error: "legacyLocalId is required." }, { status: 400 });
  }

  try {
    if (body.kind === "standard" && isLiveTournamentState(body.state)) {
      const result = await createStandardTournamentRepository().save(body.state, {
        legacyLocalId: body.legacyLocalId,
        tournamentId: body.tournamentId,
        expectedUpdatedAt: body.expectedUpdatedAt,
      });
      return Response.json({ ok: true, tournamentId: result.tournamentId, saveMode: result.saveMode });
    }

    if (body.kind === "team-vs-team" && isTeamVsTeamTournamentState(body.state)) {
      const result = await createTeamVsTeamTournamentRepository().save(body.state, {
        legacyLocalId: body.legacyLocalId,
        tournamentId: body.tournamentId,
        expectedUpdatedAt: body.expectedUpdatedAt,
      });
      return Response.json({ ok: true, tournamentId: result.tournamentId, saveMode: result.saveMode });
    }

    return Response.json({ ok: false, error: "Invalid shadow-save payload." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shadow-save failed.";
    const status = message.toLocaleLowerCase("en").includes("conflict") ? 409 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

function isLiveTournamentState(value: unknown): value is LiveTournamentState {
  return Boolean(
    value &&
    typeof value === "object" &&
    "tournamentName" in value &&
    "format" in value &&
    "players" in value &&
    "rounds" in value &&
    "results" in value,
  );
}

function isTeamVsTeamTournamentState(value: unknown): value is TeamVsTeamTournamentState {
  return Boolean(
    value &&
    typeof value === "object" &&
    "name" in value &&
    "teamCount" in value &&
    "teams" in value &&
    "matchups" in value,
  );
}
