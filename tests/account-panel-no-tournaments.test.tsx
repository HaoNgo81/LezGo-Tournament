import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountPanel } from "../components/auth/account-panel";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

describe("STEP 25Y-F3 Account panel without tournament listing", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    navigationMocks.push.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("renders signed-in identity and security without requesting account tournaments", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return Response.json({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-0000000000a1",
            email: "owner@example.com",
            displayName: "Owner",
            username: "owner",
            role: "user",
          },
        });
      }

      if (url.startsWith("/api/account/tournaments")) {
        throw new Error("Account panel must not fetch tournament lists or tournament details.");
      }

      return Response.json({ ok: false }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountPanel />);

    await waitFor(() => expect(screen.getByText("Owner")).toBeInTheDocument());
    expect(screen.getByText("@owner")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("Sikkerhed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skift kode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log andre enheder ud" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log ud" })).toBeInTheDocument();
    expect(screen.queryByText("Mine turneringer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-tournament-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-tournament-card")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Åbn turnering" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith("/api/account/tournaments"))).toBe(false);
  });

  it("uses the provided account immediately and does not make a duplicate account or tournament request", () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: false }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountPanel initialAccount={{
      userId: "00000000-0000-4000-8000-0000000000b2",
      email: "admin@example.com",
      displayName: "Admin User",
      username: "admin",
      role: "admin",
    }} />);

    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("@admin")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(screen.queryByText("Mine turneringer")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps code-change controls working without tournament UI in the panel", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/credentials/change-code") {
        expect(JSON.parse(String(init?.body))).toEqual({
          currentCode: "OLD123",
          newCode: "NEW456",
          repeatNewCode: "NEW456",
        });
        return Response.json({ ok: true });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountPanel initialAccount={{
      userId: "00000000-0000-4000-8000-0000000000a1",
      email: "owner@example.com",
      displayName: "Owner",
      username: "owner",
      role: "user",
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "Skift kode" }));
    fireEvent.change(screen.getByLabelText("Nuværende kode"), { target: { value: "OLD123" } });
    fireEvent.change(screen.getByLabelText("Ny 6-tegns kode"), { target: { value: "NEW456" } });
    fireEvent.change(screen.getByLabelText("Gentag kode"), { target: { value: "NEW456" } });
    fireEvent.submit(screen.getByRole("button", { name: "Gem ny kode" }).closest("form") as HTMLFormElement);

    await screen.findByText("Din kode er ændret.");
    expect(screen.queryByText("Mine turneringer")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/credentials/change-code", expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith("/api/account/tournaments"))).toBe(false);
  });
});
