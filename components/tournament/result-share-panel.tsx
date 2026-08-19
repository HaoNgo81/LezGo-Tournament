"use client";

import { useMemo, useState } from "react";
import type { LiveTournamentState } from "@/lib/live-scoring";
import { createQrCodeMatrix } from "@/lib/sharing";
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
  const [showQr, setShowQr] = useState(false);
  const qrCode = useMemo(() => (resultUrl ? createQrCodeMatrix(resultUrl) : null), [resultUrl]);

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

      if (!response.ok || !body.ok || !body.resultUrl) {
        throw new Error(body.error ?? "Could not publish result.");
      }

      setResultUrl(body.resultUrl);
      setMessage(t("resultShareReady"));
      return body.resultUrl;
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

    await navigator.clipboard.writeText(url);
    setMessage(t("linkCopied"));
  }

  async function handleNativeShare() {
    const url = await publishResult();

    if (!url) {
      return;
    }

    if (navigator.share) {
      await navigator.share({
        title: `${t("resultFinalResult")}: ${state.tournamentName}`,
        url,
      });
      return;
    }

    await navigator.clipboard.writeText(url);
    setMessage(t("linkCopied"));
  }

  async function handleShowQr() {
    const url = await publishResult();

    if (url) {
      setShowQr(true);
    }
  }

  return (
    <section className="app-card grid gap-3 border-[var(--primary)] bg-[var(--primary-soft)]/35 p-4" aria-label={t("resultShareTitle")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase text-[var(--primary-strong)]">{t("resultShareTitle")}</p>
          <h3 className="text-xl font-black">{t("resultFinalResult")}</h3>
          <p className="text-sm font-bold text-[var(--muted)]">{t("resultShareHelp")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" type="button" disabled={isPublishing} onClick={handleNativeShare}>
            {isPublishing ? t("remoteScoreSaving") : t("resultShareButton")}
          </button>
          <button className="btn-outline-primary" type="button" disabled={isPublishing} onClick={handleShowQr}>
            {t("resultShowQr")}
          </button>
          <button className="btn-outline-primary" type="button" disabled={isPublishing} onClick={handleCopyLink}>
            {t("copyLink")}
          </button>
        </div>
      </div>

      {resultUrl ? (
        <div className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="text-sm font-black uppercase text-[var(--primary-strong)]">{t("resultPublicLink")}</p>
          <code className="break-all rounded-md bg-white px-3 py-2 text-sm font-bold text-[var(--foreground)]">{resultUrl}</code>
        </div>
      ) : null}

      {showQr && qrCode ? (
        <div className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 sm:grid-cols-[auto_1fr]">
          <QrSvg modules={qrCode.modules} size={qrCode.size} label={t("resultQrAlt")} />
          <div className="grid content-start gap-2">
            <p className="font-black">{t("resultQrHelp")}</p>
            <p className="text-sm font-bold text-[var(--muted)]">{t("resultReadOnlyHelp")}</p>
            <button className="btn-outline-primary" type="button" onClick={() => setShowQr(false)}>
              {t("close")}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="text-sm font-black text-[var(--primary-strong)]">{message}</p> : null}
    </section>
  );
}

async function parsePublishResponse(response: Response): Promise<PublishPublicResultResponse> {
  try {
    return await response.json() as PublishPublicResultResponse;
  } catch {
    return { ok: false, error: "Invalid result share response." };
  }
}

function QrSvg({ modules, size, label }: { modules: boolean[][]; size: number; label: string }) {
  const quietZone = 4;
  const viewBoxSize = size + quietZone * 2;

  return (
    <svg className="h-auto w-full max-w-[14rem] rounded-md bg-white p-2" role="img" aria-label={label} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} shapeRendering="crispEdges">
      <rect width={viewBoxSize} height={viewBoxSize} fill="#fff" />
      {modules.map((row, y) =>
        row.map((filled, x) => (filled ? <rect key={`${x}-${y}`} x={x + quietZone} y={y + quietZone} width="1" height="1" fill="#111" /> : null)),
      )}
    </svg>
  );
}
