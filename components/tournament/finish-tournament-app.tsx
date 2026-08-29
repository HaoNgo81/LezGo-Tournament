"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createMockLiveTournamentState,
  finishTournament,
  type LiveTournamentState,
} from "@/lib/live-scoring";
import { createTournamentResultFileName, createTournamentResultPdf } from "@/lib/results-export";
import {
  createStandardShadowSaveLocalId,
  loadActiveCloudTournamentAuthority,
  loadActiveTournament,
  loadShadowSaveMetadata,
  markActiveCloudTournamentAuthority,
  markCloudTournamentRestored,
  markRemoteShadowSaveApplied,
  saveActiveTournament,
  saveActiveTournamentFromRemoteSync,
  saveCompletedTournament,
  type CloudTournamentAuthority,
} from "@/lib/tournament-setup";
import { CompletedTournamentResults, formatFinishedTournamentSummary, getRankingModeLabelKey } from "@/components/tournament/completed-tournament-results";
import { ResultSharePanel } from "@/components/tournament/result-share-panel";
import { useAppTranslation } from "@/lib/preferences/client";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

interface ShadowSaveWriteResponse {
  ok?: boolean;
  conflict?: boolean;
  kind?: "standard" | "team-vs-team";
  state?: LiveTournamentState;
  tournamentId?: string;
  updatedAt?: string;
  matchScoreVersions?: Record<string, number>;
  error?: string;
}

