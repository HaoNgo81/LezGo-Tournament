import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  children: ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-black leading-tight sm:text-xl">{title}</h2>
      {children}
    </section>
  );
}
