// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260820000200_step_25i_c1c8b_admin_takeover_rpc.sql"), "utf8");

describe("STEP 25I-C1-C8B-T2-FIX3 admin takeover RPC migration", () => {
  it("adds a narrow service-role-only takeover RPC without broad table grants", () => {
    expect(migration).toContain("create or replace function public.lezgo_admin_takeover_tournament_v1");
    expect(migration).toContain("security definer");
    expect(migration).toContain("not public.lezgo_is_admin(p_admin_user_id)");
    expect(migration).toContain("grant execute on function public.lezgo_admin_takeover_tournament_v1(uuid, uuid) to service_role");
    expect(migration).toContain("revoke all on function public.lezgo_admin_takeover_tournament_v1(uuid, uuid) from authenticated");
    expect(migration).not.toMatch(/\bgrant\s+update\s+on\s+(table\s+)?public\.tournaments\s+to\s+authenticated\b/i);
    expect(migration).not.toMatch(/\bdisable\s+row\s+level\s+security\b/i);
  });

  it("preserves creator and owner fields while changing only controller metadata", () => {
    expect(migration).toContain("set controller_user_id = p_admin_user_id");
    expect(migration).toContain("updated_by_user_id = p_admin_user_id");
    expect(migration).not.toMatch(/\bcreated_by_user_id\s*=\s*p_admin_user_id\b/i);
    expect(migration).not.toMatch(/\bowner_user_id\s*=\s*p_admin_user_id\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.tournaments\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
  });
});