export function FinishTournamentApp() {
  const { t } = useAppTranslation();
  const [state, setState] = useState<LiveTournamentState>(() => createMockLiveTournamentState());
  const [cloudAuthority, setCloudAuthority] = useState<CloudTournamentAuthority | null>(null);
  const [message, setMessage] = useState("");
  const finishInFlightRef = useRef(false);
  const hasHydrated = useHasHydrated();
  const isFinished = state.status === "finished";

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const loadedState = loadActiveTournament() ?? createMockLiveTournamentState();
      const localId = createStandardShadowSaveLocalId(loadedState);
      setState(loadedState);
      setCloudAuthority(loadActiveCloudTournamentAuthority("standard", localId));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <div className="app-card p-4 font-bold text-[var(--muted)]">{t("loadingTournament")}</div>;
  }

  async function handleFinish() {
    if (finishInFlightRef.current) {
      return;
    }

    finishInFlightRef.current = true;

    try {
      const finishedState = finishTournament(state);

      if (!await saveControlledFinishSnapshot(finishedState)) {
        return;
      }

      saveCompletedTournament(finishedState);
      setState(finishedState);
    } finally {
      finishInFlightRef.current = false;
    }
  }

  async function saveControlledFinishSnapshot(finishedState: LiveTournamentState): Promise<boolean> {
    const localId = createStandardShadowSaveLocalId(state);
    const metadata = loadShadowSaveMetadata(localId);

    if (!metadata?.supabaseTournamentId || metadata.kind !== "standard") {
      saveActiveTournament(finishedState);
      return true;
    }

    if (cloudAuthority?.canManage === false || metadata.canManage === false) {
      setMessage(t("remoteControlledByOtherUser"));
      return false;
    }

    const response = await fetch("/api/supabase/shadow-save", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "standard",
        legacyLocalId: metadata.legacyLocalId ?? localId,
        tournamentId: metadata.supabaseTournamentId,
        expectedUpdatedAt: metadata.lastShadowSaveVersion,
        state: finishedState,
      }),
    });
    const body = await parseShadowSaveWriteResponse(response);

    if (response.status === 401 || response.status === 403) {
      await reconcileControlLost(localId, metadata.supabaseTournamentId);
      setMessage(t("remoteControlledByOtherUser"));
      return false;
    }

    if (response.status === 409) {
      await reconcileSameControllerConflict(localId, metadata.supabaseTournamentId, body);
      setMessage(t("ownerTournamentConflictMessage"));
      return false;
    }

    if (!response.ok || !body.ok || !body.tournamentId) {
      setMessage(body.error ?? "Synchronization failed. Local tournament is preserved.");
      return false;
    }

    saveActiveTournamentFromRemoteSync(finishedState);
    markRemoteShadowSaveApplied(localId, "standard", body.updatedAt, new Date().toISOString(), body.matchScoreVersions);
    return true;
  }

  async function reconcileSameControllerConflict(localId: string, tournamentId: string, conflictBody: ShadowSaveWriteResponse): Promise<void> {
    if (conflictBody.kind === "standard" && conflictBody.state && conflictBody.updatedAt) {
      saveActiveTournamentFromRemoteSync(conflictBody.state);
      markRemoteShadowSaveApplied(localId, "standard", conflictBody.updatedAt, new Date().toISOString(), conflictBody.matchScoreVersions);
      setState(conflictBody.state);
      return;
    }

    try {
      const response = await fetch(`/api/account/tournaments/${encodeURIComponent(tournamentId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json() as { ok?: boolean; kind?: "standard"; state?: LiveTournamentState; updatedAt?: string; matchScoreVersions?: Record<string, number> };

      if (response.ok && body.ok && body.kind === "standard" && body.state) {
        saveActiveTournamentFromRemoteSync(body.state);
        markRemoteShadowSaveApplied(localId, "standard", body.updatedAt, new Date().toISOString(), body.matchScoreVersions);
        setState(body.state);
      }
    } catch {
      // The stale finish was rejected server-side; the current page remains unchanged until refresh succeeds.
    }
  }

  async function reconcileControlLost(localId: string, tournamentId: string): Promise<void> {
    try {
      const response = await fetch(`/api/account/tournaments/${encodeURIComponent(tournamentId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json() as { ok?: boolean; kind?: "standard"; state?: LiveTournamentState; updatedAt?: string; matchScoreVersions?: Record<string, number> };

      if (response.ok && body.ok && body.kind === "standard" && body.state) {
        saveActiveTournamentFromRemoteSync(body.state);
        markCloudTournamentRestored({
          localId,
          legacyLocalId: localId,
          kind: "standard",
          tournamentId,
          updatedAt: body.updatedAt,
          canManage: false,
          matchScoreVersions: body.matchScoreVersions,
        });
        setState(body.state);
      }
    } catch {
      // Losing control should still remove finish authority even if refresh fails.
    } finally {
      const authority: CloudTournamentAuthority = {
        ...(cloudAuthority ?? {
          source: "server",
          kind: "standard",
          localId,
          tournamentId,
          canRead: true,
          canManage: true,
        }),
        source: "server",
        kind: "standard",
        localId,
        tournamentId,
        canRead: true,
        canManage: false,
      };
      markActiveCloudTournamentAuthority(authority);
      setCloudAuthority(authority);
    }
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
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{isFinished ? t("completedTournament") : t("finishTournament")}</p>
        <h2 className="text-2xl font-black">{state.tournamentName}</h2>
        <p className="text-sm font-bold text-[var(--muted)]">
          {formatFinishedTournamentSummary(state, t)}
        </p>
        {!isFinished ? <p className="text-sm font-bold text-[var(--muted)]">
          {t("finalStandings")} sorteres efter {t(getRankingModeLabelKey(state)).toLocaleLowerCase("da")}.
        </p> : null}
        {!isFinished ? <div className="action-grid">
          <Link className="btn-secondary min-h-14 text-lg" href="/live">
            {t("editScore")}
          </Link>
          <button className="btn-outline-primary min-h-14 text-lg" type="button" onClick={handleDownloadPdf}>
            Download PDF
          </button>
          <button className="min-h-14 rounded-md bg-red-600 px-5 text-lg font-black text-white disabled:bg-gray-300" type="button" disabled={isFinished || cloudAuthority?.canManage === false} onClick={() => void handleFinish()}>
            {isFinished ? t("completed") : t("finishTournament")}
          </button>
        </div> : (
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline-primary min-h-12 px-4 text-base" type="button" onClick={handleDownloadPdf}>
              Download PDF
            </button>
            <ResultSharePanel state={state} />
          </div>
        )}
        {message ? <p className="rounded-md bg-yellow-50 p-3 font-bold text-yellow-900">{message}</p> : null}
      </section>

      <CompletedTournamentResults state={state} t={t} />
    </div>
  );
}

async function parseShadowSaveWriteResponse(response: Response): Promise<ShadowSaveWriteResponse> {
  try {
    return await response.json() as ShadowSaveWriteResponse;
  } catch {
    return { ok: false, error: "Synchronization failed. Local tournament is preserved." };
  }
}
