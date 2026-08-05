import Link from "next/link";
import type { ReactNode } from "react";

interface PrimaryButtonProps {
  href?: string;
  children: ReactNode;
  type?: "button" | "submit";
}

export function PrimaryButton({ href, children, type = "button" }: PrimaryButtonProps) {
  const className = "inline-flex min-h-14 w-full items-center justify-center rounded-md bg-[var(--primary)] px-5 text-center text-lg font-black text-white shadow-sm transition hover:bg-[var(--primary-strong)] focus:outline-none focus:ring-4 focus:ring-green-100 disabled:bg-gray-300";

  if (href) {
    return <Link className={className} href={href}>{children}</Link>;
  }

  return <button className={className} type={type}>{children}</button>;
}
