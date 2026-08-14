import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TournamentSetupForm } from "../components/tournament/tournament-setup-form";
import { saveTournamentSettings } from "../lib/tournament-settings";
import { saveTournamentTemplate } from "../lib/tournament-templates";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("tournament setup form", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.history.pushState({}, "", "/");
    push.mockClear();
  });

  it("keeps Puljespil and Team vs. Team on standby in the setup UI", () => {
    render(<TournamentSetupForm />);

    expect(screen.queryByRole("button", { name: "Puljespil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team vs. Team" })).not.toBeInTheDocument();
  });

  it("starts a new tournament with empty player fields and the selected format as default name", () => {
    render(<TournamentSetupForm />);

    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Americano");
    expect(screen.getByRole("textbox", { name: "Spillere, Et navn pr. linje" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Americano" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Fast Makker Americano" }));

    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Fast Makker Americano");
    expect(screen.getByRole("button", { name: "Americano" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Fast Makker Americano" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Par 1, spiller 1" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Par 1, spiller 2" })).toHaveValue("");
  });

  it("keeps exactly one visual selected-state aligned with the actual selected format", () => {
    render(<TournamentSetupForm />);

    const formatNames = ["Americano", "Mexicano", "Mixed Americano", "Fast Makker Americano", "Fast Makker Mexicano"];

    for (const formatName of formatNames) {
      fireEvent.click(screen.getByRole("button", { name: formatName }));

      for (const candidate of formatNames) {
        const button = screen.getByRole("button", { name: candidate });
        const shouldBeSelected = candidate === formatName;
        expect(button).toHaveAttribute("aria-pressed", shouldBeSelected ? "true" : "false");
        expect(button).toHaveAttribute("data-selected", shouldBeSelected ? "true" : "false");

        if (shouldBeSelected) {
          expect(button).toHaveClass("tournament-format-button-selected");
          expect(button).not.toHaveClass("tournament-format-button-unselected");
        } else {
          expect(button).toHaveClass("tournament-format-button-unselected");
          expect(button).not.toHaveClass("tournament-format-button-selected");
        }
      }
    }
  });

  it("selects every format from pointer input before a click event is required", () => {
    render(<TournamentSetupForm />);

    const formatNames = ["Americano", "Mexicano", "Mixed Americano", "Fast Makker Americano", "Fast Makker Mexicano"];

    for (const formatName of formatNames) {
      fireEvent.pointerUp(screen.getByRole("button", { name: formatName }));

      expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue(formatName);

      for (const candidate of formatNames) {
        expect(screen.getByRole("button", { name: candidate })).toHaveAttribute("aria-pressed", candidate === formatName ? "true" : "false");
      }
    }
  });

  it("does not overwrite a custom tournament name when format changes", () => {
    render(<TournamentSetupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Navn" }), { target: { value: "Fredag Americano" } });
    fireEvent.click(screen.getByRole("button", { name: "Mexicano" }));

    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Fredag Americano");
  });

  it("shows device debug state and event data only on the debug URL", async () => {
    window.history.pushState({}, "", "/new-tournament?deviceDebug=1");

    render(<TournamentSetupForm />);

    expect(await screen.findByText("STEP20BC-DEVICE-TEST-01")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mexicano" }));

    await waitFor(() => {
      const debugPanel = within(screen.getByTestId("device-debug-panel"));
      expect(debugPanel.getByText("FORMAT_CLICK")).toBeInTheDocument();
      expect(debugPanel.getAllByText("Mexicano").length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Scoring" }), { target: { value: "timed" } });

    await waitFor(() => {
      const debugPanel = within(screen.getByTestId("device-debug-panel"));
      expect(debugPanel.getByText("SCORING_CHANGE")).toBeInTheDocument();
      expect(debugPanel.getAllByText("timed").length).toBeGreaterThan(0);
      expect(debugPanel.getAllByText("NO").length).toBeGreaterThan(0);
    });
  });

  it("shows the three user-facing scoring choices and dynamic fields", () => {
    render(<TournamentSetupForm />);

    const scoringSelect = screen.getByRole("combobox", { name: "Scoring" });

    expect(screen.getByRole("option", { name: "Spil til antal scorepoint" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Samlet til antal scorepoint" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Tid (fri scoring)" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Antal scorepoint" })).toBeInTheDocument();

    fireEvent.change(scoringSelect, { target: { value: "total" } });
    expect(screen.getByRole("spinbutton", { name: "Samlet antal scorepoint" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Antal scorepoint" })).not.toBeInTheDocument();

    fireEvent.change(scoringSelect, { target: { value: "timed" } });
    expect(screen.getByRole("spinbutton", { name: "Spilletid (minutter)" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Antal scorepoint" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Samlet antal scorepoint" })).not.toBeInTheDocument();

    fireEvent.change(scoringSelect, { target: { value: "target" } });
    expect(screen.getByRole("spinbutton", { name: "Antal scorepoint" })).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "Spilletid (minutter)" })).not.toBeInTheDocument();
  });

  it("shows the new tournament form in English when English is selected", () => {
    saveTournamentSettings({
      language: "en",
      scoringMode: "Fast antal point",
      courts: 2,
      rounds: 2,
      rankingMode: "matchPointsFirst",
      timeLimitMinutes: 15,
      alarmSound: "standard",
    });

    render(<TournamentSetupForm />);

    expect(screen.getByRole("heading", { name: "1. Tournament format" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. Tournament settings" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Americano");
    expect(screen.getByRole("spinbutton", { name: "Number of score points" })).toHaveValue(21);
    expect(screen.getByRole("combobox", { name: "Sort standings by" })).toHaveDisplayValue("Most match points");
    expect(screen.getByRole("spinbutton", { name: "Courts" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Rounds" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "3. Players" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Players, One name per line" })).toHaveAttribute("placeholder", "One name per line");
    expect(screen.getByRole("heading", { name: "4. Review" })).toBeInTheDocument();
    expect(screen.getByText("Fixed score:")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "5. Start tournament" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start tournament" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fixed Partner Americano" })).toBeInTheDocument();
    expect(screen.queryByText("Turneringsform")).not.toBeInTheDocument();
    expect(screen.queryByText("Start turnering")).not.toBeInTheDocument();
  });

  it("starts Mixed Americano player fields empty", () => {
    render(<TournamentSetupForm />);

    fireEvent.click(screen.getByRole("button", { name: "Mixed Americano" }));

    expect(screen.getByRole("textbox", { name: "Kvinder" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Mænd" })).toHaveValue("");
  });

  it("applies tournament template values from the start link", async () => {
    saveTournamentTemplate(
      {
        title: "Chopstick",
        format: "Fast Makker Mexicano",
        scoringMode: "Fast antal point",
        fixedScoreRule: "target",
        fixedScorePoints: 6,
        courts: 4,
        rounds: 20,
        firstRoundOrder: "random",
        rankingMode: "matchPointsFirst",
      },
      "chopstick",
    );
    window.history.pushState({}, "", "/new-tournament?template=chopstick");

    render(<TournamentSetupForm />);

    expect(await screen.findByDisplayValue("Chopstick")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fast Makker Mexicano" })).toHaveClass("tournament-format-button-selected");
    expect(screen.getByRole("spinbutton", { name: "Baner" })).toHaveValue(4);
    expect(screen.getByRole("spinbutton", { name: "Runder" })).toHaveValue(20);
    expect(screen.getByRole("spinbutton", { name: "Antal scorepoint" })).toHaveValue(6);
    expect(screen.queryByRole("combobox", { name: "Runde 1" })).not.toBeInTheDocument();
  });
});
