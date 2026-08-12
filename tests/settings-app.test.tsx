import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsApp } from "../components/settings/settings-app";
import { loadTournamentSettings } from "../lib/tournament-settings";

describe("SettingsApp", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
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

  it("previews and saves a custom primary theme color", async () => {
    render(<SettingsApp />);

    const primaryColor = await screen.findByLabelText("Primær knapfarve");
    fireEvent.change(primaryColor, { target: { value: "#123456" } });

    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#123456");

    fireEvent.click(screen.getByRole("button", { name: "Gem indstillinger" }));
    await waitFor(() => expect(loadTournamentSettings().theme.primary).toBe("#123456"));
  });

  it("resets the theme to LezGo colors", async () => {
    render(<SettingsApp />);

    fireEvent.change(await screen.findByLabelText("Primær knapfarve"), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Nulstil tema" }));

    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#18a058");
  });
});
