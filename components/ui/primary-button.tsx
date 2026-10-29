import Link from "next/link";
import type { ReactNode } from "react";

interface PrimaryButtonProps {
  href?: string;
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  describedBy?: string;
  onClick?: () => void;
}

// Dark text on gold: #191d1b on #d8aa20 is 7.9:1 (white on gold was 2.2:1).
// Disabled: --muted on --control-hover-bg is 5.2:1 (gray-300 gave 4.2:1).
const className = "inline-flex min-h-14 w-full items-center justify-center rounded-md bg-[var(--primary)] px-5 text-center text-lg font-black text-[var(--foreground)] shadow-sm transition hover:bg-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:border-2 disabled:border-dashed disabled:border-[var(--control-border)] disabled:bg-[var(--control-hover-bg)] disabled:text-[var(--muted)] disabled:shadow-none";

export function PrimaryButton({ href, children, type = "button", disabled = false, describedBy, onClick }: PrimaryButtonProps) {
  if (href) {
    return <Link className={className} href={href}>{children}</Link>;
  }

  return <button aria-describedby={describedBy} className={className} disabled={disabled} onClick={onClick} type={type}>{children}</button>;
}
