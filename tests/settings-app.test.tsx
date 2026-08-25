import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "../components/settings/settings-app";
import { loadTournamentSettings } from "../lib/tournament-settings";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("SettingsApp", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    push.mockClear();
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.lang = "da";
  });

  it("saves language and keeps it after reload", async () => {
    render(<SettingsApp />);

    const languageSelect = await screen.findByRole("combobox", { name: "Sprog" });
    fireEvent.change(languageSelect, { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(loadTournamentSettings().language).toBe("en"));
    expect(document.documentElement.lang).toBe("en");
  });

  it("starts directly with tournament defaults and does not render the duplicated Account section", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: false }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsApp />);

    expect(await screen.findByRole("heading", { name: "Standarder for nye turneringer" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Konto" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Logget ind")).not.toBeInTheDocument();
    expect(screen.queryByText("Sikkerhed")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scoring")).toBeInTheDocument();
    expect(screen.getByLabelText("Sorter stilling efter")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts with English tournament defaults without Account UI when English is selected", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: false }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({
      ...loadTournamentSettings(),
      language: "en",
    }));

    render(<SettingsApp />);

    expect(await screen.findByRole("heading", { name: "Defaults for new tournaments" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Account" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("account-panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Signed in")).not.toBeInTheDocument();
    expect(screen.queryByText("Security")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scoring")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort standings by")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews and saves a custom primary theme color", async () => {
    render(<SettingsApp />);

    const primaryColor = await screen.findByLabelText("Primær knapfarve");
    fireEvent.change(primaryColor, { target: { value: "#123456" } });

    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#123456");

    fireEvent.click(screen.getByRole("button", { name: "Gem indstillinger" }));
    await waitFor(() => expect(loadTournamentSettings().theme.primary).toBe("#123456"));
  });

  it("offers and saves all built-in theme presets", async () => {
    render(<SettingsApp />);

    const themeSelect = await screen.findByRole("combobox", { name: "Tema" });
    const expectedThemes = ["LezGo", "Dark Gold", "Midnight", "Ocean", "Forest", "Lys", "HYBRID LEZGO", "Brugerdefineret"];

    for (const themeName of expectedThemes) {
      expect(screen.getByRole("option", { name: themeName })).toBeInTheDocument();
    }

    fireEvent.change(themeSelect, { target: { value: "darkGold" } });
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("#3a291c");
    expect(document.documentElement.style.getPropertyValue("--control-bg")).toBe("#5a402c");

    fireEvent.click(screen.getByRole("button", { name: "Gem indstillinger" }));
    await waitFor(() => expect(loadTournamentSettings().theme.preset).toBe("darkGold"));
  });

  it("offers and saves the Hybrid LEZGO visual theme", async () => {
    render(<SettingsApp />);

    const themeSelect = await screen.findByRole("combobox", { name: "Tema" });
    fireEvent.change(themeSelect, { target: { value: "hybridLezgo" } });

    expect(document.documentElement.dataset.theme).toBe("hybridLezgo");
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("#f7f1e5");
    expect(document.documentElement.style.getPropertyValue("--surface")).toBe("#fff9ef");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#d8aa20");
    expect(document.documentElement.style.getPropertyValue("--surface-dark")).toBe("#4a3524");
    expect(document.documentElement.style.getPropertyValue("--selected-bg")).toBe("#4a3524");
    expect(document.documentElement.style.getPropertyValue("--control-bg")).toBe("#fff9ef");

    fireEvent.click(screen.getByRole("button", { name: "Gem indstillinger" }));
    await waitFor(() => expect(loadTournamentSettings().theme.preset).toBe("hybridLezgo"));
  });

  it("resets the theme to the Hybrid LEZGO default colors", async () => {
    render(<SettingsApp />);

    fireEvent.change(await screen.findByLabelText("Primær knapfarve"), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Nulstil tema" }));

    expect(document.documentElement.dataset.theme).toBe("hybridLezgo");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#d8aa20");
  });

  it("preserves active tournament data when changing the theme", async () => {
    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify({ tournamentName: "STATE SAFE", activeRoundNumber: 2 }));

    render(<SettingsApp />);

    const themeSelect = await screen.findByRole("combobox", { name: "Tema" });
    fireEvent.change(themeSelect, { target: { value: "light" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem indstillinger" }));

    await waitFor(() => expect(loadTournamentSettings().theme.preset).toBe("light"));
    expect(window.localStorage.getItem("lezgo.activeTournament.v1")).toBe(JSON.stringify({ tournamentName: "STATE SAFE", activeRoundNumber: 2 }));
  });
});
