export type ThemePreset = "lezgo" | "darkGold" | "midnight" | "ocean" | "forest" | "light" | "hybridLezgo" | "custom";

export interface AppTheme {
  preset: ThemePreset;
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  foreground: string;
  accent: string;
}

export const themePresets: Record<Exclude<ThemePreset, "custom">, AppTheme> = {
  lezgo: {
    preset: "lezgo",
    primary: "#18a058",
    secondary: "#ffffff",
    background: "#f4f8f5",
    surface: "#ffffff",
    foreground: "#112018",
    accent: "#0f7d43",
  },
  darkGold: {
    preset: "darkGold",
    primary: "#f7d046",
    secondary: "#5a402c",
    background: "#3a291c",
    surface: "#4a3524",
    foreground: "#fff8df",
    accent: "#caa253",
  },
  midnight: {
    preset: "midnight",
    primary: "#60a5fa",
    secondary: "#182235",
    background: "#080f1f",
    surface: "#101827",
    foreground: "#eef6ff",
    accent: "#38bdf8",
  },
  ocean: {
    preset: "ocean",
    primary: "#22d3ee",
    secondary: "#dff7fb",
    background: "#eef9fb",
    surface: "#ffffff",
    foreground: "#082f49",
    accent: "#0369a1",
  },
  forest: {
    preset: "forest",
    primary: "#22c55e",
    secondary: "#e8f7ee",
    background: "#f0f8f2",
    surface: "#ffffff",
    foreground: "#102519",
    accent: "#166534",
  },
  light: {
    preset: "light",
    primary: "#0f7d43",
    secondary: "#eef4f0",
    background: "#fbfdfb",
    surface: "#ffffff",
    foreground: "#102017",
    accent: "#d6a447",
  },
  hybridLezgo: {
    preset: "hybridLezgo",
    primary: "#d7a91e",
    secondary: "#4a3524",
    background: "#f7f1e5",
    surface: "#fbf7ef",
    foreground: "#181b18",
    accent: "#a87a08",
  },
};

export interface ThemeCssVariables {
  "--background": string;
  "--surface": string;
  "--card": string;
  "--foreground": string;
  "--muted": string;
  "--line": string;
  "--border": string;
  "--primary": string;
  "--primary-strong": string;
  "--primary-soft": string;
  "--primary-text": string;
  "--secondary": string;
  "--secondary-text": string;
  "--accent": string;
  "--surface-dark": string;
  "--surface-dark-text": string;
  "--surface-dark-muted": string;
  "--control-bg": string;
  "--control-text": string;
  "--control-border": string;
  "--control-hover-bg": string;
  "--selected-bg": string;
  "--selected-text": string;
  "--selected-border": string;
  "--focus-ring": string;
  "--danger-bg": string;
}

export function createDefaultTheme(): AppTheme {
  return { ...themePresets.hybridLezgo };
}

export function normalizeTheme(input: Partial<AppTheme> | undefined): AppTheme {
  if (!input) {
    return createDefaultTheme();
  }

  const preset = normalizeThemePreset(input.preset);

  if (input.preset !== "custom" && !preset) {
    return createDefaultTheme();
  }

  const base = preset ? themePresets[preset] : createDefaultTheme();

  return {
    preset: input.preset === "custom" ? "custom" : base.preset,
    primary: normalizeColor(input.primary, base.primary),
    secondary: normalizeColor(input.secondary, base.secondary),
    background: normalizeColor(input.background, base.background),
    surface: normalizeColor(input.surface, base.surface),
    foreground: normalizeColor(input.foreground, base.foreground),
    accent: normalizeColor(input.accent, base.accent),
  };
}

export function getThemeForPreset(preset: Exclude<ThemePreset, "custom">): AppTheme {
  return { ...themePresets[preset] };
}

export function applyTheme(theme: AppTheme, root: HTMLElement = document.documentElement): void {
  const variables = createThemeCssVariables(theme);

  for (const [key, value] of Object.entries(variables)) {
    root.style.setProperty(key, value);
  }

  root.dataset.theme = theme.preset;
}

