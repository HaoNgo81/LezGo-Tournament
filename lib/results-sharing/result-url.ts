export const CURRENT_PUBLIC_RESULT_ORIGIN = "https://lezgotournament.vercel.app";

const stalePublicResultHostnames = new Set([
  "app.lezgopadel.dk",
  "lez-go-tournament.vercel.app",
]);

const resultIdPattern = /^[A-HJ-NP-Z2-9]{12,24}$/;

export function createResultUrl(origin: string, resultId: string): string {
  validateResultId(resultId);
  return new URL(`/result/${resultId}`, normalizeOrigin(origin)).toString();
}

export function normalizePublicResultUrl(inputUrl: string, resultId: string, preferredOrigin?: string): string {
  validateResultId(resultId);
  const origin = normalizeOptionalPublicResultOrigin(preferredOrigin) ?? CURRENT_PUBLIC_RESULT_ORIGIN;

  try {
    const url = new URL(inputUrl);
    const pathResultId = url.pathname.split("/").filter(Boolean).at(-1);

    if (pathResultId === resultId) {
      return createResultUrl(origin, resultId);
    }
  } catch {
    // Fall through to the known result id.
  }

  return createResultUrl(origin, resultId);
}

export function validateResultId(resultId: string): void {
  if (!resultIdPattern.test(resultId)) {
    throw new Error("Result ID is invalid.");
  }
}

export function normalizeOptionalPublicResultOrigin(origin: string | undefined): string | null {
  const normalizedOrigin = normalizeOptionalOrigin(origin);

  if (!normalizedOrigin) {
    return null;
  }

  return stalePublicResultHostnames.has(new URL(normalizedOrigin).hostname) ? null : normalizedOrigin;
}

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin;
}

function normalizeOptionalOrigin(origin: string | undefined): string | null {
  if (!origin?.trim()) {
    return null;
  }

  try {
    const url = new URL(origin.trim());
    return url.hostname === "0.0.0.0" || url.hostname === "::" ? null : url.origin;
  } catch {
    return null;
  }
}
