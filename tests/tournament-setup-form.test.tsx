import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
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
    vi.useRealTimers();
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
      tapFormat(formatName);

      expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue(formatName);

      for (const candidate of formatNames) {
        expect(screen.getByRole("button", { name: candidate })).toHaveAttribute("aria-pressed", candidate === formatName ? "true" : "false");
      }
    }
  });

  it("does not select a format when touch-like pointer input turns into a vertical scroll", () => {
    render(<TournamentSetupForm />);

    dragFormat("Mexicano", 40);

    expectSelectedFormat("Americano");
    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Americano");
  });

  it("still treats a small pointer movement as a tap", () => {
    render(<TournamentSetupForm />);

    dragFormat("Mexicano", 3);

    expectSelectedFormat("Mexicano");
    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Mexicano");
  });

  it("does not select a format after pointer cancel", () => {
    render(<TournamentSetupForm />);

    const mexicanoButton = getFormatButton("Mexicano");
    fireEvent.pointerDown(mexicanoButton, { clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(mexicanoButton);
    fireEvent.pointerUp(mexicanoButton, { clientX: 0, clientY: 0 });

    expectSelectedFormat("Americano");
    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Americano");
  });

  it("ignores repeated scroll gestures that start on different format buttons", () => {
    render(<TournamentSetupForm />);

    dragFormat("Mexicano", 40);
    dragFormat("Mixed Americano", 45);
    dragFormat("Fast Makker Americano", 50);
    dragFormat("Fast Makker Mexicano", 55);

    expectSelectedFormat("Americano");
    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Americano");
  });

  it("keeps desktop click selection working without a pointer gesture", () => {
    render(<TournamentSetupForm />);

    fireEvent.click(getFormatButton("Fast Makker Mexicano"));

    expectSelectedFormat("Fast Makker Mexicano");
    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Fast Makker Mexicano");
  });

  it("does not overwrite a custom tournament name when format changes", () => {
    render(<TournamentSetupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Navn" }), { target: { value: "Fredag Americano" } });
    fireEvent.click(screen.getByRole("button", { name: "Mexicano" }));

    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Fredag Americano");
  });

  it("does not render temporary device debug markup or unstable hydration values", () => {
    window.history.pushState({}, "", "/new-tournament?deviceDebug=1");

    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const serverHtml = renderToString(<TournamentSetupForm />);
    expect(serverHtml).not.toContain("STEP20");
    expect(serverHtml).not.toContain("CLIENT HYDRATION PROBE");
    expect(serverHtml).not.toContain("DEV BUILD DEBUG");
    expect(serverHtml).not.toContain("FORMAT BUTTON DOM AUDIT");
    expect(serverHtml).not.toMatch(/mount-\d+/);
    expect(getItemSpy).not.toHaveBeenCalled();
    getItemSpy.mockRestore();

    render(<TournamentSetupForm />);

    expect(screen.queryByTestId("active-code-marker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("client-hydration-probe")).not.toBeInTheDocument();
    expect(screen.queryByTestId("device-debug-panel")).not.toBeInTheDocument();
    expect(screen.queryByText("STEP20BC-DEVICE-TEST-01")).not.toBeInTheDocument();
  });

  it("keeps entered tournament setup values when saved settings restore after hydration", () => {
    vi.useFakeTimers();
    saveTournamentSettings({
      scoringMode: "Fast antal point",
      courts: 4,
      rounds: 12,
      rankingMode: "matchPointsFirst",
      timeLimitMinutes: 45,
      alarmSound: "standard",
    });

    render(<TournamentSetupForm />);

    tapFormat("Mexicano");
    fireEvent.change(screen.getByRole("textbox", { name: "Navn" }), { target: { value: "RESET TEST" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Scoring" }), { target: { value: "timed" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Baner" }), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Runder" }), { target: { value: "3" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Sorter stilling efter" }), { target: { value: "partiPointsFirst" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Spillere, Et navn pr. linje" }), {
      target: { value: "Hao\nMartin\nRonnie\nSimon\nTuan\nJohnnie\nKlaus\nLindon" },
    });
    fireEvent.scroll(window, { target: { scrollY: 300 } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Navn" }));
    fireEvent.focus(screen.getByRole("textbox", { name: "Navn" }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expectSelectedFormat("Mexicano");
    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("RESET TEST");
    expect(screen.getByRole("combobox", { name: "Scoring" })).toHaveValue("timed");
    expect(screen.queryByRole("spinbutton", { name: "Antal scorepoint" })).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Spilletid (minutter)" })).toHaveValue(15);
    expect(screen.getByRole("spinbutton", { name: "Baner" })).toHaveValue(2);
    expect(screen.getByRole("spinbutton", { name: "Runder" })).toHaveValue(3);
    expect(screen.getByRole("combobox", { name: "Sorter stilling efter" })).toHaveValue("partiPointsFirst");
    expect(screen.getByRole("textbox", { name: "Spillere, Et navn pr. linje" })).toHaveValue("Hao\nMartin\nRonnie\nSimon\nTuan\nJohnnie\nKlaus\nLindon");
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

  it("allows courts and rounds to be cleared temporarily before entering a new value", () => {
    render(<TournamentSetupForm />);

    const courtsInput = getNumberInput("Baner");
    const roundsInput = getNumberInput("Runder");

    expect(courtsInput).toHaveValue(2);
    fireEvent.change(courtsInput, { target: { value: "" } });
    expect(courtsInput.value).toBe("");
    fireEvent.change(courtsInput, { target: { value: "3" } });
    expect(courtsInput.value).toBe("3");
    expect(courtsInput.value).not.toBe("03");

    fireEvent.change(courtsInput, { target: { value: "" } });
    expect(courtsInput.value).toBe("");
    fireEvent.change(courtsInput, { target: { value: "4" } });
    expect(courtsInput.value).toBe("4");

    expect(roundsInput).toHaveValue(2);
    fireEvent.change(roundsInput, { target: { value: "" } });
    expect(roundsInput.value).toBe("");
    fireEvent.change(roundsInput, { target: { value: "3" } });
    expect(roundsInput.value).toBe("3");

    fireEvent.change(roundsInput, { target: { value: "" } });
    expect(roundsInput.value).toBe("");
    fireEvent.change(roundsInput, { target: { value: "10" } });
    expect(roundsInput.value).toBe("10");
  });

  it("allows time limit minutes to be cleared temporarily before entering a new value", () => {
    render(<TournamentSetupForm />);

    fireEvent.change(screen.getByRole("combobox", { name: "Scoring" }), { target: { value: "timed" } });
    const timeLimitInput = getNumberInput("Spilletid (minutter)");

    fireEvent.change(timeLimitInput, { target: { value: "0" } });
    expect(timeLimitInput.value).toBe("0");
    fireEvent.change(timeLimitInput, { target: { value: "" } });
    expect(timeLimitInput.value).toBe("");
    fireEvent.change(timeLimitInput, { target: { value: "10" } });
    expect(timeLimitInput.value).toBe("10");
    expect(timeLimitInput.value).not.toBe("010");

    fireEvent.change(timeLimitInput, { target: { value: "" } });
    expect(timeLimitInput.value).toBe("");
    fireEvent.change(timeLimitInput, { target: { value: "15" } });
    expect(timeLimitInput.value).toBe("15");

    fireEvent.change(timeLimitInput, { target: { value: "" } });
    expect(timeLimitInput.value).toBe("");
  });

  it("normalizes leading zeroes in courts and rounds without changing other setup state", () => {
    render(<TournamentSetupForm />);

    tapFormat("Mexicano");
    fireEvent.change(screen.getByRole("textbox", { name: "Navn" }), { target: { value: "RESET TEST" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Scoring" }), { target: { value: "timed" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Spillere, Et navn pr. linje" }), {
      target: { value: "Hao\nMartin\nRonnie\nSimon\nTuan\nJohnnie\nKlaus\nLindon" },
    });

    const courtsInput = getNumberInput("Baner");
    const roundsInput = getNumberInput("Runder");
    fireEvent.change(courtsInput, { target: { value: "03" } });
    fireEvent.blur(courtsInput);
    fireEvent.change(roundsInput, { target: { value: "010" } });
    fireEvent.blur(roundsInput);

    expectSelectedFormat("Mexicano");
    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("RESET TEST");
    expect(screen.getByRole("combobox", { name: "Scoring" })).toHaveValue("timed");
    expect(screen.queryByRole("spinbutton", { name: "Antal scorepoint" })).not.toBeInTheDocument();
    expect(courtsInput.value).toBe("3");
    expect(roundsInput.value).toBe("10");
    expect(screen.getByRole("textbox", { name: "Spillere, Et navn pr. linje" })).toHaveValue("Hao\nMartin\nRonnie\nSimon\nTuan\nJohnnie\nKlaus\nLindon");

    dragFormat("Americano", 40);
    expectSelectedFormat("Mexicano");
  });

  it("normalizes leading zeroes in editable numeric setup fields", () => {
    render(<TournamentSetupForm />);

    const scorePointsInput = getNumberInput("Antal scorepoint");
    fireEvent.change(scorePointsInput, { target: { value: "021" } });
    fireEvent.blur(scorePointsInput);
    expect(scorePointsInput.value).toBe("21");

    fireEvent.change(screen.getByRole("combobox", { name: "Scoring" }), { target: { value: "timed" } });
    const timeLimitInput = getNumberInput("Spilletid (minutter)");
    fireEvent.change(timeLimitInput, { target: { value: "010" } });
    fireEvent.blur(timeLimitInput);
    expect(timeLimitInput.value).toBe("10");
    fireEvent.change(timeLimitInput, { target: { value: "005" } });
    fireEvent.blur(timeLimitInput);
    expect(timeLimitInput.value).toBe("5");
    fireEvent.change(timeLimitInput, { target: { value: "030" } });
    fireEvent.blur(timeLimitInput);
    expect(timeLimitInput.value).toBe("30");

    fireEvent.change(screen.getByRole("combobox", { name: "Scoring" }), { target: { value: "target" } });
    const courtsInput = getNumberInput("Baner");
    const roundsInput = getNumberInput("Runder");
    fireEvent.change(courtsInput, { target: { value: "03" } });
    fireEvent.blur(courtsInput);
    fireEvent.change(roundsInput, { target: { value: "010" } });
    fireEvent.blur(roundsInput);
    expect(courtsInput.value).toBe("3");
    expect(roundsInput.value).toBe("10");
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

function getFormatButton(formatName: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${escapeRegExp(formatName)}$`) });
}

function getNumberInput(label: string): HTMLInputElement {
  return screen.getByRole("spinbutton", { name: label }) as HTMLInputElement;
}

function tapFormat(formatName: string): void {
  const button = getFormatButton(formatName);
  fireEvent.pointerDown(button, { clientX: 0, clientY: 0 });
  fireEvent.pointerUp(button, { clientX: 0, clientY: 0 });
}

function dragFormat(formatName: string, verticalMovement: number): void {
  const button = getFormatButton(formatName);
  fireEvent.pointerDown(button, { clientX: 0, clientY: 0 });
  fireEvent.pointerMove(button, { clientX: 0, clientY: verticalMovement });
  fireEvent.pointerUp(button, { clientX: 0, clientY: verticalMovement });
}

function expectSelectedFormat(formatName: string): void {
  const formatNames = ["Americano", "Mexicano", "Mixed Americano", "Fast Makker Americano", "Fast Makker Mexicano"];

  for (const candidate of formatNames) {
    expect(getFormatButton(candidate)).toHaveAttribute("aria-pressed", candidate === formatName ? "true" : "false");
    expect(getFormatButton(candidate)).toHaveAttribute("data-selected", candidate === formatName ? "true" : "false");
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
