"use client";

import { useAppTranslation } from "@/lib/preferences/client";
import type { StandingRow } from "@/lib/tournament-engine";

interface StandingsTableProps {
  standings: StandingRow[];
  variant?: "standard" | "compactLive";
}

export function StandingsTable({ standings, variant = "standard" }: StandingsTableProps) {
  const { t } = useAppTranslation();

  if (variant === "compactLive") {
    const mobilePriorityGrid = "grid-cols-[1.45rem_minmax(7rem,1fr)_1.25rem_1.25rem_1.25rem_2rem_2.7rem] min-[360px]:grid-cols-[1.55rem_minmax(8rem,1fr)_1.35rem_1.35rem_1.35rem_2.2rem_2.9rem] min-[390px]:grid-cols-[1.65rem_minmax(9rem,1fr)_1.45rem_1.45rem_1.45rem_2.35rem_3.1rem]";
    const headerGridClass = `${mobilePriorityGrid} gap-0.5 px-1 py-1 text-[0.58rem] sm:grid-cols-[2rem_minmax(12rem,1fr)_2rem_2rem_2rem_3rem_3.6rem] sm:gap-1.5 sm:px-2 sm:py-1.5 sm:text-xs lg:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_2.5rem_2.5rem_3.75rem_4.5rem] lg:gap-2 lg:px-3 lg:py-2 lg:text-sm`;
    const rowGridClass = `${mobilePriorityGrid} gap-0.5 px-1 py-1 sm:grid-cols-[2rem_minmax(12rem,1fr)_2rem_2rem_2rem_3rem_3.6rem] sm:gap-1.5 sm:px-2 sm:py-1.5 lg:grid-cols-[2.5rem_minmax(0,1fr)_2.5rem_2.5rem_2.5rem_3.75rem_4.5rem] lg:gap-2 lg:px-3 lg:py-2`;

    return (
      <div className="app-card overflow-hidden p-0" data-density="compact-live" data-testid="live-compact-standings">
        <div className={`grid bg-[var(--primary-soft)] font-black uppercase text-[var(--primary-strong)] ${headerGridClass}`} data-column-layout="player-priority">
          <span>#</span>
          <span data-testid="live-standings-player-header" style={{ overflowWrap: "normal", wordBreak: "normal" }}>Spiller</span>
          <span className="text-right">V</span>
          <span className="text-right">U</span>
          <span className="text-right">T</span>
          <span className="text-right">MP</span>
          <span className="text-right">Point</span>
        </div>
        {standings.map((row) => (
          <article
            key={row.id}
            aria-label={`${row.rank} ${row.name} V ${row.wins} U ${row.draws} T ${row.losses} MP ${row.matchPoints} Point ${row.pointsFor}`}
            className={`grid min-w-0 items-center border-t border-[var(--line)] ${rowGridClass}`}
            data-column-layout="player-priority"
            data-testid="live-compact-standings-row"
          >
            <span className="text-sm font-black text-[var(--primary-strong)] sm:text-base lg:text-lg">{row.rank}</span>
            <h3 className="min-w-0 text-sm font-black leading-tight sm:text-base lg:text-lg" data-testid="live-standings-player-name" style={{ overflowWrap: "normal", wordBreak: "normal" }}>{row.name}</h3>
            <p className="text-right text-sm font-black text-[var(--muted)] sm:text-base lg:text-lg">{row.wins}</p>
            <p className="text-right text-sm font-black text-[var(--muted)] sm:text-base lg:text-lg">{row.draws}</p>
            <p className="text-right text-sm font-black text-[var(--muted)] sm:text-base lg:text-lg">{row.losses}</p>
            <p className="text-right text-sm font-black text-[var(--muted)] sm:text-base lg:text-lg">{row.matchPoints}</p>
            <p className="text-right text-sm font-black text-[var(--muted)] sm:text-base lg:text-lg">{row.pointsFor}</p>
          </article>
        ))}
      </div>
    );
  }

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
