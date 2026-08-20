import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

describe("STEP 25I-C1-B main page account UI", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    navigationMocks.push.mockReset();
    window.localStorage.clear();
    document.documentElement.lang = "da";
  });

  it("shows compact logged-out account actions on the main page without removing existing cards", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));

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
    expect(screen.getByRole("link", { name: /Turneringsskabeloner/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Turneringer/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Åbn turnering fra anden enhed/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Indstillinger/i })).toHaveAttribute("href", "/settings");

    fireEvent.click(loginButton);

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(within(dialog).getByRole("heading", { name: "Konto" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Email eller brugernavn")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("6-tegns kode")).toHaveAttribute("type", "password");
    expect(dialog).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("main-account-dialog-panel")).toHaveClass("max-h-[calc(100svh-2.5rem)]", "overflow-y-auto");
  });

  it("changes language from the premium top bar through the existing preferences system", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));

    render(<HomePage />);

    const topBar = await screen.findByTestId("main-account-top-bar");
    fireEvent.click(within(topBar).getByTestId("main-language-control"));

    await waitFor(() => expect(within(topBar).getByTestId("main-language-control")).toHaveTextContent("EN"));
    expect(within(topBar).getByTestId("main-account-control")).toHaveTextContent("Log in");
    expect(within(topBar).getByTestId("main-account-create-control")).toHaveTextContent("Create account");
  });

  it("opens the create-user state directly from the header create action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));

    render(<HomePage />);
    fireEvent.click(await screen.findByTestId("main-account-create-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(dialog).toHaveClass("overflow-y-auto", "overscroll-contain", "py-5");
    expect(screen.getByTestId("main-account-dialog-panel")).toHaveClass("max-h-[calc(100svh-2.5rem)]", "sm:max-h-[calc(100svh-3rem)]", "overflow-y-auto");
    expect(within(dialog).getByRole("heading", { name: "Konto" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Opret bruger" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Navn")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Brugernavn")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Har du allerede en bruger? Log ind" })).toBeInTheDocument();
  });

  it("renders logged-out account actions in English", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 })));
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({ language: "en" }));

    render(<HomePage />);

    expect(await screen.findByTestId("main-account-control")).toHaveTextContent("Log in");
    expect(screen.getByTestId("main-account-create-control")).toHaveTextContent("Create account");
  });

  it("logs in with email and code through the C1-A credential endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/login") {
        expect(JSON.parse(String(init?.body))).toEqual({ identifier: "hao@example.com", code: "abc123" });
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
    expect(screen.getByTestId("main-account-control")).not.toHaveTextContent("hao@example.com");
    expect(screen.queryByTestId("main-account-create-control")).not.toBeInTheDocument();
  });

  it("logs in with username and code through the same C1-A credential endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ ok: false }), { status: 401 });
      }

      if (url === "/api/auth/credentials/login") {
        expect(JSON.parse(String(init?.body))).toEqual({ identifier: "hao", code: "a1b2c3" });
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
          verificationRequired: false,
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

    await screen.findByText("Brugeren er oprettet. Log ind med email eller brugernavn og din kode.");
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
          message: "If the email is linked to an account, we have sent recovery instructions.",
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
    expect(screen.getByTestId("main-account-dialog-panel")).toHaveClass("overflow-y-auto");
    fireEvent.change(within(dialog).getByLabelText("E-mail"), { target: { value: "ukendt@example.com" } });
    fireEvent.submit(within(dialog).getByRole("button", { name: "Send vejledning" }).closest("form") as HTMLFormElement);

    await screen.findByText("Hvis emailen er tilknyttet en konto, har vi sendt en mail med instruktioner.");
  });

  it("shows display name or username, own tournament list and logout for signed-in users", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/auth/me") {
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

      if (url === "/api/account/tournaments") {
        return new Response(JSON.stringify({
          ok: true,
          tournaments: [{
            id: "00000000-0000-4000-8000-000000000101",
            name: "Cloud Cup",
            format: "mexicano",
            status: "active",
          }],
        }), { status: 200 });
      }

      if (url === "/api/auth/logout") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<HomePage />);

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Owner"));
    expect(screen.getByTestId("main-account-control")).not.toHaveTextContent("owner@example.com");
    fireEvent.click(screen.getByTestId("main-account-control"));

    const dialog = await screen.findByTestId("main-account-dialog");
    expect(await within(dialog).findByText("Mine turneringer")).toBeInTheDocument();
    expect(within(dialog).getByText("Cloud Cup")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Log ud" }));

    await waitFor(() => expect(screen.getByTestId("main-account-control")).toHaveTextContent("Log ind"));
    expect(screen.getByTestId("main-account-create-control")).toHaveTextContent("Opret bruger");
  });
});
