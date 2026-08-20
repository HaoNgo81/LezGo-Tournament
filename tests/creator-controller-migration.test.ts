// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260820000100_step_25i_c1c8a_creator_controller.sql"), "utf8");

describe("STEP 25I-C1-C8A creator/controller migration", () => {
  it("adds creator and controller fields with non-destructive backfill", () => {
    expect(migration).toContain("add column if not exists created_by_user_id uuid null references auth.users(id) on delete set null");
    expect(migration).toContain("add column if not exists controller_user_id uuid null references auth.users(id) on delete set null");
    expect(migration).toContain("created_by_user_id = coalesce(created_by_user_id, owner_user_id)");
    expect(migration).toContain("controller_user_id = coalesce(controller_user_id, owner_user_id)");
    expect(migration).not.toMatch(/\bdrop\s+column\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.tournaments\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
  });

  it("keeps owner compatibility while moving trusted writes to the effective controller", () => {
    expect(migration).toContain("effective_controller_user_id := coalesce(existing_controller_user_id, existing_owner_user_id)");
    expect(migration).toContain("effective_controller_user_id := coalesce(tournament_row.controller_user_id, tournament_row.owner_user_id)");
    expect(migration).toContain("created_by_user_id = coalesce(existing_created_by_user_id, existing_owner_user_id, p_actor_user_id)");
    expect(migration).toContain("controller_user_id = coalesce(existing_controller_user_id, existing_owner_user_id, p_actor_user_id)");
    expect(migration).toContain("grant execute on function public.lezgo_save_owned_match_score_v1");
  });
});
