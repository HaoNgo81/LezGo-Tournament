import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import { explicitLogoutStorageKey } from "../lib/auth/client-logout";
import { createMockLiveTournamentState } from "../lib/live-scoring";
import { createStandardShadowSaveLocalId, loadActiveCloudTournamentAuthority, loadActiveTournament, markActiveCloudTournamentAuthority, saveActiveTournament } from "../lib/tournament-setup";
import { clearBrowserRegressionState, expectRemovedLegacyFeaturesAbsent, mockLoggedOutAccountFetch } from "./helpers/current-product-regression";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

function expectUsableAccountModalShell(dialog: HTMLElement) {
  const panel = screen.getByTestId("main-account-dialog-panel");
  const scrollArea = screen.getByTestId("main-account-dialog-scroll");

  expect(dialog).toHaveClass("fixed", "inset-0", "overflow-y-auto", "overscroll-contain", "py-5");
  expect(panel).toHaveClass(
    "grid",
    "max-h-[calc(100dvh-2.5rem)]",
    "sm:max-h-[calc(100dvh-3rem)]",
    "overflow-hidden",
  );
  expect(panel.className).toContain("grid-rows-[auto_minmax(0,1fr)]");
  expect(panel).not.toHaveClass("overflow-y-auto");
  expect(scrollArea).toHaveClass("min-h-0", "overflow-y-auto", "px-4", "pb-4");
  expect(panel).toContainElement(scrollArea);
}

