import type { LiveTournamentState } from "../live-scoring";
import type { TeamVsTeamTournamentState } from "./team-vs-team-setup";

export function queueStandardTournamentShadowSave(state: LiveTournamentState): void {
  queueShadowSave({
    kind: "standard",
    legacyLocalId: createStandardLegacyLocalId(state),
    state,
  });
}

export function queueTeamVsTeamShadowSave(state: TeamVsTeamTournamentState): void {
  queueShadowSave({
    kind: "team-vs-team",
    legacyLocalId: createTeamVsTeamLegacyLocalId(state),
    state,
  });
}

function queueShadowSave(payload: { kind: "standard" | "team-vs-team"; legacyLocalId: string; state: unknown }): void {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE !== "1") {
    return;
  }

  window.setTimeout(() => {
    fetch("/api/supabase/shadow-save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      // localStorage remains primary; shadow-save failures must not break the tournament.
    });
  }, 0);
}

function createStandardLegacyLocalId(state: LiveTournamentState): string {
  return `${state.tournamentName.trim().toLocaleLowerCase("da")}-${state.format}`;
}

function createTeamVsTeamLegacyLocalId(state: TeamVsTeamTournamentState): string {
  return `${state.name.trim().toLocaleLowerCase("da")}-team-vs-team`;
}
