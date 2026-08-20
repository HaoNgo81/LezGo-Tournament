"use client";

import { useMemo, useState } from "react";
import type { ManagedTournament, ManagedTournamentPerson, ManagedTournamentStatus } from "@/lib/admin/tournaments";

interface AdminTournamentManagementProps {
  tournaments: ManagedTournament[];
  currentUserId: string;
}

type StatusFilter = "all" | ManagedTournamentStatus;
type FormatFilter = "all" | "americano" | "fixed-partner-americano" | "mixed-americano" | "mexicano" | "fixed-partner-mexicano" | "team-vs-team" | "pool-play";

interface TakeoverResponse {
  ok?: boolean;
  tournament?: ManagedTournament;
  error?: string;
}

export function AdminTournamentManagement({ tournaments: initialTournaments }: AdminTournamentManagementProps) {
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
  const [expandedTournamentId, setExpandedTournamentId] = useState<string | null>(null);
  const [confirmTournament, setConfirmTournament] = useState<ManagedTournament | null>(null);
  const [busyTournamentId, setBusyTournamentId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const visibleTournaments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("da");

    return tournaments.filter((tournament) => {
      const matchesQuery = !normalizedQuery || [
        tournament.name,
        formatLabel(tournament.format),
        statusLabel(tournament.status),
        tournament.creator.displayName,
        tournament.creator.username ?? "",
        tournament.controller.displayName,
        tournament.controller.username ?? "",
      ].some((value) => value.toLocaleLowerCase("da").includes(normalizedQuery));
      const matchesStatus = statusFilter === "all" || tournament.status === statusFilter;
      const matchesFormat = formatFilter === "all" || tournament.format === formatFilter;

      return matchesQuery && matchesStatus && matchesFormat;
    });
  }, [formatFilter, query, statusFilter, tournaments]);

  const replaceTournament = (updatedTournament: ManagedTournament) => {
    setTournaments((current) => current.map((tournament) => tournament.id === updatedTournament.id ? updatedTournament : tournament));
  };

  const handleTakeover = async (tournament: ManagedTournament) => {
    setBusyTournamentId(tournament.id);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournament.id)}/takeover`, {
        method: "POST",
      });
      const body = await response.json() as TakeoverResponse;

      if (!response.ok || !body.ok || !body.tournament) {
        throw new Error(body.error || "Turneringen kunne ikke overtages.");
      }

      replaceTournament(body.tournament);
      setExpandedTournamentId(body.tournament.id);
      setConfirmTournament(null);
      setMessage("Du styrer nu denne turnering.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Turneringen kunne ikke overtages.");
    } finally {
      setBusyTournamentId(null);
    }
  };

  return (
    <section className="grid gap-4" data-testid="admin-tournament-management">
      <div className="app-card grid gap-3 p-4 sm:p-5">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">TURNERINGSSTYRING</p>
          <h2 className="mt-1 text-2xl font-black">Turneringer</h2>
          <p className="mt-2 font-bold text-[var(--muted)]">Se og administrer turneringer.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
          <label className="grid gap-1 text-sm font-black">
            Søg
            <input
              className="field-control"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søg efter turnering, bruger eller format"
              type="search"
            />
          </label>
          <FilterSelect label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)} options={[
            ["all", "Alle"],
            ["setup", "Kommende"],
            ["active", "Aktive"],
            ["finished", "Afsluttede"],
          ]} />
          <FilterSelect label="Format" value={formatFilter} onChange={(value) => setFormatFilter(value as FormatFilter)} options={[
            ["all", "Alle"],
            ["americano", "Americano"],
            ["fixed-partner-americano", "Fast Makker Americano"],
            ["mixed-americano", "Mixed Americano"],
            ["mexicano", "Mexicano"],
            ["fixed-partner-mexicano", "Fast Makker Mexicano"],
            ["team-vs-team", "Team vs Team"],
            ["pool-play", "Puljespil"],
          ]} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-[var(--muted)]">
          <span>Viser {visibleTournaments.length} af {tournaments.length} turneringer</span>
          <span>Ingen turneringer kan slettes her.</span>
        </div>
        {message ? <p className="rounded-md border border-[var(--primary)] bg-[var(--primary-soft)]/45 px-3 py-2 text-sm font-black text-[var(--primary-strong)]" role="status">{message}</p> : null}
      </div>

      {visibleTournaments.length ? (
        <>
          <div className="hidden overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-xl lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-[var(--primary-soft)]/60 text-xs uppercase text-[var(--primary-strong)]">
                <tr>
                  <TableHeader className="w-[20%]">Turnering</TableHeader>
                  <TableHeader className="w-[13%]">Format</TableHeader>
                  <TableHeader className="w-[9%]">Status</TableHeader>
                  <TableHeader className="w-[16%]">Oprettet af</TableHeader>
                  <TableHeader className="w-[16%]">Styres af</TableHeader>
                  <TableHeader className="w-[12%]">Opdateret</TableHeader>
                  <TableHeader className="w-[14%]">Handlinger</TableHeader>
                </tr>
              </thead>
              <tbody>
                {visibleTournaments.map((tournament) => (
                  <TournamentTableRows
                    key={tournament.id}
                    tournament={tournament}
                    expanded={expandedTournamentId === tournament.id}
                    busy={busyTournamentId === tournament.id}
                    onOpen={() => setExpandedTournamentId(expandedTournamentId === tournament.id ? null : tournament.id)}
                    onTakeover={() => setConfirmTournament(tournament)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {visibleTournaments.map((tournament) => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                expanded={expandedTournamentId === tournament.id}
                busy={busyTournamentId === tournament.id}
                onOpen={() => setExpandedTournamentId(expandedTournamentId === tournament.id ? null : tournament.id)}
                onTakeover={() => setConfirmTournament(tournament)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="app-card p-4 text-sm font-black text-[var(--muted)]">Ingen turneringer endnu.</div>
      )}

      {confirmTournament ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/45 p-5" role="dialog" aria-modal="true" aria-labelledby="admin-takeover-title">
          <div className="w-full max-w-lg rounded-md border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl">
            <h3 className="text-2xl font-black" id="admin-takeover-title">Overtag styring af turnering?</h3>
            <p className="mt-3 font-bold text-[var(--muted)]">
              Du overtager styringen af denne turnering. Den oprindelige opretter bevares i historikken.
            </p>
            <dl className="mt-4 grid gap-2 text-sm font-bold">
              <InfoRow label="Turnering" value={confirmTournament.name} />
              <InfoRow label="Oprettet af" value={personLabel(confirmTournament.creator)} />
              <InfoRow label="Styres i øjeblikket af" value={personLabel(confirmTournament.controller)} />
            </dl>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button className="btn-secondary min-h-12" type="button" disabled={busyTournamentId === confirmTournament.id} onClick={() => setConfirmTournament(null)}>
                Annuller
              </button>
              <button className="btn-primary min-h-12" type="button" disabled={busyTournamentId === confirmTournament.id} onClick={() => void handleTakeover(confirmTournament)}>
                {busyTournamentId === confirmTournament.id ? "Overtager..." : "Overtag styring"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TournamentTableRows(props: {
  tournament: ManagedTournament;
  expanded: boolean;
  busy: boolean;
  onOpen: () => void;
  onTakeover: () => void;
}) {
  return (
    <>
      <tr className="border-t border-[var(--line)]" data-testid="admin-tournament-row">
        <TableCell>{props.tournament.name}</TableCell>
        <TableCell>{formatLabel(props.tournament.format)}</TableCell>
        <TableCell><StatusBadge status={props.tournament.status} /></TableCell>
        <TableCell><PersonBlock person={props.tournament.creator} /></TableCell>
        <TableCell><PersonBlock person={props.tournament.controller} /></TableCell>
        <TableCell>{formatDate(props.tournament.updatedAt)}</TableCell>
        <TableCell><TournamentActions {...props} /></TableCell>
      </tr>
      {props.expanded ? (
        <tr className="border-t border-[var(--line)] bg-[var(--primary-soft)]/20">
          <td className="px-3 py-3" colSpan={7}>
            <TournamentInspection tournament={props.tournament} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function TournamentCard(props: {
  tournament: ManagedTournament;
  expanded: boolean;
  busy: boolean;
  onOpen: () => void;
  onTakeover: () => void;
}) {
  return (
    <article className="app-card grid gap-3 p-4" data-testid="admin-tournament-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-xl font-black">{props.tournament.name}</h3>
          <p className="text-sm font-bold text-[var(--muted)]">{formatLabel(props.tournament.format)}</p>
        </div>
        <StatusBadge status={props.tournament.status} />
      </div>
      <dl className="grid gap-2 text-sm font-bold">
        <InfoRow label="Oprettet af" value={personLabel(props.tournament.creator)} />
        <InfoRow label="Styres af" value={personLabel(props.tournament.controller)} />
        <InfoRow label="Opdateret" value={formatDate(props.tournament.updatedAt)} />
      </dl>
      <TournamentActions {...props} />
      {props.expanded ? <TournamentInspection tournament={props.tournament} /> : null}
    </article>
  );
}

function TournamentActions(props: {
  tournament: ManagedTournament;
  busy: boolean;
  onOpen: () => void;
  onTakeover: () => void;
}) {
  return (
    <div className="grid gap-2">
      <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={props.onOpen}>
        Åbn
      </button>
      {props.tournament.isControlledByCurrentAdmin ? (
        <span className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2 text-center text-sm font-black text-[var(--primary-strong)]">
          Du styrer
        </span>
      ) : (
        <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" disabled={props.busy} onClick={props.onTakeover}>
          Overtag styring
        </button>
      )}
    </div>
  );
}

function TournamentInspection({ tournament }: { tournament: ManagedTournament }) {
  return (
    <div className="grid gap-2 rounded-md border border-[var(--line)] bg-white/70 p-3 text-sm font-bold" data-testid="admin-tournament-inspection">
      <p className="font-black text-[var(--primary-strong)]">Inspektion</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <InfoRow label="Runde" value={tournament.activeRoundNumber ? String(tournament.activeRoundNumber) : "-"} />
        <InfoRow label="Baner" value={tournament.courtCount ? String(tournament.courtCount) : "-"} />
        <InfoRow label="Runder" value={tournament.configuredRounds ? String(tournament.configuredRounds) : "-"} />
        <InfoRow label="Oprettet" value={formatDate(tournament.createdAt)} />
      </div>
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-black">
      {props.label}
      <select className="field-control min-w-40" value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        {props.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}

function TableHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-black ${className}`}>{children}</th>;
}

