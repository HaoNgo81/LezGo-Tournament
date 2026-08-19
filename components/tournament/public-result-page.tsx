"use client";

import Link from "next/link";
import { useAppTranslation } from "@/lib/preferences/client";
import type { PublicResultSnapshot } from "@/lib/results-sharing";

export function PublicResultPage({ snapshot }: { snapshot: PublicResultSnapshot }) {
  const { language, t } = useAppTranslation();
  const participantType = formatParticipantType(snapshot.participantType, language);
  const rankingLabel = snapshot.rankingMode === "matchPointsFirst" ? t("matchPoints").toLowerCase() : t("scorePoints").toLowerCase();

  return (
    <main className="safe-screen">
      <div className="mx-auto grid max-w-4xl gap-5">
        <header className="app-card grid gap-3 p-5 sm:p-6">
          <Link className="text-sm font-black uppercase text-[var(--primary-strong)]" href="/">LEZGO PADEL</Link>
          <div className="grid gap-2">
            <p className="text-sm font-black uppercase text-[var(--primary-strong)]">{t("resultFinalResult")}</p>
            <h1 className="text-3xl font-black leading-tight sm:text-5xl">{snapshot.tournamentName}</h1>
            <p className="font-bold text-[var(--muted)]">
              {snapshot.formatLabel} · {snapshot.participantCount} {participantType} · {snapshot.completedAt ? formatDate(snapshot.completedAt, language) : t("completed")}
            </p>
          </div>
          <p className="rounded-md border border-[var(--line)] bg-[var(--primary-soft)] px-3 py-2 text-sm font-black uppercase text-[var(--primary-strong)]">
            {t("resultCompletedReadOnly")}
          </p>
        </header>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase text-[var(--primary-strong)]">{t("resultFinalResult")}</p>
              <h2 className="text-2xl font-black">{t("finalStandings")}</h2>
            </div>
            <p className="text-sm font-bold text-[var(--muted)]">
              {t("resultSortedBy")} {rankingLabel}.
            </p>
          </div>
          <PublicResultTable snapshot={snapshot} />
        </section>
      </div>
    </main>
  );
}

function PublicResultTable({ snapshot }: { snapshot: PublicResultSnapshot }) {
  const { t, language } = useAppTranslation();
  const hasGroups = snapshot.rows.some((row) => row.groupName);

  return (
    <div className="app-card table-scroll" tabIndex={0}>
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead className="bg-[var(--primary-soft)] text-sm uppercase text-[var(--primary-strong)]">
          <tr>
            <th className="p-3">#</th>
            <th className="p-3">{snapshot.participantType === "pair" ? t("resultPairPlayers") : formatParticipantType(snapshot.participantType, language)}</th>
            {hasGroups ? <th className="p-3">{t("resultGroup")}</th> : null}
            <th className="p-3 text-right">V</th>
            <th className="p-3 text-right">U</th>
            <th className="p-3 text-right">T</th>
            <th className="p-3 text-right">MP</th>
            <th className="p-3 text-right">Point</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--line)]">
              <td className="p-3 text-lg font-black text-[var(--primary-strong)]">{row.rank}</td>
              <td className="max-w-[20rem] p-3 font-black">{row.name}</td>
              {hasGroups ? <td className="p-3 font-bold text-[var(--muted)]">{row.groupName ?? ""}</td> : null}
              <td className="p-3 text-right font-bold">{row.wins ?? "-"}</td>
              <td className="p-3 text-right font-bold">{row.draws ?? "-"}</td>
              <td className="p-3 text-right font-bold">{row.losses ?? "-"}</td>
              <td className="p-3 text-right font-bold">{row.matchPoints ?? "-"}</td>
              <td className="p-3 text-right font-bold">{row.scorePoints ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(value: string, language: "da" | "en"): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "da-DK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatParticipantType(type: PublicResultSnapshot["participantType"], language: "da" | "en"): string {
  switch (type) {
    case "pair":
      return language === "en" ? "pairs" : "par";
    case "team":
      return language === "en" ? "teams" : "hold";
    case "player":
      return language === "en" ? "players" : "spillere";
  }
}
