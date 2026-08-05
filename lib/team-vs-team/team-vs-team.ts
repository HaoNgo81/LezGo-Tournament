export interface TeamVsTeamPlayer {
  id: string;
  name: string;
}

export interface TeamVsTeamTeam {
  id: string;
  name: string;
  captainPlayerId: string;
  players: [TeamVsTeamPlayer, TeamVsTeamPlayer, TeamVsTeamPlayer, TeamVsTeamPlayer];
}

export interface TeamVsTeamMatchup {
  id: string;
  teamA: TeamVsTeamTeam;
  teamB: TeamVsTeamTeam;
}

export interface TeamVsTeamPairing {
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
}

export interface TeamVsTeamRoundLineup {
  roundNumber: 1 | 2 | 3;
  match1: TeamVsTeamPairing;
  match2: TeamVsTeamPairing;
  overrideRepeatedPairs?: boolean;
}

export interface TeamVsTeamSetResult {
  teamAPoints: number;
  teamBPoints: number;
}

export interface TeamVsTeamRoundResult {
  roundNumber: 1 | 2 | 3;
  match1: TeamVsTeamSetResult;
  match2: TeamVsTeamSetResult;
}

export interface TeamVsTeamTieBreak {
  teamAPlayerIds: [string, string];
  teamBPlayerIds: [string, string];
  result: TeamVsTeamSetResult;
}

export interface TeamVsTeamRoundScore {
  roundNumber: 1 | 2 | 3;
  actualMatchWins: { teamA: number; teamB: number };
  awardedMatchWins: { teamA: number; teamB: number };
  ruleMessage?: string;
}

export interface TeamVsTeamMatchScore {
  teamAWins: number;
  teamBWins: number;
  roundScores: TeamVsTeamRoundScore[];
  tieBreakRequired: boolean;
  tieBreakWinnerTeamId?: string;
  winnerTeamId?: string;
}

export interface TeamVsTeamBracketMatch {
  id: string;
  label: string;
  teamAId: string;
  teamBId: string;
}

export interface TeamVsTeamBracket {
  firstRound: TeamVsTeamBracketMatch[];
  secondRound: TeamVsTeamBracketMatch[];
  warning?: string;
}

const teamSize = 4;

export function validateTeamVsTeamTeams(teams: TeamVsTeamTeam[]): void {
  if (teams.length !== 2 && teams.length !== 4) {
    throw new Error("Team vs. Team kræver enten 2 eller 4 hold.");
  }

  const teamIds = new Set<string>();
  const playerIds = new Set<string>();

  teams.forEach((team) => {
    if (teamIds.has(team.id)) {
      throw new Error(`Hold-id skal være unikt: ${team.id}`);
    }

    teamIds.add(team.id);

    if (team.players.length !== teamSize) {
      throw new Error(`${team.name} skal have præcis 4 spillere.`);
    }

    const teamPlayerIds = new Set(team.players.map((player) => player.id));

    if (teamPlayerIds.size !== teamSize) {
      throw new Error(`${team.name} har dublerede spillere.`);
    }

    if (!teamPlayerIds.has(team.captainPlayerId)) {
      throw new Error(`${team.name} skal have en holdkaptajn blandt holdets 4 spillere.`);
    }

    team.players.forEach((player) => {
      if (playerIds.has(player.id)) {
        throw new Error(`Spiller må kun være på ét hold: ${player.name}`);
      }

      playerIds.add(player.id);
    });
  });
}

export function createTeamVsTeamBracket(teams: TeamVsTeamTeam[]): TeamVsTeamBracket {
  validateTeamVsTeamTeams(teams);

  if (teams.length === 2) {
    return {
      firstRound: [{ id: "holdkamp-1", label: "Holdkamp", teamAId: teams[0].id, teamBId: teams[1].id }],
      secondRound: [],
    };
  }

  return {
    firstRound: [
      { id: "semifinale-1", label: "Holdrunde 1", teamAId: teams[0].id, teamBId: teams[1].id },
      { id: "semifinale-2", label: "Holdrunde 1", teamAId: teams[2].id, teamBId: teams[3].id },
    ],
    secondRound: [
      { id: "finale", label: "Finale", teamAId: "vinder-semifinale-1", teamBId: "vinder-semifinale-2" },
      { id: "placeringskamp", label: "Placeringskamp", teamAId: "taber-semifinale-1", teamBId: "taber-semifinale-2" },
    ],
  };
}

