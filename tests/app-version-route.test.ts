import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/app-version/route";

describe("app version route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a non-cached deployment version for PWA update checks", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123deployment");

    const response = GET();
    const body = await response.json() as { version?: string };

    expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
    expect(body.version).toBe("abc123deployment");
  });
});
