"use client";

import { useMemo, useState } from "react";
import { useAppTranslation } from "@/lib/preferences/client";
import type { AccountRole } from "@/lib/auth";
import type { ManagedAccountStatus, ManagedAccountUser } from "@/lib/admin/users";

interface AdminUserManagementProps {
  users: ManagedAccountUser[];
  currentUserId: string;
}

type RoleFilter = "all" | AccountRole;
type StatusFilter = "all" | ManagedAccountStatus;
type VerificationFilter = "all" | "verified" | "unverified";

interface AdminActionResponse {
  ok?: boolean;
  user?: ManagedAccountUser;
  error?: string;
}

export function AdminUserManagement({ users: initialUsers, currentUserId }: AdminUserManagementProps) {
  const { language } = useAppTranslation();
  const copy = language === "en" ? englishCopy : danishCopy;
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");

    return users.filter((user) => {
      const matchesQuery = !normalizedQuery || [
        user.displayName,
        user.username ?? "",
        user.email,
      ].some((value) => value.toLocaleLowerCase("en").includes(normalizedQuery));
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      const matchesVerification = verificationFilter === "all" || (verificationFilter === "verified" ? user.emailVerified : !user.emailVerified);

      return matchesQuery && matchesRole && matchesStatus && matchesVerification;
    });
  }, [query, roleFilter, statusFilter, users, verificationFilter]);

  const replaceUser = (updatedUser: ManagedAccountUser) => {
    setUsers((current) => current.map((user) => user.userId === updatedUser.userId ? updatedUser : user));
  };

  const handleRoleChange = async (user: ManagedAccountUser) => {
    const nextRole: AccountRole = user.role === "admin" ? "user" : "admin";
    const confirmation = nextRole === "admin"
      ? copy.confirmPromote(user.displayName)
      : user.userId === currentUserId
        ? copy.confirmSelfDemote(user.displayName)
        : copy.confirmDemote(user.displayName);

    if (!window.confirm(confirmation)) {
      return;
    }

    await runUserAction(`${user.userId}:role`, async () => {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.userId)}/role`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: nextRole }),
      });
      const body = await response.json() as AdminActionResponse;

      if (!response.ok || !body.ok || !body.user) {
        throw new Error(body.error || copy.roleError);
      }

      replaceUser(body.user);
      setMessage(nextRole === "admin" ? copy.promoted : copy.demoted);
    });
  };

  const handleStatusChange = async (user: ManagedAccountUser) => {
    const nextStatus: ManagedAccountStatus = user.status === "active" ? "deactivated" : "active";
    const confirmation = nextStatus === "deactivated"
      ? copy.confirmDeactivate(user.displayName)
      : copy.confirmReactivate(user.displayName);

    if (!window.confirm(confirmation)) {
      return;
    }

    await runUserAction(`${user.userId}:status`, async () => {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.userId)}/status`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await response.json() as AdminActionResponse;

      if (!response.ok || !body.ok || !body.user) {
        throw new Error(body.error || copy.statusError);
      }

      replaceUser(body.user);
      setMessage(nextStatus === "active" ? copy.reactivatedMessage : copy.deactivatedMessage);
    });
  };

  const runUserAction = async (actionKey: string, action: () => Promise<void>) => {
    setBusyAction(actionKey);
    setMessage("");

    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setBusyAction("");
    }
  };

  return (
    <section className="grid gap-4" data-testid="admin-user-management">
      <div className="app-card grid gap-3 p-4 sm:p-5">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">ADMIN</p>
          <h2 className="mt-1 text-2xl font-black">{copy.title}</h2>
          <p className="mt-2 font-bold text-[var(--muted)]">{copy.description}</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
          <label className="grid gap-1 text-sm font-black">
            {copy.search}
            <input
              className="field-control"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              type="search"
            />
          </label>
          <FilterSelect label={copy.role} value={roleFilter} onChange={(value) => setRoleFilter(value as RoleFilter)} options={[
            ["all", copy.all],
            ["admin", "ADMIN"],
            ["user", "USER"],
          ]} />
          <FilterSelect label={copy.status} value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)} options={[
            ["all", copy.all],
            ["active", copy.active],
            ["deactivated", copy.deactivated],
          ]} />
          <FilterSelect label={copy.email} value={verificationFilter} onChange={(value) => setVerificationFilter(value as VerificationFilter)} options={[
            ["all", copy.all],
            ["verified", copy.verified],
            ["unverified", copy.unverified],
          ]} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-[var(--muted)]">
          <span>{copy.showing(visibleUsers.length, users.length)}</span>
          <span>{copy.noCredentialMaterial}</span>
        </div>
        {message ? <p className="rounded-md border border-[var(--primary)] bg-[var(--primary-soft)]/45 px-3 py-2 text-sm font-black text-[var(--primary-strong)]" role="status">{message}</p> : null}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] shadow-xl md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-[var(--primary-soft)]/60 text-xs uppercase text-[var(--primary-strong)]">
            <tr>
              <TableHeader className="w-[18%]">{copy.name}</TableHeader>
              <TableHeader className="w-[14%]">{copy.username}</TableHeader>
              <TableHeader className="w-[23%]">{copy.email}</TableHeader>
              <TableHeader className="w-[9%]">{copy.role}</TableHeader>
              <TableHeader className="w-[11%]">{copy.emailStatus}</TableHeader>
              <TableHeader className="w-[11%]">{copy.status}</TableHeader>
              <TableHeader className="w-[14%]">{copy.actions}</TableHeader>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => (
              <tr className="border-t border-[var(--line)]" key={user.userId} data-testid="admin-user-row">
                <TableCell>{user.displayName}</TableCell>
                <TableCell>{user.username ? `@${user.username}` : "-"}</TableCell>
                <TableCell>{user.email || "-"}</TableCell>
                <TableCell><RoleBadge role={user.role} /></TableCell>
                <TableCell>{user.emailVerified ? copy.verified : copy.unverified}</TableCell>
                <TableCell><StatusBadge status={user.status} copy={copy} /></TableCell>
                <TableCell>
                  <UserActions
                    copy={copy}
                    user={user}
                    busyAction={busyAction}
                    onRoleChange={handleRoleChange}
                    onStatusChange={handleStatusChange}
                  />
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {visibleUsers.map((user) => (
          <article className="app-card grid gap-3 p-4" key={user.userId} data-testid="admin-user-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-xl font-black">{user.displayName}</h3>
                <p className="break-words text-sm font-bold text-[var(--muted)]">{user.username ? `@${user.username}` : copy.noUsername}</p>
              </div>
              <RoleBadge role={user.role} />
            </div>
            <dl className="grid gap-2 text-sm font-bold">
              <InfoRow label={copy.email} value={user.email || "-"} />
              <InfoRow label={copy.emailStatus} value={user.emailVerified ? copy.verified : copy.unverified} />
              <InfoRow label={copy.status} value={user.status === "active" ? copy.active : copy.deactivated} />
            </dl>
            <UserActions
              copy={copy}
              user={user}
              busyAction={busyAction}
              onRoleChange={handleRoleChange}
              onStatusChange={handleStatusChange}
            />
          </article>
        ))}
      </div>
    </section>
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
      <select className="field-control min-w-36" value={props.value} onChange={(event) => props.onChange(event.target.value)}>
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
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 border-t border-[var(--line)] pt-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function RoleBadge({ role }: { role: AccountRole }) {
  return (
    <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-black ${role === "admin" ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "border-[var(--line)] bg-white/80 text-[var(--muted)]"}`}>
      {role.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status, copy }: { status: ManagedAccountStatus; copy: typeof danishCopy }) {
  return (
    <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-black ${status === "active" ? "border-emerald-500/50 bg-emerald-50 text-emerald-800" : "border-red-500/50 bg-red-50 text-red-800"}`}>
      {status === "active" ? copy.active : copy.deactivated}
    </span>
  );
}

