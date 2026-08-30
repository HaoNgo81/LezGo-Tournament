import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TournamentSetupForm } from "../components/tournament/tournament-setup-form";
import { loadActiveTournament, loadAllShadowSaveMetadata } from "../lib/tournament-setup";
import { saveTournamentSettings } from "../lib/tournament-settings";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
const originalShadowSaveFlag = process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("tournament setup form", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalShadowSaveFlag === undefined) {
      delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = originalShadowSaveFlag;
    }
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
    expect(screen.getAllByRole("textbox", { name: /^Spiller \d+$/ })).toHaveLength(8);
    expect(screen.getByRole("textbox", { name: "Spiller 1" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Americano" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Fast Makker Americano" }));

    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Fast Makker Americano");
    expect(screen.getByRole("button", { name: "Americano" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Fast Makker Americano" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "Par 1, spiller 1" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Par 1, spiller 2" })).toHaveValue("");
  });

  it("renders short descriptions inside every visible tournament format card", () => {
    render(<TournamentSetupForm />);

    const descriptions = [
      ["Americano", "Alle spiller med og mod hinanden."],
      ["Mexicano", "Nye makkere og modstandere dannes efter stillingen."],
      ["Mixed Americano", "Kvinde og mand spiller sammen i skiftende makkerpar."],
      ["Fast Makker Americano", "Faste makkerpar møder de øvrige par."],
      ["Fast Makker Mexicano", "Faste makkerpar møder modstandere efter stillingen."],
    ] as const;

    for (const [formatName, description] of descriptions) {
      const button = screen.getByRole("button", { name: formatName });
      expect(within(button).getByText(description)).toBeInTheDocument();
      expect(within(button).getByText(description)).toHaveClass("text-sm", "font-semibold", "text-[var(--muted)]");
    }
  });

  it("keeps selected format-card descriptions readable on the dark brown surface", () => {
    const globalCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    render(<TournamentSetupForm />);

    const selectedButton = screen.getByRole("button", { name: "Americano" });
    const description = within(selectedButton).getByText("Alle spiller med og mod hinanden.");

    expect(selectedButton).toHaveClass("tournament-format-button-selected");
    expect(description).toHaveAttribute("data-format-description");
    expect(globalCss).toContain("--surface-dark: #4a3524;");
    expect(globalCss).toContain("--selected-bg: var(--surface-dark);");
    expect(globalCss).toContain(".tournament-format-button-selected [data-format-description]");
    expect(globalCss).toContain("color: var(--surface-dark-muted);");
  });

  it("selects the format when clicking the description inside the card", () => {
    render(<TournamentSetupForm />);

    fireEvent.click(screen.getByText("Nye makkere og modstandere dannes efter stillingen."));

    expectSelectedFormat("Mexicano");
    expect(screen.getByRole("textbox", { name: "Navn" })).toHaveValue("Mexicano");
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
    fillIndividualPlayerFields(["Hao", "Martin", "Ronnie", "Simon", "Tuan", "Johnnie", "Klaus", "Lindon"]);
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
    expect(screen.getByRole("textbox", { name: "Spiller 1" })).toHaveValue("Hao");
    expect(screen.getByRole("textbox", { name: "Spiller 8" })).toHaveValue("Lindon");
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

    tapFormat("Mexicano");
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
    fillIndividualPlayerFields(["Hao", "Martin", "Ronnie", "Simon", "Tuan", "Johnnie", "Klaus", "Lindon"]);

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
    expect(screen.getByRole("textbox", { name: "Spiller 1" })).toHaveValue("Hao");
    expect(screen.getByRole("textbox", { name: "Spiller 8" })).toHaveValue("Lindon");

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
    tapFormat("Mexicano");
    const courtsInput = getNumberInput("Baner");
    const roundsInput = getNumberInput("Runder");
    fireEvent.change(courtsInput, { target: { value: "03" } });
    fireEvent.blur(courtsInput);
    fireEvent.change(roundsInput, { target: { value: "010" } });
    fireEvent.blur(roundsInput);
    expect(courtsInput.value).toBe("3");
    expect(roundsInput.value).toBe("10");
  });

  it("hides manual rounds for Americano and shows calculated rotation", () => {
    render(<TournamentSetupForm />);

    expect(screen.queryByRole("spinbutton", { name: "Runder" })).not.toBeInTheDocument();
    expect(screen.getAllByText((_content, element) => element?.textContent === "Rotation: -")[0]).toBeInTheDocument();

    fillIndividualPlayerFields(["Anna", "Hassan", "Maja", "Noah", "Sofia", "Emil", "Clara", "Jonas", "Liva"]);

    expect(screen.getAllByText((_content, element) => element?.textContent === "Rotation: 13 runder")[0]).toBeInTheDocument();
  });

  it("hides manual rounds for Fast Makker Americano and shows calculated pair rotation", () => {
    render(<TournamentSetupForm />);

    fireEvent.click(screen.getByRole("button", { name: "Fast Makker Americano" }));

    expect(screen.queryByRole("spinbutton", { name: "Runder" })).not.toBeInTheDocument();
    expect(screen.getAllByText((_content, element) => element?.textContent === "Rotation: -")[0]).toBeInTheDocument();

    fillFixedPartnerPlayerFields(Array.from({ length: 10 }, (_, index) => `Spiller ${index + 1}`));

    expect(screen.getAllByText((_content, element) => element?.textContent === "Rotation: 8 runder")[0]).toBeInTheDocument();
  });

  it("starts a timed free-scoring tournament even when the hidden score-point field was cleared", async () => {
    const fetchMock = mockAuthenticatedAccountFetch(Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    render(<TournamentSetupForm />);

    fireEvent.change(getNumberInput("Antal scorepoint"), { target: { value: "0" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Scoring" }), { target: { value: "timed" } });
    fireEvent.change(getNumberInput("Spilletid (minutter)"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Mexicano" }));
    fireEvent.change(getNumberInput("Baner"), { target: { value: "4" } });
    fireEvent.change(getNumberInput("Runder"), { target: { value: "20" } });
    fillIndividualPlayerFields(Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`));
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/live"));
    expect(screen.queryByText("Antal scorepoint skal være mindst 1.")).not.toBeInTheDocument();
    expect(loadActiveTournament()).toMatchObject({
      format: "mexicano",
      scoringMode: "Spil på tid",
      timeLimitMinutes: 15,
      configuredRounds: 20,
      courtCount: 4,
    });
    expect(loadActiveTournament()?.fixedScorePoints).toBeUndefined();
  });

  it("shows a duration error for timed free-scoring setup without a valid game time", async () => {
    vi.stubGlobal("fetch", mockAuthenticatedAccountFetch(Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))));

    render(<TournamentSetupForm />);

    fireEvent.change(screen.getByRole("combobox", { name: "Scoring" }), { target: { value: "timed" } });
    fireEvent.change(getNumberInput("Spilletid (minutter)"), { target: { value: "0" } });
    fillIndividualPlayerFields(["Anna", "Peter", "Mads", "Louise"]);
    submitSetupForm();

    expect(await screen.findByText("Spilletid skal være mindst 1.")).toBeInTheDocument();
    expect(screen.queryByText("Antal scorepoint skal være mindst 1.")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps fixed-score setup blocked when score points are invalid", async () => {
    vi.stubGlobal("fetch", mockAuthenticatedAccountFetch(Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))));

    render(<TournamentSetupForm />);

    fireEvent.change(getNumberInput("Antal scorepoint"), { target: { value: "0" } });
    fillIndividualPlayerFields(["Anna", "Peter", "Mads", "Louise"]);
    submitSetupForm();

    expect(await screen.findByText("Antal scorepoint skal være mindst 1.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
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
    expect(screen.queryByRole("spinbutton", { name: "Rounds" })).not.toBeInTheDocument();
    expect(screen.getAllByText((_content, element) => element?.textContent === "Rotation: -")[0]).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "3. Players" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^Player \d+$/ })).toHaveLength(8);
    expect(screen.getByRole("textbox", { name: "Player 1" })).toHaveAttribute("placeholder", "Player 1");
    expect(screen.getByRole("heading", { name: "4. Review" })).toBeInTheDocument();
    expect(screen.getByText("Fixed score:")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "5. Start tournament" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start tournament" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fixed Partner Americano" })).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Americano" })).getByText("Everyone plays with and against each other.")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Fixed Partner Americano" })).getByText("Fixed partner pairs play the other pairs.")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Mixed Americano" })).getByText("Women and men pair up in changing teams.")).toBeInTheDocument();
    expect(screen.queryByText("Turneringsform")).not.toBeInTheDocument();
    expect(screen.queryByText("Start turnering")).not.toBeInTheDocument();
  });

  it("lets an anonymous guest create a local-only tournament without cloud ownership", async () => {
    const originalFlag = process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    const fetchMock = mockGuestAccountFetch();
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";

    render(<TournamentSetupForm />);

    await screen.findByText("Som gæst kan du bruge op til 2 baner. Log ind for flere baner.");
    fillIndividualPlayerFields(["Anna", "Peter", "Mads", "Louise", "Ægir", "Østen", "Åse", "Minh"]);
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/live"));
    expect(loadActiveTournament()?.players.map((player) => player.name)).toEqual(["Anna", "Peter", "Mads", "Louise", "Ægir", "Østen", "Åse", "Minh"]);
    expect(fetchMock.mock.calls.some((call) => call[0] === "/api/supabase/shadow-save")).toBe(false);
    expect(loadAllShadowSaveMetadata()).toEqual([expect.objectContaining({
      kind: "standard",
      status: "local-only",
    })]);
    expect(loadAllShadowSaveMetadata()[0]?.supabaseTournamentId).toBeUndefined();

    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = originalFlag;
    }
  });

  it("keeps guest court selection capped at 2 courts", async () => {
    mockGuestAccountFetch();

    render(<TournamentSetupForm />);

    await screen.findByText("Som gæst kan du bruge op til 2 baner. Log ind for flere baner.");
    const courtsInput = screen.getByRole("spinbutton", { name: "Baner" });
    expect(courtsInput).toHaveAttribute("max", "2");

    fireEvent.change(courtsInput, { target: { value: "3" } });
    expect(courtsInput).toHaveValue(2);
  });

  it("rejects a guest tournament with more than 2 courts at submit time", async () => {
    const authResponse = createDeferred<Response>();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/auth/me") {
        return await authResponse.promise;
      }

      return new Response(JSON.stringify({ ok: false, error: "Unexpected request." }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TournamentSetupForm />);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Baner" }), { target: { value: "3" } });
    fillIndividualPlayerFields(Array.from({ length: 12 }, (_, index) => `Guest ${index + 1}`));
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    authResponse.resolve(new Response(JSON.stringify({ ok: false }), { status: 401 }));

    expect((await screen.findAllByText("Som gæst kan du bruge op til 2 baner. Log ind for flere baner.")).length).toBeGreaterThan(0);
    expect(push).not.toHaveBeenCalled();
    expect(loadActiveTournament()).toBeNull();
    expect(fetchMock.mock.calls.some((call) => call[0] === "/api/supabase/shadow-save")).toBe(false);
  });

  it("keeps authenticated court selection uncapped by the guest limit", async () => {
    const fetchMock = mockAuthenticatedAccountFetch(Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    render(<TournamentSetupForm />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", { cache: "no-store" }));
    const courtsInput = screen.getByRole("spinbutton", { name: "Baner" });

    expect(courtsInput).not.toHaveAttribute("max");
    expect(screen.queryByText("Som gæst kan du bruge op til 2 baner. Log ind for flere baner.")).not.toBeInTheDocument();

    fireEvent.change(courtsInput, { target: { value: "3" } });
    expect(courtsInput).toHaveValue(3);
  });

  it.each([
    "Americano",
    "Mexicano",
    "Mixed Americano",
    "Fast Makker Americano",
    "Fast Makker Mexicano",
  ])("applies the guest 2-court cap to %s", async (formatName) => {
    mockGuestAccountFetch();

    render(<TournamentSetupForm />);

    fireEvent.click(screen.getByRole("button", { name: formatName }));
    await screen.findByText("Som gæst kan du bruge op til 2 baner. Log ind for flere baner.");
    expect(screen.getByRole("spinbutton", { name: "Baner" })).toHaveAttribute("max", "2");
  });

  it("waits for the initial cloud shadow-save before navigating to live", async () => {
    const originalFlag = process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    const deferred = createDeferred<Response>();
    const fetchMock = mockAuthenticatedAccountFetch(deferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<TournamentSetupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Navn" }), { target: { value: "USER OWNERSHIP TEST" } });
    fillIndividualPlayerFields(["Hao", "Martin", "Ronnie", "Simon"]);
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/supabase/shadow-save", expect.objectContaining({
      method: "POST",
    })));
    expect(push).not.toHaveBeenCalled();

    const shadowSaveCall = fetchMock.mock.calls.find((call) => call[0] === "/api/supabase/shadow-save");
    const payload = JSON.parse(shadowSaveCall?.[1]?.body as string) as { legacyLocalId?: string; tournamentId?: string; state?: { tournamentName?: string } };
    expect(payload.tournamentId).toBeUndefined();
    expect(payload.legacyLocalId).toContain("user ownership test");
    expect(payload.state?.tournamentName).toBe("USER OWNERSHIP TEST");

    deferred.resolve(new Response(JSON.stringify({
      ok: true,
      saveMode: "insert",
      tournamentId: "00000000-0000-4000-8000-00000000025a",
      organizerToken: "STEP_25K_FIX1_ORGANIZER_TOKEN",
      updatedAt: "2026-08-21T12:00:00.000Z",
    }), { status: 200 }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/live"));

    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = originalFlag;
    }
  });

  it("retries the initial ownership shadow-save when stale local metadata is terminal", async () => {
    const originalFlag = process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    const shadowSaveResponse = Promise.resolve(new Response(JSON.stringify({
      ok: true,
      saveMode: "insert",
      tournamentId: "00000000-0000-4000-8000-00000000025b",
      organizerToken: "STEP_25K_FIX2_ORGANIZER_TOKEN",
      updatedAt: "2026-08-21T13:00:00.000Z",
    }), { status: 200 }));
    const fetchMock = mockAuthenticatedAccountFetch(shadowSaveResponse);
    vi.stubGlobal("fetch", fetchMock);

    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      "lezgotakeovertest turnering-americano": {
        localId: "lezgotakeovertest turnering-americano",
        kind: "standard",
        status: "conflict",
        lastError: "Tournament snapshot conflict.",
      },
    }));

    render(<TournamentSetupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Navn" }), { target: { value: "lezgotakeovertest turnering" } });
    fillIndividualPlayerFields(["Hao", "Martin", "Ronnie", "Simon"]);
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/supabase/shadow-save", expect.objectContaining({
      method: "POST",
    })));

    const shadowSaveCall = fetchMock.mock.calls.find((call) => call[0] === "/api/supabase/shadow-save");
    const payload = JSON.parse(shadowSaveCall?.[1]?.body as string) as { legacyLocalId?: string; state?: { tournamentName?: string } };
    expect(payload.legacyLocalId).toBe("lezgotakeovertest turnering-americano");
    expect(payload.state?.tournamentName).toBe("lezgotakeovertest turnering");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/live"));

    const metadata = JSON.parse(window.localStorage.getItem("lezgo.shadowSaveMetadata.v1") ?? "{}") as Record<string, { status?: string; supabaseTournamentId?: string }>;
    expect(metadata["lezgotakeovertest turnering-americano"]).toMatchObject({
      status: "synced",
      supabaseTournamentId: "00000000-0000-4000-8000-00000000025b",
    });

    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = originalFlag;
    }
  });

  it("blocks navigation when the initial cloud shadow-save does not create a Supabase tournament", async () => {
    const originalFlag = process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = "1";
    const shadowSaveResponse = Promise.resolve(new Response(JSON.stringify({
      ok: false,
      error: "Shadow-save failed.",
    }), { status: 500 }));
    const fetchMock = mockAuthenticatedAccountFetch(shadowSaveResponse);
    vi.stubGlobal("fetch", fetchMock);

    render(<TournamentSetupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Navn" }), { target: { value: "FIX3 TEST" } });
    fillIndividualPlayerFields(["Hao", "Martin", "Ronnie", "Simon"]);
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    await screen.findByText("Turneringen blev gemt lokalt, men kunne ikke synkroniseres til skyen. Prøv igen.");

    expect(fetchMock).toHaveBeenCalledWith("/api/supabase/shadow-save", expect.objectContaining({
      method: "POST",
    }));
    expect(push).not.toHaveBeenCalled();

    const metadata = JSON.parse(window.localStorage.getItem("lezgo.shadowSaveMetadata.v1") ?? "{}") as Record<string, { status?: string; supabaseTournamentId?: string }>;
    expect(metadata["fix3 test-americano"]).toMatchObject({
      status: "error",
    });
    expect(metadata["fix3 test-americano"]?.supabaseTournamentId).toBeUndefined();

    if (originalFlag === undefined) {
      delete process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE;
    } else {
      process.env.NEXT_PUBLIC_LEZGO_SUPABASE_SHADOW_SAVE = originalFlag;
    }
  });

  it("starts Mixed Americano player fields empty", () => {
    render(<TournamentSetupForm />);

    fireEvent.click(screen.getByRole("button", { name: "Mixed Americano" }));

    expect(screen.getAllByRole("textbox", { name: /^Kvinder Spiller \d+$/ })).toHaveLength(4);
    expect(screen.getAllByRole("textbox", { name: /^Mænd Spiller \d+$/ })).toHaveLength(4);
    expect(screen.getByRole("textbox", { name: "Kvinder Spiller 1" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Mænd Spiller 1" })).toHaveValue("");
  });

  it("renders separate Americano player fields and preserves player order in the tournament payload", async () => {
    render(<TournamentSetupForm />);

    fillIndividualPlayerFields(["Anna", "Peter", "Mads", "Louise", "Ægir", "Østen", "Åse", "Minh"]);
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/live"));
    expect(loadActiveTournament()?.players.map((player) => player.name)).toEqual(["Anna", "Peter", "Mads", "Louise", "Ægir", "Østen", "Åse", "Minh"]);
  });

  it("renders separate Mexicano player fields with dynamic count from courts", async () => {
    vi.stubGlobal("fetch", mockAuthenticatedAccountFetch(Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))));
    render(<TournamentSetupForm />);

    fireEvent.click(screen.getByRole("button", { name: "Mexicano" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Baner" }), { target: { value: "4" } });

    expect(screen.getAllByRole("textbox", { name: /^Spiller \d+$/ })).toHaveLength(16);
    fillIndividualPlayerFields(Array.from({ length: 16 }, (_, index) => `Mexicano ${index + 1}`));
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/live"));
    expect(loadActiveTournament()?.format).toBe("mexicano");
    expect(loadActiveTournament()?.players.map((player) => player.name)).toEqual(Array.from({ length: 16 }, (_, index) => `Mexicano ${index + 1}`));
  });

  it("renders separate Mixed Americano women and men fields while preserving gender groups", async () => {
    render(<TournamentSetupForm />);

    fireEvent.click(screen.getByRole("button", { name: "Mixed Americano" }));
    fillMixedPlayerFields("Kvinder", ["Anna", "Louise", "Maja", "Åse"]);
    fillMixedPlayerFields("Mænd", ["Hao", "Minh", "Søren", "Đức"]);
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/live"));
    const players = loadActiveTournament()?.players ?? [];
    expect(players.map((player) => player.name)).toEqual(["Anna", "Louise", "Maja", "Åse", "Hao", "Minh", "Søren", "Đức"]);
    expect(players.filter((player) => player.gender === "female")).toHaveLength(4);
    expect(players.filter((player) => player.gender === "male")).toHaveLength(4);
  });

  it("localizes individual player labels in English and keeps fixed partner pair entry unchanged", () => {
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

    expect(screen.getAllByRole("textbox", { name: /^Player \d+$/ })).toHaveLength(8);
    expect(screen.getByRole("textbox", { name: "Player 1" })).toHaveAttribute("placeholder", "Player 1");

    fireEvent.click(screen.getByRole("button", { name: "Mixed Americano" }));
    expect(screen.getAllByRole("textbox", { name: /^Women Player \d+$/ })).toHaveLength(4);
    expect(screen.getAllByRole("textbox", { name: /^Men Player \d+$/ })).toHaveLength(4);

    fireEvent.click(screen.getByRole("button", { name: "Fixed Partner Americano" }));
    expect(screen.getByRole("textbox", { name: "Par 1, spiller 1" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Player 1" })).not.toBeInTheDocument();
  });

  it("ignores legacy tournament template links in the simplified setup flow", async () => {
    window.history.pushState({}, "", "/new-tournament?template=chopstick");

    render(<TournamentSetupForm />);

    expect(await screen.findByDisplayValue("Americano")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Americano" })).toHaveClass("tournament-format-button-selected");
    expect(screen.getByRole("spinbutton", { name: "Baner" })).toHaveValue(2);
    expect(screen.queryByRole("spinbutton", { name: "Runder" })).not.toBeInTheDocument();
    expect(screen.getAllByText((_content, element) => element?.textContent === "Rotation: -")[0]).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Antal scorepoint" })).toHaveValue(21);
    expect(screen.queryByRole("combobox", { name: "Runde 1" })).not.toBeInTheDocument();
  });
});

function getFormatButton(formatName: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${escapeRegExp(formatName)}$`) });
}

function getNumberInput(label: string): HTMLInputElement {
  return screen.getByRole("spinbutton", { name: label }) as HTMLInputElement;
}

function fillIndividualPlayerFields(names: string[]): void {
  names.forEach((name, index) => {
    fireEvent.change(screen.getByRole("textbox", { name: `Spiller ${index + 1}` }), { target: { value: name } });
  });
}

function fillFixedPartnerPlayerFields(names: string[]): void {
  const requiredPairs = Math.ceil(names.length / 2);

  while (screen.queryByRole("textbox", { name: `Par ${requiredPairs}, spiller 1` }) === null) {
    fireEvent.click(screen.getByRole("button", { name: "Tilføj par" }));
  }

  names.forEach((name, index) => {
    const pairNumber = Math.floor(index / 2) + 1;
    const playerNumber = (index % 2) + 1;
    fireEvent.change(screen.getByRole("textbox", { name: `Par ${pairNumber}, spiller ${playerNumber}` }), { target: { value: name } });
  });
}

function fillMixedPlayerFields(groupLabel: string, names: string[]): void {
  names.forEach((name, index) => {
    fireEvent.change(screen.getByRole("textbox", { name: `${groupLabel} Spiller ${index + 1}` }), { target: { value: name } });
  });
}

function submitSetupForm(): void {
  const startButton = screen.getByRole("button", { name: "Start turnering" });
  const form = startButton.closest("form");

  if (!form) {
    throw new Error("Tournament setup form was not rendered.");
  }

  fireEvent.submit(form);
}

function mockGuestAccountFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;

    if (input.toString() === "/api/auth/me") {
      return new Response(JSON.stringify({ ok: false }), { status: 401 });
    }

    return new Response(JSON.stringify({ ok: false, error: "Unexpected request." }), { status: 500 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockAuthenticatedAccountFetch(shadowSaveResponse: Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;

    if (input.toString() === "/api/auth/me") {
      return new Response(JSON.stringify({
        ok: true,
        account: {
          userId: "user-1",
          email: "user@example.com",
          displayName: "Test User",
          username: "testuser",
          role: "user",
        },
      }), { status: 200 });
    }

    if (input.toString() === "/api/supabase/shadow-save") {
      return await shadowSaveResponse;
    }

    return new Response(JSON.stringify({ ok: false, error: "Unexpected request." }), { status: 500 });
  });
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

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
