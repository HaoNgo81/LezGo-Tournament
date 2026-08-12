export type ThemePreset = "lezgo" | "dark" | "light" | "custom";

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
  dark: {
    preset: "dark",
    primary: "#f7d046",
    secondary: "#22332a",
    background: "#0f1b14",
    surface: "#18261d",
    foreground: "#f7fff9",
    accent: "#d6a447",
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
};

export function createDefaultTheme(): AppTheme {
  return { ...themePresets.lezgo };
}

export function normalizeTheme(input: Partial<AppTheme> | undefined): AppTheme {
  if (!input) {
    return createDefaultTheme();
  }

  const preset = input.preset && input.preset !== "custom" ? input.preset : undefined;
  const base = preset ? themePresets[preset] : createDefaultTheme();

  return {
    preset: input.preset ?? base.preset,
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
  const primaryText = getReadableTextColor(theme.primary);
  const secondaryText = getReadableTextColor(theme.secondary);
  const muted = mixHex(theme.foreground, theme.background, 0.38);
  const line = mixHex(theme.foreground, theme.background, 0.82);
  const primarySoft = mixHex(theme.primary, theme.surface, 0.84);

  root.style.setProperty("--background", theme.background);
  root.style.setProperty("--surface", theme.surface);
  root.style.setProperty("--foreground", theme.foreground);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--line", line);
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--primary-strong", theme.accent);
  root.style.setProperty("--primary-soft", primarySoft);
  root.style.setProperty("--primary-text", primaryText);
  root.style.setProperty("--secondary", theme.secondary);
  root.style.setProperty("--secondary-text", secondaryText);
  root.style.setProperty("--accent", theme.accent);
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function getReadableTextColor(backgroundColor: string): "#ffffff" | "#112018" {
  const { r, g, b } = hexToRgb(backgroundColor);
  const luminance = (0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b));

  return luminance > 0.52 ? "#112018" : "#ffffff";
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
