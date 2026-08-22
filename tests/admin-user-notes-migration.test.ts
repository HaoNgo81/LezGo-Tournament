// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260822000200_step_25p_admin_user_notes.sql"), "utf8");

describe("STEP 25P admin user notes migration", () => {
  it("keeps internal notes outside profiles with admin-only RLS", () => {
    expect(migration).toContain("create table if not exists public.admin_user_notes");
    expect(migration).toContain("alter table public.admin_user_notes enable row level security");
    expect(migration).toContain("using (public.lezgo_is_admin(auth.uid()))");
    expect(migration).toContain("with check (public.lezgo_is_admin(auth.uid()))");
    expect(migration).toContain("revoke all on table public.admin_user_notes from anon");
    expect(migration).not.toMatch(/\balter\s+table\s+public\.profiles\s+add\s+column\s+.*note/i);
  });

  it("is non-destructive and does not touch tournament data", () => {
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\bdrop\s+column\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.tournaments\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
  });
});
