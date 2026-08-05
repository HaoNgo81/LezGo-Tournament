"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  calculateLiveStandings,
  createMockLiveTournamentState,
  finishTournament,
  type LiveTournamentState,
} from "@/lib/live-scoring";
import { createTournamentResultFileName, createTournamentResultPdf } from "@/lib/results-export";
import {
  loadActiveTournament,
  saveActiveTournament,
  saveCompletedTournament,
} from "@/lib/tournament-setup";
import { StandingsTable } from "@/components/tournament/standings-table";

const rankingModeLabels = {
  matchPointsFirst: "Flest matchpoint",
  partiPointsFirst: "Flest partipoint",
} as const;

export function FinishTournamentApp() {
  const [state, setState] = useState<LiveTournamentState>(() => loadActiveTournament() ?? createMockLiveTournamentState());
  const standings = useMemo(() => calculateLiveStandings(state), [state]);
  const isFinished = state.status === "finished";

  function handleFinish() {
    const finishedState = finishTournament(state);
    saveActiveTournament(finishedState);
    saveCompletedTournament(finishedState);
    setState(finishedState);
  }

  function handleDownloadPdf() {
    const pdf = createTournamentResultPdf(state);
    const pdfBytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = createTournamentResultFileName(state);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-5">
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{isFinished ? "Turneringen er afsluttet" : "Afslut turnering"}</p>
        <h2 className="text-2xl font-black">{state.tournamentName}</h2>
        <p className="text-sm font-bold text-[var(--muted)]">
          Slutstilling sorteres efter {rankingModeLabels[state.rankingMode].toLocaleLowerCase("da")}. Resultater kan stadig rettes fra live-skærmen efter afslutning.
        </p>
        <div className="action-grid">
          <Link className="btn-secondary min-h-14 text-lg" href="/live">
            Ret resultater
          </Link>
          <button className="btn-outline-primary min-h-14 text-lg" type="button" onClick={handleDownloadPdf}>
            Download PDF
          </button>
          <button className="min-h-14 rounded-md bg-red-600 px-5 text-lg font-black text-white disabled:bg-gray-300" type="button" disabled={isFinished} onClick={handleFinish}>
            {isFinished ? "Afsluttet" : "Afslut turnering nu"}
          </button>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-xl font-black">Slutstilling</h2>
        <StandingsTable standings={standings} />
      </section>
    </div>
  );
}
