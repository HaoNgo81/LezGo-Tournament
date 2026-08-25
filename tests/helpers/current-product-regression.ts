import { cleanup, screen, within } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { TournamentSetupFormat } from "../../lib/tournament-setup";

export const currentTournamentFormats: TournamentSetupFormat[] = [
  "Americano",
  "Fast Makker Americano",
  "Mixed Americano",
  "Mexicano",
  "Fast Makker Mexicano",
];

export const disabledLegacyFeatureCopy = "Denne funktion er ikke længere tilgængelig.";
export const removedLegacyFeatureTextPattern = /QR-kode klar|TV \/ Livescore|Livescore|Scoreindtastning|Turneringsskabeloner|Tournament templates|Del \/ vis på anden enhed|Open tournament from another device|Remote|Handoff/i;

export function clearBrowserRegressionState(): void {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.lang = "da";
  window.history.pushState(null, "", "/");
}

export function cleanupBrowserRegressionState(): void {
  cleanup();
  clearBrowserRegressionState();
}

export function mockLoggedOutAccountFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function expectDisabledLegacyFeaturePage(): HTMLElement {
  const disabledPage = screen.getByTestId("disabled-feature-page");

  expect(disabledPage).toHaveTextContent(disabledLegacyFeatureCopy);
  expect(screen.getByRole("link", { name: "Ny turnering" })).toHaveAttribute("href", "/new-tournament");
  expect(screen.getByRole("link", { name: "Turneringer" })).toHaveAttribute("href", "/tournaments");
  expect(within(disabledPage).queryByText(removedLegacyFeatureTextPattern)).not.toBeInTheDocument();

  return disabledPage;
}

export function expectRemovedLegacyFeaturesAbsent(scope: HTMLElement = document.body): void {
  expect(within(scope).queryByRole("link", { name: /Turneringsskabeloner|Tournament templates/i })).not.toBeInTheDocument();
  expect(within(scope).queryByRole("link", { name: /Åbn turnering fra anden enhed|Open tournament from another device/i })).not.toBeInTheDocument();
  expect(within(scope).queryByRole("button", { name: /TV \/ Livescore|Vis QR|Show QR/i })).not.toBeInTheDocument();
  expect(within(scope).queryByText(removedLegacyFeatureTextPattern)).not.toBeInTheDocument();
}

export function expectAdminTournamentManagementAbsent(): void {
  expect(screen.queryByRole("button", { name: "Turneringer" })).not.toBeInTheDocument();
  expect(screen.queryByTestId("admin-tournament-management")).not.toBeInTheDocument();
  expect(screen.queryByText("TURNERINGSSTYRING")).not.toBeInTheDocument();
}
