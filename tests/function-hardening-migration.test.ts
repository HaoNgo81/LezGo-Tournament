// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261029000100_step_40a_harden_function_privileges.sql"), "utf8");
const statements = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

describe("STEP 40A function hardening migration", () => {
  it("pins the search_path of set_updated_at", () => {
    expect(statements).toContain("alter function public.set_updated_at() set search_path = ''");
  });

  it("stops API roles from calling the trigger functions directly", () => {
    expect(statements).toContain("revoke execute on function public.lezgo_handle_new_auth_user() from public, anon, authenticated");
    expect(statements).toContain("revoke execute on function public.rls_auto_enable() from public, anon, authenticated");
  });

  it("keeps the helpers that row-level security policies call as the signed-in user", () => {
    expect(statements).not.toMatch(/lezgo_is_admin/);
    expect(statements).not.toMatch(/lezgo_can_read_tournament/);
  });

  it("is non-destructive", () => {
    expect(statements).not.toMatch(/\bdrop\b/i);
    expect(statements).not.toMatch(/\bdelete\b/i);
    expect(statements).not.toMatch(/\btruncate\b/i);
    expect(statements).not.toMatch(/\bsecurity\s+invoker\b/i);
  });
});
