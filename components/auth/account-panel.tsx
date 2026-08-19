"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAppTranslation } from "@/lib/preferences/client";

interface Account {
  userId: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
}

interface AccountTournament {
  id: string;
  name: string;
  format: string;
  status: string;
}

type LoginStep = "details" | "code";

export function AccountPanel() {
  const { t } = useAppTranslation();
  const [account, setAccount] = useState<Account | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<LoginStep>("details");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tournaments, setTournaments] = useState<AccountTournament[]>([]);

  async function loadOwnTournaments() {
    try {
      const response = await fetch("/api/account/tournaments", { cache: "no-store" });
      const body = await response.json() as { ok?: boolean; tournaments?: AccountTournament[] };

      if (response.ok && body.ok && body.tournaments) {
        setTournaments(body.tournaments);
      }
    } catch {
      setTournaments([]);
    }
  }

  useEffect(() => {
    let isDisposed = false;

    async function loadAccount() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await response.json() as { ok?: boolean; account?: Account };

        if (!isDisposed && response.ok && body.ok && body.account) {
          setAccount(body.account);
          setDisplayName(body.account.displayName);
          setEmail(body.account.email);
          void loadOwnTournaments();
        }
      } catch {
        // Anonymous users simply see the login form.
      }
    }

    void loadAccount();

    return () => {
      isDisposed = true;
    };
  }, []);

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? t("accountOtpCouldNotSend"));
      }

      setStep("code");
      setMessage(t("accountOtpSent"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountOtpCouldNotSend"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email, token: otp }),
      });
      const body = await response.json() as { ok?: boolean; account?: Account; error?: string };

      if (!response.ok || !body.ok || !body.account) {
        throw new Error(body.error ?? t("accountOtpCouldNotVerify"));
      }

      setAccount(body.account);
      setDisplayName(body.account.displayName);
      setEmail(body.account.email);
      setOtp("");
      setStep("details");
      setMessage(t("accountLoggedIn"));
      void loadOwnTournaments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountOtpCouldNotVerify"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoading(true);
    setMessage("");

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAccount(null);
      setTournaments([]);
      setOtp("");
      setStep("details");
      setMessage(t("accountLoggedOut"));
    } finally {
      setIsLoading(false);
    }
  }

  if (account) {
    return (
      <div className="app-card grid gap-3 p-4 sm:p-5" data-testid="account-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">{t("accountSignedIn")}</p>
            <p className="mt-1 text-xl font-black">{account.displayName}</p>
            <p className="font-bold text-[var(--muted)]">{account.email}</p>
          </div>
          {account.role === "admin" ? (
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-[var(--primary)] px-3 py-1 text-xs font-black text-[var(--primary-strong)]">ADMIN</span>
              <Link className="rounded-md border border-[var(--primary)] px-3 py-1 text-xs font-black text-[var(--primary-strong)]" href="/admin">
                {t("admin")}
              </Link>
            </div>
          ) : null}
        </div>
        <button className="btn-secondary min-h-12" type="button" disabled={isLoading} onClick={handleLogout}>
          {t("logout")}
        </button>
        <div className="rounded-md border border-[var(--line)] bg-white/70 p-3">
          <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">{t("accountOwnTournaments")}</p>
          {tournaments.length ? (
            <ul className="mt-2 grid gap-2 text-sm font-bold">
              {tournaments.slice(0, 5).map((tournament) => (
                <li key={tournament.id} className="grid gap-1 rounded-md border border-[var(--line)] p-2">
                  <span>{tournament.name}</span>
                  <span className="text-xs text-[var(--muted)]">{tournament.status} · {tournament.format}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">{t("accountNoOwnTournaments")}</p>
          )}
        </div>
        {message ? <p className="font-bold text-[var(--primary-strong)]">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="app-card grid gap-3 p-4 sm:p-5" data-testid="account-panel">
      <div>
        <p className="text-lg font-black">{t("accountCreateOrLogin")}</p>
        <p className="mt-1 font-bold text-[var(--muted)]">{t("accountOtpHelp")}</p>
      </div>
      {step === "details" ? (
        <form className="grid gap-3" onSubmit={handleRequestOtp}>
          <label className="grid gap-2 text-lg font-bold">
            {t("accountName")}
            <input className="field-control" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
          </label>
          <label className="grid gap-2 text-lg font-bold">
            {t("accountEmail")}
            <input className="field-control" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" type="email" />
          </label>
          <button className="btn-primary min-h-12" type="submit" disabled={isLoading}>
            {t("accountContinue")}
          </button>
        </form>
      ) : (
        <form className="grid gap-3" onSubmit={handleVerifyOtp}>
          <label className="grid gap-2 text-lg font-bold">
            {t("accountVerificationCode")}
            <input className="field-control tracking-widest" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
          </label>
          <div className="action-grid">
            <button className="btn-primary min-h-12" type="submit" disabled={isLoading}>
              {t("accountVerify")}
            </button>
            <button className="btn-secondary min-h-12" type="button" disabled={isLoading} onClick={() => setStep("details")}>
              {t("edit")}
            </button>
          </div>
        </form>
      )}
      {message ? <p className="font-bold text-[var(--primary-strong)]">{message}</p> : null}
    </div>
  );
}
