import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppPreferences } from "@/components/preferences/app-preferences";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { installPromptCaptureScript } from "@/lib/pwa/install-prompt";
import "./globals.css";

const basePath = "";

export const metadata: Metadata = {
  title: "LEZGO PADEL",
  description: "Mobile-first padel tournament app",
  applicationName: "LEZGO PADEL",
  appleWebApp: {
    capable: true,
    title: "LEZGO PADEL",
  },
  icons: {
    icon: `${basePath}/app-icon-192.png`,
    apple: `${basePath}/app-icon-192.png`,
  },
};

export const viewport: Viewport = {
  themeColor: "#d8aa20",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="da">
      <head>
        {/* Catches the browser install prompt for the portal's ?install=1 links before React loads. */}
        <script dangerouslySetInnerHTML={{ __html: installPromptCaptureScript }} />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <AppPreferences />
        {children}
      </body>
    </html>
  );
}
