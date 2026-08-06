import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "LEZGO PADEL",
  description: "Mobile-first padel tournament app",
  applicationName: "LEZGO PADEL",
  appleWebApp: {
    capable: true,
    title: "LEZGO PADEL",
  },
};

export const viewport: Viewport = {
  themeColor: "#18a058",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="da">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
