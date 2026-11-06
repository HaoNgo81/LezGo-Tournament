// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkCurrentAuthSession, fetchWithAuthRefresh } from "../lib/auth/client-session";

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("client session helpers (STEP 42A)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shares one /api/auth/me request between checks that overlap, so a refresh token is never used twice at once", async () => {
    let resolveMe!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveMe = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const first = checkCurrentAuthSession();
    const second = checkCurrentAuthSession();
    resolveMe(new Response(JSON.stringify({ ok: true, account: { userId: "u" } }), { status: 200 }));

    await expect(first).resolves.toBe("signedIn");
    await expect(second).resolves.toBe("signedIn");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A later check makes a new request.
    fetchMock.mockImplementationOnce(() => respond(401, { ok: false }));
    await expect(checkCurrentAuthSession()).resolves.toBe("signedOut");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports unknown, not signed out, when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(checkCurrentAuthSession()).resolves.toBe("unknown");
  });

  it("renews the login once on 401 and retries the request", async () => {
    const calls: string[] = [];
    let saveAttempts = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      calls.push(url);
      if (url === "/api/auth/me") return respond(200, { ok: true, account: { userId: "u" } });
      saveAttempts += 1;
      return saveAttempts === 1 ? respond(401, { ok: false }) : respond(200, { ok: true });
    }));

    const response = await fetchWithAuthRefresh("/api/supabase/shadow-save", { method: "POST" });
    expect(response.status).toBe(200);
    expect(calls).toEqual(["/api/supabase/shadow-save", "/api/auth/me", "/api/supabase/shadow-save"]);
  });

  it("returns the 401 without retrying when the login cannot be renewed", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      calls.push(input.toString());
      return respond(401, { ok: false });
    }));

    const response = await fetchWithAuthRefresh("/api/supabase/shadow-save", { method: "POST" });
    expect(response.status).toBe(401);
    expect(calls).toEqual(["/api/supabase/shadow-save", "/api/auth/me"]);
  });

  it("does not renew on 403 (another account controls the tournament)", async () => {
    const fetchMock = vi.fn(() => respond(403, { ok: false }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchWithAuthRefresh("/api/x")).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
