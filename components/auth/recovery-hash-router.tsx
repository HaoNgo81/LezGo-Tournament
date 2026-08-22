"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RecoveryHashRouter() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;

    if (!isSupabaseRecoveryHash(hash)) {
      return;
    }

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    router.replace(`/auth/reset${hash}`);
  }, [router]);

  return null;
}

function isSupabaseRecoveryHash(hash: string): boolean {
  if (!hash) {
    return false;
  }

  const params = new URLSearchParams(hash.slice(1));
  return params.get("type") === "recovery" && Boolean(params.get("access_token"));
}
