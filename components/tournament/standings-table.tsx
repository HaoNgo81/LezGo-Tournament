"use client";

import { useAppTranslation } from "@/lib/preferences/client";
import type { StandingRow } from "@/lib/tournament-engine";

interface StandingsTableProps {
  standings: StandingRow[];
}

export function StandingsTable({ standings }: StandingsTableProps) {
  const { t } = useAppTranslation();

  return (
    <div className="app-card table-scroll" tabIndex={0}>
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead className="bg-[var(--primary-soft)] text-sm uppercase text-[var(--muted)]">
          <tr>
            <th className="p-3">{t("position")}</th>
            <th className="p-3">{t("name")}</th>
            <th className="p-3">{t("matchPoints")}</th>
            <th className="p-3">{t("scorePoints")}</th>
            <th className="p-3">{t("wins")}</th>
            <th className="p-3">{t("draws")}</th>
            <th className="p-3">{t("losses")}</th>
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
