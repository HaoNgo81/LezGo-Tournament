// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { listManagedTournaments, takeoverManagedTournament } from "../lib/admin/tournaments";
import type { SupabaseRestClient } from "../lib/supabase/rest-client";

const admin = {
  userId: "00000000-0000-4000-8000-0000000000ad",
  email: "admin@example.com",
  displayName: "Admin",
  username: "admin",
  role: "admin" as const,
};
const creatorId = "00000000-0000-4000-8000-0000000000a1";
const otherId = "00000000-0000-4000-8000-0000000000b2";
const tournamentId = "00000000-0000-4000-8000-000000000101";

describe("STEP 25I-C1-C8B admin tournament service", () => {
  it("lists all tournaments with friendly creator and controller identities", async () => {
    const client = createClient();

    const tournaments = await listManagedTournaments(admin, { client });

    expect(tournaments).toHaveLength(3);
    expect(tournaments[0]).toMatchObject({
      name: "Creator Cup",
      creator: { displayName: "Creator One", username: "creator" },
      controller: { displayName: "Controller Two", username: "controller" },
      isControlledByCurrentAdmin: false,
    });
    expect(tournaments[1].creator.displayName).toBe("Ældre turnering");
    expect(tournaments[2].creator.displayName).toBe("Ukendt bruger");
  });

  it("updates only controller semantics during takeover and preserves creator", async () => {
    const client = createClient();

    const tournament = await takeoverManagedTournament({ actor: admin, tournamentId }, { client });

    expect(client.update).toHaveBeenCalledWith("tournaments", `id=eq.${encodeURIComponent(tournamentId)}`, {
      controller_user_id: admin.userId,
      updated_by_user_id: admin.userId,
    });
    expect(tournament.creator).toMatchObject({ displayName: "Creator One", username: "creator" });
    expect(tournament.controller).toMatchObject({ displayName: "Admin One", username: "admin" });
    expect(tournament.isControlledByCurrentAdmin).toBe(true);
  });

  it("blocks normal users before tournament data is changed", async () => {
    const client = createClient();

    await expect(takeoverManagedTournament({
      actor: { ...admin, role: "user" },
      tournamentId,
    }, { client })).rejects.toMatchObject({ status: 403 });
    expect(client.update).not.toHaveBeenCalled();
  });
});

function createClient(): SupabaseRestClient {
  const tournaments = [
    createTournamentRow(tournamentId, "Creator Cup", creatorId, otherId),
    createTournamentRow("00000000-0000-4000-8000-000000000102", "Legacy Cup", null, null),
    createTournamentRow("00000000-0000-4000-8000-000000000103", "Missing Profile Cup", "00000000-0000-4000-8000-000000000999", null),
  ];
  const profiles = [
    { user_id: creatorId, display_name: "Creator One", username: "creator", email: "creator@example.com" },
    { user_id: otherId, display_name: "Controller Two", username: "controller", email: "controller@example.com" },
    { user_id: admin.userId, display_name: "Admin One", username: "admin", email: "admin@example.com" },
  ];

  const select: SupabaseRestClient["select"] = vi.fn(async (table: string, query: string) => {
    if (table === "tournaments" && query.includes("id=eq.")) {
      return tournaments.filter((row) => query.includes(row.id));
    }
    if (table === "tournaments") {
      return tournaments;
    }
    if (table === "profiles") {
      return profiles;
    }
    return [];
  }) as SupabaseRestClient["select"];
  const update: SupabaseRestClient["update"] = vi.fn(async () => [{
    ...tournaments[0],
    controller_user_id: admin.userId,
  }]) as SupabaseRestClient["update"];

  return {
    rpc: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    select,
    update,
  } satisfies SupabaseRestClient;
}

function createTournamentRow(id: string, name: string, createdBy: string | null, controller: string | null) {
  return {
    id,
    name,
    format: "mexicano",
    status: "active",
    active_round_number: 1,
    court_count: 2,
    configured_rounds: 5,
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-20T11:00:00.000Z",
    owner_user_id: createdBy,
    created_by_user_id: createdBy,
    controller_user_id: controller,
  };
}
