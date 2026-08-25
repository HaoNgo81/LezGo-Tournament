import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerRegistration, hasActiveTournamentInBrowserStorage } from "../components/pwa/service-worker-registration";

const updateCheckIntervalMs = 30 * 60 * 1000;

type Listener = () => void;

interface MockServiceWorker {
  addEventListener: (eventName: string, listener: Listener) => void;
  dispatchStateChange: () => void;
  postMessage: ReturnType<typeof vi.fn>;
  state: ServiceWorkerState;
}

function createMockWorker(state: ServiceWorkerState = "installed"): MockServiceWorker {
  const listeners = new Map<string, Listener>();

  return {
    addEventListener: (eventName, listener) => {
      listeners.set(eventName, listener);
    },
    dispatchStateChange: () => listeners.get("statechange")?.(),
    postMessage: vi.fn(),
    state,
  };
}

function createProductionServiceWorkerMock(options: { controller?: boolean; waiting?: MockServiceWorker | null } = {}) {
  const serviceWorkerListeners = new Map<string, Listener>();
  const registrationListeners = new Map<string, Listener>();
  const registration = {
    addEventListener: (eventName: string, listener: Listener) => {
      registrationListeners.set(eventName, listener);
    },
    installing: null as MockServiceWorker | null,
    update: vi.fn().mockResolvedValue(undefined),
    waiting: options.waiting ?? null,
  };
  const serviceWorker = {
    addEventListener: (eventName: string, listener: Listener) => {
      serviceWorkerListeners.set(eventName, listener);
    },
    controller: options.controller === false ? null : {},
    getRegistrations: vi.fn(),
    register: vi.fn().mockResolvedValue(registration),
    removeEventListener: vi.fn(),
  };

  Object.defineProperty(window.navigator, "serviceWorker", {
    value: serviceWorker,
    configurable: true,
  });

  return {
    dispatchControllerChange: () => serviceWorkerListeners.get("controllerchange")?.(),
    dispatchUpdateFound: (worker: MockServiceWorker) => {
      registration.installing = worker;
      registrationListeners.get("updatefound")?.();
    },
    registration,
    serviceWorker,
  };
}

function mockAppVersionResponses(...versions: Array<Error | string>) {
  const responses = [...versions];
  const fetchMock = vi.fn().mockImplementation(() => {
    const nextResponse = responses.shift() ?? versions.at(-1) ?? "version-1";

    if (nextResponse instanceof Error) {
      return Promise.reject(nextResponse);
    }

    return Promise.resolve(new Response(JSON.stringify({ version: nextResponse }), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("service worker registration", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("does not register the app service worker outside production and removes stale registrations", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: { getRegistrations, register },
      configurable: true,
    });

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(getRegistrations).toHaveBeenCalled();
      expect(unregister).toHaveBeenCalled();
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("checks for app and service worker updates on startup, focus, foreground and a periodic interval", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    const { registration, serviceWorker } = createProductionServiceWorkerMock();
    const fetchMock = mockAppVersionResponses("version-1");

    render(<ServiceWorkerRegistration reload={vi.fn()} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { updateViaCache: "none" });
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(updateCheckIntervalMs);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(registration.update).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("requests activation when a new service worker reaches the installed state", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { dispatchUpdateFound } = createProductionServiceWorkerMock();
    const worker = createMockWorker("installing");
    mockAppVersionResponses("version-1");

    render(<ServiceWorkerRegistration reload={vi.fn()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    dispatchUpdateFound(worker);
    worker.state = "installed";
    worker.dispatchStateChange();

    expect(worker.postMessage).toHaveBeenCalledWith({ type: "LEZGO_SKIP_WAITING" });
  });

  it("asks a waiting installed PWA service worker to activate", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const waiting = createMockWorker();
    createProductionServiceWorkerMock({ waiting });
    mockAppVersionResponses("version-1");

    render(<ServiceWorkerRegistration reload={vi.fn()} />);

    await waitFor(() => {
      expect(waiting.postMessage).toHaveBeenCalledWith({ type: "LEZGO_SKIP_WAITING" });
    });
  });

  it("applies a detected deployment update once when no active tournament is being controlled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const reload = vi.fn();
    const { dispatchControllerChange } = createProductionServiceWorkerMock();
    mockAppVersionResponses("version-1", "version-2");

    render(<ServiceWorkerRegistration reload={reload} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    dispatchControllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("lezgo.pwaUpdateReload.v1")).toBe("version-2");
  });

  it("keeps active tournament state running and delays disruptive reloads until the tournament is safe", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const reload = vi.fn();
    const beforeTournament = JSON.stringify({ status: "active", tournamentName: "STATE SAFE" });
    window.localStorage.setItem("lezgo.activeTournament.v1", beforeTournament);
    createProductionServiceWorkerMock();
    mockAppVersionResponses("version-1", "version-2");

    render(<ServiceWorkerRegistration reload={reload} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText("Ny version klar")).toBeInTheDocument();
    expect(screen.getByText("LEZGO er blevet opdateret. Den nye version aktiveres, når det er sikkert.")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("lezgo.activeTournament.v1")).toBe(beforeTournament);

    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify({ status: "finished", tournamentName: "STATE SAFE" }));
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("recovers from offline update checks and retries later", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const reload = vi.fn();
    createProductionServiceWorkerMock();
    mockAppVersionResponses(new Error("offline"), "version-1", "version-2");

    render(<ServiceWorkerRegistration reload={reload} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(reload).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it("recognizes standard, list and Team vs Team active tournaments without changing storage", () => {
    expect(hasActiveTournamentInBrowserStorage()).toBe(false);

    window.localStorage.setItem("lezgo.activeTournaments.v1", JSON.stringify([{ status: "finished" }, { status: "active" }]));
    expect(hasActiveTournamentInBrowserStorage()).toBe(true);
    expect(window.localStorage.getItem("lezgo.activeTournaments.v1")).toBe(JSON.stringify([{ status: "finished" }, { status: "active" }]));

    window.localStorage.clear();
    window.localStorage.setItem("lezgo.activeTeamVsTeam.v1", JSON.stringify({ status: "active" }));
    expect(hasActiveTournamentInBrowserStorage()).toBe(true);
  });

  it("localizes the delayed update notice in English", async () => {
    vi.stubEnv("NODE_ENV", "production");
    window.localStorage.setItem("lezgo.tournamentSettings.v1", JSON.stringify({ language: "en" }));
    window.localStorage.setItem("lezgo.activeTournament.v1", JSON.stringify({ status: "active" }));
    createProductionServiceWorkerMock();
    mockAppVersionResponses("version-1", "version-2");

    render(<ServiceWorkerRegistration reload={vi.fn()} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event("focus"));

    expect(await screen.findByText("New version ready")).toBeInTheDocument();
    expect(screen.getByText("LEZGO has been updated. The new version will activate when it is safe.")).toBeInTheDocument();
  });
});
