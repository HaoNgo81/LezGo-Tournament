"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backHref?: string;
  compactMobile?: boolean;
  contentWidth?: "standard" | "wide";
  headerAction?: ReactNode;
  primaryAction?: ReactNode;
}

export function AppShell({ title, subtitle, children, backHref = "/", compactMobile = false, contentWidth = "standard", headerAction, primaryAction }: AppShellProps) {
  const { t } = useAppTranslation();
  const translatedTitle = translateKnownShellText(title, t);
  const translatedSubtitle = subtitle ? translateKnownShellText(subtitle, t) : undefined;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const widthClassName = contentWidth === "wide" ? "max-w-[min(1180px,calc(100vw-48px))]" : compactMobile ? "max-w-4xl xl:max-w-6xl" : "max-w-4xl";

  return (
    <main className={`safe-screen mx-auto flex w-full flex-col ${widthClassName} ${compactMobile ? "gap-3 sm:gap-6" : "gap-6"}`}>
      <header className={`flex flex-col ${compactMobile ? "gap-2 sm:gap-4" : "gap-4"}`}>
        {headerAction ? (
          <div className="rounded-md border-b border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 backdrop-blur sm:px-3" data-testid="main-account-top-bar">
            <div className="flex w-full justify-end">
              {headerAction}
            </div>
          </div>
        ) : null}
        {backHref ? (
          <Link className={`inline-flex w-fit items-center rounded-md px-1 font-black text-[var(--primary-strong)] ${compactMobile ? "min-h-9 text-sm sm:min-h-11 sm:text-base" : "min-h-11 text-base"}`} href={backHref}>
            {t("back")}
          </Link>
        ) : null}
        <div className="flex items-start gap-3" data-testid="app-shell-brand-area">
          <div className="max-w-3xl flex-1">
            <Image className={`h-auto w-full ${compactMobile ? "max-w-[min(100%,16rem)] sm:max-w-[min(100%,24rem)]" : "max-w-[min(100%,24rem)]"}`} src={`${basePath}/lezgo-padel-logo.png`} width={1399} height={184} priority unoptimized alt={t("appBrand")} />
            <h1 className={`font-black leading-tight text-[var(--foreground)] ${compactMobile ? "mt-1 text-xl sm:mt-2 sm:text-4xl" : "mt-2 text-2xl sm:text-4xl"}`}>{translatedTitle}</h1>
            {translatedSubtitle ? <p className={`max-w-2xl font-bold text-[var(--muted)] ${compactMobile ? "mt-1 text-sm leading-5 sm:mt-2 sm:text-lg sm:leading-7" : "mt-2 text-base leading-7 sm:text-lg"}`}>{translatedSubtitle}</p> : null}
          </div>
        </div>
      </header>
      {children}
      {primaryAction ? <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 p-3 shadow-2xl backdrop-blur sm:p-4"><div className="mx-auto max-w-4xl">{primaryAction}</div></div> : null}
    </main>
  );
}

function translateKnownShellText(text: string, t: (key: TranslationKey) => string): string {
  const knownTexts: Record<string, TranslationKey> = {
    "Indstillinger": "settings",
    "Ny turnering": "newTournamentTitle",
    "Opret en turnering med format, spillere, baner, runder og stillingssortering.": "newTournamentDescription",
    "Opret, rediger, slet og start fra skabelon.": "templatesDescription",
    "Standarder, der bruges automatisk ved nye turneringer.": "settingsDescription",
    "Turneringsskabeloner": "homeTemplatesTitle",
    "Turneringer": "tournaments",
    "Aktive og afsluttede turneringer gemmes lokalt.": "tournamentsDescription",
    "Live turnering": "liveTournamentTitle",
    "En skærm til runde, kampe, scoring og stilling.": "liveTournamentDescription",
    "openRemoteTournament": "openRemoteTournament",
    "openRemoteTournamentDescription": "openRemoteTournamentDescription",
  };

  return knownTexts[text] ? t(knownTexts[text]) : text;
}