export function getTeamVsTeamPairConstitutions(team: TeamVsTeamTeam): Array<[[string, string], [string, string]]> {
  const [player1, player2, player3, player4] = team.players.map((player) => player.id);

  return [
    [[player1, player2], [player3, player4]],
    [[player1, player3], [player2, player4]],
    [[player1, player4], [player2, player3]],
  ];
}

export function validateTeamVsTeamLineup(matchup: TeamVsTeamMatchup, lineup: TeamVsTeamRoundLineup, previousLineups: TeamVsTeamRoundLineup[] = []): string[] {
  assertRoundNumber(lineup.roundNumber);
  assertTeamUsesEveryPlayerOnce(matchup.teamA, [lineup.match1.teamAPlayerIds, lineup.match2.teamAPlayerIds]);
  assertTeamUsesEveryPlayerOnce(matchup.teamB, [lineup.match1.teamBPlayerIds, lineup.match2.teamBPlayerIds]);

  const repeatedPairs = findRepeatedPairs(lineup, previousLineups);

  if (repeatedPairs.length && !lineup.overrideRepeatedPairs) {
    throw new Error(`Makkerpar er allerede anvendt: ${repeatedPairs.join(", ")}`);
  }

  return repeatedPairs.map((pair) => `Makkerpar er allerede anvendt: ${pair}`);
}

export function calculateTeamVsTeamMatchScore(matchup: TeamVsTeamMatchup, roundResults: TeamVsTeamRoundResult[], tieBreak?: TeamVsTeamTieBreak): TeamVsTeamMatchScore {
  const sortedResults = [...roundResults].sort((left, right) => left.roundNumber - right.roundNumber);
  const roundScores = sortedResults.map(calculateRoundScore);
  const teamAWins = roundScores.reduce((sum, round) => sum + round.awardedMatchWins.teamA, 0);
  const teamBWins = roundScores.reduce((sum, round) => sum + round.awardedMatchWins.teamB, 0);
  const tieBreakRequired = sortedResults.length === 3 && teamAWins === 3 && teamBWins === 3;
  let tieBreakWinnerTeamId: string | undefined;

  if (tieBreak) {
    if (!tieBreakRequired) {
      throw new Error("Match Tie-break må først oprettes, når stillingen efter 3 runder er 3-3.");
    }

    validateTeamVsTeamTieBreak(matchup, tieBreak);
    tieBreakWinnerTeamId = tieBreak.result.teamAPoints > tieBreak.result.teamBPoints ? matchup.teamA.id : matchup.teamB.id;
  }

  return {
    teamAWins,
    teamBWins,
    roundScores,
    tieBreakRequired,
    tieBreakWinnerTeamId,
    winnerTeamId: tieBreakWinnerTeamId ?? getWinnerTeamId(matchup, teamAWins, teamBWins, sortedResults.length),
  };
}

export function validateTeamVsTeamTieBreak(matchup: TeamVsTeamMatchup, tieBreak: TeamVsTeamTieBreak): void {
  assertPairBelongsToTeam(matchup.teamA, tieBreak.teamAPlayerIds);
  assertPairBelongsToTeam(matchup.teamB, tieBreak.teamBPlayerIds);
  assertValidTieBreakResult(tieBreak.result);
}

function calculateRoundScore(result: TeamVsTeamRoundResult): TeamVsTeamRoundScore {
  assertRoundNumber(result.roundNumber);
  assertValidSetResult(result.match1);
  assertValidSetResult(result.match2);

  const match1Winner = getSetWinner(result.match1);
  const match2Winner = getSetWinner(result.match2);
  const actualMatchWins = {
    teamA: Number(match1Winner === "teamA") + Number(match2Winner === "teamA"),
    teamB: Number(match1Winner === "teamB") + Number(match2Winner === "teamB"),
  };
  const teamAHasSixZero = didTeamWinSixZero(result.match1, "teamA") || didTeamWinSixZero(result.match2, "teamA");
  const teamBHasSixZero = didTeamWinSixZero(result.match1, "teamB") || didTeamWinSixZero(result.match2, "teamB");

  if (teamAHasSixZero && teamBHasSixZero) {
    return {
      roundNumber: result.roundNumber,
      actualMatchWins,
      awardedMatchWins: actualMatchWins,
      ruleMessage: "Begge hold har vundet 6-0. Straffen ophæves, og hvert hold tildeles én kampsejr.",
    };
  }

  if (teamAHasSixZero) {
    return {
      roundNumber: result.roundNumber,
      actualMatchWins,
      awardedMatchWins: { teamA: 2, teamB: 0 },
      ruleMessage: "6-0-reglen er aktiveret. Hold A tildeles begge kampsejre i denne runde.",
    };
  }

  if (teamBHasSixZero) {
    return {
      roundNumber: result.roundNumber,
      actualMatchWins,
      awardedMatchWins: { teamA: 0, teamB: 2 },
      ruleMessage: "6-0-reglen er aktiveret. Hold B tildeles begge kampsejre i denne runde.",
    };
  }

  return {
    roundNumber: result.roundNumber,
    actualMatchWins,
    awardedMatchWins: actualMatchWins,
  };
}

