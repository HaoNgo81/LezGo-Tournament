import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrossMatchStagePanel } from "../components/tournament/cross-match-stage-panel";
import type { CrossMatchStage } from "../lib/tournament-setup";

describe("CrossMatchStagePanel", () => {
  it("shows pair cross matches with participant, source pool, and rank", () => {
    render(<CrossMatchStagePanel stage={createPairStage()} />);

    expect(screen.getByRole("heading", { name: "Krydskampe" })).toBeInTheDocument();
    expect(screen.getByText("Pulje 1 mod Pulje 2")).toBeInTheDocument();

    const firstMatch = screen.getByRole("heading", { name: "Kamp 1" }).closest("article");

    expect(firstMatch).not.toBeNull();
    expect(within(firstMatch as HTMLElement).getByText("Par A")).toBeInTheDocument();
    expect(within(firstMatch as HTMLElement).getByText("Pulje 1, nr. 1")).toBeInTheDocument();
    expect(within(firstMatch as HTMLElement).getByText("Par D")).toBeInTheDocument();
    expect(within(firstMatch as HTMLElement).getByText("Pulje 2, nr. 2")).toBeInTheDocument();
  });

  it("shows team submatch count as delkampe", () => {
    render(<CrossMatchStagePanel stage={{ ...createPairStage(), participantType: "team" }} />);

    expect(screen.getAllByText("3 delkampe")).toHaveLength(2);
  });

  it("shows Americano rounds and courts for individual players", () => {
    render(<CrossMatchStagePanel stage={createPlayerStage()} />);

    expect(screen.getByRole("heading", { name: "Runde 1" })).toBeInTheDocument();
    expect(screen.getByText("Bane 1")).toBeInTheDocument();
    expect(screen.getByText("Anna + Clara")).toBeInTheDocument();
    expect(screen.getByText("Pulje 1, nr. 1 / Pulje 2, nr. 1")).toBeInTheDocument();
  });

  it("shows unmatched final player pool placement play", () => {
    render(<CrossMatchStagePanel stage={createUnmatchedPlayerPlacementStage()} />);

    expect(screen.getByText("Ulig sidste pulje")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Placeringsspil" })).toBeInTheDocument();
    expect(screen.getByText("Pulje 3 · placering 5-8")).toBeInTheDocument();
    expect(screen.getByText("Iben + Liam")).toBeInTheDocument();
    expect(screen.getByText("Pulje 3, nr. 1 / Pulje 3, nr. 4")).toBeInTheDocument();
  });

  it("shows automatic bye and walkover advances separately", () => {
    render(<CrossMatchStagePanel stage={createAutomaticAdvanceStage()} />);

    expect(screen.getByRole("heading", { name: "Automatisk videre" })).toBeInTheDocument();
    expect(screen.getByText("Oversidning")).toBeInTheDocument();
    expect(screen.getByText("Walkover")).toBeInTheDocument();
    expect(screen.getByText("Pulje 3, nr. 1")).toBeInTheDocument();
    expect(screen.getByText("Pulje 3, nr. 2")).toBeInTheDocument();
  });
});

function createPairStage(): CrossMatchStage {
  return {
    participantType: "pair",
    participants: [
      { id: "pair-a", name: "Par A" },
      { id: "pair-b", name: "Par B" },
      { id: "pair-c", name: "Par C" },
      { id: "pair-d", name: "Par D" },
    ],
    groups: [
      {
        id: "cross-group-1",
        name: "Krydsspil 1",
        sourcePoolIds: ["pool-1", "pool-2"],
        scheduleType: "crossMatches",
        qualifiers: [
          { participantId: "pair-a", sourcePoolId: "pool-1", sourcePoolName: "Pulje 1", sourceRank: 1 },
          { participantId: "pair-b", sourcePoolId: "pool-1", sourcePoolName: "Pulje 1", sourceRank: 2 },
          { participantId: "pair-c", sourcePoolId: "pool-2", sourcePoolName: "Pulje 2", sourceRank: 1 },
          { participantId: "pair-d", sourcePoolId: "pool-2", sourcePoolName: "Pulje 2", sourceRank: 2 },
        ],
        encounters: [
          {
            id: "cross-group-1-match-1",
            poolId: "cross-group-1",
            participantAId: "pair-a",
            participantBId: "pair-d",
            sourcePoolAId: "pool-1",
            sourcePoolBId: "pool-2",
            sourceRankA: 1,
            sourceRankB: 2,
            matchesPerTeam: 3,
          },
          {
            id: "cross-group-1-match-2",
            poolId: "cross-group-1",
            participantAId: "pair-b",
            participantBId: "pair-c",
            sourcePoolAId: "pool-1",
            sourcePoolBId: "pool-2",
            sourceRankA: 2,
            sourceRankB: 1,
            matchesPerTeam: 3,
          },
        ],
        americanoRounds: [],
      },
    ],
    unmatchedPlacementGroups: [],
    automaticAdvances: [],
  };
}

function createPlayerStage(): CrossMatchStage {
  return {
    participantType: "player",
    participants: [
      { id: "anna", name: "Anna" },
      { id: "bo", name: "Bo" },
      { id: "clara", name: "Clara" },
      { id: "dan", name: "Dan" },
    ],
    groups: [
      {
        id: "cross-group-1",
        name: "Krydsspil 1",
        sourcePoolIds: ["pool-1", "pool-2"],
        scheduleType: "americanoRotation",
        qualifiers: [
          { participantId: "anna", sourcePoolId: "pool-1", sourcePoolName: "Pulje 1", sourceRank: 1 },
          { participantId: "bo", sourcePoolId: "pool-1", sourcePoolName: "Pulje 1", sourceRank: 2 },
          { participantId: "clara", sourcePoolId: "pool-2", sourcePoolName: "Pulje 2", sourceRank: 1 },
          { participantId: "dan", sourcePoolId: "pool-2", sourcePoolName: "Pulje 2", sourceRank: 2 },
        ],
        encounters: [],
        americanoRounds: [
          {
            roundNumber: 1,
            byeParticipantIds: [],
            matches: [
              {
                id: "cross-group-1-round-1-court-1",
                poolId: "cross-group-1",
                roundNumber: 1,
                courtNumber: 1,
                teamA: { playerIds: ["anna", "clara"] },
                teamB: { playerIds: ["bo", "dan"] },
              },
            ],
          },
        ],
      },
    ],
    unmatchedPlacementGroups: [],
    automaticAdvances: [],
  };
}

function createAutomaticAdvanceStage(): CrossMatchStage {
  const baseStage = createPairStage();

  return {
    ...baseStage,
    automaticAdvances: [
      {
        id: "pool-3-rank-1-bye",
        participantId: "pair-e",
        sourcePoolId: "pool-3",
        sourcePoolName: "Pulje 3",
        sourceRank: 1,
        resolution: "bye",
        advancesAutomatically: true,
      },
      {
        id: "pool-3-rank-2-walkover",
        participantId: "pair-f",
        sourcePoolId: "pool-3",
        sourcePoolName: "Pulje 3",
        sourceRank: 2,
        resolution: "walkover",
        advancesAutomatically: true,
      },
    ],
    participants: [
      ...baseStage.participants,
      { id: "pair-e", name: "Par E" },
      { id: "pair-f", name: "Par F" },
    ],
  };
}

function createUnmatchedPlayerPlacementStage(): CrossMatchStage {
  const baseStage = createPlayerStage();

  return {
    ...baseStage,
    participants: [
      ...baseStage.participants,
      { id: "iben", name: "Iben" },
      { id: "jens", name: "Jens" },
      { id: "karla", name: "Karla" },
      { id: "liam", name: "Liam" },
    ],
    unmatchedPlacementGroups: [
      {
        id: "unmatched-placement-2",
        name: "Placeringsspil 2",
        sourcePoolId: "pool-3",
        sourcePoolName: "Pulje 3",
        finalPlacementFrom: 5,
        finalPlacementTo: 8,
        participants: [
          { participantId: "iben", sourcePoolId: "pool-3", sourcePoolName: "Pulje 3", sourceRank: 1 },
          { participantId: "jens", sourcePoolId: "pool-3", sourcePoolName: "Pulje 3", sourceRank: 2 },
          { participantId: "karla", sourcePoolId: "pool-3", sourcePoolName: "Pulje 3", sourceRank: 3 },
          { participantId: "liam", sourcePoolId: "pool-3", sourcePoolName: "Pulje 3", sourceRank: 4 },
        ],
        americanoRounds: [
          {
            roundNumber: 1,
            byeParticipantIds: [],
            matches: [
              {
                id: "unmatched-placement-2-round-1-court-1",
                poolId: "unmatched-placement-2",
                roundNumber: 1,
                courtNumber: 1,
                teamA: { playerIds: ["iben", "liam"] },
                teamB: { playerIds: ["jens", "karla"] },
              },
            ],
          },
        ],
      },
    ],
  };
}
