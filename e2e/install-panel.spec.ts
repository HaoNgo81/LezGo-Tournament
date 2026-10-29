import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The LEZGO Apps portal's "Installer" button links to /?install=1. Headless Chromium does not fire a real
// beforeinstallprompt, so the test dispatches one with a stubbed prompt() to check the whole page flow.
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });

test("a normal visit shows no install panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Ny turnering/ })).toBeVisible();
  await expect(page.getByTestId("install-panel")).toHaveCount(0);
});

test("install link from the portal opens the browser install dialog with one tap", async ({ page }) => {
  await page.goto("/?install=1");
  await expect(page.getByTestId("install-panel")).toBeVisible();

  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        (window as unknown as { promptCalls: number }).promptCalls = 1;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });

  const button = page.getByRole("button", { name: "Installer app" });
  await expect(button).toBeVisible();
  const results = await new AxeBuilder({ page }).include('[data-testid="install-panel"]').analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);

  await button.click();
  await expect(page.getByText("Appen er installeret. Du kan åbne den fra din startskærm.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { promptCalls?: number }).promptCalls)).toBe(1);
});

test("without a browser install prompt the panel shows the manual steps, and can be closed", async ({ page }) => {
  await page.goto("/?install=1");
  await expect(page.getByText(/Åbn browserens menu, og vælg Installer app/)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("install-panel").getByRole("button", { name: "Luk" }).click();
  await expect(page.getByTestId("install-panel")).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
});

test.describe("opened inside Messenger on Android", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36 [FB_IAB/MESSENGER;FBAV/480.0]" });

  test("explains how to open the page in Chrome", async ({ page }) => {
    await page.goto("/?install=1");
    await expect(page.getByTestId("install-panel")).toHaveAttribute("data-install-state", "inAppAndroid");
    await expect(page.getByText(/vælg Åbn i Chrome/)).toBeVisible();
  });
});
