// Install flow for links from the LEZGO Apps portal (lezgoapp.vercel.app): the portal's "Installer"
// button opens this app with ?install=1. Browsers only allow the install dialog on the app's own
// domain and only after a click in the page, so the home page shows an install panel with a button.

export const installQueryParameter = "install";
export const installReadyEvent = "lezgo:install-ready";
export const installedEvent = "lezgo:installed";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

declare global {
  interface Window {
    __lezgoInstallPrompt?: BeforeInstallPromptEvent | null;
    __lezgoInstalled?: boolean;
  }
}

// Runs inline in <head> so the browser's beforeinstallprompt event is caught even if it fires before
// React has loaded. It only defers the browser's own install banner when the page was opened with
// ?install=1; normal visits behave as before.
export const installPromptCaptureScript = `(function(){try{if(!/[?&]${installQueryParameter}=1(&|$)/.test(window.location.search))return;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__lezgoInstallPrompt=e;window.dispatchEvent(new Event("${installReadyEvent}"));});window.addEventListener("appinstalled",function(){window.__lezgoInstalled=true;window.__lezgoInstallPrompt=null;window.dispatchEvent(new Event("${installedEvent}"));});}catch(e){}})();`;

export function isInstallRequested(search: string): boolean {
  return new URLSearchParams(search).get(installQueryParameter) === "1";
}

export function isRunningAsInstalledApp(): boolean {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || navigatorWithStandalone.standalone);
}

export function isAppleTouchDevice(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  // iPadOS reports itself as a Mac, so a touch-capable "MacIntel" is an iPad.
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}
