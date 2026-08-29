"use client";

import { useState } from "react";
import type { LiveTournamentState } from "@/lib/live-scoring";
import { normalizePublicResultUrl } from "@/lib/results-sharing/result-url";
import { createStandardShadowSaveLocalId, loadShadowSaveMetadata } from "@/lib/tournament-setup";
import { useAppTranslation } from "@/lib/preferences/client";

interface PublishPublicResultResponse {
  ok: boolean;
  resultId?: string;
  resultUrl?: string;
  error?: string;
}

export function ResultSharePanel({ state }: { state: LiveTournamentState }) {
  const { t } = useAppTranslation();
  const [isPublishing, setIsPublishing] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [message, setMessage] = useState("");

  if (state.status !== "finished") {
    return null;
  }

  async function publishResult(): Promise<string | null> {
    if (resultUrl) {
      return resultUrl;
    }

    const localId = createStandardShadowSaveLocalId(state);
    const metadata = loadShadowSaveMetadata(localId);

    if (!metadata?.supabaseTournamentId || !metadata.organizerToken) {
      setMessage(t("resultShareSyncRequired"));
      return null;
    }

    setIsPublishing(true);
    setMessage("");

    try {
      const response = await fetch("/api/supabase/result-snapshots/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "standard",
          legacyLocalId: localId,
          organizerToken: metadata.organizerToken,
          tournamentId: metadata.supabaseTournamentId,
          state,
        }),
      });
      const body = await parsePublishResponse(response);

      if (!response.ok || !body.ok || !body.resultUrl || !body.resultId) {
        throw new Error(body.error ?? "Could not publish result.");
      }

      const publicResultUrl = normalizePublicResultUrl(body.resultUrl, body.resultId, window.location.origin);

      setResultUrl(publicResultUrl);
      setMessage(t("resultShareReady"));
      return publicResultUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("resultShareError"));
      return null;
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleCopyLink() {
    const url = await publishResult();

    if (!url) {
      return;
    }

    await copyToClipboard(url);
    setMessage(t("linkCopied"));
  }

  async function handleNativeShare() {
    const url = await publishResult();

    if (!url) {
      return;
    }

    if (navigator.share) {
      await navigator.share({
        title: state.tournamentName,
        url,
      });
      return;
    }

    await copyToClipboard(url);
    setMessage(t("linkCopied"));
  }

  async function handleDisableSharing() {
    const localId = createStandardShadowSaveLocalId(state);
    const metadata = loadShadowSaveMetadata(localId);

    if (!metadata?.supabaseTournamentId || !metadata.organizerToken) {
      setMessage(t("resultShareSyncRequired"));
      return;
    }

    setIsPublishing(true);
    setMessage("");

    try {
      const response = await fetch("/api/supabase/result-snapshots/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "standard",
          legacyLocalId: localId,
          organizerToken: metadata.organizerToken,
          tournamentId: metadata.supabaseTournamentId,
        }),
      });
      const body = await parsePublishResponse(response);

      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "Could not disable public result sharing.");
      }

      setResultUrl("");
      setMessage("Deling slået fra.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("resultShareError"));
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="grid min-w-0 flex-1 gap-2" aria-label="Del turnering">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary min-h-12 px-4 text-base" type="button" disabled={isPublishing} onClick={handleNativeShare}>
          {isPublishing ? t("remoteScoreSaving") : "Del turnering"}
        </button>
        <button className="btn-outline-primary min-h-12 px-4 text-base" type="button" disabled={isPublishing} onClick={handleCopyLink}>
          {t("copyLink")}
        </button>
        {resultUrl ? (
          <button className="btn-secondary min-h-12 px-4 text-base" type="button" disabled={isPublishing} onClick={handleDisableSharing}>
            Slå deling fra
          </button>
        ) : null}
      </div>

      {resultUrl ? (
        <div className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <code className="break-all rounded-md bg-white px-3 py-2 text-sm font-bold text-[var(--foreground)]">{resultUrl}</code>
        </div>
      ) : null}

      {message ? <p className="text-sm font-black text-[var(--primary-strong)]">{message}</p> : null}
    </div>
  );
}

async function parsePublishResponse(response: Response): Promise<PublishPublicResultResponse> {
  try {
    return await response.json() as PublishPublicResultResponse;
  } catch {
    return { ok: false, error: "Invalid result share response." };
  }
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  }
}
