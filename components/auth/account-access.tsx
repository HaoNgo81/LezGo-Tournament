"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AccountPanel, type Account, type AccountView } from "./account-panel";
import { notifyPreferencesChanged, useAppTranslation } from "@/lib/preferences/client";
import { loadTournamentSettings, saveTournamentSettings } from "@/lib/tournament-settings";
import type { AppLanguage } from "@/lib/i18n/translations";

type AccountDialogView = Extract<AccountView, "login" | "create">;

interface AccountAccessProps {
  onAccountChange?: (account: Account | null) => void;
}

export function AccountAccess({ onAccountChange }: AccountAccessProps) {
  const { language, t } = useAppTranslation();
  const [account, setAccount] = useState<Account | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dialogView, setDialogView] = useState<AccountDialogView>("login");
  const [dialogMessage, setDialogMessage] = useState("");
  const handledVerificationRedirectRef = useRef(false);

  useEffect(() => {
    let isDisposed = false;

    async function loadAccount() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await response.json() as { ok?: boolean; account?: Account };

        if (!isDisposed && response.ok && body.ok && body.account) {
          setAccount(body.account);
          onAccountChange?.(body.account);
        }
      } catch {
        // Signed-out users keep the compact login entry point.
      }
    }

    void loadAccount();

    return () => {
      isDisposed = true;
    };
  }, [onAccountChange]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verificationState = params.get("accountVerified");

    if (!verificationState || handledVerificationRedirectRef.current) {
      return;
    }

    handledVerificationRedirectRef.current = true;
    const message = verificationState === "verified" ? t("accountEmailVerifiedMessage") : t("accountEmailVerificationFailed");

    setDialogView("login");
    setDialogMessage(message);
    setIsOpen(true);

    params.delete("accountVerified");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [t]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const label = account ? account.displayName || account.username || t("account") : t("accountLogin");
  const handlePanelAccountChange = useCallback((nextAccount: Account | null) => {
    if (isOpen && !account && nextAccount) {
      setIsOpen(false);
    }

    setAccount(nextAccount);
    onAccountChange?.(nextAccount);
  }, [account, isOpen, onAccountChange]);
  const openDialog = (view: AccountDialogView) => {
    setDialogView(view);
    setDialogMessage("");
    setIsOpen(true);
  };
  const handleLanguageToggle = () => {
    const settings = loadTournamentSettings();
    const nextLanguage: AppLanguage = language === "da" ? "en" : "da";
    saveTournamentSettings({ ...settings, language: nextLanguage });
    notifyPreferencesChanged();
  };
  const dialog = isOpen ? (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/30 px-4 py-5 sm:px-6 sm:py-6" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" data-testid="main-account-dialog">
      <div className="grid min-h-full items-start justify-items-center sm:items-center">
        <div className="grid max-h-[calc(100dvh-2.5rem)] w-full max-w-xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:max-h-[calc(100dvh-3rem)]" data-testid="main-account-dialog-panel">
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <h2 id="account-dialog-title" className="text-xl font-black">{t("account")}</h2>
            <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => setIsOpen(false)}>
              {t("close")}
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5" data-testid="main-account-dialog-scroll">
            <AccountPanel framed={false} initialView={dialogView} initialMessage={dialogMessage} onAccountChange={handlePanelAccountChange} />
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm font-black text-[var(--foreground)] sm:gap-x-3 sm:text-base" data-testid="main-account-action-group">
        <button
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[var(--foreground)] transition hover:bg-[var(--primary-soft)]/45 focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] sm:px-2"
          type="button"
          aria-label={t("language")}
          data-testid="main-language-control"
          onClick={handleLanguageToggle}
        >
          <GlobeIcon />
          <span>{language.toUpperCase()}</span>
          <ChevronDownIcon />
        </button>
        <AccountSeparator />
        {account ? (
        <button
          className="inline-flex min-h-9 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[var(--foreground)] transition hover:bg-[var(--primary-soft)]/45 focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] sm:max-w-[14rem] sm:px-2"
          type="button"
          aria-label={label}
          data-testid="main-account-control"
          onClick={() => openDialog("login")}
        >
          <AccountIcon />
          <span className="truncate">{label}</span>
          <ChevronDownIcon />
        </button>
      ) : (
        <>
          <button
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[var(--foreground)] transition hover:bg-[var(--primary-soft)]/45 focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] sm:px-2"
            type="button"
            aria-label={t("accountLogin")}
            data-testid="main-account-control"
            onClick={() => openDialog("login")}
          >
            <AccountIcon />
            <span className="whitespace-nowrap">{t("accountLogin")}</span>
          </button>
          <AccountSeparator />
          <button
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[var(--primary-strong)] transition hover:bg-[var(--primary-soft)]/45 focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] sm:gap-1.5 sm:px-2"
            type="button"
            aria-label={t("accountCreateAccount")}
            data-testid="main-account-create-control"
            onClick={() => openDialog("create")}
          >
            <PlusIcon />
            <span className="whitespace-nowrap">{t("accountCreateAccount")}</span>
            <ChevronRightIcon />
          </button>
        </>
      )}
      </div>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" />
      <path d="M3.6 9h16.8M3.6 15h16.8M12 3c2.25 2.4 3.35 5.4 3.35 9S14.25 18.6 12 21M12 3C9.75 5.4 8.65 8.4 8.65 12s1.1 6.6 3.35 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-[var(--primary-strong)]" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="hidden h-3.5 w-3.5 shrink-0 text-[var(--primary-strong)] sm:block" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccountSeparator() {
  return <span className="hidden h-5 w-px shrink-0 bg-[var(--line)] sm:inline-block" aria-hidden="true" />;
}
