"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations?.()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      return;
    }

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    void navigator.serviceWorker.register(`${basePath}/sw.js`);
  }, []);

  return null;
}
