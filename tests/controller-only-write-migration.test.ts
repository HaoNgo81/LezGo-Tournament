// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260820000300_step_25i_c1c8c_controller_only_writes.sql"), "utf8");

describe("STEP 25I-C1-C8C controller-only write migration", () => {
  it("replaces owned write RPC authorization without admin bypasses", () => {
    expect(migration).toContain("create or replace function public.lezgo_save_owned_tournament_snapshot_v1");
    expect(migration).toContain("create or replace function public.lezgo_save_owned_match_score_v1");
    expect(migration).toContain("effective_controller_user_id := coalesce(existing_controller_user_id, existing_owner_user_id)");
    expect(migration).toContain("effective_controller_user_id := coalesce(tournament_row.controller_user_id, tournament_row.owner_user_id)");
    expect(migration).toContain("effective_controller_user_id <> p_actor_user_id then");
    expect(migration).not.toMatch(/lezgo_is_admin\(p_actor_user_id\)/i);
  });

  it("keeps the migration non-destructive and service-role scoped", () => {
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bdrop\s+column\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.tournaments\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).toContain("grant execute on function public.lezgo_save_owned_tournament_snapshot_v1");
    expect(migration).toContain("grant execute on function public.lezgo_save_owned_match_score_v1");
  });
});

