"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppTranslation } from "@/lib/preferences/client";
import { createStandardShadowSaveLocalId, createTeamVsTeamShadowSaveLocalId, markActiveCloudTournamentAuthority, markCloudTournamentRestored, saveActiveTeamVsTeamTournamentFromRemoteSync, saveActiveTournamentFromRemoteSync, type TeamVsTeamTournamentState } from "@/lib/tournament-setup";
import type { LiveTournamentState } from "@/lib/live-scoring";

export interface Account {
  userId: string;
  email: string;
  displayName: string;
  username?: string;
  role: "admin" | "user";
}

interface AccountTournament {
  id: string;
  name: string;
  format: string;
  status: string;
  updatedAt?: string;
  canManage?: boolean;
  managementState?: "controller" | "readOnly" | "completed";
}

export type AccountView = "login" | "create" | "forgot" | "reset" | "verify";
type CloudTournamentOpenResponse =
  | {
      ok: true;
      kind: "standard";
      state: LiveTournamentState;
      tournamentId: string;
      updatedAt?: string;
      legacyLocalId?: string;
      organizerToken?: string;
      canManage?: boolean;
      canRead?: boolean;
      createdByUserId?: string | null;
      controllerUserId?: string | null;
      ownerUserId?: string | null;
      matchScoreVersions?: Record<string, number>;
    }
  | {
      ok: true;
      kind: "team-vs-team";
      state: TeamVsTeamTournamentState;
      tournamentId: string;
      updatedAt?: string;
      legacyLocalId?: string;
      organizerToken?: string;
      canManage?: boolean;
      canRead?: boolean;
      createdByUserId?: string | null;
      controllerUserId?: string | null;
      ownerUserId?: string | null;
    }
  | {
      ok?: false;
      error?: string;
    };

interface AccountPanelProps {
  framed?: boolean;
  initialView?: AccountView;
  initialMessage?: string;
  onAccountChange?: (account: Account | null) => void;
}

