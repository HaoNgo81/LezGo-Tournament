import { readFileSync } from "node:fs";
import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

// Same flow the owner tested by hand for STEP 32A/33A: Fast Makker Americano, 4 pairs, 2 courts,
// free scoring. Pairs B and A tie on match points and score points; B has the better overall
// point difference (+4 vs -4) although A won the direct match, so B must rank above A.
const scores: Record<string, [number, number]> = {
  "A|B": [10, 8],
  "A|C": [4, 10],
  "A|D": [10, 10],
  "B|C": [10, 4],
  "B|D": [6, 6],
  "C|D": [5, 7],
};
// Long surnames make sure narrow standings layouts are tested with names that do not fit easily.
const expectedOrder = ["D / Dd Frederiksen", "B / Bb Vestergaard", "A / Aa Christoffersen", "C / Cc Kristiansen"];
const expectedDifferences = ["+2", "+4", "-4", "-2"];

const phone: BrowserContextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "allow" };
const smallPhone: BrowserContextOptions = { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, serviceWorkers: "allow" };
const tabletLandscape: BrowserContextOptions = { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, serviceWorkers: "allow" };
// Laptop with a mouse: the live page splits into two columns, so the standings card is narrow.
const laptop: BrowserContextOptions = { viewport: { width: 1180, height: 820 }, serviceWorkers: "allow" };

async function createFixedPartnerTournament(page: Page) {
  await page.goto("/new-tournament");
  await page.getByRole("button", { name: /Fast Makker Americano/ }).click();
  await page.locator("select").first().selectOption("timed");
  const pairs = [["A", "Aa Christoffersen"], ["B", "Bb Vestergaard"], ["C", "Cc Kristiansen"], ["D", "Dd Frederiksen"]];

  for (const [pairIndex, players] of pairs.entries()) {
    for (const [playerIndex, name] of players.entries()) {
      const input = page.getByLabel(`Par ${pairIndex + 1}, spiller ${playerIndex + 1}`, { exact: true });
      if ((await input.count()) === 0) {
        await page.getByRole("button", { name: "Tilføj par" }).click();
      }
      await input.fill(name);
    }
  }

  await page.getByRole("button", { name: "Start turnering" }).click();
  await page.waitForURL(/\/live/);
  // toContainText joins the card text without spaces, so match the second player names directly.
  // The demo state shown before hydration uses other names (Anna, Hassan, ...), so this waits for the real tournament.
  await expect(page.getByTestId("live-court-card").first()).toContainText(/Aa|Bb|Cc|Dd/);
}

function pairName(label: string) {
  return label.trim().split(" / ")[0];
}

async function playAllRounds(page: Page) {
  for (let round = 1; round <= 3; round += 1) {
    const cards = page.getByTestId("live-court-card");
    const cardCount = await cards.count();

    for (let index = 0; index < cardCount; index += 1) {
      await cards.nth(index).getByRole("button", { name: /Indtast score|Rediger score/i }).click();
      const teamA = page.getByLabel("Hold A scorepoint");
      const teamB = page.getByLabel("Hold B scorepoint");
      const nameA = pairName(await teamA.evaluate((element) => (element as HTMLInputElement).labels?.[0]?.textContent ?? ""));
      const nameB = pairName(await teamB.evaluate((element) => (element as HTMLInputElement).labels?.[0]?.textContent ?? ""));
      const [first, second] = scores[[nameA, nameB].sort().join("|")];
      const [scoreA, scoreB] = nameA < nameB ? [first, second] : [second, first];

      await teamA.fill(String(scoreA));
      await teamB.fill(String(scoreB));
      await page.getByRole("button", { name: "Gem" }).click();
      await expect(cards.nth(index)).toContainText(String(scoreA));
    }

    if (round < 3) {
      await page.getByTestId("live-bottom-round-navigation").getByRole("button", { name: "Næste" }).click();
      await expect(page.getByTestId("live-round-navigation-card")).toContainText(`Runde ${round + 1}`);
    }
  }
}

async function expectStandings(page: Page) {
  const table = page.getByTestId("live-compact-standings");
  await expect(table.getByTestId("live-standings-player-name")).toHaveText(expectedOrder);
  await expect(table.getByTestId("live-standings-point-difference")).toHaveText(expectedDifferences);
}

