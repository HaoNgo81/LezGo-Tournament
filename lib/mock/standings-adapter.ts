import { standings } from "./tournament-data";
import type { StandingRow } from "../tournament-engine";

export const mockStandingRows: StandingRow[] = standings.map((row) => ({
  id: row.name,
  name: row.name,
  rank: row.rank,
  matchPoints: row.points,
  pointsFor: row.won,
  pointsAgainst: row.lost,
  pointDifference: row.diff,
  wins: row.wins,
  draws: 0,
  losses: 0,
  headToHeadMatchPoints: 0,
  headToHeadPointDifference: 0,
  pauseCount: 0,
}));