export function AccountPanel({ framed = true, initialView = "login", initialMessage = "", onAccountChange }: AccountPanelProps) {
  const router = useRouter();
  const { t } = useAppTranslation();
  const [account, setAccount] = useState<Account | null>(null);
  const [view, setView] = useState<AccountView>(initialView);
  const [identifier, setIdentifier] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [rememberLogin, setRememberLogin] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [repeatCode, setRepeatCode] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [newCode, setNewCode] = useState("");
  const [repeatNewCode, setRepeatNewCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [isLoading, setIsLoading] = useState(false);
  const [openingTournamentId, setOpeningTournamentId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<AccountTournament[]>([]);
  const sortedTournaments = useMemo(() => [...tournaments].sort(compareAccountTournaments), [tournaments]);

  const loadOwnTournaments = useCallback(async function loadOwnTournaments() {
    try {
      const response = await fetch("/api/account/tournaments", { cache: "no-store" });
      const body = await response.json() as { ok?: boolean; tournaments?: AccountTournament[] };

      if (response.ok && body.ok && body.tournaments) {
        setTournaments(body.tournaments);
      }
    } catch {
      setTournaments([]);
    }
  }, []);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    setMessage(initialMessage);
  }, [initialMessage]);

  const setSignedInAccount = useCallback(function setSignedInAccount(nextAccount: Account | null) {
    setAccount(nextAccount);
    onAccountChange?.(nextAccount);

    if (nextAccount) {
      setDisplayName(nextAccount.displayName);
      setUsername(nextAccount.username ?? "");
      setEmail(nextAccount.email);
      setIdentifier(nextAccount.username ?? nextAccount.email);
      setView("login");
    }
  }, [onAccountChange]);

  useEffect(() => {
    let isDisposed = false;

    async function loadAccount() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await response.json() as { ok?: boolean; account?: Account };

        if (!isDisposed && response.ok && body.ok && body.account) {
          setSignedInAccount(body.account);
          void loadOwnTournaments();
        }
      } catch {
        // Anonymous users simply see the credential login form.
      }
    }

    void loadAccount();

    return () => {
      isDisposed = true;
    };
  }, [loadOwnTournaments, setSignedInAccount]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/credentials/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, code: loginCode, remember: rememberLogin }),
      });
      const body = await response.json() as { ok?: boolean; account?: Account; rememberDenied?: boolean; error?: string };

      if (!response.ok || !body.ok || !body.account) {
        throw new Error(localizeAuthError(body.error, t("accountLoginError"), {
          unverifiedEmail: t("accountEmailNotVerified"),
        }));
      }

      setSignedInAccount(body.account);
      setLoginCode("");
      setMessage(body.rememberDenied ? t("accountLoginAdminNotRemembered") : t("accountLoggedIn"));
      void loadOwnTournaments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountLoginError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      if (createCode && repeatCode && createCode !== repeatCode) {
        throw new Error(t("accountCodeMismatch"));
      }

      const response = await fetch("/api/auth/credentials/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, username, email, code: createCode, repeatCode }),
      });
      const body = await response.json() as { ok?: boolean; account?: Account; verificationRequired?: boolean; error?: string };

      if (!response.ok || !body.ok) {
        throw new Error(localizeAuthError(body.error, t("accountCreateError")));
      }

      setIdentifier(username || email);
      setLoginCode("");
      setCreateCode("");
      setRepeatCode("");
      setPendingVerificationEmail(email);

      if (body.verificationRequired) {
        setView("verify");
        setMessage(t("accountVerificationEmailSent"));
        return;
      }

      setView("login");
      setMessage(t("accountCreated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountCreateError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForgotCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/credentials/recover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      const body = await response.json() as { ok?: boolean; message?: string; error?: string };

      if (!response.ok || !body.ok) {
        throw new Error(localizeAuthError(body.error, t("accountGenericRecovery")));
      }

      setMessage(t("accountGenericRecovery"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountGenericRecovery"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendVerification() {
    const targetEmail = pendingVerificationEmail || email;

    if (!targetEmail) {
      setMessage(t("accountVerificationResendError"));
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/credentials/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok || !body.ok) {
        throw new Error(localizeAuthError(body.error, t("accountVerificationResendError")));
      }

      setMessage(t("accountVerificationEmailResent"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountVerificationResendError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      if (newCode && repeatNewCode && newCode !== repeatNewCode) {
        throw new Error(t("accountCodeMismatch"));
      }

      const response = await fetch("/api/auth/credentials/reset-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: newCode, repeatCode: repeatNewCode }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok || !body.ok) {
        throw new Error(localizeAuthError(body.error, t("accountCodeCouldNotReset")));
      }

      setNewCode("");
      setRepeatNewCode("");
      setView("login");
      setMessage(t("accountCodeReset"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountCodeCouldNotReset"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    setIsLoading(true);
    setMessage("");

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setSignedInAccount(null);
      setTournaments([]);
      setLoginCode("");
      setRememberLogin(false);
      setMessage(t("accountLoggedOut"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOpenTournament(tournamentId: string) {
    setOpeningTournamentId(tournamentId);
    setMessage("");

    try {
      const response = await fetch(`/api/account/tournaments/${encodeURIComponent(tournamentId)}`, { cache: "no-store" });
      const body = await response.json() as CloudTournamentOpenResponse;

      if (!response.ok || !body.ok) {
        throw new Error("error" in body && body.error ? body.error : t("accountTournamentOpenError"));
      }

      if (body.kind === "standard") {
        const localId = createStandardShadowSaveLocalId(body.state);
        saveActiveTournamentFromRemoteSync(body.state);
        markCloudTournamentRestored({
          localId,
          legacyLocalId: body.legacyLocalId,
          kind: "standard",
          tournamentId: body.tournamentId,
          updatedAt: body.updatedAt,
          organizerToken: body.organizerToken,
          canManage: body.canManage,
          matchScoreVersions: body.matchScoreVersions,
        });
        markActiveCloudTournamentAuthority({
          source: "server",
          kind: "standard",
          localId,
          tournamentId: body.tournamentId,
          canRead: body.canRead ?? true,
          canManage: body.canManage === true,
          createdByUserId: body.createdByUserId,
          controllerUserId: body.controllerUserId,
          ownerUserId: body.ownerUserId,
        });
        router.push(body.state.status === "finished" ? "/finish" : "/live");
        return;
      }

      const localId = createTeamVsTeamShadowSaveLocalId(body.state);
      saveActiveTeamVsTeamTournamentFromRemoteSync(body.state);
      markCloudTournamentRestored({
        localId,
        legacyLocalId: body.legacyLocalId,
        kind: "team-vs-team",
        tournamentId: body.tournamentId,
        updatedAt: body.updatedAt,
        organizerToken: body.organizerToken,
        canManage: body.canManage,
      });
      markActiveCloudTournamentAuthority({
        source: "server",
        kind: "team-vs-team",
        localId,
        tournamentId: body.tournamentId,
        canRead: body.canRead ?? true,
        canManage: body.canManage === true,
        createdByUserId: body.createdByUserId,
        controllerUserId: body.controllerUserId,
        ownerUserId: body.ownerUserId,
      });
      router.push("/team-vs-team");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountTournamentOpenError"));
    } finally {
      setOpeningTournamentId(null);
    }
  }

  const containerClassName = framed ? "app-card grid gap-3 p-4 sm:p-5" : "grid gap-3";

  if (account) {
    return (
      <div className={containerClassName} data-testid="account-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">{t("accountSignedIn")}</p>
            <p className="mt-1 text-xl font-black">{account.displayName || account.username || t("account")}</p>
            {account.username ? <p className="font-bold text-[var(--muted)]">@{account.username}</p> : null}
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
        <div className="rounded-md border border-[var(--line)] bg-white/70 p-3">
          <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">{t("accountOwnTournaments")}</p>
          {sortedTournaments.length ? (
            <ul className="mt-2 grid max-h-[42dvh] gap-2 overflow-y-auto pr-1 text-sm font-bold" data-testid="account-tournament-list">
              {sortedTournaments.map((tournament) => (
                <li key={tournament.id} className="grid min-w-0 gap-2 rounded-md border border-[var(--line)] bg-white/80 p-3" data-testid="account-tournament-card">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block break-words text-base font-black text-[var(--foreground)]">{tournament.name}</span>
                      <span className="mt-1 block text-xs font-black uppercase tracking-wide text-[var(--muted)]">{formatTournamentSummary(tournament)}</span>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-xs font-black ${getManagementBadgeClassName(tournament)}`}>
                      {getManagementLabel(tournament)}
                    </span>
                  </div>
                  {tournament.updatedAt ? (
                    <span className="text-xs font-bold text-[var(--muted)]">{t("accountTournamentUpdated")} {formatUpdatedAt(tournament.updatedAt)}</span>
                  ) : null}
                  <button className="btn-secondary min-h-10 text-sm" type="button" disabled={openingTournamentId === tournament.id || isLoading} onClick={() => void handleOpenTournament(tournament.id)}>
                    {openingTournamentId === tournament.id ? t("loadingTournament") : getTournamentActionLabel(tournament)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 grid gap-3 rounded-md border border-dashed border-[var(--line)] bg-white/60 p-3">
              <p className="text-sm font-bold text-[var(--muted)]">{t("accountNoOwnTournaments")}</p>
              <button className="btn-secondary min-h-10 text-sm" type="button" onClick={() => router.push("/new-tournament")}>
                {t("accountCreateTournament")}
              </button>
            </div>
          )}
        </div>
        {view === "reset" ? (
          <form className="grid gap-3 rounded-md border border-[var(--line)] bg-white/70 p-3" onSubmit={handleResetCode}>
            <CodeField label={t("accountNewCode")} value={newCode} onChange={setNewCode} showCode={showCode} />
            <CodeField label={t("accountRepeatCode")} value={repeatNewCode} onChange={setRepeatNewCode} showCode={showCode} />
            <button className="btn-primary min-h-12" type="submit" disabled={isLoading}>
              {t("accountSaveNewCode")}
            </button>
          </form>
        ) : null}
        <div className="action-grid">
          <button className="btn-secondary min-h-12" type="button" disabled={isLoading} onClick={() => setView(view === "reset" ? "login" : "reset")}>
            {view === "reset" ? t("cancel") : t("accountNewCode")}
          </button>
          <button className="btn-secondary min-h-12" type="button" disabled={isLoading} onClick={handleLogout}>
            {t("logout")}
          </button>
        </div>
        {message ? <p className="font-bold text-[var(--primary-strong)]" role="status">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className={containerClassName} data-testid="account-panel">
      {view === "login" ? (
        <form className="grid gap-3" onSubmit={handleLogin}>
          <div>
            <p className="text-lg font-black">{t("accountLogin")}</p>
          </div>
          <label className="grid gap-2 text-base font-bold">
            {t("accountIdentifier")}
            <input className="field-control" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" inputMode="email" />
          </label>
          <CodeField label={t("accountCode")} value={loginCode} onChange={setLoginCode} showCode={showCode} />
          <ShowCodeButton showCode={showCode} onToggle={() => setShowCode((value) => !value)} />
          <label className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-white/70 px-3 py-2 text-sm font-black text-[var(--foreground)]">
            <input
              checked={rememberLogin}
              className="h-4 w-4 accent-[var(--primary)]"
              onChange={(event) => setRememberLogin(event.target.checked)}
              type="checkbox"
            />
            {t("accountRememberLogin")}
          </label>
          <button className="btn-primary min-h-12" type="submit" disabled={isLoading}>
            {t("accountLogin")}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-[var(--primary-strong)]">
            <button className="rounded-md px-1 py-2 text-left" type="button" onClick={() => { setView("forgot"); setMessage(""); }}>
              {t("accountForgotCode")}?
            </button>
            <button className="rounded-md px-1 py-2 text-left" type="button" onClick={() => { setView("create"); setMessage(""); }}>
              {t("accountCreateAccount")}
            </button>
          </div>
        </form>
      ) : null}
      {view === "create" ? (
        <form className="grid gap-3" onSubmit={handleCreateAccount}>
          <div>
            <p className="text-lg font-black">{t("accountCreateAccount")}</p>
          </div>
          <label className="grid gap-2 text-base font-bold">
            {t("accountName")}
            <input className="field-control" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
          </label>
          <label className="grid gap-2 text-base font-bold">
            {t("accountUsername")}
            <input className="field-control" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label className="grid gap-2 text-base font-bold">
            {t("accountEmail")}
            <input className="field-control" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" type="email" />
          </label>
          <CodeField label={t("accountCode")} value={createCode} onChange={setCreateCode} showCode={showCode} />
          <CodeField label={t("accountRepeatCode")} value={repeatCode} onChange={setRepeatCode} showCode={showCode} />
          <ShowCodeButton showCode={showCode} onToggle={() => setShowCode((value) => !value)} />
          <button className="btn-primary min-h-12" type="submit" disabled={isLoading}>
            {t("accountCreateSubmit")}
          </button>
          <button className="rounded-md px-1 py-2 text-left text-sm font-black text-[var(--primary-strong)]" type="button" onClick={() => { setView("login"); setMessage(""); }}>
            {t("accountAlreadyHaveLogin")}
          </button>
        </form>
      ) : null}
      {view === "verify" ? (
        <div className="grid gap-3 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)]/45 p-3" data-testid="account-verification-pending">
          <div>
            <p className="text-lg font-black">{t("accountVerifyEmailTitle")}</p>
            <p className="mt-1 font-bold text-[var(--muted)]">{t("accountVerifyEmailBody")}</p>
          </div>
          {pendingVerificationEmail ? (
            <p className="break-words text-sm font-black text-[var(--primary-strong)]">{pendingVerificationEmail}</p>
          ) : null}
          <div className="action-grid">
            <button className="btn-secondary min-h-12" type="button" disabled={isLoading} onClick={() => void handleResendVerification()}>
              {t("accountResendVerification")}
            </button>
            <button className="btn-secondary min-h-12" type="button" disabled={isLoading} onClick={() => { setView("login"); setMessage(""); }}>
              {t("accountBackToLogin")}
            </button>
          </div>
        </div>
      ) : null}
      {view === "forgot" ? (
        <form className="grid gap-3" onSubmit={handleForgotCode}>
          <div>
            <p className="text-lg font-black">{t("accountForgotCode")}</p>
            <p className="mt-1 font-bold text-[var(--muted)]">{t("accountForgotCodeHelp")}</p>
          </div>
          <label className="grid gap-2 text-base font-bold">
            {t("accountEmail")}
            <input className="field-control" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} autoComplete="email" inputMode="email" type="email" />
          </label>
          <button className="btn-primary min-h-12" type="submit" disabled={isLoading}>
            {t("accountSendInstructions")}
          </button>
          <button className="rounded-md px-1 py-2 text-left text-sm font-black text-[var(--primary-strong)]" type="button" onClick={() => { setView("login"); setMessage(""); }}>
            {t("accountLogin")}
          </button>
        </form>
      ) : null}
      {message ? <p className="font-bold text-[var(--primary-strong)]" role="status">{message}</p> : null}
    </div>
  );

  function ShowCodeButton({ showCode: isShown, onToggle }: { showCode: boolean; onToggle: () => void }) {
    return (
      <button className="w-fit rounded-md px-1 py-2 text-sm font-black text-[var(--primary-strong)]" type="button" onClick={onToggle}>
        {isShown ? t("accountHideCode") : t("accountShowCode")}
      </button>
    );
  }

  function formatTournamentSummary(tournament: AccountTournament): string {
    return `${getTournamentStatusLabel(tournament.status)} · ${getTournamentFormatLabel(tournament.format)}`;
  }

  function getManagementLabel(tournament: AccountTournament): string {
    if (tournament.managementState === "completed" || tournament.status === "finished") {
      return t("accountTournamentCompleted");
    }

    if (tournament.managementState === "readOnly" || tournament.canManage === false) {
      return t("accountTournamentReadOnly");
    }

    return t("accountTournamentController");
  }

  function getTournamentActionLabel(tournament: AccountTournament): string {
    if (tournament.managementState === "completed" || tournament.status === "finished") {
      return t("seeFinalStandings");
    }

    return t("accountOpenTournament");
  }

  function getManagementBadgeClassName(tournament: AccountTournament): string {
    if (tournament.managementState === "completed" || tournament.status === "finished") {
      return "border-[var(--line)] bg-[var(--background)] text-[var(--muted)]";
    }

    if (tournament.managementState === "readOnly" || tournament.canManage === false) {
      return "border-[var(--line)] bg-[var(--background)] text-[var(--muted)]";
    }

    return "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]";
  }

  function getTournamentStatusLabel(status: string): string {
    if (status === "setup") {
      return t("accountTournamentStatusSetup");
    }

    if (status === "finished") {
      return t("accountTournamentStatusFinished");
    }

    return t("accountTournamentStatusActive");
  }

  function getTournamentFormatLabel(format: string): string {
    if (format === "americano") {
      return t("formatAmericano");
    }

    if (format === "mexicano") {
      return t("formatMexicano");
    }

    if (format === "mixed-americano") {
      return t("formatMixedAmericano");
    }

    if (format === "fixed-partner-americano") {
      return t("fixedPartnerAmericano");
    }

    if (format === "fixed-partner-mexicano") {
      return t("fixedPartnerMexicano");
    }

    if (format === "pool-play") {
      return t("formatPoolPlay");
    }

    return format;
  }

  function formatUpdatedAt(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
}

function compareAccountTournaments(left: AccountTournament, right: AccountTournament): number {
  const groupDifference = getAccountTournamentSortGroup(left) - getAccountTournamentSortGroup(right);

  if (groupDifference !== 0) {
    return groupDifference;
  }

  return getUpdatedAtTime(right.updatedAt) - getUpdatedAtTime(left.updatedAt);
}

function getAccountTournamentSortGroup(tournament: AccountTournament): number {
  if (tournament.managementState === "completed" || tournament.status === "finished") {
    return 2;
  }

  if (tournament.managementState === "readOnly" || tournament.canManage === false) {
    return 1;
  }

  return 0;
}

function getUpdatedAtTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function CodeField({ label, value, onChange, showCode }: { label: string; value: string; onChange: (value: string) => void; showCode: boolean }) {
  return (
    <label className="grid gap-2 text-base font-bold">
      {label}
      <input
        className="field-control tracking-[0.25em]"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6))}
        inputMode="text"
        autoComplete="one-time-code"
        maxLength={6}
        type={showCode ? "text" : "password"}
      />
    </label>
  );
}

function localizeAuthError(message: string | undefined, fallback: string, options: { unverifiedEmail?: string } = {}): string {
  if (!message) {
    return fallback;
  }

  if (message === "Email is not verified.") {
    return options.unverifiedEmail ?? fallback;
  }

  if (
    message === "Email/username or code is incorrect." ||
    message === "Login code is invalid." ||
    message === "Username is invalid." ||
    message === "Email is invalid." ||
    message === "Too many attempts. Try again later."
  ) {
    return fallback;
  }

  return message;
}