function UserActions(props: {
  copy: typeof danishCopy;
  user: ManagedAccountUser;
  busyAction: string;
  onRoleChange: (user: ManagedAccountUser) => Promise<void>;
  onStatusChange: (user: ManagedAccountUser) => Promise<void>;
}) {
  const roleBusy = props.busyAction === `${props.user.userId}:role`;
  const statusBusy = props.busyAction === `${props.user.userId}:status`;

  return (
    <div className="grid gap-2">
      <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" disabled={roleBusy || statusBusy} onClick={() => void props.onRoleChange(props.user)}>
        {props.user.role === "admin" ? props.copy.makeUser : props.copy.makeAdmin}
      </button>
      <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" disabled={roleBusy || statusBusy} onClick={() => void props.onStatusChange(props.user)}>
        {props.user.status === "active" ? props.copy.deactivate : props.copy.reactivate}
      </button>
    </div>
  );
}

const danishCopy = {
  title: "Brugerstyring",
  description: "Administrer brugere, roller og kontostatus.",
  search: "Søg",
  searchPlaceholder: "Navn, brugernavn eller e-mail",
  all: "Alle",
  name: "Navn",
  username: "Brugernavn",
  noUsername: "Intet brugernavn",
  email: "E-mail",
  emailStatus: "E-mail",
  role: "Rolle",
  status: "Status",
  actions: "Handlinger",
  verified: "Bekræftet",
  unverified: "Ikke bekræftet",
  active: "Aktiv",
  deactivated: "Deaktiveret",
  makeAdmin: "Gør ADMIN",
  makeUser: "Gør USER",
  deactivate: "Deaktivér bruger",
  reactivate: "Aktivér bruger",
  confirmPromote: (name: string) => `Gør ${name} til ADMIN?`,
  confirmDemote: (name: string) => `Gør ${name} til USER?`,
  confirmSelfDemote: (name: string) => `Du er ved at fjerne ADMIN fra dig selv (${name}). Fortsæt kun hvis en anden ADMIN findes.`,
  confirmDeactivate: (name: string) => `Deaktivér ${name}? Brugeren kan ikke logge ind eller skrive til egne turneringer.`,
  confirmReactivate: (name: string) => `Aktivér ${name}?`,
  showing: (visible: number, total: number) => `Viser ${visible} af ${total} brugere`,
  noCredentialMaterial: "Koder og hashes vises aldrig.",
  roleError: "Rollen kunne ikke opdateres.",
  statusError: "Kontostatus kunne ikke opdateres.",
  genericError: "Handlingen kunne ikke gennemføres.",
  promoted: "Brugeren er nu ADMIN.",
  demoted: "Brugeren er nu USER.",
  deactivatedMessage: "Brugeren er deaktiveret.",
  reactivatedMessage: "Brugeren er aktiveret.",
};

