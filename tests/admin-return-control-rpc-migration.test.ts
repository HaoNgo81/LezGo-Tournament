// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260822000100_step_25n_admin_return_control_rpc.sql"), "utf8");

describe("STEP 25N-FIX1 admin return-control RPC migration", () => {
  it("adds a narrow service-role-only return-control RPC without broad table grants", () => {
    expect(migration).toContain("create or replace function public.lezgo_admin_return_tournament_control_v1");
    expect(migration).toContain("security definer");
    expect(migration).toContain("not public.lezgo_is_admin(p_admin_user_id)");
    expect(migration).toContain("grant execute on function public.lezgo_admin_return_tournament_control_v1(uuid, uuid) to service_role");
    expect(migration).toContain("revoke all on function public.lezgo_admin_return_tournament_control_v1(uuid, uuid) from authenticated");
    expect(migration).not.toMatch(/\bgrant\s+update\s+on\s+(table\s+)?public\.tournaments\s+to\s+authenticated\b/i);
    expect(migration).not.toMatch(/\bdisable\s+row\s+level\s+security\b/i);
  });

  it("preserves creator and owner fields while returning only controller metadata to owner", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("controller_user_id = tournament_row.owner_user_id");
    expect(migration).toContain("updated_by_user_id = p_admin_user_id");
    expect(migration).toContain("tournament_row.controller_user_id is distinct from p_admin_user_id");
    expect(migration).not.toMatch(/\bset\s+created_by_user_id\s*=/i);
    expect(migration).not.toMatch(/\bset\s+owner_user_id\s*=/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.tournaments\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
  });
});
