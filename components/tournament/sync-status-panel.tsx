"use client";

import { useEffect, useState } from "react";
import type { LiveTournamentState } from "@/lib/live-scoring";
import { useAppTranslation } from "@/lib/preferences/client";
import { createQrCodeMatrix, type QrCodeMatrix } from "@/lib/sharing";
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
  revoked?: boolean;
}

interface HandoffProvisionState {
  handoffUrl: string;
  expiresAt: string;
  qrCode: QrCodeMatrix;
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
  const [handoffState, setHandoffState] = useState<HandoffProvisionState | null>(null);
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
  const canManageAccess = Boolean(metadata?.supabaseTournamentId && metadata?.organizerToken);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const scoreEntryUrl = origin && accessState?.tournamentCode ? createRemoteUrl(origin, { code: accessState.tournamentCode }) : "";
  const tvHandoffUrl = handoffState?.handoffUrl ? withRemoteDisplayMode(handoffState.handoffUrl, "scoreboard") : "";
  const tvQrCode = tvHandoffUrl ? createQrCodeMatrix(tvHandoffUrl) : null;

  function handleRetry() {
    if (kind === "standard") {
      retryStandardTournamentShadowSave(localId, state as LiveTournamentState);
      return;
    }

    retryTeamVsTeamShadowSave(localId, state as TeamVsTeamTournamentState);
  }