const englishCopy: typeof danishCopy = {
  title: "User management",
  description: "Manage users, roles and account status.",
  search: "Search",
  searchPlaceholder: "Name, username or email",
  all: "All",
  name: "Name",
  username: "Username",
  noUsername: "No username",
  email: "Email",
  emailStatus: "Email",
  role: "Role",
  status: "Status",
  actions: "Actions",
  verified: "Verified",
  unverified: "Not verified",
  active: "Active",
  deactivated: "Deactivated",
  makeAdmin: "Make ADMIN",
  makeUser: "Make USER",
  deactivate: "Deactivate user",
  reactivate: "Reactivate user",
  confirmPromote: (name: string) => `Make ${name} ADMIN?`,
  confirmDemote: (name: string) => `Make ${name} USER?`,
  confirmSelfDemote: (name: string) => `You are removing ADMIN from yourself (${name}). Continue only if another ADMIN exists.`,
  confirmDeactivate: (name: string) => `Deactivate ${name}? The user cannot log in or write to owned tournaments.`,
  confirmReactivate: (name: string) => `Reactivate ${name}?`,
  showing: (visible: number, total: number) => `Showing ${visible} of ${total} users`,
  noCredentialMaterial: "Codes and hashes are never shown.",
  roleError: "Role could not be updated.",
  statusError: "Account status could not be updated.",
  genericError: "The action could not be completed.",
  promoted: "The user is now ADMIN.",
  demoted: "The user is now USER.",
  deactivatedMessage: "The user is deactivated.",
  reactivatedMessage: "The user is active.",
};