function TableCell({ children }: { children: React.ReactNode }) {
  return <td className="break-words px-3 py-3 align-top font-bold">{children}</td>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 border-t border-[var(--line)] pt-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function PersonBlock({ person }: { person: ManagedTournamentPerson }) {
  return (
    <div>
      <p>{person.displayName}</p>
      {person.username ? <p className="text-xs text-[var(--muted)]">@{person.username}</p> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: ManagedTournamentStatus }) {
  return (
    <span className="inline-flex w-fit rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] px-2 py-1 text-xs font-black text-[var(--primary-strong)]">
      {statusLabel(status)}
    </span>
  );
}

function personLabel(person: ManagedTournamentPerson): string {
  return person.username ? `${person.displayName} (@${person.username})` : person.displayName;
}

function statusLabel(status: ManagedTournamentStatus): string {
  if (status === "setup") return "Kommende";
  if (status === "active") return "Aktiv";
  return "Afsluttet";
}

function formatLabel(format: string): string {
  const labels: Record<string, string> = {
    americano: "Americano",
    "fixed-partner-americano": "Fast Makker Americano",
    "mixed-americano": "Mixed Americano",
    mexicano: "Mexicano",
    "fixed-partner-mexicano": "Fast Makker Mexicano",
    "team-vs-team": "Team vs Team",
    "pool-play": "Puljespil",
  };
  return labels[format] ?? format;
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
