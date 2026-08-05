import Link from "next/link";
import type { ReactNode } from "react";

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backHref?: string;
  primaryAction?: ReactNode;
}

export function AppShell({ title, subtitle, children, backHref = "/", primaryAction }: AppShellProps) {
  return (
    <main className="safe-screen mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-4">
        {backHref ? (
          <Link className="inline-flex min-h-11 w-fit items-center rounded-md px-1 text-base font-black text-[var(--primary-strong)]" href={backHref}>
            Tilbage
          </Link>
        ) : null}
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-normal text-[var(--primary-strong)]">LEZGO PADEL</p>
          <h1 className="mt-2 text-2xl font-black leading-tight text-[var(--foreground)] sm:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-2xl text-base font-bold leading-7 text-[var(--muted)] sm:text-lg">{subtitle}</p> : null}
        </div>
      </header>
      {children}
      {primaryAction ? <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white/95 p-3 shadow-2xl backdrop-blur sm:p-4"><div className="mx-auto max-w-4xl">{primaryAction}</div></div> : null}
    </main>
  );
}
