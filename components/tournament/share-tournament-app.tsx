"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createMockLiveTournamentState, type LiveTournamentState } from "@/lib/live-scoring";
import { createQrCodeMatrix, createShareUrl } from "@/lib/sharing";
import { loadActiveTournament } from "@/lib/tournament-setup";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

export function ShareTournamentApp() {
  const hasHydrated = useHasHydrated();
  const [state, setState] = useState<LiveTournamentState>(() => createMockLiveTournamentState());
  const [origin, setOrigin] = useState("http://localhost:3000");
  const [copyStatus, setCopyStatus] = useState("");
  const shareUrl = useMemo(() => createShareUrl(origin, "/qr"), [origin]);
  const qrCode = useMemo(() => createQrCodeMatrix(shareUrl), [shareUrl]);

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setState(loadActiveTournament() ?? createMockLiveTournamentState());
      setOrigin(window.location.origin);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <div className="app-card p-4 font-bold text-[var(--muted)]">Indlæser deling...</div>;
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopyStatus("Link kopieret.");
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 app-card p-4">
        <div>
          <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Del turnering</p>
          <h2 className="mt-1 text-2xl font-black">{state.tournamentName}</h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">QR-koden åbner spillerens read-only visning.</p>
        </div>

        <QrSvg modules={qrCode.modules} size={qrCode.size} />

        <label className="grid gap-2 text-base font-bold">
          Link
          <input className="min-h-12 rounded-md border border-[var(--line)] bg-gray-50 p-3 font-mono text-sm" readOnly value={shareUrl} />
        </label>

        <div className="action-grid">
          <button className="btn-primary" type="button" onClick={handleCopy}>
            Kopier link
          </button>
          <Link className="btn-outline-primary" href="/qr">
            Åbn QR
          </Link>
          <Link className="btn-outline-primary" href="/tv">
            Åbn TV-skærm
          </Link>
        </div>

        {copyStatus ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{copyStatus}</p> : null}
      </section>
    </div>
  );
}

function QrSvg({ modules, size }: { modules: boolean[][]; size: number }) {
  const quietZone = 4;
  const svgSize = size + quietZone * 2;

  return (
    <svg className="mx-auto h-auto w-full max-w-72 rounded-md bg-white p-3" viewBox={`0 0 ${svgSize} ${svgSize}`} role="img" aria-label="QR-kode til turnering">
      <rect width={svgSize} height={svgSize} fill="white" />
      {modules.map((row, y) =>
        row.map((isDark, x) => (
          isDark ? <rect key={`${x}-${y}`} x={x + quietZone} y={y + quietZone} width="1" height="1" fill="black" /> : null
        )),
      )}
    </svg>
  );
}
