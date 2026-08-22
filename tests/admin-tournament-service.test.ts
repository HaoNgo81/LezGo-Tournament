// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { listManagedTournaments, returnManagedTournamentControlToOwner, takeoverManagedTournament } from "../lib/admin/tournaments";
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
      canReturnControlToOwner: false,
    });
    expect(tournaments[1].creator.displayName).toBe("Ældre turnering");
    expect(tournaments[2].creator.displayName).toBe("Ukendt bruger");
  });

  it("updates only controller semantics during takeover and preserves creator", async () => {
    const client = createClient();

    const tournament = await takeoverManagedTournament({ actor: admin, tournamentId }, { client });

    expect(client.rpc).toHaveBeenCalledWith("lezgo_admin_takeover_tournament_v1", {
      p_tournament_id: tournamentId,
      p_admin_user_id: admin.userId,
    });
    expect(client.update).not.toHaveBeenCalled();
    expect(tournament.creator).toMatchObject({ displayName: "Creator One", username: "creator" });
    expect(tournament.controller).toMatchObject({ displayName: "Admin One", username: "admin" });
    expect(tournament.isControlledByCurrentAdmin).toBe(true);
    expect(tournament.canReturnControlToOwner).toBe(true);
  });

  it("returns admin-controlled tournament control to the owning user without changing creator or owner", async () => {
    const client = createClient({ adminControlsTournament: true });

    const tournament = await returnManagedTournamentControlToOwner({ actor: admin, tournamentId }, { client });

    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.update).toHaveBeenCalledWith(
      "tournaments",
      expect.stringContaining(`id=eq.${tournamentId}`),
      { controller_user_id: creatorId },
    );
    expect(client.update).toHaveBeenCalledWith(
      "tournaments",
      expect.stringContaining(`controller_user_id=eq.${admin.userId}`),
      { controller_user_id: creatorId },
    );
    expect(client.snapshot().find((row) => row.id === tournamentId)).toMatchObject({
      owner_user_id: creatorId,
      created_by_user_id: creatorId,
      controller_user_id: creatorId,
    });
    expect(tournament.creator).toMatchObject({ displayName: "Creator One", username: "creator" });
    expect(tournament.controller).toMatchObject({ displayName: "Creator One", username: "creator" });
    expect(tournament.isControlledByCurrentAdmin).toBe(false);
    expect(tournament.canReturnControlToOwner).toBe(false);
  });

  it("rejects return-control when the admin is not the current controller", async () => {
    const client = createClient();

    await expect(returnManagedTournamentControlToOwner({ actor: admin, tournamentId }, { client })).rejects.toMatchObject({ status: 403 });

    expect(client.update).not.toHaveBeenCalled();
    expect(client.snapshot().find((row) => row.id === tournamentId)?.controller_user_id).toBe(otherId);
  });

  it("blocks normal users from return-control before tournament data is changed", async () => {
    const client = createClient({ adminControlsTournament: true });

    await expect(returnManagedTournamentControlToOwner({
      actor: { ...admin, role: "user" },
      tournamentId,
    }, { client })).rejects.toMatchObject({ status: 403 });
    expect(client.update).not.toHaveBeenCalled();
  });

  it("does not partially mutate local state when the takeover RPC fails", async () => {
    const client = createClient({ failTakeover: true });

    await expect(takeoverManagedTournament({ actor: admin, tournamentId }, { client })).rejects.toThrow("permission denied for table tournaments");

    expect(client.update).not.toHaveBeenCalled();
    expect(client.snapshot().find((row) => row.id === tournamentId)?.controller_user_id).toBe(otherId);
  });

  it("blocks normal users before tournament data is changed", async () => {
    const client = createClient();

    await expect(takeoverManagedTournament({
      actor: { ...admin, role: "user" },
      tournamentId,
    }, { client })).rejects.toMatchObject({ status: 403 });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });
});

function createClient(options: { failTakeover?: boolean; adminControlsTournament?: boolean } = {}): SupabaseRestClient & { snapshot: () => ReturnType<typeof createTournamentRow>[] } {
  const tournaments = [
    createTournamentRow(tournamentId, "Creator Cup", creatorId, options.adminControlsTournament ? admin.userId : otherId),
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
  const update: SupabaseRestClient["update"] = vi.fn(async (_table: string, query: string, values: Record<string, unknown>) => {
    const row = tournaments.find((candidate) => query.includes(candidate.id));
    if (!row || row.controller_user_id !== admin.userId || row.owner_user_id !== values.controller_user_id) {
      return [];
    }
    row.controller_user_id = values.controller_user_id as string;
    return [row];
  }) as SupabaseRestClient["update"];
  const rpc: SupabaseRestClient["rpc"] = vi.fn(async (functionName: string) => {
    if (functionName !== "lezgo_admin_takeover_tournament_v1") {
      throw new Error(`Unexpected RPC ${functionName}`);
    }
    if (options.failTakeover) {
      throw new Error("permission denied for table tournaments");
    }
    const row = tournaments.find((candidate) => candidate.id === tournamentId);
    if (!row) {
      throw new Error("Tournament was not found.");
    }
    row.controller_user_id = admin.userId;
    return row;
  }) as SupabaseRestClient["rpc"];

  const client = {
    rpc,
    insert: vi.fn(),
    delete: vi.fn(),
    select,
    update,
    snapshot: () => tournaments,
  };

  return client;
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
