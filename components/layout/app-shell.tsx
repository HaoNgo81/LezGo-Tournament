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
  primaryAction?: ReactNode;
}

export function AppShell({ title, subtitle, children, backHref = "/", primaryAction }: AppShellProps) {
  const { t } = useAppTranslation();
  const translatedTitle = translateKnownShellText(title, t);
  const translatedSubtitle = subtitle ? translateKnownShellText(subtitle, t) : undefined;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <main className="safe-screen mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-4">
        {backHref ? (
          <Link className="inline-flex min-h-11 w-fit items-center rounded-md px-1 text-base font-black text-[var(--primary-strong)]" href={backHref}>
            {t("back")}
          </Link>
        ) : null}
        <div className="max-w-3xl">
          <Image className="h-auto w-full max-w-[min(100%,24rem)]" src={`${basePath}/lezgo-padel-logo.png`} width={1399} height={184} priority unoptimized alt={t("appBrand")} />
          <h1 className="mt-2 text-2xl font-black leading-tight text-[var(--foreground)] sm:text-4xl">{translatedTitle}</h1>
          {translatedSubtitle ? <p className="mt-2 max-w-2xl text-base font-bold leading-7 text-[var(--muted)] sm:text-lg">{translatedSubtitle}</p> : null}
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
    "openRemoteTournament": "openRemoteTournament",
    "openRemoteTournamentDescription": "openRemoteTournamentDescription",
  };

  return knownTexts[text] ? t(knownTexts[text]) : text;
}
