import { assertSupabaseServerConfig } from "@/lib/supabase/server";

export interface SupabaseAdminAuthUser {
  id: string;
  email: string;
  created_at?: unknown;
  confirmed_at?: unknown;
  email_confirmed_at?: unknown;
  banned_until?: unknown;
  deleted_at?: unknown;
  user_metadata?: {
    display_name?: unknown;
    name?: unknown;
    username?: unknown;
  };
}

export class SupabaseAuthAdminError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SupabaseAuthAdminError";
    this.status = status;
  }
}

interface SupabaseAdminAuthConfig {
  url: string;
  serviceRoleKey: string;
}

export async function readSupabaseAdminAuthUser(userId: string): Promise<SupabaseAdminAuthUser | null> {
  const config = getSupabaseAdminAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "GET",
    headers: getAdminAuthHeaders(config),
  });
  const body = await parseJson(response);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new SupabaseAuthAdminError("Account state could not be read.", response.status || 500);
  }

  return getAuthUserFromBody(body);
}

export async function updateSupabaseAdminAuthUserBan(userId: string, banDuration: string): Promise<SupabaseAdminAuthUser> {
  const config = getSupabaseAdminAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: getAdminAuthHeaders(config),
    body: JSON.stringify({
      ban_duration: banDuration,
    }),
  });
  const body = await parseJson(response);
  const user = getAuthUserFromBody(body);

  if (!response.ok || !user) {
    throw new SupabaseAuthAdminError("Account status could not be updated.", response.status || 500);
  }

  return user;
}

export async function deleteSupabaseAdminAuthUser(userId: string): Promise<void> {
  const config = getSupabaseAdminAuthConfig();
  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: getAdminAuthHeaders(config),
  });

  if (!response.ok) {
    throw new SupabaseAuthAdminError("Account could not be deleted.", response.status || 500);
  }
}

export function isSupabaseAdminAuthUserVerified(user: Pick<SupabaseAdminAuthUser, "email_confirmed_at" | "confirmed_at">): boolean {
  return Boolean(parseAuthDate(user.email_confirmed_at) || parseAuthDate(user.confirmed_at));
}

export function isSupabaseAdminAuthUserDeactivated(user: Pick<SupabaseAdminAuthUser, "banned_until" | "deleted_at">): boolean {
  if (parseAuthDate(user.deleted_at)) {
    return true;
  }

  const bannedUntil = parseAuthDate(user.banned_until);
  return Boolean(bannedUntil && bannedUntil.getTime() > Date.now());
}

function getSupabaseAdminAuthConfig(): SupabaseAdminAuthConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serverConfig = assertSupabaseServerConfig();

  if (!url) {
    throw new SupabaseAuthAdminError("Supabase Auth is not configured.", 503);
  }

  return {
    url: url.replace(/\/$/, ""),
    serviceRoleKey: serverConfig.serviceRoleKey,
  };
}

function getAdminAuthHeaders(config: SupabaseAdminAuthConfig): HeadersInit {
  return {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getAuthUserFromBody(value: unknown): SupabaseAdminAuthUser | null {
  if (isAuthUser(value)) {
    return value;
  }

  const nested = (value as { user?: unknown } | null)?.user;
  return isAuthUser(nested) ? nested : null;
}

function isAuthUser(value: unknown): value is SupabaseAdminAuthUser {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as SupabaseAdminAuthUser).id === "string" &&
    typeof (value as SupabaseAdminAuthUser).email === "string",
  );
}

function parseAuthDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
