export const tournamentTypes = [
  "Americano",
  "Mexicano",
  "Mixed Americano",
  "Fast Makker Americano",
  "Fast Makker Mexicano",
  "Team vs. Team",
] as const;

export const scoringModes = ["Fri scoring", "Fast antal point", "Spil på tid"] as const;

export const mockPlayers = [
  "Anna",
  "Hassan",
  "Maja",
  "Noah",
  "Sofia",
  "Emil",
  "Clara",
  "Jonas",
  "Freja",
  "Malik",
  "Ida",
  "Oscar",
];

export const mockMatches = [
  { court: "Bane 1", teamA: "Anna / Hassan", teamB: "Maja / Noah", score: "18 - 14" },
  { court: "Bane 2", teamA: "Sofia / Emil", teamB: "Clara / Jonas", score: "12 - 12" },
  { court: "Bane 3", teamA: "Freja / Malik", teamB: "Ida / Oscar", score: "Ikke gemt" },
];

export const standings = [
  { rank: 1, name: "Anna", points: 42, won: 42, lost: 26, diff: 16, wins: 3 },
  { rank: 2, name: "Hassan", points: 40, won: 40, lost: 28, diff: 12, wins: 3 },
  { rank: 3, name: "Maja", points: 36, won: 36, lost: 32, diff: 4, wins: 2 },
  { rank: 4, name: "Noah", points: 34, won: 34, lost: 34, diff: 0, wins: 2 },
  { rank: 5, name: "Sofia", points: 31, won: 31, lost: 37, diff: -6, wins: 1 },
  { rank: 6, name: "Emil", points: 29, won: 29, lost: 39, diff: -10, wins: 1 },
];

export const tournaments = [
  { title: "Fredag Americano", status: "Aktiv", type: "Americano", players: 12 },
  { title: "Sommer Mix", status: "Kommende", type: "Mixed Americano", players: 16 },
  { title: "Holdfinale", status: "Afsluttet", type: "Team vs. Team", players: 16 },
];

export const templates = [
  { title: "8 spillere / 2 baner", type: "Americano", scoring: "Fast antal point" },
  { title: "12 spillere / 3 baner", type: "Mexicano", scoring: "Spil på tid" },
  { title: "Mixed fredag", type: "Mixed Americano", scoring: "Fri scoring" },
];

