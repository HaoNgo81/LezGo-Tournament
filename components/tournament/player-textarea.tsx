import { mockPlayers } from "@/lib/mock/tournament-data";

export function PlayerTextarea() {
  return (
    <textarea
      className="min-h-64 w-full resize-y rounded-md border border-[var(--line)] bg-white p-4 text-xl leading-8 shadow-sm focus:border-[var(--primary)] focus:outline-none focus:ring-4 focus:ring-green-100"
      defaultValue={mockPlayers.join("\n")}
      aria-label="Spillere, et navn pr. linje"
    />
  );
}
