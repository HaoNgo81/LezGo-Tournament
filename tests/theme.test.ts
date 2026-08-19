import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultTheme, createThemeCssVariables, getContrastRatio, normalizeTheme, themePresets } from "../lib/theme/theme";
import { translations } from "../lib/i18n/translations";

const requiredControlTokens = [
  "--control-bg",
  "--control-text",
  "--control-border",
  "--control-hover-bg",
  "--selected-bg",
  "--selected-text",
  "--selected-border",
] as const;

describe("theme presets", () => {
  it("defines the built-in theme presets", () => {
    expect(Object.keys(themePresets)).toEqual(["lezgo", "darkGold", "midnight", "ocean", "forest", "light", "hybridLezgo"]);
  });

  it("has Danish and English labels for all built-in themes", () => {
    for (const key of ["lezgo", "darkGold", "midnight", "ocean", "forest", "light", "hybridLezgo"] as const) {
      expect(translations.da[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
  });

  it("adds Hybrid LEZGO as a warm cream, graphite and gold theme without replacing existing presets", () => {
    expect(themePresets.hybridLezgo).toMatchObject({
      preset: "hybridLezgo",
      primary: "#d7a91e",
      secondary: "#1d2221",
      background: "#f7f1e5",
      surface: "#fbf7ef",
      foreground: "#181b18",
      accent: "#a87a08",
    });
  });

  it("uses Hybrid LEZGO as the default theme fallback", () => {
    expect(createDefaultTheme()).toEqual(themePresets.hybridLezgo);
    expect(normalizeTheme(undefined)).toMatchObject({ preset: "hybridLezgo" });
    expect(normalizeTheme({ preset: "missing" as never })).toMatchObject({ preset: "hybridLezgo" });
  });

  it("scopes the Hybrid LEZGO background image to the Hybrid LEZGO theme only", () => {
    const globalCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const backgroundPath = resolve(process.cwd(), "public/themes/hybrid-lezgo/padel-court-background.svg");

    expect(existsSync(backgroundPath)).toBe(true);
    expect(globalCss).toMatch(/html\[data-theme="hybridLezgo"\] body,\s*html:not\(\[data-theme\]\) body \{/);
    expect(globalCss).toContain('url("/themes/hybrid-lezgo/padel-court-background.svg")');
    expect(globalCss).toMatch(/linear-gradient\(rgba\(247, 241, 229, 0\.76\), rgba\(247, 241, 229, 0\.84\)\)/);
  });

  it("keeps Hybrid LEZGO color fidelity scoped to court cards, metrics and sync status without layout rules", () => {
    const globalCss = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

    expect(globalCss).toContain('html[data-theme="hybridLezgo"] [data-card-structure="unified-court-card"]');
    expect(globalCss).toContain("background: #1b211f;");
    expect(globalCss).toContain('html[data-theme="hybridLezgo"] [data-testid="live-summary-metric"]');
    expect(globalCss).toContain('html[data-theme="hybridLezgo"] [data-testid="live-sync-status-panel"]');
    expect(globalCss).toContain("background: #10251f;");
    const hybridRules = globalCss.match(/html\[data-theme="hybridLezgo"\][^{]+\{[^}]+\}/g) ?? [];

    expect(hybridRules.join("\n")).not.toMatch(/grid-template-columns|font-size|width:|height:|padding:|margin:|position:/);
  });

  it("maps legacy dark theme settings to Dark Gold", () => {
    expect(normalizeTheme(JSON.parse('{"preset":"dark"}')).preset).toBe("darkGold");
  });

  it("provides readable control and selected format-button colors in every preset", () => {
    for (const theme of Object.values(themePresets)) {
      const variables = createThemeCssVariables(theme);

      for (const token of requiredControlTokens) {
        expect(variables[token]).toBeTruthy();
      }

      expect(getContrastRatio(variables["--control-bg"], variables["--control-text"])).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(variables["--selected-bg"], variables["--selected-text"])).toBeGreaterThanOrEqual(4.5);
      expect(variables["--control-bg"]).not.toBe(variables["--selected-bg"]);
      expect(variables["--control-border"]).not.toBe(variables["--selected-border"]);
    }
  });
});
