import { expect, test, type Page } from "@playwright/test";

// STEP 42A in a real browser: a signed-in organizer's login disappears while the phone screen is off.
// The account API is simulated with page.route (CI has no real accounts): first signed in, then every
// account call answers 401. The tournament must stay under the organizer's control with a clear notice.

const tournamentId = "00000000-0000-4000-8000-0000000042e1";
const ownerId = "00000000-0000-4000-8000-00000000aaa1";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });

async function createGuestTournament(page: Page) {
  await page.goto("/new-tournament");
  for (const [index, name] of ["Anna", "Peter", "Mads", "Louise"].entries()) {
    await page.getByRole("textbox", { name: `Spiller ${index + 1}`, exact: true }).fill(name);
  }
  await page.getByRole("button", { name: "Start turnering" }).click();
  await page.waitForURL(/\/live/);
  await expect(page.getByTestId("live-court-card").first()).toContainText(/Anna|Peter|Mads|Louise/);
}

// Turns the guest tournament into one the signed-in organizer controls in the cloud.
async function markAsOwnedCloudTournament(page: Page) {
  return page.evaluate(({ tournamentId, ownerId }) => {
    const state = JSON.parse(window.localStorage.getItem("lezgo.activeTournament.v1") ?? "null");
    const localId = `${state.tournamentName.trim().toLocaleLowerCase("da")}-${state.format}`;
    // A real cloud tournament knows the score version of every match.
    const matchScoreVersions = Object.fromEntries(
      (state.rounds as Array<{ matches: Array<{ id: string }> }>).flatMap((round) => round.matches.map((match) => [match.id, 1])),
    );
    window.localStorage.setItem("lezgo.shadowSaveMetadata.v1", JSON.stringify({
      [localId]: {
        localId,
        kind: "standard",
        status: "synced",
        canManage: true,
        supabaseTournamentId: tournamentId,
        lastLocalSaveAt: "2026-11-06T12:00:00.000Z",
        lastShadowSaveVersion: "2026-11-06T12:00:00.000Z",
        matchScoreVersions,
      },
    }));
    window.sessionStorage.setItem("lezgo.activeCloudTournamentAuthority.v1", JSON.stringify({
      source: "server",
      kind: "standard",
      localId,
      tournamentId,
      canRead: true,
      canManage: true,
      createdByUserId: ownerId,
      controllerUserId: ownerId,
      ownerUserId: ownerId,
    }));
    return { state, localId, matchScoreVersions };
  }, { tournamentId, ownerId });
}

async function turnScreenOffAndOn(page: Page) {
  await page.evaluate(() => {
    const setVisibility = (value: DocumentVisibilityState) => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test("login lost while the screen is off: the organizer keeps the tournament and the typed score", async ({ page }) => {
  await createGuestTournament(page);
  const { state, localId, matchScoreVersions } = await markAsOwnedCloudTournament(page);

  let signedIn = true;
  const signedOut = { status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Authentication was denied." }) };
  await page.route("**/api/auth/me", (route) => route.fulfill(signedIn
    ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, account: { userId: ownerId, email: "owner@example.com", displayName: "Owner", role: "user" } }) }
    : signedOut));
  await page.route(`**/api/account/tournaments/${tournamentId}**`, (route) => route.fulfill(signedIn && route.request().method() === "GET"
    ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, kind: "standard", state, tournamentId, updatedAt: "2026-11-06T12:00:00.000Z", canRead: true, canManage: true, matchScoreVersions }) }
    : signedOut));
  await page.route("**/api/supabase/shadow-save", (route) => route.fulfill(signedIn
    ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tournamentId, updatedAt: "2026-11-06T12:01:00.000Z" }) }
    : signedOut));

  await page.reload();
  await expect(page.getByTestId("live-court-card").first()).toContainText(/Anna|Peter|Mads|Louise/);
  await expect(page.getByTestId("live-session-notice")).toHaveCount(0);

  // The screen is turned off; meanwhile the login expires. Turning it on again shows the notice at once.
  signedIn = false;
  await turnScreenOffAndOn(page);
  await expect(page.getByTestId("live-session-notice")).toContainText("Du er blevet logget ud");

  // Typing and saving a score keeps the sheet open with the typed values and the same notice.
  await page.getByTestId("live-court-card").first().getByRole("button", { name: /Indtast score/i }).click();
  await page.getByLabel("Hold A scorepoint").fill("14");
  await page.getByLabel("Hold B scorepoint").fill("9");
  await page.getByRole("button", { name: "Gem", exact: true }).click();
  await expect(page.getByTestId("score-sheet-session-notice")).toContainText("Du er blevet logget ud");
  await expect(page.getByLabel("Hold A scorepoint")).toHaveValue("14");
  await expect(page.getByLabel("Hold B scorepoint")).toHaveValue("9");
  await expect(page.getByText("Du har ikke længere styring af denne turnering.")).toHaveCount(0);

  // Not locked: the organizer still controls the tournament and can navigate rounds.
  const canManage = await page.evaluate((id) => JSON.parse(window.localStorage.getItem("lezgo.shadowSaveMetadata.v1") ?? "{}")[id]?.canManage, localId);
  expect(canManage).not.toBe(false);
  await page.getByRole("button", { name: "Luk" }).click();
  await expect(page.getByTestId("live-bottom-round-navigation").getByRole("button", { name: "Næste" })).toBeVisible();
});
