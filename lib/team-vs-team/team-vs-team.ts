export interface TeamVsTeamPlayer {
  id: string;
  name: string;
}

export interface TeamVsTeamTeam {
  id: string;
  name: string;
  captainPlayerId: string;
  players: TeamVsTeamPlayer[];
}

export type TeamVsTeamPlayersPerTeam = 4 | 6 | 8;

export type TeamVsTeamMatchFormat = "oneSet" | "bestOfThree";

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

export interface TeamVsTeamMatchResult {
  sets: TeamVsTeamSetResult[];
}

export interface TeamVsTeamRoundResult {
  roundNumber: 1 | 2 | 3;
  match1: TeamVsTeamMatchResult;
  match2: TeamVsTeamMatchResult;
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

export const teamVsTeamPlayerOptions: TeamVsTeamPlayersPerTeam[] = [4, 6, 8];

export function getTeamVsTeamMaxRounds(playersPerTeam: TeamVsTeamPlayersPerTeam): 2 | 3 {
  return playersPerTeam === 4 ? 3 : 2;
}

export function validateTeamVsTeamTeams(teams: TeamVsTeamTeam[], playersPerTeam: TeamVsTeamPlayersPerTeam = 4): void {
  if (teams.length !== 2 && teams.length !== 4) {
    throw new Error("Team vs. Team kræver enten 2 eller 4 hold.");
  }

  if (!teamVsTeamPlayerOptions.includes(playersPerTeam)) {
    throw new Error("Team vs. Team kræver 4, 6 eller 8 spillere pr. hold.");
  }

  const teamIds = new Set<string>();
  const playerIds = new Set<string>();

  teams.forEach((team) => {
    if (teamIds.has(team.id)) {
      throw new Error(`Hold-id skal være unikt: ${team.id}`);
    }

    teamIds.add(team.id);

    if (team.players.length !== playersPerTeam) {
      throw new Error(`${team.name} skal have præcis ${playersPerTeam} spillere.`);
    }

    const teamPlayerIds = new Set(team.players.map((player) => player.id));

    if (teamPlayerIds.size !== playersPerTeam) {
      throw new Error(`${team.name} har dublerede spillere.`);
    }

    if (!teamPlayerIds.has(team.captainPlayerId)) {
      throw new Error(`${team.name} skal have en holdkaptajn blandt holdets spillere.`);
    }

    team.players.forEach((player) => {
      if (playerIds.has(player.id)) {
        throw new Error(`Spiller må kun være på ét hold: ${player.name}`);
      }

      playerIds.add(player.id);
    });
  });
}

export function createTeamVsTeamBracket(teams: TeamVsTeamTeam[], playersPerTeam: TeamVsTeamPlayersPerTeam = 4): TeamVsTeamBracket {
  validateTeamVsTeamTeams(teams, playersPerTeam);

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
  const playerIds = team.players.map((player) => player.id);
  const [player1, player2, player3, player4, player5, player6, player7, player8] = playerIds;
  const constitutions: Array<[[string, string], [string, string]]> = [
    [[player1, player2], [player3, player4]],
    [[player1, player3], [player2, player4]],
  ];

  if (team.players.length === 4) {
    constitutions.push([[player1, player4], [player2, player3]]);
  }

  if (team.players.length === 6) {
    constitutions[1] = [[player5, player6], [player1, player2]];
  }

  if (team.players.length === 8) {
    constitutions[1] = [[player5, player6], [player7, player8]];
  }

  return constitutions;
}

export function validateTeamVsTeamLineup(matchup: TeamVsTeamMatchup, lineup: TeamVsTeamRoundLineup, previousLineups: TeamVsTeamRoundLineup[] = [], playersPerTeam: TeamVsTeamPlayersPerTeam = 4): string[] {
  assertRoundNumber(lineup.roundNumber, playersPerTeam);
  assertTeamUsesFourUniquePlayers(matchup.teamA, [lineup.match1.teamAPlayerIds, lineup.match2.teamAPlayerIds]);
  assertTeamUsesFourUniquePlayers(matchup.teamB, [lineup.match1.teamBPlayerIds, lineup.match2.teamBPlayerIds]);

  const repeatedPairs = findRepeatedPairs(lineup, previousLineups);

  if (repeatedPairs.length && !lineup.overrideRepeatedPairs) {
    throw new Error(`Makkerpar er allerede anvendt: ${repeatedPairs.join(", ")}`);
  }

  return repeatedPairs.map((pair) => `Makkerpar er allerede anvendt: ${pair}`);
}

export function calculateTeamVsTeamMatchScore(
  matchup: TeamVsTeamMatchup,
  roundResults: TeamVsTeamRoundResult[],
  tieBreak?: TeamVsTeamTieBreak,
  options: { playersPerTeam?: TeamVsTeamPlayersPerTeam; matchFormat?: TeamVsTeamMatchFormat } = {},
): TeamVsTeamMatchScore {
  const playersPerTeam = options.playersPerTeam ?? 4;
  const matchFormat = options.matchFormat ?? "oneSet";
  const maxRounds = getTeamVsTeamMaxRounds(playersPerTeam);
  const sortedResults = [...roundResults].sort((left, right) => left.roundNumber - right.roundNumber);
  const roundScores = sortedResults.map((result) => calculateRoundScore(result, playersPerTeam, matchFormat));
  const teamAWins = roundScores.reduce((sum, round) => sum + round.awardedMatchWins.teamA, 0);
  const teamBWins = roundScores.reduce((sum, round) => sum + round.awardedMatchWins.teamB, 0);
  const tieBreakRequired = sortedResults.length === maxRounds && teamAWins === teamBWins;
  let tieBreakWinnerTeamId: string | undefined;

  if (tieBreak) {
    if (!tieBreakRequired) {
      throw new Error("Match Tie-break må først oprettes, når holdkampen står uafgjort efter alle runder.");
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
    winnerTeamId: tieBreakWinnerTeamId ?? getWinnerTeamId(matchup, teamAWins, teamBWins, sortedResults.length, maxRounds),
  };
}

export function validateTeamVsTeamTieBreak(matchup: TeamVsTeamMatchup, tieBreak: TeamVsTeamTieBreak): void {
  assertPairBelongsToTeam(matchup.teamA, tieBreak.teamAPlayerIds);
  assertPairBelongsToTeam(matchup.teamB, tieBreak.teamBPlayerIds);
  assertValidTieBreakResult(tieBreak.result);
}

function calculateRoundScore(result: TeamVsTeamRoundResult, playersPerTeam: TeamVsTeamPlayersPerTeam, matchFormat: TeamVsTeamMatchFormat): TeamVsTeamRoundScore {
  assertRoundNumber(result.roundNumber, playersPerTeam);
  assertValidMatchResult(result.match1, matchFormat);
  assertValidMatchResult(result.match2, matchFormat);

  const match1Winner = getMatchWinner(result.match1);
  const match2Winner = getMatchWinner(result.match2);
  const actualMatchWins = {
    teamA: Number(match1Winner === "teamA") + Number(match2Winner === "teamA"),
    teamB: Number(match1Winner === "teamB") + Number(match2Winner === "teamB"),
  };

  return {
    roundNumber: result.roundNumber,
    actualMatchWins,
    awardedMatchWins: actualMatchWins,
  };
}

function assertRoundNumber(roundNumber: number, playersPerTeam: TeamVsTeamPlayersPerTeam = 4): asserts roundNumber is 1 | 2 | 3 {
  const maxRounds = getTeamVsTeamMaxRounds(playersPerTeam);

  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > maxRounds) {
    throw new Error(`Team vs. Team med ${playersPerTeam} spillere pr. hold består af præcis ${maxRounds} runder.`);
  }
}

function assertTeamUsesFourUniquePlayers(team: TeamVsTeamTeam, pairs: Array<[string, string]>): void {
  const teamPlayerIds = new Set(team.players.map((player) => player.id));
  const selectedPlayerIds = pairs.flat();
  const uniqueSelectedPlayerIds = new Set(selectedPlayerIds);

  if (selectedPlayerIds.length !== 4 || uniqueSelectedPlayerIds.size !== 4) {
    throw new Error(`${team.name}: der skal vælges 4 forskellige spillere i runden.`);
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

function assertValidMatchResult(result: TeamVsTeamMatchResult, matchFormat: TeamVsTeamMatchFormat): void {
  if (!Array.isArray(result.sets)) {
    throw new Error("Kampresultat skal indtastes som sæt.");
  }

  if (matchFormat === "oneSet" && result.sets.length !== 1) {
    throw new Error("Kampformatet 1 sæt kræver præcis ét sætresultat.");
  }

  if (matchFormat === "bestOfThree" && (result.sets.length < 2 || result.sets.length > 3)) {
    throw new Error("Bedst af 3 sæt kræver 2 eller 3 sætresultater.");
  }

  result.sets.forEach(assertValidSetResult);
  getMatchWinner(result);
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

function getMatchWinner(result: TeamVsTeamMatchResult): "teamA" | "teamB" {
  const setWins = result.sets.reduce(
    (wins, setResult) => {
      const winner = getSetWinner(setResult);
      return {
        teamA: wins.teamA + Number(winner === "teamA"),
        teamB: wins.teamB + Number(winner === "teamB"),
      };
    },
    { teamA: 0, teamB: 0 },
  );

  if (setWins.teamA === setWins.teamB) {
    throw new Error("En kamp skal have en vinder på sæt.");
  }

  return setWins.teamA > setWins.teamB ? "teamA" : "teamB";
}

function getWinnerTeamId(matchup: TeamVsTeamMatchup, teamAWins: number, teamBWins: number, completedRounds: number, maxRounds: 2 | 3): string | undefined {
  if (completedRounds < maxRounds || teamAWins === teamBWins) {
    return undefined;
  }

  return teamAWins > teamBWins ? matchup.teamA.id : matchup.teamB.id;
}