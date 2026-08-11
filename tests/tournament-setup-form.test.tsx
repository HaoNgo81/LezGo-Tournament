import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TournamentSetupForm } from "../components/tournament/tournament-setup-form";
import { saveTournamentTemplate } from "../lib/tournament-templates";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("tournament setup form", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    push.mockClear();
  });

  it("keeps Puljespil and Team vs. Team on standby in the setup UI", () => {
    render(<TournamentSetupForm />);

    expect(screen.queryByRole("button", { name: "Puljespil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Team vs. Team" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Fast Makker Mexicano" })).toHaveClass("border-[var(--primary)]");
    expect(screen.getByRole("spinbutton", { name: "Baner" })).toHaveValue(4);
    expect(screen.getByRole("spinbutton", { name: "Runder" })).toHaveValue(20);
    expect(screen.getByRole("spinbutton", { name: "Antal scorepoint" })).toHaveValue(6);
    expect(screen.queryByRole("combobox", { name: "Runde 1" })).not.toBeInTheDocument();
  });
});
