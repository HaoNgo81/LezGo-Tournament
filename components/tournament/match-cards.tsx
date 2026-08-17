import { UnifiedCourtCard, splitCourtTeamName } from "@/components/tournament/unified-court-card";
import { mockMatches } from "@/lib/mock/tournament-data";
import type { ReadOnlyMatchCard } from "@/lib/read-only-views";

interface MatchCardsProps {
  matches?: ReadOnlyMatchCard[];
}

export function MatchCards({ matches = mockMatches.map((match) => ({ ...match, id: match.court, status: "Afsluttet" as const })) }: MatchCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {matches.map((match) => {
        const score = parseCardScore(match.score);

        return (
          <UnifiedCourtCard
            key={match.id}
            court={match.court}
            density="standard"
            leftPlayers={splitCourtTeamName(match.teamA)}
            leftScore={score?.teamA}
            rightPlayers={splitCourtTeamName(match.teamB)}
            rightScore={score?.teamB}
            status={match.status}
            testId="match-court-card"
            testIdPrefix="match-court"
          />
        );
      })}
    </div>
  );
}

function parseCardScore(score: string): { teamA: number; teamB: number } | null {
  const match = score.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);

  if (!match) {
    return null;
  }

  return {
    teamA: Number(match[1]),
    teamB: Number(match[2]),
  };
}
