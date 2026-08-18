import { describe, expect, it } from "vitest";
import { createThemeCssVariables, getContrastRatio, normalizeTheme, themePresets } from "../lib/theme/theme";
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
  it("defines the six built-in theme presets", () => {
    expect(Object.keys(themePresets)).toEqual(["lezgo", "darkGold", "midnight", "ocean", "forest", "light"]);
  });

  it("has Danish and English labels for all built-in themes", () => {
    for (const key of ["lezgo", "darkGold", "midnight", "ocean", "forest", "light"] as const) {
      expect(translations.da[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
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