export function createThemeCssVariables(theme: AppTheme): ThemeCssVariables {
  if (theme.preset === "hybridLezgo") {
    return {
      "--background": "#f7f1e5",
      "--surface": "#fff9ef",
      "--card": "#fbf7ef",
      "--foreground": "#191d1b",
      "--muted": "#5e625b",
      "--line": "rgba(153, 119, 39, 0.20)",
      "--border": "rgba(153, 119, 39, 0.20)",
      "--primary": "#d8aa20",
      "--primary-strong": "#a87a08",
      "--primary-soft": "#f2e3b5",
      "--primary-text": "#161a18",
      "--secondary": "#fbf7ef",
      "--secondary-text": "#191d1b",
      "--accent": "#c99712",
      "--surface-dark": "#4a3524",
      "--surface-dark-text": "#fff5df",
      "--surface-dark-muted": "#eadcc6",
      "--control-bg": "#fff9ef",
      "--control-text": "#191d1b",
      "--control-border": "rgba(205, 155, 20, 0.55)",
      "--control-hover-bg": "#f4ead3",
      "--selected-bg": "#4a3524",
      "--selected-text": "#fff5df",
      "--selected-border": "#d8aa20",
      "--focus-ring": "rgba(216, 170, 32, 0.30)",
      "--danger-bg": "#fff2ed",
    };
  }

  const primaryText = getReadableTextColor(theme.primary);
  const secondaryText = getReadableTextColor(theme.secondary);
  const muted = mixHex(theme.foreground, theme.background, 0.38);
  const line = mixHex(theme.foreground, theme.background, 0.82);
  const primarySoft = mixHex(theme.primary, theme.surface, 0.84);
  const surfaceDark = getRelativeLuminance(theme.secondary) < 0.25 ? theme.secondary : mixHex(theme.foreground, "#000000", 0.2);
  const surfaceDarkText = getReadableTextColor(surfaceDark);
  const surfaceDarkMuted = surfaceDarkText === "#ffffff" ? mixHex("#ffffff", surfaceDark, 0.18) : mixHex(theme.foreground, theme.background, 0.38);
  const selectedBg = surfaceDark === theme.secondary ? mixHex(surfaceDark, "#000000", 0.18) : surfaceDark;
  const focusRing = withAlpha(theme.primary, 0.28);
  const controlHoverBg = mixHex(theme.primary, theme.secondary, 0.9);
  const dangerBg = mixHex("#dc2626", theme.surface, 0.88);

  return {
    "--background": theme.background,
    "--surface": theme.surface,
    "--card": theme.surface,
    "--foreground": theme.foreground,
    "--muted": muted,
    "--line": line,
    "--border": line,
    "--primary": theme.primary,
    "--primary-strong": theme.accent,
    "--primary-soft": primarySoft,
    "--primary-text": primaryText,
    "--secondary": theme.secondary,
    "--secondary-text": secondaryText,
    "--accent": theme.accent,
    "--surface-dark": surfaceDark,
    "--surface-dark-text": surfaceDarkText,
    "--surface-dark-muted": surfaceDarkMuted,
    "--control-bg": theme.secondary,
    "--control-text": secondaryText,
    "--control-border": line,
    "--control-hover-bg": controlHoverBg,
    "--selected-bg": selectedBg,
    "--selected-text": surfaceDarkText,
    "--selected-border": theme.primary,
    "--focus-ring": focusRing,
    "--danger-bg": dangerBg,
  };
}

export function getContrastRatio(colorA: string, colorB: string): number {
  const a = getRelativeLuminance(colorA);
  const b = getRelativeLuminance(colorB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeThemePreset(value: unknown): Exclude<ThemePreset, "custom"> | undefined {
  if (value === "dark") {
    return "darkGold";
  }

  return typeof value === "string" && value in themePresets ? value as Exclude<ThemePreset, "custom"> : undefined;
}

function getReadableTextColor(backgroundColor: string): "#ffffff" | "#112018" {
  const luminance = getRelativeLuminance(backgroundColor);

  return luminance > 0.52 ? "#112018" : "#ffffff";
}

function getRelativeLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color);

  return (0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b));
}

function srgb(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function mixHex(color: string, base: string, baseWeight: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(base);
  const colorWeight = 1 - baseWeight;

  return rgbToHex({
    r: Math.round(a.r * colorWeight + b.r * baseWeight),
    g: Math.round(a.g * colorWeight + b.g * baseWeight),
    b: Math.round(a.b * colorWeight + b.b * baseWeight),
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
