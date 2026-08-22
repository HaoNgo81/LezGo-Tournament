import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountCodeRecoveryPanel } from "../components/auth/account-code-recovery-panel";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchParams: new URLSearchParams("token_hash=recovery-token-hash&type=recovery"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigationMocks.push }),
  useSearchParams: () => navigationMocks.searchParams,
}));

describe("STEP 25M account code recovery UI", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    navigationMocks.push.mockReset();
    navigationMocks.searchParams = new URLSearchParams("token_hash=recovery-token-hash&type=recovery");
    window.history.pushState(null, "", "/");
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("submits the recovery token and new matching code without storing token material", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/auth/credentials/recover/complete");
      expect(JSON.parse(String(init?.body))).toEqual({
        accessToken: "",
        tokenHash: "recovery-token-hash",
        type: "recovery",
        code: "abc123",
        repeatCode: "abc123",
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountCodeRecoveryPanel />);

    fireEvent.change(screen.getByLabelText("Ny 6-tegns kode"), { target: { value: "abc123" } });
    fireEvent.change(screen.getByLabelText("Gentag kode"), { target: { value: "abc123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Nulstil kode" }).closest("form") as HTMLFormElement);

    await screen.findByText("Din kode er ændret. Du kan nu logge ind.");
    fireEvent.click(screen.getByRole("button", { name: "Log ind" }));

    expect(navigationMocks.push).toHaveBeenCalledWith("/");
    expect(window.localStorage.getItem("recovery-token-hash")).toBeNull();
    expect(window.sessionStorage.getItem("recovery-token-hash")).toBeNull();
  });

  it("submits Supabase recovery credentials from the URL hash and removes the hash from the address bar", async () => {
    navigationMocks.searchParams = new URLSearchParams("");
    window.history.pushState(null, "", "/auth/reset#access_token=fragment-access-token&refresh_token=fragment-refresh-token&type=recovery");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/auth/credentials/recover/complete");
      expect(JSON.parse(String(init?.body))).toEqual({
        accessToken: "fragment-access-token",
        tokenHash: "",
        type: "recovery",
        code: "123456",
        repeatCode: "123456",
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountCodeRecoveryPanel />);

    await waitFor(() => expect(window.location.hash).toBe(""));
    fireEvent.change(await screen.findByLabelText("Ny 6-tegns kode"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("Gentag kode"), { target: { value: "123456" } });
    fireEvent.submit(screen.getByRole("button", { name: "Nulstil kode" }).closest("form") as HTMLFormElement);

    await screen.findByText("Din kode er ændret. Du kan nu logge ind.");
    expect(document.body).not.toHaveTextContent("fragment-access-token");
    expect(document.body).not.toHaveTextContent("fragment-refresh-token");
    expect(window.localStorage.getItem("fragment-access-token")).toBeNull();
    expect(window.sessionStorage.getItem("fragment-access-token")).toBeNull();
  });

  it("shows an invalid-link state when the recovery token is missing", () => {
    navigationMocks.searchParams = new URLSearchParams("");

    render(<AccountCodeRecoveryPanel />);

    expect(screen.getByText("Linket er ugyldigt eller udløbet.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ny 6-tegns kode")).not.toBeInTheDocument();
  });

  it("does not display raw server errors from recovery completion", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: "database timeout: service-role-key leaked detail",
    }), { status: 500 })));

    render(<AccountCodeRecoveryPanel />);

    fireEvent.change(screen.getByLabelText("Ny 6-tegns kode"), { target: { value: "abc123" } });
    fireEvent.change(screen.getByLabelText("Gentag kode"), { target: { value: "abc123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Nulstil kode" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByText("Linket er ugyldigt eller udløbet.")).toBeInTheDocument());
    expect(screen.queryByText(/service-role-key|database timeout/i)).not.toBeInTheDocument();
  });

  it("keeps expired recovery sessions in a safe request-new-link state after submit", async () => {
    navigationMocks.searchParams = new URLSearchParams("");
    window.history.pushState(null, "", "/auth/reset#access_token=expired-recovery-token&refresh_token=expired-refresh-token&type=recovery");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: "expired",
    }), { status: 403 })));

    render(<AccountCodeRecoveryPanel />);

    await waitFor(() => expect(window.location.hash).toBe(""));
    fireEvent.change(await screen.findByLabelText("Ny 6-tegns kode"), { target: { value: "abc123" } });
    fireEvent.change(screen.getByLabelText("Gentag kode"), { target: { value: "abc123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Nulstil kode" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByText("Linket er ugyldigt eller udløbet.")).toBeInTheDocument());
    expect(document.body).not.toHaveTextContent("expired-recovery-token");
    expect(window.localStorage.getItem("expired-recovery-token")).toBeNull();
    expect(window.sessionStorage.getItem("expired-recovery-token")).toBeNull();
  });

  it("keeps the reset card compact for the account modal mobile regression", () => {
    render(<AccountCodeRecoveryPanel />);

    expect(screen.getByTestId("account-code-recovery-panel")).toHaveClass("app-card", "max-w-xl", "p-4", "sm:p-5");
    expect(screen.getByRole("button", { name: "Nulstil kode" })).toHaveClass("min-h-12");
  });
});
