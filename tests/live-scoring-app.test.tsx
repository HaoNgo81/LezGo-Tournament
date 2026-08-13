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

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);

    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toBeRequired();
  });

  it("shows live score heading, a direct TV/Mirror link and a bottom next button", async () => {
    saveActiveTournament(createMockLiveTournamentState());
    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Live score" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sync status")).toHaveTextContent("Kun gemt lokalt");
    expect(screen.getByRole("link", { name: "TV / Mirror" })).toHaveAttribute("href", "/tv");
    expect(screen.getAllByRole("button", { name: "Næste" })).toHaveLength(2);
  });

  it("shows an existing score when a result is edited", async () => {
    const state = createMockLiveTournamentState();
    const matchId = state.rounds[0].matches[0].id;
    saveActiveTournament(saveMatchResult(state, { matchId, teamAPoints: 21, teamBPoints: 12 }));
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Rediger score" }));

    expect(screen.getByRole("textbox", { name: "Hold A scorepoint" })).toHaveValue("21");
    expect(screen.getByRole("textbox", { name: "Hold B scorepoint" })).toHaveValue("12");
  });

  it("calculates the opponent score from one input for fixed total scoring", async () => {
    saveActiveTournament(createFixedPartnerAmericanoTotalScoreTournament());
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findAllByRole("button", { name: "Indtast score" }).then((buttons) => buttons[0]));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "18" } });

    expect(screen.getByLabelText("Hold B scorepoint")).toHaveTextContent("6");
    expect(screen.queryByRole("textbox", { name: "Hold B scorepoint" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(await screen.findByText("18 - 6")).toBeInTheDocument();
  });

  it("calculates the opponent score for Mixed Americano fixed total scoring", async () => {
    saveActiveTournament(createMixedAmericanoTotalScoreTournament());
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findAllByRole("button", { name: "Indtast score" }).then((buttons) => buttons[0]));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });

    expect(screen.getByLabelText("Hold B scorepoint")).toHaveTextContent("7");
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(await screen.findByText("17 - 7")).toBeInTheDocument();
  });

  it("shows validation instead of crashing for invalid fixed total scoring", async () => {
    saveActiveTournament(createFixedPartnerAmericanoTotalScoreTournament());
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findAllByRole("button", { name: "Indtast score" }).then((buttons) => buttons[0]));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "25" } });

    expect(screen.getByText("Scoren skal være mellem 0 og 24.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gem" })).toBeDisabled();
  });

  it("shows target score validation instead of the runtime error page", async () => {
    saveActiveTournament(createFixedPartnerAmericanoTargetScoreTournament());
    render(<LiveScoringApp />);

    fireEvent.click(await screen.findAllByRole("button", { name: "Indtast score" }).then((buttons) => buttons[0]));
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    expect(await screen.findByText((content) => content.includes("Ved Spil til 21"))).toBeInTheDocument();
    expect(screen.queryByText("17 - 4")).not.toBeInTheDocument();
  });

  it("opens the next Mexicano round from the live player standings", async () => {
    saveActiveTournament(createStandardTournament("Mexicano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    fireEvent.click(screen.getAllByRole("button", { name: "Næste" })[0]);

    expect(screen.getByText("Næste runde åbnet.")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("Spiller 1 / Spiller 5")).toBeInTheDocument();
    expect(screen.getByText("Spiller 3 / Spiller 7")).toBeInTheDocument();
  });

  it("opens the next round from the bottom next button below live score", async () => {
    saveActiveTournament(createStandardTournament("Americano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    fireEvent.click(screen.getAllByRole("button", { name: "Næste" })[1]);

    expect(screen.getByText("Næste runde åbnet.")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("opens the next Fast Makker Mexicano round from the live pair standings", async () => {
    saveActiveTournament(createStandardTournament("Fast Makker Mexicano"));
    render(<LiveScoringApp />);

    expect(await screen.findByText("1 / 5")).toBeInTheDocument();
    scoreVisibleRound();
    fireEvent.click(screen.getAllByRole("button", { name: "Næste" })[0]);

    expect(screen.getByText("Næste runde åbnet.")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getAllByText("Spiller 1 / Spiller 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spiller 5 / Spiller 6").length).toBeGreaterThan(0);
  });

  it("locks ranking mode on live Fast Makker Mexicano tournaments", async () => {
    saveActiveTournament(createStandardTournament("Fast Makker Mexicano", { rankingMode: "partiPointsFirst" }));
    render(<LiveScoringApp />);

    expect(await screen.findByText("Fast Makker Mexicano test")).toBeInTheDocument();
    expect(screen.getAllByText((content) => content.includes("scorepoint")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("scores initial pool matches from a pool-play tournament", async () => {
    saveActiveTournament(createPoolTournament());
    render(<LiveScoringApp />);

    expect(await screen.findByRole("heading", { name: "Puljekampe" })).toBeInTheDocument();
    expect(screen.getByText("Puljespil · 4 deltagere · 2 puljer")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
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
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
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

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "21" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "17" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getByRole("button", { name: "Opret finaler" }));

    expect(screen.getByText("Finaler oprettet.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Finaler" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Finale")).toBeInTheDocument();
    expect(screen.getByText("Bronzekamp")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
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
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hold A scorepoint" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Hold B scorepoint" }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Match tiebreak" }), { target: { value: "teamB" } });
    fireEvent.click(screen.getByRole("button", { name: "Gem" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
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

    fireEvent.click(screen.getByRole("button", { name: "Indtast score" }));
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

function createStandardTournament(format: TournamentSetupFormat, overrides: Partial<Parameters<typeof createTournamentFromSetup>[0]> = {}) {
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
    ...overrides,
  });
}

function createFixedPartnerAmericanoTotalScoreTournament() {
  return createTournamentFromSetup({
    name: "Fast Makker Americano total",
    format: "Fast Makker Americano",
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 8,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function createFixedPartnerAmericanoTargetScoreTournament() {
  return createTournamentFromSetup({
    name: "Fast Makker Americano target",
    format: "Fast Makker Americano",
    playerText: sixteenPlayerText,
    femalePlayerText: "",
    malePlayerText: "",
    courts: 4,
    rounds: 8,
    scoringMode: "Fast antal point",
    fixedScoreRule: "target",
    fixedScorePoints: 21,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function createMixedAmericanoTotalScoreTournament() {
  return createTournamentFromSetup({
    name: "Mixed Americano total",
    format: "Mixed Americano",
    playerText: "",
    femalePlayerText: Array.from({ length: 8 }, (_, index) => `Kvinde ${index + 1}`).join("\n"),
    malePlayerText: Array.from({ length: 8 }, (_, index) => `Mand ${index + 1}`).join("\n"),
    courts: 4,
    rounds: 8,
    scoringMode: "Fast antal point",
    fixedScoreRule: "total",
    fixedScorePoints: 24,
    firstRoundOrder: "manual",
    rankingMode: "matchPointsFirst",
  });
}

function scoreVisibleRound() {
  for (let matchIndex = 0; matchIndex < 4; matchIndex += 1) {
    fireEvent.click(screen.getAllByRole("button", { name: "Indtast score" })[0]);
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
