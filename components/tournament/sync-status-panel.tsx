"use client";

import { useEffect, useState } from "react";
import type { LiveTournamentState } from "@/lib/live-scoring";
import { useAppTranslation } from "@/lib/preferences/client";
import {
  loadShadowSaveMetadata,
  retryStandardTournamentShadowSave,
  retryTeamVsTeamShadowSave,
  shadowSaveMetadataChangedEvent,
  type ShadowSaveKind,
  type ShadowSaveMetadata,
  type TeamVsTeamTournamentState,
} from "@/lib/tournament-setup";

interface AccessProvisionState {
  tournamentCode: string;
  shareToken?: string;
}

export function SyncStatusPanel({
  kind,
  localId,
  state,
}: {
  kind: ShadowSaveKind;
  localId: string;
  state: LiveTournamentState | TeamVsTeamTournamentState;
}) {
  const { t } = useAppTranslation();
  const [metadata, setMetadata] = useState<ShadowSaveMetadata | null>(() => loadShadowSaveMetadata(localId));
  const [accessState, setAccessState] = useState<AccessProvisionState | null>(null);
  const [accessMessage, setAccessMessage] = useState("");
  const [accessIsLoading, setAccessIsLoading] = useState(false);

  useEffect(() => {
    function refresh() {
      setMetadata(loadShadowSaveMetadata(localId));
    }

    refresh();
    window.addEventListener(shadowSaveMetadataChangedEvent, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(shadowSaveMetadataChangedEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [localId]);

  const status = metadata?.status ?? "local-only";
  const copy = getStatusCopy(status);
  const canRetry = status === "error";
  const canProvisionAccess = Boolean(metadata?.supabaseTournamentId);

  function handleRetry() {
    if (kind === "standard") {
      retryStandardTournamentShadowSave(localId, state as LiveTournamentState);
      return;
    }

    retryTeamVsTeamShadowSave(localId, state as TeamVsTeamTournamentState);
  }

  async function handleProvisionAccess() {
    if (!metadata?.supabaseTournamentId) {
      return;
    }

    setAccessIsLoading(true);
    setAccessMessage("");

    try {
      const response = await fetch("/api/supabase/tournament-access/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: metadata.supabaseTournamentId }),
      });
      const body = await response.json() as { ok?: boolean; tournamentCode?: string; shareToken?: string };

      if (!response.ok || !body.ok || !body.tournamentCode) {
        throw new Error("Access provisioning failed.");
      }

      setAccessState({ tournamentCode: body.tournamentCode, shareToken: body.shareToken });
      setAccessMessage(body.shareToken ? t("remoteAccessReady") : t("remoteTokenOnlyShownOnce"));
    } catch {
      setAccessMessage(t("remoteFetchError"));
    } finally {
      setAccessIsLoading(false);
    }
  }

  async function copyValue(value: string, message: string) {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setAccessMessage(message);
  }

  return (
    <div className={`rounded-md border p-3 text-sm font-bold ${copy.className}`} aria-label="Sync status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-black">{copy.label}</p>
          <p className="mt-1 text-xs opacity-80">{getStatusDetail(metadata, localId)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canProvisionAccess ? (
            <button className="rounded-md border border-current px-3 py-2 text-sm font-black disabled:opacity-50" type="button" disabled={accessIsLoading} onClick={handleProvisionAccess}>
              {t("remoteAccessInfo")}
            </button>
          ) : null}
          {canRetry ? (
            <button className="rounded-md border border-current px-3 py-2 text-sm font-black" type="button" onClick={handleRetry}>
              Prøv igen
            </button>
          ) : null}
        </div>
      </div>
      {accessState ? (
        <div className="mt-3 grid gap-3 border-t border-current/20 pt-3 text-xs">
          <p>{t("remoteAccessOnlyInitialToken")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-current/20 bg-white/60 p-3">
              <p className="font-black">{t("remoteTournamentCode")}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <code className="font-mono text-sm">{accessState.tournamentCode}</code>
                <button className="rounded-md border border-current px-2 py-1 font-black" type="button" onClick={() => copyValue(accessState.tournamentCode, t("remoteCodeCopied"))}>
                  {t("remoteCopy")}
                </button>
              </div>
            </div>
            <div className="rounded-md border border-current/20 bg-white/60 p-3">
              <p className="font-black">{t("remoteShareToken")}</p>
              {accessState.shareToken ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <code className="min-w-0 truncate font-mono text-sm">************</code>
                  <button className="rounded-md border border-current px-2 py-1 font-black" type="button" onClick={() => copyValue(accessState.shareToken ?? "", t("remoteShareTokenCopied"))}>
                    {t("remoteCopy")}
                  </button>
                </div>
              ) : (
                <p className="mt-2 font-bold opacity-80">{t("remoteTokenOnlyShownOnce")}</p>
              )}
            </div>
          </div>
          <p>{t("remoteQrFuture")}</p>
        </div>
      ) : null}
      {accessMessage ? <p className="mt-3 border-t border-current/20 pt-3 text-xs font-black">{accessMessage}</p> : null}
      {status === "conflict" ? (
        <div className="mt-3 grid gap-1 border-t border-current/20 pt-3 text-xs">
          <p>Lokal turnering er stadig intakt. Supabase er ikke overskrevet.</p>
          <p>Lokal ID: {localId}</p>
          <p>Supabase UUID: {metadata?.supabaseTournamentId ?? "Mangler"}</p>
          <p>Lokal gemt: {formatSyncTime(metadata?.lastLocalSaveAt)}</p>
          <p>Supabase version: {formatSyncTime(metadata?.lastShadowSaveVersion)}</p>
        </div>
      ) : null}
    </div>
  );
}

function getStatusCopy(status: ShadowSaveMetadata["status"] | "local-only"): { label: string; className: string } {
  switch (status) {
    case "syncing":
      return { label: "Synkroniserer...", className: "border-blue-200 bg-blue-50 text-blue-800" };
    case "synced":
      return { label: "Synkroniseret", className: "border-green-200 bg-green-50 text-[var(--primary-strong)]" };
    case "error":
      return { label: "Synkronisering fejlede", className: "border-yellow-200 bg-yellow-50 text-yellow-800" };
    case "conflict":
      return { label: "Konflikt kræver handling", className: "border-red-200 bg-red-50 text-red-700" };
    case "local-only":
      return { label: "Kun gemt lokalt", className: "border-[var(--line)] bg-gray-50 text-[var(--muted)]" };
  }
}

function getStatusDetail(metadata: ShadowSaveMetadata | null, localId: string): string {
  if (!metadata) {
    return `Lokal ID: ${localId}`;
  }

  if (metadata.status === "synced") {
    return `Sidst synkroniseret: ${formatSyncTime(metadata.lastSuccessfulShadowSaveAt)} · ${metadata.supabaseTournamentId ?? "Supabase UUID mangler"}`;
  }

  if (metadata.status === "error") {
    return `${metadata.lastError ?? "Supabase kunne ikke nås."} · Lokal gem er bevaret.`;
  }

  if (metadata.status === "syncing") {
    return `Lokal gem: ${formatSyncTime(metadata.lastLocalSaveAt)}`;
  }

  if (metadata.status === "conflict") {
    return metadata.lastError ?? "Supabase har en nyere version.";
  }

  return `Lokal ID: ${localId}`;
}

function formatSyncTime(value?: string): string {
  if (!value) {
    return "Ukendt";
  }

  return new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
