import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPanel, installPromptWaitMs } from "../components/pwa/install-panel";
import { installPromptCaptureScript, installReadyEvent, isAppleTouchDevice, isInAppBrowser, isInstallRequested, type BeforeInstallPromptEvent } from "../lib/pwa/install-prompt";

function createPromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
}

// The panel decides its state right after mount (setTimeout 0).
async function renderPanel() {
  render(<InstallPanel />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setUrl(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

describe("install panel for the portal's Installer link", () => {
  beforeEach(() => {
    window.__lezgoInstallPrompt = undefined;
    window.__lezgoInstalled = undefined;
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14) Chrome/130");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    setUrl("");
  });

  it("is not shown on a normal visit", () => {
    setUrl("");
    render(<InstallPanel />);
    expect(screen.queryByTestId("install-panel")).toBeNull();
  });

  it("shows the install button when the browser offers an install prompt, and opens the browser dialog on click", async () => {
    setUrl("?install=1");
    const { event, prompt } = createPromptEvent("accepted");
    window.__lezgoInstallPrompt = event;

    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Installer app" }));

    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("install-panel")).toHaveAttribute("data-install-state", "installed"));
    expect(screen.getByText("Appen er installeret. Du kan åbne den fra din startskærm.")).toBeInTheDocument();
    expect(window.__lezgoInstallPrompt).toBeNull();
  });

  it("shows the button when the prompt arrives after the page has loaded", async () => {
    setUrl("?install=1");
    await renderPanel();
    expect(screen.getByTestId("install-panel")).toHaveAttribute("data-install-state", "waiting");

    act(() => {
      window.__lezgoInstallPrompt = createPromptEvent().event;
      window.dispatchEvent(new Event(installReadyEvent));
    });
    expect(screen.getByRole("button", { name: "Installer app" })).toBeEnabled();
  });

  it("falls back to the browser-menu steps when no prompt arrives, or when the user cancels", async () => {
    vi.useFakeTimers();
    setUrl("?install=1");
    render(<InstallPanel />);
    act(() => vi.advanceTimersByTime(installPromptWaitMs));
    expect(screen.getByTestId("install-panel")).toHaveAttribute("data-install-state", "fallback");
    expect(screen.queryByRole("button", { name: "Installer app" })).toBeNull();
    cleanup();
    vi.useRealTimers();

    window.__lezgoInstallPrompt = createPromptEvent("dismissed").event;
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Installer app" }));
    await waitFor(() => expect(screen.getByTestId("install-panel")).toHaveAttribute("data-install-state", "fallback"));
  });

  it("shows Share > Add to Home Screen steps on iPhone", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1");
    setUrl("?install=1");
    await renderPanel();
    expect(screen.getByText(/tryk på Del-ikonet i Safari/)).toBeInTheDocument();
  });

  it("tells Messenger/Facebook users on Android to open the page in Chrome, and still shows the button if a prompt arrives", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14; wv) Chrome/130 Mobile [FB_IAB/MESSENGER;FBAV/480.0]");
    setUrl("?install=1");
    await renderPanel();
    expect(screen.getByTestId("install-panel")).toHaveAttribute("data-install-state", "inAppAndroid");
    expect(screen.getByText(/vælg Åbn i Chrome/)).toBeInTheDocument();

    act(() => {
      window.__lezgoInstallPrompt = createPromptEvent().event;
      window.dispatchEvent(new Event(installReadyEvent));
    });
    expect(screen.getByRole("button", { name: "Installer app" })).toBeEnabled();
  });

  it("tells in-app browser users on iPhone to open the page in Safari", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Instagram 350.0");
    setUrl("?install=1");
    await renderPanel();
    expect(screen.getByTestId("install-panel")).toHaveAttribute("data-install-state", "inAppIos");
    expect(screen.getByText(/vælg Åbn i Safari/)).toBeInTheDocument();
  });

  it("says the app is installed when it is already running as an app", async () => {
    setUrl("?install=1");
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(display-mode: standalone)" }) as MediaQueryList);
    await renderPanel();
    expect(screen.getByTestId("install-panel")).toHaveAttribute("data-install-state", "installed");
    vi.unstubAllGlobals();
  });

  it("closes and removes ?install=1 from the address", async () => {
    setUrl("?install=1&x=2");
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Luk" }));
    expect(screen.queryByTestId("install-panel")).toBeNull();
    expect(window.location.search).toBe("?x=2");
  });
});

describe("install prompt helpers", () => {
  afterEach(() => setUrl(""));

  it("recognises the install link", () => {
    expect(isInstallRequested("?install=1")).toBe(true);
    expect(isInstallRequested("?install=0")).toBe(false);
    expect(isInstallRequested("")).toBe(false);
  });

  it("recognises browsers built into other apps, but not normal Chrome, Safari, Edge or Samsung Internet", () => {
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Instagram 350.0")).toBe(true);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36 Edg/130")).toBe(false);
    expect(isInAppBrowser("Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Chrome/122 Mobile Safari/537.36")).toBe(false);
  });

  it("detects iPhone and iPad (including iPadOS reporting as a Mac)", () => {
    expect(isAppleTouchDevice("iPhone", "iPhone", 5)).toBe(true);
    expect(isAppleTouchDevice("Macintosh", "MacIntel", 5)).toBe(true);
    expect(isAppleTouchDevice("Macintosh", "MacIntel", 0)).toBe(false);
    expect(isAppleTouchDevice("Android", "Linux", 5)).toBe(false);
  });

  it("the inline script defers and stores the prompt only on install links", () => {
    setUrl("");
    window.__lezgoInstallPrompt = undefined;
    new Function(installPromptCaptureScript)();
    const normal = createPromptEvent().event;
    window.dispatchEvent(normal);
    expect(window.__lezgoInstallPrompt).toBeUndefined();

    setUrl("?install=1");
    new Function(installPromptCaptureScript)();
    const fromPortal = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(fromPortal);
    expect(fromPortal.defaultPrevented).toBe(true);
    expect(window.__lezgoInstallPrompt).toBe(fromPortal);
  });
});
