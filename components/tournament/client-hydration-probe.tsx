"use client";

import { useEffect, useState } from "react";

export function ClientHydrationProbe() {
  const [hydrated, setHydrated] = useState(false);
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="rounded-md border-4 border-purple-700 bg-purple-50 p-4 font-mono text-sm font-black text-purple-950" data-testid="client-hydration-probe">
      <p>CLIENT HYDRATION PROBE</p>
      <p>CLIENT TEST HYDRATED: {hydrated ? "YES" : "NO"}</p>
      <button className="mt-3 rounded-md border border-purple-700 bg-white px-4 py-3" type="button" onClick={() => setClicks((currentClicks) => currentClicks + 1)}>
        CLIENT TEST BUTTON
      </button>
      <p>CLIENT CLICK: {clicks}</p>
    </section>
  );
}
