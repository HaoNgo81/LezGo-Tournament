import { assertSupabaseServerConfig, type SupabaseServerConfig } from "./server";

export interface SupabaseRestError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export class SupabaseRestClientError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "SupabaseRestClientError";
    this.status = status;
    this.body = body;
  }
}

export interface SupabaseRestClient {
  rpc<T>(functionName: string, body: Record<string, unknown>): Promise<T>;
  select<T>(table: string, query: string): Promise<T[]>;
  insert<T>(table: string, rows: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }): Promise<T[]>;
  update<T>(table: string, query: string, values: Record<string, unknown>): Promise<T[]>;
  delete(table: string, query: string): Promise<void>;
}

export function createSupabaseRestClient(config: SupabaseServerConfig = assertSupabaseServerConfig()): SupabaseRestClient {
  const baseUrl = `${config.url.replace(/\/$/, "")}/rest/v1`;
  const headers = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
  };

  return {
    async rpc<T>(functionName: string, body: Record<string, unknown>) {
      return request<T>(`${baseUrl}/rpc/${functionName}`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    },
    async select<T>(table: string, query: string) {
      return request<T[]>(`${baseUrl}/${table}?${query}`, {
        method: "GET",
        headers,
      });
    },
    async insert<T>(table: string, rows: Record<string, unknown> | Record<string, unknown>[], options: { onConflict?: string } = {}) {
      const search = options.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : "";
      return request<T[]>(`${baseUrl}/${table}${search}`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(rows),
      });
    },
    async update<T>(table: string, query: string, values: Record<string, unknown>) {
      return request<T[]>(`${baseUrl}/${table}?${query}`, {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(values),
      });
    },
    async delete(table: string, query: string) {
      await request<unknown>(`${baseUrl}/${table}?${query}`, {
        method: "DELETE",
        headers: {
          ...headers,
          prefer: "return=minimal",
        },
      });
    },
  };
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? parseJson(text) : null;

  if (!response.ok) {
    throw new SupabaseRestClientError(getErrorMessage(body, response.status), response.status, body);
  }

  return body as T;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(body: unknown, status: number): string {
  if (isRestError(body)) {
    return body.message;
  }

  return `Supabase REST request failed with status ${status}.`;
}

function isRestError(body: unknown): body is SupabaseRestError {
  return Boolean(body && typeof body === "object" && "message" in body && typeof (body as SupabaseRestError).message === "string");
}
