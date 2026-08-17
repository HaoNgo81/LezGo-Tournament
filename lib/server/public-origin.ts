export function resolvePublicAppOrigin(request: Request): string {
  const configuredOrigin = normalizeConfiguredOrigin(process.env.LEZGO_PUBLIC_APP_ORIGIN);

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const vercelOrigin = normalizeVercelOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL);

  if (vercelOrigin) {
    return vercelOrigin;
  }

  const requestOrigin = getRequestHeaderOrigin(request) ?? getRequestUrlOrigin(request);

  if (!isUnreachableBindOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return requestOrigin.replace("://0.0.0.0", "://localhost");
}

function normalizeConfiguredOrigin(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    if (isUnreachableBindOrigin(url.origin)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function normalizeVercelOrigin(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return normalizeConfiguredOrigin(withProtocol);
}

function getRequestHeaderOrigin(request: Request): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim();

  if (!host) {
    return null;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestProtocol = getRequestUrlProtocol(request.url);
  const protocol = forwardedProto || requestProtocol;

  return `${protocol}//${host}`;
}

function getRequestUrlOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function getRequestUrlProtocol(requestUrl: string): string {
  try {
    return new URL(requestUrl).protocol === "https:" ? "https:" : "http:";
  } catch {
    return "http:";
  }
}

function isUnreachableBindOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "0.0.0.0" || url.hostname === "::";
  } catch {
    return false;
  }
}
