import Link from "next/link";
import type { ReactNode } from "react";

interface LargeActionProps {
  href: string;
  title: string;
  description?: string;
  icon: ReactNode;
}

export function LargeAction({ href, title, description, icon }: LargeActionProps) {
  return (
    <Link className="app-card flex min-h-28 items-start gap-4 p-4 sm:items-center sm:p-5 transition hover:border-[var(--primary)] focus:outline-none focus:ring-4 focus:ring-green-100" href={href}>
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-[var(--primary-soft)] text-2xl font-black text-[var(--primary-strong)]" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-black leading-tight sm:text-2xl">{title}</span>
        {description ? <span className="mt-1 block text-base font-bold leading-6 text-[var(--muted)]">{description}</span> : null}
      </span>
    </Link>
  );
}
