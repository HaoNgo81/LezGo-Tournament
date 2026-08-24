import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { proxy } from "../proxy";

describe("production domain proxy", () => {
  it("redirects legacy hyphenated Vercel URLs to the canonical production domain", () => {
    const response = proxy(createRequest("https://lez-go-tournament.vercel.app/live?display=scoreboard", "lez-go-tournament.vercel.app"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://lezgotournament.vercel.app/live?display=scoreboard");
  });

  it("allows the canonical production domain without redirecting", () => {
    const response = proxy(createRequest("https://lezgotournament.vercel.app/live", "lezgotournament.vercel.app"));

    expect(response.headers.get("location")).toBeNull();
  });
});

function createRequest(url: string, host: string): NextRequest {
  return {
    headers: new Headers({ host }),
    nextUrl: new URL(url),
  } as NextRequest;
}
