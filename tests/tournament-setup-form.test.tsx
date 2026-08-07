import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TournamentSetupForm } from "../components/tournament/tournament-setup-form";
import { loadActiveTournament } from "../lib/tournament-setup";

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

  it("opens the active Team vs. Team tournament after creation", () => {
    render(<TournamentSetupForm />);

    fireEvent.click(screen.getByRole("button", { name: "Team vs. Team" }));

    for (let team = 1; team <= 2; team += 1) {
      for (let pair = 1; pair <= 2; pair += 1) {
        for (let player = 1; player <= 2; player += 1) {
          fireEvent.change(screen.getByRole("textbox", { name: `Hold ${team}, par ${pair}, spiller ${player}` }), {
            target: { value: `H${team}P${pair}${player}` },
          });
        }
      }
    }

    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    expect(push).toHaveBeenCalledWith("/team-vs-team");
  });

  it("creates a pool-play tournament and opens live scoring", () => {
    render(<TournamentSetupForm />);

    fireEvent.click(screen.getAllByRole("button", { name: "Puljespil" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Start turnering" }));

    const activeTournament = loadActiveTournament();

    expect(push).toHaveBeenCalledWith("/live");
    expect(activeTournament).toMatchObject({
      format: "pool-play",
      poolPlay: {
        phase: "initial",
        advancementMode: "crossMatches",
        unmatchedResolution: "bye",
      },
    });
    expect(activeTournament?.poolPlay?.initialStage.pools).toHaveLength(2);
    expect(activeTournament?.poolPlay?.initialStage.pools[0].participantIds).toHaveLength(4);
  });
});
