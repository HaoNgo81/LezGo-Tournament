import type { StandingRow } from "@/lib/tournament-engine";

interface StandingsTableProps {
  standings: StandingRow[];
}

export function StandingsTable({ standings }: StandingsTableProps) {
  return (
    <div className="app-card table-scroll" tabIndex={0}>
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead className="bg-[var(--primary-soft)] text-sm uppercase text-[var(--muted)]">
          <tr>
            <th className="p-3">Placering</th>
            <th className="p-3">Navn</th>
            <th className="p-3">Matchpoint</th>
            <th className="p-3">Scorepoint</th>
            <th className="p-3">Sejre</th>
            <th className="p-3">Uafgjort</th>
            <th className="p-3">Tab</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.id} className="border-t border-[var(--line)]">
              <td className="p-3 font-black">{row.rank}</td>
              <td className="p-3 font-bold">{row.name}</td>
              <td className="p-3">{row.matchPoints}</td>
              <td className="p-3">{row.pointsFor}</td>
              <td className="p-3">{row.wins}</td>
              <td className="p-3">{row.draws}</td>
              <td className="p-3">{row.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

