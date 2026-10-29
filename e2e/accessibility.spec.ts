import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Accessibility checks from the design review (2026-10-29): contrast, zoom, focus ring and input size,
// on the home page and /new-tournament at phone (375 px) and desktop (1280 px) width.
const widths = [
  { name: "phone", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
] as const;
const pages = ["/", "/new-tournament"] as const;

// WCAG relative-luminance contrast between the element's text colour and the first opaque background
// behind it (walking up the tree). Semi-transparent backgrounds are composited over their parents.
async function getTextContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    // Computed colours can be lab()/oklch() (Tailwind 4), so let a canvas convert them to sRGB.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const parse = (value: string) => {
      if (!value || value === "transparent") return null;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "rgba(0, 0, 0, 0)";
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const blend = (top: { r: number; g: number; b: number; a: number }, bottom: { r: number; g: number; b: number }) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
    });
    const layers: Array<{ r: number; g: number; b: number; a: number }> = [];
    let node: Element | null = element;
    while (node) {
      const background = parse(getComputedStyle(node).backgroundColor);
      if (background && background.a > 0) {
        layers.push(background);
        if (background.a >= 1) break;
      }
      node = node.parentElement;
    }
    let background = { r: 255, g: 255, b: 255 };
    for (const layer of layers.reverse()) background = blend(layer, background);
    const text = parse(getComputedStyle(element).color) ?? { r: 0, g: 0, b: 0, a: 1 };
    const foreground = blend(text, background);
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  });
}

async function fillFourAmericanoPlayers(page: Page) {
  for (const [index, name] of ["Anna", "Peter", "Mads", "Louise"].entries()) {
    await page.getByRole("textbox", { name: `Spiller ${index + 1}`, exact: true }).fill(name);
  }
}

for (const width of widths) {
  test.describe(`${width.name} ${width.viewport.width}px`, () => {
    test.use({ viewport: width.viewport, isMobile: width.isMobile, hasTouch: width.hasTouch, serviceWorkers: "block" });

    for (const path of pages) {
      test(`axe finds no contrast problems and no serious issues on ${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("button", { name: "Opret bruger" })).toBeVisible();
        if (path === "/new-tournament") {
          await fillFourAmericanoPlayers(page);
        }

        // label-content-name-mismatch is an experimental axe rule. It flags the existing language button and
        // format buttons (aria-label differs from the visible text), which this change does not touch; it is
        // listed as a follow-up in the PR rather than hidden by a baseline here.
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .disableRules(["label-content-name-mismatch"])
          .analyze();
        const describe = (violations: typeof results.violations) =>
          violations.map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);

        expect(describe(results.violations.filter((violation) => violation.id === "color-contrast")), "color-contrast").toEqual([]);
        expect(describe(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")), "serious/critical").toEqual([]);
      });

      test(`viewport allows pinch zoom and inputs are at least 16px on ${path}`, async ({ page }) => {
        await page.goto(path);
        const viewport = (await page.locator('meta[name="viewport"]').getAttribute("content")) ?? "";
        expect(viewport).toContain("width=device-width");
        expect(viewport).not.toMatch(/maximum-scale/i);
        expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/i);

        const fontSizes = await page.locator("input:visible, select:visible, textarea:visible").evaluateAll((elements) =>
          elements.map((element) => ({ label: element.getAttribute("aria-label") ?? element.getAttribute("name") ?? element.id ?? element.tagName, size: parseFloat(getComputedStyle(element).fontSize) })),
        );
        expect(fontSizes.filter((field) => field.size < 16), "inputs below 16px").toEqual([]);
      });
    }

    test("Opret bruger and Start turnering have at least 4.5:1 text contrast", async ({ page }) => {
      await page.goto("/");
      expect(await getTextContrast(page.getByRole("button", { name: "Opret bruger" }).locator("span", { hasText: "Opret bruger" }))).toBeGreaterThanOrEqual(4.5);

      await page.goto("/new-tournament");
      const start = page.getByRole("button", { name: "Start turnering" });
      await expect(start).toBeDisabled();
      await expect(page.getByTestId("start-requirement")).toHaveText("Tilføj mindst 4 spillere for at starte.");
      expect(await getTextContrast(start), "disabled").toBeGreaterThanOrEqual(4.5);

      await fillFourAmericanoPlayers(page);
      await expect(start).toBeEnabled();
      expect(await getTextContrast(start), "enabled").toBeGreaterThanOrEqual(4.5);
      expect(Number(await start.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700);
    });

    test("live page and score dialog: Gem uses dark bold text and axe finds no contrast problems", async ({ page }) => {
      // Americano with 4 players starts on one court; the live page then has the round buttons and score dialog.
      await page.goto("/new-tournament");
      await fillFourAmericanoPlayers(page);
      await page.getByRole("button", { name: "Start turnering" }).click();
      await page.waitForURL(/\/live/);
      await expect(page.getByTestId("live-court-card").first()).toContainText(/Anna|Peter|Mads|Louise/);

      await page.getByTestId("live-court-card").first().getByRole("button", { name: /Indtast score/i }).click();
      const save = page.getByRole("button", { name: "Gem", exact: true });
      await expect(save).toBeVisible();
      // Button text utilities apply again (STEP 41A): Gem is bold, and its text is dark on gold.
      expect(Number(await save.evaluate((element) => getComputedStyle(element).fontWeight))).toBeGreaterThanOrEqual(700);
      expect(await getTextContrast(save)).toBeGreaterThanOrEqual(4.5);

      const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).withRules(["color-contrast"]).analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
    });

    test("home cards show a visible focus ring when reached with Tab", async ({ page }) => {
      await page.goto("/");
      const card = page.getByRole("link", { name: /Ny turnering/ });
      await expect(card).toBeVisible();

      for (let press = 0; press < 15 && !(await card.evaluate((element) => element === document.activeElement)); press += 1) {
        await page.keyboard.press("Tab");
      }
      await expect(card).toBeFocused();

      const readStyle = () => card.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { boxShadow: computed.boxShadow, outlineStyle: computed.outlineStyle, outlineWidth: computed.outlineWidth };
      });
      // The card has a CSS transition, so wait for the ring to finish animating in.
      await expect.poll(async () => (await readStyle()).boxShadow).toContain("rgba(216, 170, 32, 0.3)");
      const style = await readStyle();
      const hasRing = style.boxShadow !== "none" || (style.outlineStyle !== "none" && style.outlineWidth !== "0px");
      expect(hasRing, JSON.stringify(style)).toBe(true);
    });
  });
}
