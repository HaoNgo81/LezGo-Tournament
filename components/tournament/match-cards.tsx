import { mockMatches } from "@/lib/mock/tournament-data";
import type { ReadOnlyMatchCard } from "@/lib/read-only-views";

interface MatchCardsProps {
  matches?: ReadOnlyMatchCard[];
}

export function MatchCards({ matches = mockMatches.map((match) => ({ ...match, id: match.court, status: "Afsluttet" as const })) }: MatchCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {matches.map((match) => (
        <article key={match.id} className="app-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black">{match.court}</h3>
            <span className={`rounded-md px-3 py-1 text-sm font-bold ${match.status === "Afsluttet" ? "bg-green-100 text-[var(--primary-strong)]" : match.status === "I gang" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-[var(--muted)]"}`}>
              {match.score}
            </span>
          </div>
          <p className="mt-4 text-lg font-bold leading-7">
            <span>{match.teamA}</span>{" "}
            <span className="text-[var(--muted)]">vs</span>{" "}
            <span>{match.teamB}</span>
          </p>
        </article>
      ))}
    </div>
  );
}

