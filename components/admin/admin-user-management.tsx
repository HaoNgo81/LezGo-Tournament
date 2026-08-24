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

interface AdminActionResponse {
  ok?: boolean;
  user?: ManagedAccountUser;
  generatedCode?: string;
  error?: string;
}

export function AdminUserManagement({ users: initialUsers, currentUserId }: AdminUserManagementProps) {
  const { language } = useAppTranslation();
  const copy = language === "en" ? englishCopy : danishCopy;
  const [users, setUsers] = useState(initialUsers);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [busyAction, setBusyAction] = useState("");
  const [message, setMessage] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");

  const selectedUser = selectedUserId ? users.find((user) => user.userId === selectedUserId) : undefined;

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");

    return users.filter((user) => {
      const matchesQuery = !normalizedQuery || [
        user.displayName,
        user.username ?? "",
        user.email,
        user.adminNote ?? "",
      ].some((value) => value.toLocaleLowerCase("en").includes(normalizedQuery));
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;

      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [query, roleFilter, statusFilter, users]);

  const replaceUser = (updatedUser: ManagedAccountUser) => {
    setUsers((current) => current.map((user) => user.userId === updatedUser.userId ? updatedUser : user));
    setSelectedUserId(updatedUser.userId);
  };

  const postUserAction = async (user: ManagedAccountUser, suffix: string, body: Record<string, unknown>, fallback: string): Promise<AdminActionResponse> => {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.userId)}/${suffix}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const result = await response.json() as AdminActionResponse;

    if (!response.ok || !result.ok || !result.user) {
      throw new Error(result.error || fallback);
    }

    replaceUser(result.user);
    return result;
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
      await postUserAction(user, "role", { role: nextRole }, copy.roleError);
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
      await postUserAction(user, "status", { status: nextStatus }, copy.statusError);
      setMessage(nextStatus === "active" ? copy.reactivatedMessage : copy.deactivatedMessage);
    });
  };

  const handleDetailsSave = async (user: ManagedAccountUser, values: UserDetailsFormValues) => {
    if (!window.confirm(copy.confirmDetails(user.displayName))) {
      return;
    }

    await runUserAction(`${user.userId}:details`, async () => {
      await postUserAction(user, "details", { ...values }, copy.detailsError);
      setMessage(copy.detailsSaved);
    });
  };

  const handleNoteSave = async (user: ManagedAccountUser, note: string) => {
    await runUserAction(`${user.userId}:note`, async () => {
      await postUserAction(user, "note", { note }, copy.noteError);
      setMessage(copy.noteSaved);
    });
  };

  const handleCodeReset = async (user: ManagedAccountUser, code: string, mode: "manual" | "generate") => {
    if (!window.confirm(copy.confirmResetCode(user.displayName))) {
      return;
    }

    await runUserAction(`${user.userId}:reset-code`, async () => {
      const result = await postUserAction(user, "reset-code", { mode, code: mode === "manual" ? code : undefined }, copy.resetCodeError);
      setGeneratedCode(result.generatedCode ?? "");
      setMessage(result.generatedCode ? copy.generatedCodeReady : copy.manualCodeSaved);
    });
  };

  const runUserAction = async (actionKey: string, action: () => Promise<void>) => {
    setBusyAction(actionKey);
    setMessage("");
    setGeneratedCode("");

    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.genericError);
    } finally {
      setBusyAction("");
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4" data-testid="admin-user-management">
      <div className="app-card grid gap-3 p-4 sm:p-5">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-[var(--primary-strong)]">ADMIN</p>
          <h2 className="mt-1 text-2xl font-black">{copy.title}</h2>
          <p className="mt-2 font-bold text-[var(--muted)]">{copy.description}</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(22rem,1fr)_minmax(10rem,auto)_minmax(11rem,auto)] lg:items-end">
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-black text-[var(--muted)]">
          <span>{copy.showing(visibleUsers.length, users.length)}</span>
          <span>{copy.noCredentialMaterial}</span>
        </div>
        {message ? <p className="rounded-md border border-[var(--primary)] bg-[var(--primary-soft)]/45 px-3 py-2 text-sm font-black text-[var(--primary-strong)]" role="status">{message}</p> : null}
        {generatedCode ? (
          <p className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-black text-amber-900" role="status">
            {copy.generatedCodeLabel}: <span className="font-mono text-base tracking-[0.2em]">{generatedCode}</span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3">
          {visibleUsers.map((user) => (
            <article
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 shadow-lg transition hover:border-[var(--primary)]/70 sm:p-5"
              key={user.userId}
              data-testid="admin-user-row"
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="grid min-w-0 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 break-words text-xl font-black">{user.displayName}</h3>
                    <RoleBadge role={user.role} />
                    <StatusBadge status={user.status} copy={copy} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-[var(--muted)]">
                    <span>{user.username ? `@${user.username}` : copy.noUsername}</span>
                    <span className="break-all sm:break-normal">{user.email || "-"}</span>
                  </div>
                  <dl className="grid gap-2 text-xs font-black uppercase text-[var(--muted)] sm:grid-cols-2">
                    <CompactInfo label={copy.created} value={formatDate(user.createdAt)} />
                    <CompactInfo label={copy.lastSignIn} value={formatDate(user.lastSignInAt)} />
                  </dl>
                </div>
                <button
                  className="btn-primary min-h-11 w-full px-5 py-2 text-sm md:w-40"
                  type="button"
                  onClick={() => setSelectedUserId(user.userId)}
                >
                  {copy.manage}
                </button>
              </div>
            </article>
          ))}
        </div>

        {selectedUser ? (
          <UserDetailPanel
            key={selectedUser.userId}
            copy={copy}
            user={selectedUser}
            busyAction={busyAction}
            onClose={() => setSelectedUserId("")}
            onDetailsSave={handleDetailsSave}
            onNoteSave={handleNoteSave}
            onCodeReset={handleCodeReset}
            onRoleChange={handleRoleChange}
            onStatusChange={handleStatusChange}
          />
        ) : null}
      </div>
    </section>
  );
}