  async function handleProvisionAccess() {
    if (!metadata?.supabaseTournamentId || !metadata.organizerToken) {
      setAccessMessage(t("remoteOrganizerSyncRequired"));
      return;
    }

    setAccessIsLoading(true);
    setAccessMessage("");

    try {
      const response = await fetch("/api/supabase/tournament-access/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: metadata.supabaseTournamentId, organizerToken: metadata.organizerToken }),
      });
      const body = await response.json() as { ok?: boolean; tournamentCode?: string; shareToken?: string };

      if (!response.ok || !body.ok || !body.tournamentCode) {
        throw new Error("Access provisioning failed.");
      }

      setAccessState({ tournamentCode: body.tournamentCode, shareToken: body.shareToken, revoked: false });
      setAccessMessage(body.shareToken ? t("remoteAccessReady") : t("remoteTokenOnlyShownOnce"));
    } catch {
      setAccessMessage(t("remoteFetchError"));
    } finally {
      setAccessIsLoading(false);
    }
  }

  async function handleProvisionHandoff() {
    if (!metadata?.supabaseTournamentId || !metadata.organizerToken) {
      setAccessMessage(t("remoteOrganizerSyncRequired"));
      return;
    }

    setAccessIsLoading(true);
    setAccessMessage("");

    try {
      const response = await fetch("/api/supabase/tournament-handoff/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: metadata.supabaseTournamentId, organizerToken: metadata.organizerToken }),
      });
      const body = await response.json() as { ok?: boolean; handoffUrl?: string; expiresAt?: string };

      if (!response.ok || !body.ok || !body.handoffUrl || !body.expiresAt) {
        throw new Error("Handoff provisioning failed.");
      }

      setHandoffState({
        handoffUrl: body.handoffUrl,
        expiresAt: body.expiresAt,
        qrCode: createQrCodeMatrix(body.handoffUrl),
      });
      setAccessMessage(t("remoteQrReady"));
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

  async function handleRevokeAccess() {
    if (!metadata?.supabaseTournamentId || !metadata.organizerToken || !accessState?.tournamentCode) {
      setAccessMessage(t("remoteOrganizerSyncRequired"));
      return;
    }

    setAccessIsLoading(true);
    setAccessMessage("");

    try {
      const response = await fetch("/api/supabase/tournament-access/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: metadata.supabaseTournamentId,
          tournamentCode: accessState.tournamentCode,
          organizerToken: metadata.organizerToken,
        }),
      });
      const body = await response.json() as { ok?: boolean };

      if (!response.ok || !body.ok) {
        throw new Error("Access revoke failed.");
      }

      setAccessState((current) => current ? { ...current, shareToken: undefined, revoked: true } : current);
      setAccessMessage(t("remoteAccessRevoked"));
    } catch {
      setAccessMessage(t("remoteFetchError"));
    } finally {
      setAccessIsLoading(false);
    }
  }

  return (
    <div className={`rounded-md border p-3 text-sm font-bold ${copy.className}`} aria-label="Sync status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-black">{t("remoteUnifiedShareTitle")}</p>
          <p className="mt-1 text-xs font-black">{copy.label}</p>
          <p className="mt-1 text-xs opacity-80">{getStatusDetail(metadata, localId)}</p>
          {canProvisionAccess && !canManageAccess ? <p className="mt-1 text-xs font-black text-yellow-800">{t("remoteOrganizerSyncRequired")}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canProvisionAccess ? (
            <>
              <button className="rounded-md border border-current px-3 py-2 text-sm font-black disabled:opacity-50" type="button" disabled={accessIsLoading || !canManageAccess} onClick={handleProvisionHandoff}>
                {handoffState ? t("remoteGenerateNewQr") : t("remoteTvLiveScore")}
              </button>
              <button className="rounded-md border border-current px-3 py-2 text-sm font-black disabled:opacity-50" type="button" disabled={accessIsLoading || !canManageAccess} onClick={handleProvisionAccess}>
                {accessState && !accessState.shareToken ? t("remoteGenerateNewAccessCode") : t("remoteScoreEntryAccess")}
              </button>
            </>
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
          <div className="grid gap-1">
            <p className="text-sm font-black">{t("remoteScoreEntryAccess")}</p>
            <p>{accessState.revoked ? t("remoteAccessRevoked") : t("remoteScoreEntryWarning")}</p>
            <p>{t("remoteAccessOnlyInitialToken")}</p>
          </div>
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
                  <code className="font-mono text-xl font-black tracking-widest">{accessState.shareToken}</code>
                  <button className="rounded-md border border-current px-2 py-1 font-black" type="button" onClick={() => copyValue(accessState.shareToken ?? "", t("remoteShareTokenCopied"))}>
                    {t("remoteCopy")}
                  </button>
                </div>
              ) : (
                <p className="mt-2 font-bold opacity-80">{t("remoteTokenOnlyShownOnce")}</p>
              )}
            </div>
          </div>
          {scoreEntryUrl ? (
            <div className="rounded-md border border-current/20 bg-white/60 p-3">
              <p className="font-black">{t("remoteScoreEntryLink")}</p>
              <input className="mt-2 min-h-12 w-full rounded-md border border-current/20 bg-white/70 p-3 font-mono text-xs" readOnly value={scoreEntryUrl} />
              <button className="mt-2 rounded-md border border-current px-3 py-2 font-black" type="button" onClick={() => copyValue(scoreEntryUrl, t("remoteHandoffLinkCopied"))}>
                {t("copyLink")}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md border border-current px-3 py-2 font-black disabled:opacity-50" type="button" disabled={accessIsLoading || !canManageAccess} onClick={handleProvisionAccess}>
              {t("remoteGenerateNewAccessCode")}
            </button>
            <button className="rounded-md border border-red-600 px-3 py-2 font-black text-red-700 disabled:opacity-50" type="button" disabled={accessIsLoading || !canManageAccess || !accessState.tournamentCode || accessState.revoked} onClick={handleRevokeAccess}>
              {t("remoteRevokeAccess")}
            </button>
          </div>
        </div>
      ) : null}
      {handoffState && tvQrCode ? (
        <div className="mt-3 grid gap-3 border-t border-current/20 pt-3 text-xs">
          <div>
            <p className="font-black">{t("remoteTvLiveScore")}</p>
            <p className="mt-1 opacity-80">{t("remoteTvReadOnlyHelp")}</p>
            <p className="mt-1 opacity-80">{t("remoteQrValidTenMinutes")}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(180px,260px)_1fr] md:items-center">
            <QrSvg modules={tvQrCode.modules} size={tvQrCode.size} label={t("remoteQrAlt")} />
            <div className="grid gap-2">
              <p className="font-black">{t("remoteQrExpiresAt")}: {formatSyncTime(handoffState.expiresAt)}</p>
              <input className="min-h-12 rounded-md border border-current/20 bg-white/70 p-3 font-mono text-xs" readOnly value={tvHandoffUrl} />
              <div className="action-grid">
                <button className="rounded-md border border-current px-3 py-2 font-black" type="button" onClick={() => copyValue(tvHandoffUrl, t("remoteHandoffLinkCopied"))}>
                  {t("copyLink")}
                </button>
                <button className="rounded-md border border-current px-3 py-2 font-black disabled:opacity-50" type="button" disabled={accessIsLoading} onClick={handleProvisionHandoff}>
                  {t("remoteGenerateNewQr")}
                </button>
              </div>
            </div>
          </div>
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

function QrSvg({ modules, size, label }: { modules: boolean[][]; size: number; label: string }) {
  const quietZone = 4;
  const svgSize = size + quietZone * 2;

  return (
    <svg className="mx-auto h-auto w-full max-w-64 rounded-md bg-white p-3 shadow-sm" viewBox={`0 0 ${svgSize} ${svgSize}`} role="img" aria-label={label}>
      <rect width={svgSize} height={svgSize} fill="white" />
      {modules.map((row, y) =>
        row.map((isDark, x) => (
          isDark ? <rect key={`${x}-${y}`} x={x + quietZone} y={y + quietZone} width="1" height="1" fill="black" /> : null
        )),
      )}
    </svg>
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

function createRemoteUrl(origin: string, options: { code?: string; display?: "tv" | "scoreboard" }): string {
  const url = new URL("/remote", origin);

  if (options.code) {
    url.searchParams.set("code", options.code);
  }

  if (options.display) {
    url.searchParams.set("display", options.display);
  }

  return url.toString();
}

function withRemoteDisplayMode(value: string, display: "tv" | "scoreboard"): string {
  const url = new URL(value);
  url.searchParams.set("display", display);
  return url.toString();
}
