import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type ServiceWorkerHandler = (event: { data?: unknown; request?: Request; respondWith?: (promise: Promise<unknown>) => void; waitUntil?: (promise: Promise<unknown>) => void }) => void;

function runServiceWorkerScript(hostname: string) {
  const handlers = new Map<string, ServiceWorkerHandler>();
  const cacheDelete = vi.fn().mockResolvedValue(true);
  const cacheAddAll = vi.fn().mockResolvedValue(undefined);
  const cacheOpen = vi.fn().mockResolvedValue({ addAll: cacheAddAll });
  const fetch = vi.fn().mockResolvedValue(new Response("ok"));
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const claim = vi.fn().mockResolvedValue(undefined);
  const unregister = vi.fn().mockResolvedValue(true);
  const context = {
    Request,
    Response,
    URL,
    caches: {
      delete: cacheDelete,
        keys: vi.fn().mockResolvedValue(["lezgo-padel-v1", "lezgo-padel-v2", "lezgo-padel-v3", "lezgo-padel-v4", "lezgo-padel-v5"]),
      match: vi.fn().mockResolvedValue(new Response("cached")),
      open: cacheOpen,
    },
    fetch,
    self: {
      addEventListener: (eventName: string, handler: ServiceWorkerHandler) => {
        handlers.set(eventName, handler);
      },
      clients: { claim },
      location: { hostname },
      registration: {
        scope: `http://${hostname}:3015/`,
        unregister,
      },
      skipWaiting,
    },
  };

  const script = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  new Script(script).runInNewContext(context);

  return { cacheAddAll, cacheDelete, cacheMatch: context.caches.match, cacheOpen, claim, fetch, handlers, skipWaiting, unregister };
}

describe("service worker script", () => {
  it("clears old app-shell caches and unregisters on LAN development origins", async () => {
    const serviceWorker = runServiceWorkerScript("192.168.0.60");
    const installPromises: Promise<unknown>[] = [];
    const activatePromises: Promise<unknown>[] = [];

    serviceWorker.handlers.get("install")?.({ waitUntil: (promise) => installPromises.push(promise) });
    serviceWorker.handlers.get("activate")?.({ waitUntil: (promise) => activatePromises.push(promise) });

    await Promise.all(installPromises);
    await Promise.all(activatePromises);

    expect(serviceWorker.skipWaiting).toHaveBeenCalled();
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v1");
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v2");
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v3");
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v4");
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v5");
    expect(serviceWorker.claim).toHaveBeenCalled();
    expect(serviceWorker.unregister).toHaveBeenCalled();
    expect(serviceWorker.cacheOpen).not.toHaveBeenCalled();
  });

  it("activates fresh production app-shell caches and removes obsolete caches on public origins", async () => {
    const serviceWorker = runServiceWorkerScript("haongo81.github.io");
    const installPromises: Promise<unknown>[] = [];
    const activatePromises: Promise<unknown>[] = [];

    serviceWorker.handlers.get("install")?.({ waitUntil: (promise) => installPromises.push(promise) });
    serviceWorker.handlers.get("activate")?.({ waitUntil: (promise) => activatePromises.push(promise) });
    await Promise.all(installPromises);
    await Promise.all(activatePromises);

    expect(serviceWorker.cacheOpen).toHaveBeenCalledWith("lezgo-padel-v5");
    expect(serviceWorker.cacheAddAll).toHaveBeenCalledWith(["/", "/new-tournament", "/tournaments", "/live", "/finish"]);
    expect(serviceWorker.skipWaiting).toHaveBeenCalled();
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v1");
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v2");
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v3");
    expect(serviceWorker.cacheDelete).toHaveBeenCalledWith("lezgo-padel-v4");
    expect(serviceWorker.cacheDelete).not.toHaveBeenCalledWith("lezgo-padel-v5");
    expect(serviceWorker.claim).toHaveBeenCalled();
    expect(serviceWorker.unregister).not.toHaveBeenCalled();
  });

  it("accepts a controlled update message and activates the waiting worker", async () => {
    const serviceWorker = runServiceWorkerScript("lezgotournament.vercel.app");
    const messagePromises: Promise<unknown>[] = [];

    serviceWorker.handlers.get("message")?.({
      data: { type: "LEZGO_SKIP_WAITING" },
      waitUntil: (promise) => messagePromises.push(promise),
    });
    await Promise.all(messagePromises);

    expect(serviceWorker.skipWaiting).toHaveBeenCalled();
  });

  it("does not serve stale Next.js static chunks from the app-shell cache", async () => {
    const serviceWorker = runServiceWorkerScript("lez-go-tournament.vercel.app");
    const responsePromises: Promise<unknown>[] = [];

    serviceWorker.handlers.get("fetch")?.({
      request: new Request("https://lez-go-tournament.vercel.app/_next/static/chunks/old.js"),
      respondWith: (promise) => responsePromises.push(promise),
    });
    await Promise.all(responsePromises);

    expect(serviceWorker.fetch).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://lez-go-tournament.vercel.app/_next/static/chunks/old.js",
    }));
    expect(serviceWorker.cacheMatch).not.toHaveBeenCalled();
  });

  it("keeps navigation requests network-first with cache fallback for the current app shell", async () => {
    const serviceWorker = runServiceWorkerScript("lez-go-tournament.vercel.app");
    const responsePromises: Promise<unknown>[] = [];

    serviceWorker.fetch.mockRejectedValueOnce(new Error("offline"));
    serviceWorker.handlers.get("fetch")?.({
      request: new Request("https://lez-go-tournament.vercel.app/remote"),
      respondWith: (promise) => responsePromises.push(promise),
    });
    await Promise.all(responsePromises);

    expect(serviceWorker.fetch).toHaveBeenCalled();
    expect(serviceWorker.cacheMatch).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://lez-go-tournament.vercel.app/remote",
    }));
  });
});