interface UserDetailsFormValues {
  displayName: string;
  username: string;
  email: string;
}

function UserDetailPanel(props: {
  copy: typeof danishCopy;
  user: ManagedAccountUser;
  busyAction: string;
  onClose: () => void;
  onDetailsSave: (user: ManagedAccountUser, values: UserDetailsFormValues) => Promise<void>;
  onNoteSave: (user: ManagedAccountUser, note: string) => Promise<void>;
  onCodeReset: (user: ManagedAccountUser, code: string, mode: "manual" | "generate") => Promise<void>;
  onRoleChange: (user: ManagedAccountUser) => Promise<void>;
  onStatusChange: (user: ManagedAccountUser) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(props.user.displayName);
  const [username, setUsername] = useState(props.user.username ?? "");
  const [email, setEmail] = useState(props.user.email);
  const [note, setNote] = useState(props.user.adminNote ?? "");
  const [manualCode, setManualCode] = useState("");
  const detailsBusy = props.busyAction === `${props.user.userId}:details`;
  const noteBusy = props.busyAction === `${props.user.userId}:note`;
  const resetBusy = props.busyAction === `${props.user.userId}:reset-code`;
  const roleBusy = props.busyAction === `${props.user.userId}:role`;
  const statusBusy = props.busyAction === `${props.user.userId}:status`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-3 sm:p-6" role="presentation">
      <section
        aria-modal="true"
        className="max-h-[calc(100vh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--background)] shadow-2xl sm:max-h-[calc(100vh-3rem)]"
        data-testid="admin-user-detail"
        role="dialog"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-[var(--primary-strong)]">{props.copy.detail}</p>
            <h3 className="mt-1 break-words text-2xl font-black">{props.user.displayName}</h3>
            <p className="break-words text-sm font-bold text-[var(--muted)]">{props.user.email}</p>
          </div>
          <button className="btn-secondary min-h-10 px-4 py-2 text-sm" type="button" onClick={props.onClose}>
            {props.copy.close}
          </button>
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          <PanelSection title={props.copy.userDetails}>
            <dl className="grid gap-2 text-sm font-bold sm:grid-cols-2">
              <InfoRow label={props.copy.name} value={props.user.displayName} />
              <InfoRow label={props.copy.username} value={props.user.username ? `@${props.user.username}` : props.copy.noUsername} />
              <InfoRow label={props.copy.email} value={props.user.email || "-"} />
              <InfoRow label={props.copy.emailStatus} value={props.user.emailVerified ? props.copy.verified : props.copy.unverified} />
              <InfoRow label={props.copy.role} value={props.user.role.toUpperCase()} />
              <InfoRow label={props.copy.status} value={props.user.status === "active" ? props.copy.active : props.copy.deactivated} />
              <InfoRow label={props.copy.created} value={formatDate(props.user.createdAt)} />
              <InfoRow label={props.copy.lastSignIn} value={formatDate(props.user.lastSignInAt)} />
            </dl>
          </PanelSection>

          <PanelSection title={props.copy.profileDetails}>
            <form className="grid gap-3" onSubmit={(event) => {
        event.preventDefault();
        void props.onDetailsSave(props.user, { displayName, username, email });
      }}>
              <div className="grid gap-3 md:grid-cols-3">
                <TextField label={props.copy.name} value={displayName} onChange={setDisplayName} />
                <TextField label={props.copy.username} value={username} onChange={setUsername} />
                <TextField label={props.copy.email} value={email} onChange={setEmail} type="email" />
              </div>
              <button className="btn-primary min-h-11 w-full px-4 py-2 text-sm sm:w-fit" type="submit" disabled={detailsBusy}>
                {detailsBusy ? props.copy.saving : props.copy.saveDetails}
              </button>
            </form>
          </PanelSection>

          <PanelSection title={props.copy.internalNote}>
            <form className="grid gap-3" onSubmit={(event) => {
        event.preventDefault();
        void props.onNoteSave(props.user, note);
      }}>
              <textarea
                aria-label={props.copy.internalNote}
                className="field-control min-h-32 resize-y"
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <button className="btn-secondary min-h-11 w-full px-4 py-2 text-sm sm:w-fit" type="submit" disabled={noteBusy}>
                {noteBusy ? props.copy.saving : props.copy.saveNote}
              </button>
            </form>
          </PanelSection>

          <PanelSection title={props.copy.security}>
            <form className="grid gap-3" onSubmit={(event) => {
        event.preventDefault();
        void props.onCodeReset(props.user, manualCode, "manual");
        setManualCode("");
      }}>
              <div className="grid gap-3 sm:grid-cols-[minmax(12rem,18rem)_auto_auto] sm:items-end">
                <TextField label={props.copy.newCode} value={manualCode} onChange={(value) => setManualCode(value.toLocaleUpperCase("en"))} maxLength={6} />
                <button className="btn-primary min-h-11 px-4 py-2 text-sm" type="submit" disabled={resetBusy || manualCode.trim().length !== 6}>
                  {resetBusy ? props.copy.saving : props.copy.saveManualCode}
                </button>
                <button className="btn-secondary min-h-11 px-4 py-2 text-sm" type="button" disabled={resetBusy} onClick={() => void props.onCodeReset(props.user, "", "generate")}>
                  {props.copy.generateCode}
                </button>
              </div>
            </form>
          </PanelSection>

          <PanelSection title={props.copy.administration}>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="btn-secondary min-h-11 px-4 py-2 text-sm" type="button" disabled={roleBusy || statusBusy} onClick={() => void props.onRoleChange(props.user)}>
                {props.user.role === "admin" ? props.copy.makeUser : props.copy.makeAdmin}
              </button>
              <button className="btn-secondary min-h-11 px-4 py-2 text-sm" type="button" disabled={roleBusy || statusBusy} onClick={() => void props.onStatusChange(props.user)}>
                {props.user.status === "active" ? props.copy.deactivate : props.copy.reactivate}
              </button>
            </div>
          </PanelSection>
        </div>
      </section>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-black">
      {props.label}
      <input
        className="field-control"
        maxLength={props.maxLength}
        type={props.type ?? "text"}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-[var(--line)] bg-white/50 p-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function CompactInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt>{label}</dt>
      <dd className="truncate normal-case text-[var(--foreground)]">{value}</dd>
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

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 shadow-lg">
      <h4 className="text-sm font-black uppercase text-[var(--primary-strong)]">{title}</h4>
      {children}
    </section>
  );
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const danishCopy = {
  title: "Brugerstyring",
  description: "Administrer brugere, detaljer, interne noter, roller, status og kode-reset.",
  search: "Søg",
  searchPlaceholder: "Navn, brugernavn, e-mail eller note",
  all: "Alle",
  name: "Navn",
  username: "Brugernavn",
  noUsername: "Intet brugernavn",
  email: "E-mail",
  emailStatus: "E-mail",
  role: "Rolle",
  status: "Status",
  created: "Oprettet",
  lastSignIn: "Sidste login",
  actions: "Handlinger",
  detail: "Brugerdetaljer",
  userDetails: "Brugerdetaljer",
  profileDetails: "Profil",
  internalNote: "Intern admin-note",
  security: "Sikkerhed",
  administration: "Administration",
  codeReset: "Kode-reset",
  newCode: "Ny 6-tegns kode",
  saveDetails: "Gem oplysninger",
  saveNote: "Gem note",
  saveManualCode: "Gem ny kode",
  generateCode: "Generér kode",
  saving: "Gemmer...",
  open: "Åbn",
  manage: "Administrer",
  close: "Luk",
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
  confirmDetails: (name: string) => `Gem ændringer for ${name}?`,
  confirmResetCode: (name: string) => `Nulstil login-koden for ${name}? Den gamle kode virker ikke bagefter.`,
  showing: (visible: number, total: number) => `Viser ${visible} af ${total} brugere`,
  noCredentialMaterial: "Eksisterende koder, hashes og tokens vises aldrig.",
  roleError: "Rollen kunne ikke opdateres.",
  statusError: "Kontostatus kunne ikke opdateres.",
  detailsError: "Brugeroplysninger kunne ikke gemmes.",
  noteError: "Noten kunne ikke gemmes.",
  resetCodeError: "Koden kunne ikke nulstilles.",
  genericError: "Handlingen kunne ikke gennemføres.",
  promoted: "Brugeren er nu ADMIN.",
  demoted: "Brugeren er nu USER.",
  deactivatedMessage: "Brugeren er deaktiveret.",
  reactivatedMessage: "Brugeren er aktiveret.",
  detailsSaved: "Brugeroplysninger er gemt.",
  noteSaved: "Intern note er gemt.",
  manualCodeSaved: "Ny 6-tegns kode er gemt.",
  generatedCodeReady: "Ny genereret kode er gemt. Vis den sikkert til brugeren nu.",
  generatedCodeLabel: "Genereret kode",
};

const englishCopy: typeof danishCopy = {
  title: "User management",
  description: "Manage users, details, internal notes, roles, status and code reset.",
  search: "Search",
  searchPlaceholder: "Name, username, email or note",
  all: "All",
  name: "Name",
  username: "Username",
  noUsername: "No username",
  email: "Email",
  emailStatus: "Email",
  role: "Role",
  status: "Status",
  created: "Created",
  lastSignIn: "Last login",
  actions: "Actions",
  detail: "User details",
  userDetails: "User details",
  profileDetails: "Profile",
  internalNote: "Internal admin note",
  security: "Security",
  administration: "Administration",
  codeReset: "Code reset",
  newCode: "New 6-character code",
  saveDetails: "Save details",
  saveNote: "Save note",
  saveManualCode: "Save new code",
  generateCode: "Generate code",
  saving: "Saving...",
  open: "Open",
  manage: "Manage",
  close: "Close",
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
  confirmDetails: (name: string) => `Save changes for ${name}?`,
  confirmResetCode: (name: string) => `Reset the login code for ${name}? The old code will stop working.`,
  showing: (visible: number, total: number) => `Showing ${visible} of ${total} users`,
  noCredentialMaterial: "Existing codes, hashes and tokens are never shown.",
  roleError: "Role could not be updated.",
  statusError: "Account status could not be updated.",
  detailsError: "User details could not be saved.",
  noteError: "The note could not be saved.",
  resetCodeError: "The code could not be reset.",
  genericError: "The action could not be completed.",
  promoted: "The user is now ADMIN.",
  demoted: "The user is now USER.",
  deactivatedMessage: "The user is deactivated.",
  reactivatedMessage: "The user is active.",
  detailsSaved: "User details saved.",
  noteSaved: "Internal note saved.",
  manualCodeSaved: "New 6-character code saved.",
  generatedCodeReady: "New generated code saved. Share it securely with the user now.",
  generatedCodeLabel: "Generated code",
};
