import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LiveScoringApp } from "../components/tournament/live-scoring-app";
import { advanceLivePoolPlayState, createMockLiveTournamentState, saveMatchResult, saveNextPoolPhaseResult } from "../lib/live-scoring";
import { createPoolTournamentFromSetup, createTournamentFromSetup, saveActiveTournament, type TournamentSetupFormat } from "../lib/tournament-setup";

const sixteenPlayerText = Array.from({ length: 16 }, (_, index) => `Spiller ${index + 1}`).join("\n");

describe("LiveScoringApp score sheet", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("opens new score fields empty and required", () => {
    saveActiveTournament(createMockLiveTournamentState());
    render(<LiveScoringApp />);

    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);

    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toBeRequired();
  });

  it("shows live score heading and a direct TV-screen link", async () => {
    saveActiveTournament(createMockLiveTournamentState());
    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Live score" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TV-skærm" })).toHaveAttribute("href", "/tv");
  });

  it("shows an existing score when a result is edited", async () => {
    const state = createMockLiveTournamentState();
    const matchId = state.rounds[0].matches[0].id;
    saveActiveTournament(saveMatchResult(state, { matchId, teamAPoints: 21, teamBPoints: 12 }));
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Rediger" }));

    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toHaveValue("21");
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toHaveValue("12");
  });

  it("opens the next Mexicano round from the live player standings", async () => {
    saveActiveTournament(createStandardTournament("Mexicano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    fireEvent.click(screen.getByRole("button", { name: "Næste" }));

    expect(screen.getByText("Næste runde åbnet.")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("Spiller 1 / Spiller 5")).toBeInTheDocument();
    expect(screen.getByText("Spiller 3 / Spiller 7")).toBeInTheDocument();
  });

  it("opens the next Fast Makker Mexicano round from the live pair standings", async () => {
    saveActiveTournament(createStandardTournament("Fast Makker Mexicano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    fireEvent.click(screen.getByRole("button", { name: "Næste" }));

    expect(screen.getByText("Næste runde åbnet.")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getAllByText("Spiller 1 / Spiller 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spiller 5 / Spiller 6").length).toBeGreaterThan(0);
  });

  it("scores initial pool matches from a pool-play tournament", async () => {
    saveActiveTournament(createPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Puljekampe" })).toBeInTheDocument();
    expect(screen.getByText("Puljespil · 4 deltagere · 2 puljer")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("Puljeresultat gemt.")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("21 - 12")).toBeInTheDocument();
  });

  it("creates the cross-match stage after all initial pool matches are saved", async () => {
    saveActiveTournament(createCompletedInitialPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opret næste fase" }));

    expect(screen.getByText("Næste fase oprettet.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Krydskampe" }).length).toBeGreaterThan(0);
  });

  it("scores cross matches after the next phase is created", async () => {
    saveActiveTournament(createCompletedInitialPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opret næste fase" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("Næste faseresultat gemt.")).toBeInTheDocument();
    expect(screen.getAllByText("1 / 2").length).toBeGreaterThan(0);
    expect(screen.getByText("21 - 18")).toBeInTheDocument();
  });

  it("creates and scores finals after completed cross matches", async () => {
    saveActiveTournament(createCompletedInitialPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opret næste fase" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getByRole("button", { name: "Opret finaler" }));

    expect(screen.getByText("Finaler oprettet.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Finaler" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Finale")).toBeInTheDocument();
    expect(screen.getByText("Bronzekamp")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "19" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("Finaleresultat gemt.")).toBeInTheDocument();
    expect(screen.getByText("21 - 19")).toBeInTheDocument();
  });

  it("stores match tiebreak winners for tied pool-play matches", async () => {
    saveActiveTournament(createCompletedInitialPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opret næste fase" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Match tiebreak" }), { target: { value: "teamB" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("20 - 20 (MTB: hold B)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Opret finaler" }));

    expect(screen.getByText("Finaler oprettet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Par D vs Par C -" })).toBeInTheDocument();
  });

  it("scores separate placement tiebreaks for individual Americano cross-play ties", async () => {
    saveActiveTournament(scoreIndividualCrossMatchAmericanoTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Tiebreak om placering" })).toBeInTheDocument();
    expect(screen.getByText("Tiebreak om 2. / 3. plads")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Registrer" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "10" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(screen.getByText("Tiebreak-resultat gemt.")).toBeInTheDocument();
    expect(screen.getByText("10 - 7")).toBeInTheDocument();
  });

  it("shows unmatched final player pool placement play in live scoring", async () => {
    saveActiveTournament(advanceLivePoolPlayState(createCompletedInitialOddPlayerPoolTournament()));
    render(<LiveScoringApp />);

    expect((await screen.findAllByText("Placeringsspil 2")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 / 6").length).toBeGreaterThan(0);
    expect(screen.getByText("Pulje 3 · placering 5-8")).toBeInTheDocument();
    expect(screen.getAllByText("Iben / Liam").length).toBeGreaterThan(0);
  });
});

function createStandardTournament(format: TournamentSetupFormat) {
  return createTournamentFromSetup({
    name: `${format} test`,
    format,
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 5,
    scoringMode: "Fri scoring",
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function scoreVisibleRound() {
  for (let matchIndex = 0; matchIndex < 4; matchIndex += 1) {
    fireEvent.click(screen.getAllByRole("button", { name: "Registrer" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: `${10 + matchIndex}` } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));
  }
}

function createPoolTournament() {
  return createPoolTournamentFromSetup({
    name: "Lørdag Puljespil",
    participantType: "pair",
    participantText: ["Par A", "Par B", "Par C", "Par D"].join("\n"),
    poolCount: 2,
    participantsPerPool: 2,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
  });
}

function createCompletedInitialPoolTournament() {
  let state = createPoolTournament();
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const encounter of pool.encounters) {
      const currentPoolPlay = state.poolPlay;

      if (!currentPoolPlay) {
        throw new Error("Pool play state was removed.");
      }

      state = {
        ...state,
        poolPlay: {
          ...currentPoolPlay,
          initialResults: [
            ...currentPoolPlay.initialResults,
            { matchId: encounter.id, teamAPoints: 21, teamBPoints: 10 },
          ],
        },
      };
    }
  }

  return state;
}

function createCompletedInitialPlayerPoolTournament() {
  let state = createPoolTournamentFromSetup({
    name: "Individuel pulje",
    participantType: "player",
    participantText: ["Alpha", "Birk", "Clara", "David", "Echo", "Freja", "Greta", "Helge"].join("\n"),
    poolCount: 2,
    participantsPerPool: 4,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
  });
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const round of pool.americanoRounds) {
      for (const match of round.matches) {
        const currentPoolPlay = state.poolPlay;

        if (!currentPoolPlay) {
          throw new Error("Pool play state was removed.");
        }

        state = {
          ...state,
          poolPlay: {
            ...currentPoolPlay,
            initialResults: [
              ...currentPoolPlay.initialResults,
              { matchId: match.id, teamAPoints: 10, teamBPoints: 10 },
            ],
          },
        };
      }
    }
  }

  return state;
}

function scoreIndividualCrossMatchAmericanoTournament() {
  let state = advanceLivePoolPlayState(createCompletedInitialPlayerPoolTournament());
  const matches = state.poolPlay?.crossMatchStage?.groups[0].americanoRounds.flatMap((round) => round.matches);

  if (!matches) {
    throw new Error("Cross-match Americano rounds were not created.");
  }

  [
    { teamAPoints: 20, teamBPoints: 20 },
    { teamAPoints: 20, teamBPoints: 10 },
    { teamAPoints: 20, teamBPoints: 10 },
  ].forEach((score, index) => {
    state = saveNextPoolPhaseResult(state, {
      matchId: matches[index].id,
      ...score,
    });
  });

  return state;
}

function createCompletedInitialOddPlayerPoolTournament() {
  let state = createPoolTournamentFromSetup({
    name: "Ulige individuel pulje",
    participantType: "player",
    participantText: ["Alpha", "Birk", "Clara", "David", "Echo", "Freja", "Greta", "Helge", "Iben", "Jens", "Karla", "Liam"].join("\n"),
    poolCount: 3,
    participantsPerPool: 4,
    advancementMode: "crossMatches",
    unmatchedResolution: "bye",
    scoringMode: "Fri scoring",
    rankingMode: "matchPointsFirst",
  });
  const poolPlay = state.poolPlay;

  if (!poolPlay) {
    throw new Error("Pool play state was not created.");
  }

  for (const pool of poolPlay.initialStage.pools) {
    for (const round of pool.americanoRounds) {
      for (const match of round.matches) {
        const currentPoolPlay = state.poolPlay;

        if (!currentPoolPlay) {
          throw new Error("Pool play state was removed.");
        }

        state = {
          ...state,
          poolPlay: {
            ...currentPoolPlay,
            initialResults: [
              ...currentPoolPlay.initialResults,
              { matchId: match.id, teamAPoints: 10, teamBPoints: 10 },
            ],
          },
        };
      }
    }
  }

  return state;
}
