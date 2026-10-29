"use client";

import { useEffect, useState } from "react";
import { PrimaryButton } from "@/components/ui/primary-button";
import {
  installedEvent,
  installQueryParameter,
  installReadyEvent,
  isAppleTouchDevice,
  isInAppBrowser,
  isInstallRequested,
  isRunningAsInstalledApp,
} from "@/lib/pwa/install-prompt";
import { useAppTranslation } from "@/lib/preferences/client";

type InstallState = "hidden" | "waiting" | "ready" | "ios" | "inAppAndroid" | "inAppIos" | "fallback" | "installed";

// How long to wait for the browser's beforeinstallprompt before showing the manual steps.
export const installPromptWaitMs = 4000;

export function InstallPanel() {
  const { t } = useAppTranslation();
  const [state, setState] = useState<InstallState>("hidden");

  useEffect(() => {
    if (!isInstallRequested(window.location.search)) {
      return;
    }

    let timer: number | undefined;
    const showReady = () => {
      window.clearTimeout(timer);
      setState("ready");
    };
    const showInstalled = () => {
      window.clearTimeout(timer);
      setState("installed");
    };

    const decide = () => {
      if (window.__lezgoInstalled || isRunningAsInstalledApp()) {
        showInstalled();
      } else if (window.__lezgoInstallPrompt) {
        showReady();
      } else if (isInAppBrowser(navigator.userAgent)) {
        // Apps such as Messenger open links in their own browser, which cannot install. A prompt that still
        // arrives replaces this message with the install button (showReady).
        setState(isAppleTouchDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints) ? "inAppIos" : "inAppAndroid");
      } else if (isAppleTouchDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
        // Safari on iPhone/iPad has no install dialog; only Share > Add to Home Screen.
        setState("ios");
      } else {
        setState("waiting");
        timer = window.setTimeout(() => setState((current) => (current === "waiting" ? "fallback" : current)), installPromptWaitMs);
      }
    };
    // Decided after mount (not during render) so the server-rendered page and the first client render match.
    const decideTimer = window.setTimeout(decide, 0);

    window.addEventListener(installReadyEvent, showReady);
    window.addEventListener(installedEvent, showInstalled);
    return () => {
      window.clearTimeout(decideTimer);
      window.clearTimeout(timer);
      window.removeEventListener(installReadyEvent, showReady);
      window.removeEventListener(installedEvent, showInstalled);
    };
  }, []);

  async function install() {
    const promptEvent = window.__lezgoInstallPrompt;
    if (!promptEvent) {
      setState("fallback");
      return;
    }

    // The browser allows each prompt event to be used once.
    window.__lezgoInstallPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setState(choice.outcome === "accepted" ? "installed" : "fallback");
    } catch {
      setState("fallback");
    }
  }

  function close() {
    setState("hidden");
    const url = new URL(window.location.href);
    url.searchParams.delete(installQueryParameter);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  if (state === "hidden") {
    return null;
  }

  const message = {
    waiting: t("installWaiting"),
    ready: t("installBody"),
    ios: t("installIosSteps"),
    inAppAndroid: t("installInAppAndroid"),
    inAppIos: t("installInAppIos"),
    fallback: t("installFallback"),
    installed: t("installAlready"),
  }[state];

  return (
    <section aria-labelledby="install-panel-title" className="app-card mb-4 p-4 sm:p-5" data-install-state={state} data-testid="install-panel">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black leading-tight" id="install-panel-title">{t("installTitle")}</h2>
          <p aria-live="polite" className="mt-1 text-base font-bold leading-6 text-[var(--muted)]">{message}</p>
        </div>
        <button
          aria-label={t("close")}
          className="-m-1 grid h-11 w-11 shrink-0 place-items-center rounded-md text-2xl font-black leading-none text-[var(--muted)] hover:bg-[var(--primary-soft)] focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)]"
          onClick={close}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {state === "ready" ? (
        <div className="mt-4">
          <PrimaryButton onClick={() => void install()}>{t("installButton")}</PrimaryButton>
        </div>
      ) : null}
    </section>
  );
}
