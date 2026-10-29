"use client";

import { useAppTranslation } from "@/lib/preferences/client";
import { formatPointDifference, type StandingRow } from "@/lib/tournament-engine";

interface StandingsTableProps {
  standings: StandingRow[];
  variant?: "standard" | "compactLive";
}

export function StandingsTable({ standings, variant = "standard" }: StandingsTableProps) {
  const { t } = useAppTranslation();

  if (variant === "compactLive") {
    // Below 360 px the V/U/T columns are hidden so long names (e.g. "Christoffersen") fit next to MP, Point and +/−.
    const mobilePriorityGrid = "grid-cols-[1.45rem_minmax(7.5rem,1fr)_1.9rem_2.4rem_2.3rem] min-[360px]:grid-cols-[1.55rem_minmax(6rem,1fr)_1.3rem_1.3rem_1.3rem_2.1rem_2.6rem_2.5rem] min-[390px]:grid-cols-[1.65rem_minmax(7rem,1fr)_1.4rem_1.4rem_1.4rem_2.25rem_2.8rem_2.7rem]";
    const headerGridClass = `${mobilePriorityGrid} gap-0.5 px-1 py-1 text-[0.58rem] sm:grid-cols-[2rem_minmax(12rem,1fr)_2rem_2rem_2rem_3rem_3.6rem_3.4rem] sm:gap-1.5 sm:px-2 sm:py-1.5 sm:text-xs lg:grid-cols-[1.75rem_minmax(0,1fr)_1.5rem_1.5rem_1.5rem_2.25rem_2.75rem_2.75rem] lg:gap-1.5 xl:grid-cols-[2rem_minmax(0,1fr)_1.75rem_1.75rem_1.75rem_2.75rem_3.5rem_3.25rem] lg:px-3 lg:py-2 lg:text-sm`;
    const rowGridClass = `${mobilePriorityGrid} gap-0.5 px-1 py-1 sm:grid-cols-[2rem_minmax(12rem,1fr)_2rem_2rem_2rem_3rem_3.6rem_3.4rem] sm:gap-1.5 sm:px-2 sm:py-1.5 lg:grid-cols-[1.75rem_minmax(0,1fr)_1.5rem_1.5rem_1.5rem_2.25rem_2.75rem_2.75rem] lg:gap-1.5 xl:grid-cols-[2rem_minmax(0,1fr)_1.75rem_1.75rem_1.75rem_2.75rem_3.5rem_3.25rem] lg:px-3 lg:py-2`;

    return (
      <div className="app-card overflow-hidden p-0" data-density="compact-live" data-testid="live-compact-standings">
        <div className={`grid bg-[var(--primary-soft)] font-black uppercase text-[var(--accent-text)] ${headerGridClass}`} data-column-layout="player-priority">
          <span>#</span>
          <span data-testid="live-standings-player-header" style={{ overflowWrap: "normal", wordBreak: "normal" }}>Spiller</span>
          <span className="hidden text-right min-[360px]:block">V</span>
          <span className="hidden text-right min-[360px]:block">U</span>
          <span className="hidden text-right min-[360px]:block">T</span>
          <span className="text-right">MP</span>
          <span className="text-right">Point</span>
          <span className="text-right" title="Pointdifference">+/−</span>
        </div>
        {standings.map((row) => (
          <article
            key={row.id}
            aria-label={`${row.rank} ${row.name} V ${row.wins} U ${row.draws} T ${row.losses} MP ${row.matchPoints} Point ${row.pointsFor} +/− ${formatPointDifference(row.pointDifference)}`}
            className={`grid min-w-0 items-center border-t border-[var(--line)] ${rowGridClass}`}
            data-column-layout="player-priority"
            data-testid="live-compact-standings-row"
          >
            <span className="text-sm font-black text-[var(--accent-text)] sm:text-base xl:text-lg">{row.rank}</span>
            <h3 className="min-w-0 text-sm font-black leading-tight sm:text-base xl:text-lg" data-testid="live-standings-player-name" style={{ overflowWrap: "normal", wordBreak: "normal" }}>{row.name}</h3>
            <p className="hidden text-right text-sm font-black text-[var(--muted)] min-[360px]:block sm:text-base xl:text-lg">{row.wins}</p>
            <p className="hidden text-right text-sm font-black text-[var(--muted)] min-[360px]:block sm:text-base xl:text-lg">{row.draws}</p>
            <p className="hidden text-right text-sm font-black text-[var(--muted)] min-[360px]:block sm:text-base xl:text-lg">{row.losses}</p>
            <p className="text-right text-sm font-black text-[var(--muted)] sm:text-base xl:text-lg">{row.matchPoints}</p>
            <p className="text-right text-sm font-black text-[var(--muted)] sm:text-base xl:text-lg">{row.pointsFor}</p>
            <p className="text-right text-sm font-black text-[var(--muted)] sm:text-base xl:text-lg" data-testid="live-standings-point-difference">{formatPointDifference(row.pointDifference)}</p>
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
            <th className="p-3">{t("pointDifference")}</th>
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
              <td className="p-3">{formatPointDifference(row.pointDifference)}</td>
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
