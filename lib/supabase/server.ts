export interface SupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
}

export function getSupabaseServerConfig(): SupabaseServerConfig | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
  };
}

export function assertSupabaseServerConfig(): SupabaseServerConfig {
  const config = getSupabaseServerConfig();

  if (!config) {
    throw new Error("Supabase server credentials are not configured.");
  }

  return config;
}
