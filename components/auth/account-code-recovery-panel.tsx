"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppTranslation } from "@/lib/preferences/client";

export function AccountCodeRecoveryPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useAppTranslation();
  const [code, setCode] = useState("");
  const [repeatCode, setRepeatCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recoveryCredentials] = useState(() => readRecoveryCredentials(searchParams));
  const hasRecoveryToken = Boolean(recoveryCredentials.type === "recovery" && (recoveryCredentials.tokenHash || recoveryCredentials.accessToken));

  useEffect(() => {
    if (recoveryCredentials.accessToken && window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [recoveryCredentials.accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/credentials/recover/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken: recoveryCredentials.accessToken,
          tokenHash: recoveryCredentials.tokenHash,
          type: recoveryCredentials.type,
          code,
          repeatCode,
        }),
      });
      const body = await response.json() as { ok?: boolean; error?: string };

      if (!response.ok || !body.ok) {
        throw new Error(localizeRecoveryError(body.error, t("accountRecoveryInvalidLink"), {
          mismatch: t("accountCodeMismatch"),
          invalidCode: t("accountCodeInvalid"),
        }));
      }

      setCode("");
      setRepeatCode("");
      setIsSuccess(true);
      setMessage(t("accountRecoveryCodeChanged"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("accountRecoveryInvalidLink"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="app-card mx-auto grid w-full max-w-xl gap-4 p-4 sm:p-5" data-testid="account-code-recovery-panel">
      <div>
        <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">{t("accountResetCodeTitle")}</p>
        <h2 className="mt-1 text-2xl font-black">{t("accountNewCode")}</h2>
      </div>

      {!hasRecoveryToken ? (
        <div className="grid gap-3">
          <p className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm font-bold text-yellow-900" role="status">
            {t("accountRecoveryInvalidLink")}
          </p>
          <button className="btn-secondary min-h-12" type="button" onClick={() => router.push("/")}>
            {t("accountLogin")}
          </button>
        </div>
      ) : isSuccess ? (
        <div className="grid gap-3">
          <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]" role="status">{message}</p>
          <button className="btn-primary min-h-12" type="button" onClick={() => router.push("/")}>
            {t("accountLogin")}
          </button>
        </div>
      ) : (
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <CodeField label={t("accountNewCode")} value={code} onChange={setCode} showCode={showCode} />
          <CodeField label={t("accountRepeatCode")} value={repeatCode} onChange={setRepeatCode} showCode={showCode} />
          <button className="w-fit rounded-md px-1 py-2 text-sm font-black text-[var(--primary-strong)]" type="button" onClick={() => setShowCode((value) => !value)}>
            {showCode ? t("accountHideCode") : t("accountShowCode")}
          </button>
          <button className="btn-primary min-h-12" type="submit" disabled={isLoading}>
            {isLoading ? t("loadingTournament") : t("accountResetCodeTitle")}
          </button>
        </form>
      )}

      {message && !isSuccess ? <p className="font-bold text-[var(--primary-strong)]" role="status">{message}</p> : null}
    </section>
  );
}

function readRecoveryCredentials(searchParams: URLSearchParams): { tokenHash: string; accessToken: string; type: string } {
  if (typeof window !== "undefined" && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token") ?? "";
    const type = hashParams.get("type") ?? "";

    if (accessToken && type === "recovery") {
      return {
        tokenHash: "",
        accessToken,
        type,
      };
    }
  }

  return {
    tokenHash: searchParams.get("token_hash") ?? "",
    accessToken: "",
    type: searchParams.get("type") ?? "",
  };
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

function localizeRecoveryError(message: string | undefined, fallback: string, options: { mismatch: string; invalidCode: string }): string {
  if (message === "Login codes do not match.") {
    return options.mismatch;
  }

  if (message === "Login code is invalid.") {
    return options.invalidCode;
  }

  return fallback;
}