describe("STEP 25I-C1-B main page account UI", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    clearBrowserRegressionState();
  });

  it("routes a Supabase recovery hash from the homepage into the reset-code UI without keeping tokens visible", async () => {
    mockLoggedOutAccountFetch();
    window.history.pushState(null, "", "/#access_token=homepage-recovery-token&refresh_token=homepage-refresh-token&type=recovery");

    render(<HomePage />);

    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith("/auth/reset#access_token=homepage-recovery-token&refresh_token=homepage-refresh-token&type=recovery"));
    expect(window.location.hash).toBe("");
    expect(document.body).not.toHaveTextContent("homepage-recovery-token");
    expect(window.localStorage.getItem("homepage-recovery-token")).toBeNull();
    expect(window.sessionStorage.getItem("homepage-recovery-token")).toBeNull();
  });

  it("does not enter reset mode for a normal homepage visit", async () => {
    mockLoggedOutAccountFetch();

    render(<HomePage />);

    await screen.findByTestId("main-account-control");
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Ny turnering/i })).toBeInTheDocument();
  });

  it("shows compact logged-out account actions on the main page without removing existing cards", async () => {
    mockLoggedOutAccountFetch();

    render(<HomePage />);

    const topBar = await screen.findByTestId("main-account-top-bar");
    const brandArea = screen.getByTestId("app-shell-brand-area");
    const languageButton = within(topBar).getByTestId("main-language-control");
    const loginButton = within(topBar).getByTestId("main-account-control");
    const createButton = within(topBar).getByTestId("main-account-create-control");

    expect(topBar).toContainElement(languageButton);
    expect(topBar).toContainElement(loginButton);
    expect(topBar).toContainElement(createButton);
    expect(brandArea).not.toContainElement(loginButton);
    expect(brandArea).not.toContainElement(createButton);
    expect(languageButton).toHaveTextContent("DA");
    expect(loginButton).toHaveTextContent("Log ind");
    expect(createButton).toHaveTextContent("Opret bruger");
    expect(loginButton).toHaveClass("min-h-9");
    expect(createButton).toHaveClass("min-h-9");
    expect(createButton).toHaveClass("text-[var(--primary-strong)]");
    expect(createButton).not.toHaveClass("bg-[var(--primary)]");
    expect(screen.getByRole("link", { name: /Ny turnering/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Turneringer/i })).toBeInTheDocument();
    expect(screen.queryByText("UPDATE TEST D3")).not.toBeInTheDocument();
    expectRemovedLegacyFeaturesAbsent();
    expect(screen.queryByRole("link", { name: /^Indstillinger/i })).not.toBeInTheDocument();

    fireEvent.click(loginButton);

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(topBar).not.toContainElement(dialog);
    expect(document.body).toContainElement(dialog);
    expect(within(dialog).getByRole("heading", { name: "Konto" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email eller brugernavn")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("6-tegns kode")).toHaveAttribute("type", "password");
    expectUsableAccountModalShell(dialog);
  });

  it("changes language from the premium top bar through the existing preferences system", async () => {
    mockLoggedOutAccountFetch();

    render(<HomePage />);

    const topBar = await screen.findByTestId("main-account-top-bar");
    fireEvent.click(within(topBar).getByTestId("main-language-control"));

    await waitFor(() => expect(within(topBar).getByTestId("main-language-control")).toHaveTextContent("EN"));
    expect(within(topBar).getByTestId("main-account-control")).toHaveTextContent("Log in");
    expect(within(topBar).getByTestId("main-account-create-control")).toHaveTextContent("Create account");
  });

  it("opens the create-user state directly from the header create action", async () => {
    mockLoggedOutAccountFetch();

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-create-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(screen.getByTestId("main-account-top-bar")).not.toContainElement(dialog);
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expectUsableAccountModalShell(dialog);
    expect(within(dialog).getByRole("heading", { name: "Konto" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Opret bruger" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Navn")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Brugernavn")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Har du allerede en bruger? Log ind" })).toBeInTheDocument();
  });

  it("keeps the create-user modal in a normal shell with reachable top content and bottom action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-create-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    const panel = screen.getByTestId("main-account-dialog-panel");
    const scrollArea = screen.getByTestId("main-account-dialog-scroll");

    expectUsableAccountModalShell(dialog);
    expect(panel).not.toHaveClass("max-h-[92svh]");
    expect(scrollArea).toContainElement(within(dialog).getByRole("button", { name: "Opret bruger" }));
    expect(scrollArea).toContainElement(within(dialog).getByLabelText("Navn"));
    expect(scrollArea).toContainElement(within(dialog).getByLabelText("Brugernavn"));
    expect(scrollArea).toContainElement(within(dialog).getByLabelText("E-mail"));
    expect(scrollArea).toContainElement(within(dialog).getByLabelText("6-tegns kode"));
    expect(scrollArea).toContainElement(within(dialog).getByLabelText("Gentag kode"));
    expect(scrollArea).toContainElement(within(dialog).getByRole("button", { name: "Har du allerede en bruger? Log ind" }));
  });

  it("restores page scrolling after the account modal closes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-create-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Luk" }));

    await waitFor(() => expect(screen.queryByTestId("main-account-dialog")).not.toBeInTheDocument());
    expect(document.body).not.toHaveStyle({ overflow: "hidden" });
  });

  it("uses the same non-collapsing modal shell for forgot-code recovery", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Glemt kode?" }));

    expectUsableAccountModalShell(dialog);
    expect(within(dialog).getByText("Indtast den email, der er tilknyttet din konto.")).toBeInTheDocument();
    expect(screen.getByTestId("main-account-dialog-scroll")).toContainElement(within(dialog).getByRole("button", { name: "Send instruktioner" }));
  });

  it("renders logged-out account actions in English", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({ language: "en" }));

    render(<HomePage />);

    expect(await screen.findByTestId("main-account-control")).toHaveTextContent("Log in");
    expect(screen.getByTestId("main-account-create-control")).toHaveTextContent("Create account");
    expect(screen.queryByRole("link", { name: /^Settings/i })).not.toBeInTheDocument();
  });

  it("shows the global settings card and admin indicator only for admin accounts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000ad01",
            email: "admin@example.com",
            displayName: "Admin User",
            username: "admin",
            role: "admin",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({ ok: true, tournaments: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }));

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Admin User"));
    expect(screen.getByRole("link", { name: /^Indstillinger/i })).toHaveAttribute("href", "/settings");

    fireEvent.click(screen.getByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    expect(within(dialog).getByText("ADMIN")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("shows account security controls for signed-in users and calls trusted session endpoints", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b1",
            email: "hao@example.com",
            displayName: "Hao",
            username: "hao",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({ ok: true, tournaments: [] }), { status: 200 });
      }

      if (url === "/api/auth/credentials/change-code") {
        expect(JSON.parse(String(init?.body))).toEqual({
          currentCode: "OLD123",
          newCode: "NEW456",
          repeatNewCode: "NEW456",
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url === "/api/auth/sessions/logout-others") {
        return new Response(JSON.stringify({ ok: true, currentSessionPreserved: true }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Hao"));
    fireEvent.click(screen.getByTestId("main-account-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(within(dialog).getByText("Sikkerhed")).toBeInTheDocument();
    expect(within(dialog).getByText("Denne enhed er logget ind.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Skift kode" }));
    fireEvent.change(within(dialog).getByLabelText("Nuværende kode"), { target: { value: "OLD123" } });
    fireEvent.change(within(dialog).getByLabelText("Ny 6-tegns kode"), { target: { value: "NEW456" } });
    fireEvent.change(within(dialog).getByLabelText("Gentag kode"), { target: { value: "NEW456" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gem ny kode" }));

    await within(dialog).findByText("Din kode er ændret.");

    fireEvent.click(within(dialog).getByRole("button", { name: "Log andre enheder ud" }));
    await within(dialog).findByText("Andre enheder er logget ud.");

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/credentials/change-code", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sessions/logout-others", expect.objectContaining({ method: "POST" }));
    expect(String(fetchMock.mock.calls.map((call) => call[1]?.body).join("\n"))).not.toMatch(/targetUserId|access_token|refresh_token/i);
  });

  it("logs in with email and code through the C1-A credential endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/login") {
        expect(JSON.parse(String(init?.body))).toEqual({ identifier: "hao@example.com", code: "abc123", remember: false });
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b1",
            email: "hao@example.com",
            displayName: "Hao",
            username: "hao",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({ ok: true, tournaments: [] }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Email eller brugernavn"), { target: { value: "hao@example.com" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "abc123" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Log ind" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Hao"));
    await waitFor(() => expect(screen.queryByTestId("main-account-dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("main-account-control")).not.toHaveTextContent("hao@example.com");
    expect(screen.queryByTestId("main-account-create-control")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ny turnering/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Indstillinger/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("main-account-control"));
    expect(await screen.findByTestId("main-account-dialog")).toBeInTheDocument();
  });

  it("closes the account modal after USER login without changing the active tournament or controller", async () => {
    const activeTournament = createMockLiveTournamentState();
    const localId = createStandardShadowSaveLocalId(activeTournament);
    saveActiveTournament(activeTournament);
    markActiveCloudTournamentAuthority({
      source: "server",
      kind: "standard",
      localId,
      tournamentId: "00000000-0000-4000-8000-00000025b001",
      canRead: true,
      canManage: true,
      createdByUserId: "00000000-0000-4000-8000-00000000c1b1",
      controllerUserId: "00000000-0000-4000-8000-00000000c1b1",
      ownerUserId: "00000000-0000-4000-8000-00000000c1b1",
    });
    const beforeTournament = window.localStorage.getItem("lezgo.activeTournament.v1");
    const beforeAuthority = loadActiveCloudTournamentAuthority("standard", localId);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/login") {
        expect(JSON.parse(String(init?.body))).toEqual({ identifier: "hao", code: "abc123", remember: false });
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b1",
            email: "hao@example.com",
            displayName: "Hao",
            username: "hao",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({ ok: true, tournaments: [] }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Email eller brugernavn"), { target: { value: "hao" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "abc123" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Log ind" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.queryByTestId("main-account-dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("main-account-control")).toHaveTextContent("Hao");
    expect(screen.getByRole("link", { name: /Ny turnering/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Turneringer/i })).toBeInTheDocument();
    expect(window.localStorage.getItem("lezgo.activeTournament.v1")).toBe(beforeTournament);
    expect(loadActiveTournament()).toMatchObject({
      tournamentName: activeTournament.tournamentName,
      activeRoundNumber: activeTournament.activeRoundNumber,
      status: activeTournament.status,
    });
    expect(loadActiveCloudTournamentAuthority("standard", localId)).toEqual(beforeAuthority);
    expect(navigationMocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("main-account-control"));
    expect(await screen.findByTestId("main-account-dialog")).toBeInTheDocument();
  });

  it("closes the account modal after ADMIN login and keeps admin entry explicit", async () => {
    let isLoggedIn = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        if (!isLoggedIn) {
          return new Response(JSON.stringify({ ok: false }), { status: 401 });
        }

        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000ad01",
            email: "admin@example.com",
            displayName: "Admin User",
            username: "admin",
            role: "admin",
          },
        }), { status: 200 });
      }

      if (url === "/api/auth/credentials/login") {
        expect(JSON.parse(String(init?.body))).toEqual({ identifier: "admin", code: "adm123", remember: false });
        isLoggedIn = true;
        return new Response(JSON.stringify({
          ok: true,
          rememberDenied: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000ad01",
            email: "admin@example.com",
            displayName: "Admin User",
            username: "admin",
            role: "admin",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({ ok: true, tournaments: [] }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Email eller brugernavn"), { target: { value: "admin" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "adm123" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Log ind" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.queryByTestId("main-account-dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("main-account-control")).toHaveTextContent("Admin User");
    expect(screen.getByRole("link", { name: /Ny turnering/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Turneringer/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Indstillinger/i })).toHaveAttribute("href", "/settings");
    expect(screen.queryByText("Beskyttet område for systemadministration")).not.toBeInTheDocument();
    expect(navigationMocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("main-account-control"));
    const reopenedDialog = await screen.findByTestId("main-account-dialog");
    expect(within(reopenedDialog).getByText("ADMIN")).toBeInTheDocument();
    expect(within(reopenedDialog).getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("logs in with username and code through the same C1-A credential endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/login") {
        expect(JSON.parse(String(init?.body))).toEqual({ identifier: "hao", code: "a1b2c3", remember: false });
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b2",
            email: "hao@example.com",
            displayName: "Hao",
            username: "hao",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({ ok: true, tournaments: [] }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Email eller brugernavn"), { target: { value: "hao" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "a1b2c3" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Log ind" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/credentials/login", expect.any(Object)));
  });

  it("lets normal users request remembered login without storing the raw code in browser storage", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/login") {
        expect(JSON.parse(String(init?.body))).toEqual({ identifier: "hao", code: "a1b2c3", remember: true });
        return new Response(JSON.stringify({
          ok: true,
          remembered: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b2",
            email: "hao@example.com",
            displayName: "Hao",
            username: "hao",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({ ok: true, tournaments: [] }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Email eller brugernavn"), { target: { value: "hao" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "a1b2c3" } });
    fireEvent.click(within(dialog).getByLabelText("Husk kode på denne enhed"));
    fireEvent.submit(within(dialog).getByRole("button", { name: "Log ind" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Hao"));
    expect(window.localStorage.getItem("a1b2c3")).toBeNull();
    expect(window.sessionStorage.getItem("a1b2c3")).toBeNull();
    expect(JSON.stringify(window.localStorage)).not.toContain("a1b2c3");
    expect(JSON.stringify(window.sessionStorage)).not.toContain("a1b2c3");
  });

  it("shows a clear message when an unverified account tries to log in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/login") {
        return new Response(JSON.stringify({
          ok: false,
          error: "Email is not verified.",
        }), { status: 403 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Email eller brugernavn"), { target: { value: "hao@example.com" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "a1b2c3" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Log ind" }).closest("form") as HTMLFormElement);

    await screen.findByText("Din e-mail er ikke bekræftet endnu. Tjek din indbakke.");
  });

  it("creates a USER account through the C1-A register endpoint with name username email and repeated code", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/register") {
        expect(JSON.parse(String(init?.body))).toEqual({
          displayName: "Hao Ngo",
          username: "hao",
          email: "hao@example.com",
          code: "ab12cd",
          repeatCode: "ab12cd",
        });
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b3",
            email: "hao@example.com",
            displayName: "Hao Ngo",
            username: "hao",
            role: "user",
          },
          verificationRequired: true,
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-create-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Navn"), { target: { value: "Hao Ngo" } });
    fireEvent.change(within(dialog).getByLabelText("Brugernavn"), { target: { value: "hao" } });
    fireEvent.change(within(dialog).getByLabelText("E-mail"), { target: { value: "hao@example.com" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "ab12cd" } });
    fireEvent.change(within(dialog).getByLabelText("Gentag kode"), { target: { value: "ab12cd" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Opret bruger" }).closest("form") as HTMLFormElement);

    await screen.findByText("Bekræft din e-mail");
    expect(within(dialog).getByTestId("account-verification-pending")).toHaveTextContent("Vi har sendt et bekræftelseslink til din e-mail.");
    expect(within(dialog).getByRole("button", { name: "Send mail igen" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Tilbage til log ind" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/credentials/register", expect.any(Object));
  });

  it("requests forgot-code recovery without revealing whether the account exists", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/recover") {
        expect(JSON.parse(String(init?.body))).toEqual({ email: "ukendt@example.com" });
        return new Response(JSON.stringify({
          ok: true,
          message: "If the email address is registered, we have sent instructions for creating a new code.",
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Glemt kode?" }));
    expect(within(dialog).getByText("Indtast den email, der er tilknyttet din konto.")).toBeInTheDocument();
    expectUsableAccountModalShell(dialog);
    fireEvent.change(within(dialog).getByLabelText("E-mail"), { target: { value: "ukendt@example.com" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Send instruktioner" }).closest("form") as HTMLFormElement);

    await screen.findByText("Hvis e-mailadressen er registreret, har vi sendt instruktioner til at oprette en ny kode.");
  });

  it("prevents duplicate forgot-code recovery requests from one in-flight submit", async () => {
    let resolveRecovery: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/recover") {
        expect(JSON.parse(String(init?.body))).toEqual({ email: "user@example.com" });
        return await new Promise<Response>((resolve) => {
          resolveRecovery = resolve;
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Glemt kode?" }));
    fireEvent.change(within(dialog).getByLabelText("E-mail"), { target: { value: "user@example.com" } });

    const form = within(dialog).getByRole("button", { name: "Send instruktioner" }).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/auth/credentials/recover")).toHaveLength(1));
    expect(within(dialog).getByRole("button", { name: "Indlæser turnering..." })).toBeDisabled();

    resolveRecovery?.(new Response(JSON.stringify({
      ok: true,
      message: "If the email address is registered, we have sent instructions for creating a new code.",
    }), { status: 200 }));
    await screen.findByText("Hvis e-mailadressen er registreret, har vi sendt instruktioner til at oprette en ny kode.");
  });

  it("resends account verification from the pending create-account state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/register") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1c1",
            email: "hao@example.com",
            displayName: "Hao Ngo",
            username: "hao",
            role: "user",
          },
          verificationRequired: true,
        }), { status: 200 });
      }

      if (url === "/api/auth/credentials/resend-verification") {
        expect(JSON.parse(String(init?.body))).toEqual({ email: "hao@example.com" });
        return new Response(JSON.stringify({
          ok: true,
          message: "If the email can be verified, we have sent a new verification email.",
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-create-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Navn"), { target: { value: "Hao Ngo" } });
    fireEvent.change(within(dialog).getByLabelText("Brugernavn"), { target: { value: "hao" } });
    fireEvent.change(within(dialog).getByLabelText("E-mail"), { target: { value: "hao@example.com" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "ab12cd" } });
    fireEvent.change(within(dialog).getByLabelText("Gentag kode"), { target: { value: "ab12cd" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Opret bruger" }).closest("form") as HTMLFormElement);

    fireEvent.click(await within(dialog).findByRole("button", { name: "Send mail igen" }));

    await screen.findByText("Hvis e-mailen kan bekræftes, har vi sendt en ny mail.");
  });

  it("opens login with a verified-email message after the verification callback redirects home", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));
    window.history.pushState(null, "", "/?accountVerified=verified");

    render(<HomePage />);

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(within(dialog).getByText("E-mail bekræftet. Din konto er nu aktiveret. Du kan logge ind.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email eller brugernavn")).toBeInTheDocument();
    expect(window.location.search).not.toContain("accountVerified");
  });

  it("renders stored profile name username and email without using the email local-part as the account name", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-000000000902",
            email: "example@example.com",
            displayName: "Test Person",
            username: "TestUser",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({ ok: true, tournaments: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }));

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Test Person"));
    fireEvent.click(screen.getByTestId("main-account-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(within(dialog).getByText("Test Person")).toBeInTheDocument();
    expect(within(dialog).getByText("@TestUser")).toBeInTheDocument();
    expect(within(dialog).getByText("example@example.com")).toBeInTheDocument();
    expect(within(dialog).queryByText("Mine turneringer")).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId("account-tournament-list")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Opret ny turnering" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("example")).not.toBeInTheDocument();
  });

  it("shows display name or username and logout for signed-in users without fetching account tournaments", async () => {
    let isLoggedIn = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        if (!isLoggedIn) {
          return new Response(JSON.stringify({ ok: false }), { status: 401 });
        }

        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b4",
            email: "owner@example.com",
            displayName: "Owner",
            username: "owner",
            role: "user",
          },
        }), { status: 200 });
      }

      if (url === "/api/auth/logout") {
        isLoggedIn = false;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Owner"));
    expect(screen.getByTestId("main-account-control")).not.toHaveTextContent("owner@example.com");
    expect(screen.queryByRole("link", { name: /^Indstillinger/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("main-account-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(within(dialog).getByText("Logget ind")).toBeInTheDocument();
    expect(within(dialog).getByText("Owner")).toBeInTheDocument();
    expect(within(dialog).getByText("@owner")).toBeInTheDocument();
    expect(within(dialog).getByText("owner@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText("Sikkerhed")).toBeInTheDocument();
    expect(within(dialog).queryByText("Mine turneringer")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Cloud Cup")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Du styrer")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Åbn turnering" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === "/api/account/tournaments")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Log ud" }));

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Log ind"));
    expect(screen.getByTestId("main-account-create-control")).toHaveTextContent("Opret bruger");
  });

  it("keeps the signed-in Account panel focused on identity and security in English", async () => {
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({ language: "en" }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1j1",
            email: "owner@example.com",
            displayName: "Owner",
            username: "owner",
            role: "user",
          },
        }), { status: 200 });
      }

      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Owner"));
    fireEvent.click(screen.getByTestId("main-account-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(within(dialog).getByText("Signed in")).toBeInTheDocument();
    expect(within(dialog).getByText("Owner")).toBeInTheDocument();
    expect(within(dialog).getByText("@owner")).toBeInTheDocument();
    expect(within(dialog).getByText("owner@example.com")).toBeInTheDocument();
    expect(within(dialog).getByText("Security")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Change code" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Log out other devices" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(within(dialog).queryByText("My tournaments")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("You control")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Open tournament" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/owner_user_id|controller_user_id|created_by_user_id|Supabase|RLS|RPC|score_version/i)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === "/api/account/tournaments")).toBe(false);
  });

  it("closes Account immediately on USER logout and prevents delayed automatic re-login", async () => {
    let serverLoggedOut = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify(serverLoggedOut
          ? { ok: false }
          : {
              ok: true,
              account: {
                userId: "00000000-0000-4000-8000-00000000c1b1",
                email: "hao@example.com",
                displayName: "Hao",
                username: "hao",
                role: "user",
              },
            }), { status: serverLoggedOut ? 401 : 200 });
      }

      if (url === "/api/auth/logout") {
        serverLoggedOut = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Hao"));
    fireEvent.click(screen.getByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Log ud" }));

    await waitFor(() => expect(screen.queryByTestId("main-account-dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("main-account-control")).toHaveTextContent("Log ind");
    expect(screen.getByTestId("main-account-create-control")).toHaveTextContent("Opret bruger");
    expect(window.localStorage.getItem(explicitLogoutStorageKey)).toBe("1");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));

    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(12_000);
    vi.useRealTimers();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new StorageEvent("storage", { key: explicitLogoutStorageKey, newValue: "1" }));
    await Promise.resolve();

    expect(screen.getByTestId("main-account-control")).toHaveTextContent("Log ind");
    expect(screen.queryByTestId("main-account-dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/auth/me")).toHaveLength(1);
  });

  it("keeps ADMIN logout immediate and does not reopen Admin state automatically", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000ad01",
            email: "admin@example.com",
            displayName: "Admin User",
            username: "admin",
            role: "admin",
          },
        }), { status: 200 });
      }

      if (url === "/api/auth/logout") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Admin User"));
    expect(screen.getByRole("link", { name: /^Indstillinger/i })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    expect(within(dialog).getByText("ADMIN")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Log ud" }));

    await waitFor(() => expect(screen.queryByTestId("main-account-dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("main-account-control")).toHaveTextContent("Log ind");
    expect(screen.queryByRole("link", { name: /^Indstillinger/i })).not.toBeInTheDocument();

    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(12_000);
    vi.useRealTimers();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(screen.getByTestId("main-account-control")).toHaveTextContent("Log ind");
    expect(screen.queryByText("Beskyttet område for systemadministration")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((call) => String(call[0]) === "/api/auth/me")).toHaveLength(1);
  });

  it("does not bootstrap a remembered session after reload when explicit logout is marked", async () => {
    window.localStorage.setItem(explicitLogoutStorageKey, "1");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/logout") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({
          ok: true,
          remembered: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b1",
            email: "hao@example.com",
            displayName: "Hao",
            username: "hao",
            role: "user",
          },
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Log ind"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === "/api/auth/me")).toBe(false);
    expect(screen.queryByText("Hao")).not.toBeInTheDocument();
  });

  it("allows an explicit login after logout and clears the logout marker", async () => {
    window.localStorage.setItem(explicitLogoutStorageKey, "1");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/logout") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      if (url === "/api/auth/credentials/login") {
        expect(JSON.parse(String(init?.body))).toEqual({ identifier: "hao", code: "abc123", remember: false });
        return new Response(JSON.stringify({
          ok: true,
          account: {
            userId: "00000000-0000-4000-8000-00000000c1b1",
            email: "hao@example.com",
            displayName: "Hao",
            username: "hao",
            role: "user",
          },
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Log ind"));
    fireEvent.click(screen.getByTestId("main-account-control"));
    const dialog = await screen.findByTestId("main-account-dialog");
    fireEvent.change(within(dialog).getByLabelText("Email eller brugernavn"), { target: { value: "hao" } });
    fireEvent.change(within(dialog).getByLabelText("6-tegns kode"), { target: { value: "abc123" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Log ind" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Hao"));
    expect(window.localStorage.getItem(explicitLogoutStorageKey)).toBeNull();
    expect(window.sessionStorage.getItem(explicitLogoutStorageKey)).toBeNull();
  });
});