async function expectFitsScreen(page: Page) {
  const layout = await page.evaluate(() => {
    const table = document.querySelector<HTMLElement>('[data-testid="live-compact-standings"]');
    const names = [...document.querySelectorAll<HTMLElement>('[data-testid="live-standings-player-name"]')];
    return {
      pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
      tableScrollsSideways: table ? table.scrollWidth > table.clientWidth + 1 : true,
      nameOverflows: names.some((name) => name.scrollWidth > name.clientWidth + 1),
    };
  });
  const viewport = page.viewportSize();
  expect(layout, `layout at ${viewport?.width}x${viewport?.height}`).toEqual({ pageScrollsSideways: false, tableScrollsSideways: false, nameOverflows: false });
}

async function openWithSameData(browser: Browser, source: Page, options: BrowserContextOptions, path: string) {
  const context = await browser.newContext({ ...options, storageState: await source.context().storageState() });
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByTestId("live-compact-standings")).toBeVisible();
  return page;
}

test("guest runs a Fast Makker Americano tournament on phone and tablet", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ ...phone, acceptDownloads: true });
  const page = await context.newPage();

  await test.step("home page shows the app version", async () => {
    await page.goto("/");
    await expect(page.getByTestId("app-version-label")).toHaveText(/^Version \S+/);
  });

  await test.step("create tournament as guest and play three rounds", async () => {
    await createFixedPartnerTournament(page);
    // Wait until the service worker controls the page, so a first-install takeover has happened
    // before checking that it did not show the update notice (it used to cover the Gem button).
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
    await page.waitForTimeout(1_000);
    await expect(page.getByText("Ny version klar")).toHaveCount(0);
    await playAllRounds(page);
  });

  await test.step("live standings on phone: point difference decides before head-to-head", async () => {
    await expectStandings(page);
    await expectFitsScreen(page);
    await page.getByTestId("live-compact-standings").screenshot({ path: testInfo.outputPath("live-phone.png") });
  });

  await test.step("live standings on tablet landscape, laptop and small phone", async () => {
    for (const options of [tabletLandscape, laptop, smallPhone]) {
      const other = await openWithSameData(browser, page, options, "/live");
      await expectStandings(other);
      await expectFitsScreen(other);
      await other.context().close();
    }
  });

  await test.step("final standings use the live table and fit the phone screen", async () => {
    await page.goto("/finish");
    await expectStandings(page);
    await expectFitsScreen(page);
    await expect(page.getByRole("columnheader", { name: "Placering" })).toHaveCount(0);
  });

  await test.step("PDF contains the +/- column with signed differences", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
    const pdfPath = testInfo.outputPath("result.pdf");
    await download.saveAs(pdfPath);
    const pdf = readFileSync(pdfPath).toString("latin1");

    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf).toContain("(+/-)");
    expect(pdf).toMatch(/\(B \/ Bb Vestergaard\)[^]*?\(\+4\)[^]*?\(A \/ Aa Christoffersen\)[^]*?\(-4\)/);
  });

  await context.close();
});

test("first visit with an active tournament does not show the update notice over the score dialog", async ({ browser }) => {
  // Seed an active tournament before the very first page load. When the service worker installs and
  // takes control, the old code treated that as an app update and showed "Ny version klar" fixed at
  // the bottom of the screen, covering the Gem button. A fresh install is not an update.
  const seedContext = await browser.newContext({ ...phone, serviceWorkers: "block" });
  const seedPage = await seedContext.newPage();
  await createFixedPartnerTournament(seedPage);
  const storage = await seedContext.storageState();
  await seedContext.close();

  const context = await browser.newContext({ ...phone, storageState: storage });
  const page = await context.newPage();
  await page.goto("/live");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.getByTestId("live-court-card").first().getByRole("button", { name: /Indtast score/ }).click();
  await page.waitForTimeout(1_000);

  await expect(page.getByText("Ny version klar")).toHaveCount(0);
  await page.getByRole("button", { name: "Gem" }).click({ trial: true });
  await context.close();
});