function assertRoundNumber(roundNumber: number): asserts roundNumber is 1 | 2 | 3 {
  if (![1, 2, 3].includes(roundNumber)) {
    throw new Error("Team vs. Team består af præcis 3 runder.");
  }
}

function assertTeamUsesEveryPlayerOnce(team: TeamVsTeamTeam, pairs: Array<[string, string]>): void {
  const teamPlayerIds = new Set(team.players.map((player) => player.id));
  const selectedPlayerIds = pairs.flat();
  const uniqueSelectedPlayerIds = new Set(selectedPlayerIds);

  if (selectedPlayerIds.length !== 4 || uniqueSelectedPlayerIds.size !== 4) {
    throw new Error(`${team.name}: alle 4 spillere skal anvendes præcis én gang i runden.`);
  }

  selectedPlayerIds.forEach((playerId) => {
    if (!teamPlayerIds.has(playerId)) {
      throw new Error(`${team.name}: spilleren findes ikke på holdet: ${playerId}`);
    }
  });
}

function findRepeatedPairs(lineup: TeamVsTeamRoundLineup, previousLineups: TeamVsTeamRoundLineup[]): string[] {
  const previousPairs = new Set(previousLineups.flatMap((previousLineup) => getLineupPairKeys(previousLineup)));

  return getLineupPairKeys(lineup).filter((pairKey) => previousPairs.has(pairKey));
}

function getLineupPairKeys(lineup: TeamVsTeamRoundLineup): string[] {
  return [
    toPairKey(lineup.match1.teamAPlayerIds),
    toPairKey(lineup.match2.teamAPlayerIds),
    toPairKey(lineup.match1.teamBPlayerIds),
    toPairKey(lineup.match2.teamBPlayerIds),
  ];
}

function toPairKey(playerIds: [string, string]): string {
  return [...playerIds].sort((left, right) => left.localeCompare(right, "da")).join("+");
}

function assertPairBelongsToTeam(team: TeamVsTeamTeam, playerIds: [string, string]): void {
  const teamPlayerIds = new Set(team.players.map((player) => player.id));
  const uniquePlayerIds = new Set(playerIds);

  if (uniquePlayerIds.size !== 2 || playerIds.some((playerId) => !teamPlayerIds.has(playerId))) {
    throw new Error(`${team.name}: Match Tie-break skal have præcis 2 spillere fra holdet.`);
  }
}

function assertValidSetResult(result: TeamVsTeamSetResult): void {
  assertIntegerScore(result);

  if (result.teamAPoints === result.teamBPoints) {
    throw new Error("En Team vs. Team-kamp skal have en vinder.");
  }
}

function assertValidTieBreakResult(result: TeamVsTeamSetResult): void {
  assertIntegerScore(result);

  const winnerPoints = Math.max(result.teamAPoints, result.teamBPoints);
  const loserPoints = Math.min(result.teamAPoints, result.teamBPoints);

  if (winnerPoints < 10 || winnerPoints - loserPoints < 2) {
    throw new Error("Match Tie-break spilles til mindst 10 point og skal vindes med mindst 2 point.");
  }
}

function assertIntegerScore(result: TeamVsTeamSetResult): void {
  if (!Number.isInteger(result.teamAPoints) || !Number.isInteger(result.teamBPoints) || result.teamAPoints < 0 || result.teamBPoints < 0) {
    throw new Error("Resultat skal være hele, positive tal.");
  }
}

function getSetWinner(result: TeamVsTeamSetResult): "teamA" | "teamB" {
  return result.teamAPoints > result.teamBPoints ? "teamA" : "teamB";
}

function didTeamWinSixZero(result: TeamVsTeamSetResult, team: "teamA" | "teamB"): boolean {
  return team === "teamA" ? result.teamAPoints === 6 && result.teamBPoints === 0 : result.teamBPoints === 6 && result.teamAPoints === 0;
}

function getWinnerTeamId(matchup: TeamVsTeamMatchup, teamAWins: number, teamBWins: number, completedRounds: number): string | undefined {
  if (completedRounds < 3 || teamAWins === teamBWins) {
    return undefined;
  }

  return teamAWins > teamBWins ? matchup.teamA.id : matchup.teamB.id;
}
