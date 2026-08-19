"use client";

import { useEffect, useState } from "react";
import { AccountPanel, type Account } from "./account-panel";
import { useAppTranslation } from "@/lib/preferences/client";

type AccountDialogView = "login" | "create";

export function AccountAccess() {
  const { t } = useAppTranslation();
  const [account, setAccount] = useState<Account | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [dialogView, setDialogView] = useState<AccountDialogView>("login");

  useEffect(() => {
    let isDisposed = false;

    async function loadAccount() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await response.json() as { ok?: boolean; account?: Account };

        if (!isDisposed && response.ok && body.ok && body.account) {
          setAccount(body.account);
        }
      } catch {
        // Signed-out users keep the compact login entry point.
      }
    }

    void loadAccount();

    return () => {
      isDisposed = true;
    };
  }, []);

  const label = account ? account.displayName || account.username || t("account") : t("accountLogin");
  const openDialog = (view: AccountDialogView) => {
    setDialogView(view);
    setIsOpen(true);
  };

  return (
    <>
      {account ? (
        <button
          className="inline-flex min-h-10 max-w-[10rem] shrink-0 items-center gap-2 rounded-md border border-[var(--primary)] bg-[var(--surface)] px-3 py-2 text-sm font-black text-[var(--foreground)] shadow-sm transition hover:bg-[var(--control-hover-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] sm:min-h-11 sm:max-w-[14rem] sm:px-4 sm:text-base"
          type="button"
          aria-label={label}
          data-testid="main-account-control"
          onClick={() => openDialog("login")}
        >
          <AccountIcon />
          <span className="truncate">{label}</span>
        </button>
      ) : (
        <div className="flex max-w-[64vw] shrink-0 flex-wrap items-center justify-end gap-2 sm:max-w-none" data-testid="main-account-action-group">
          <button
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-[var(--primary)] bg-[var(--surface)] px-2.5 py-2 text-sm font-black text-[var(--foreground)] shadow-sm transition hover:bg-[var(--control-hover-bg)] focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] sm:min-h-11 sm:gap-2 sm:px-4 sm:text-base"
            type="button"
            aria-label={t("accountLogin")}
            data-testid="main-account-control"
            onClick={() => openDialog("login")}
          >
            <AccountIcon />
            <span className="whitespace-nowrap">{t("accountLogin")}</span>
          </button>
          <button
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-[var(--primary)] bg-[var(--primary)] px-2.5 py-2 text-sm font-black text-[var(--primary-text)] shadow-sm transition hover:bg-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] sm:min-h-11 sm:gap-2 sm:px-4 sm:text-base"
            type="button"
            aria-label={t("accountCreateAccount")}
            data-testid="main-account-create-control"
            onClick={() => openDialog("create")}
          >
            <PlusIcon />
            <span className="whitespace-nowrap">{t("accountCreateAccount")}</span>
          </button>
        </div>
      )}
      {isOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/30 p-0 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" data-testid="main-account-dialog">
          <div className="max-h-[92svh] w-full max-w-xl overflow-y-auto rounded-t-md border border-[var(--line)] bg-[var(--surface)] p-4 shadow-2xl sm:rounded-md sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="account-dialog-title" className="text-xl font-black">{t("account")}</h2>
              <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => setIsOpen(false)}>
                {t("close")}
              </button>
            </div>
            <AccountPanel framed={false} initialView={dialogView} onAccountChange={setAccount} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
