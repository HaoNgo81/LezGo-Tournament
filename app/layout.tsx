import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppPreferences } from "@/components/preferences/app-preferences";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import "./globals.css";

const basePath = process.env.GITHUB_PAGES === "true" ? "/LezGo-Tournament" : "";

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
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="da">
      <body>
        <ServiceWorkerRegistration />
        <AppPreferences />
        {children}
      </body>
    </html>
  );
}
