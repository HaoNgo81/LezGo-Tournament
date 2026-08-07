import type { StandingsRankingMode } from "../tournament-engine";
import type { ScoringMode, TournamentSetupFormat } from "../tournament-setup";

const templateStorageKey = "lezgo.tournamentTemplates.v1";

export type StandardTournamentTemplateFormat = Exclude<TournamentSetupFormat, "Team vs. Team" | "Puljespil">;

export interface TournamentTemplate {
  id: string;
  title: string;
  format: StandardTournamentTemplateFormat;
  scoringMode: ScoringMode;
  courts: number;
  rounds: number;
  firstRoundOrder: "manual" | "random";
  rankingMode: StandingsRankingMode;
  timeLimitMinutes?: number;
}

export interface TournamentTemplateInput {
  title: string;
  format: StandardTournamentTemplateFormat;
  scoringMode: ScoringMode;
  courts: number;
  rounds: number;
  firstRoundOrder: "manual" | "random";
  rankingMode: StandingsRankingMode;
  timeLimitMinutes?: number;
}

export function createDefaultTournamentTemplates(): TournamentTemplate[] {
  return [
    createTemplate({ title: "8 spillere / 2 baner", format: "Americano", scoringMode: "Fast antal point", courts: 2, rounds: 2, firstRoundOrder: "manual", rankingMode: "matchPointsFirst" }, "template-americano-8"),
    createTemplate({ title: "12 spillere / 3 baner", format: "Mexicano", scoringMode: "Spil på tid", courts: 3, rounds: 3, firstRoundOrder: "manual", rankingMode: "partiPointsFirst", timeLimitMinutes: 15 }, "template-mexicano-12"),
  ];
}

export function loadTournamentTemplates(): TournamentTemplate[] {
  if (typeof window === "undefined") {
    return createDefaultTournamentTemplates();
  }

  const savedTemplates = window.localStorage.getItem(templateStorageKey);

  if (!savedTemplates) {
    const defaults = createDefaultTournamentTemplates();
    saveTournamentTemplates(defaults);
    return defaults;
  }

  try {
    const parsedTemplates = JSON.parse(savedTemplates) as TournamentTemplate[];
    return parsedTemplates.filter(isStandardTournamentTemplate);
  } catch {
    window.localStorage.removeItem(templateStorageKey);
    return createDefaultTournamentTemplates();
  }
}

export function saveTournamentTemplate(input: TournamentTemplateInput, id = createTemplateId(input.title)): TournamentTemplate[] {
  const template = createTemplate(input, id);
  const templates = loadTournamentTemplates().filter((savedTemplate) => savedTemplate.id !== template.id);
  const nextTemplates = [template, ...templates];
  saveTournamentTemplates(nextTemplates);
  return nextTemplates;
}

export function deleteTournamentTemplate(id: string): TournamentTemplate[] {
  const templates = loadTournamentTemplates().filter((template) => template.id !== id);
  saveTournamentTemplates(templates);
  return templates;
}

export function findTournamentTemplate(id: string): TournamentTemplate | null {
  return loadTournamentTemplates().find((template) => template.id === id) ?? null;
}

function saveTournamentTemplates(templates: TournamentTemplate[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(templateStorageKey, JSON.stringify(templates));
}

function createTemplate(input: TournamentTemplateInput, id = createTemplateId(input.title)): TournamentTemplate {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Skabelonen skal have et navn.");
  }

  if (!Number.isInteger(input.courts) || input.courts < 1) {
    throw new Error("Skabelonen skal have mindst 1 bane.");
  }

  if (!Number.isInteger(input.rounds) || input.rounds < 1) {
    throw new Error("Skabelonen skal have mindst 1 runde.");
  }

  if (input.scoringMode === "Spil på tid" && (!input.timeLimitMinutes || input.timeLimitMinutes < 1)) {
    throw new Error("Vælg spilletid for skabelonen.");
  }

  if (!isStandardTemplateFormat(input.format)) {
    throw new Error("Puljespil og Team vs. Team kræver egne opsætningsfelter og kan ikke gemmes som standardskabelon.");
  }

  return {
    id,
    title,
    format: input.format,
    scoringMode: input.scoringMode,
    courts: input.courts,
    rounds: input.rounds,
    firstRoundOrder: input.firstRoundOrder,
    rankingMode: input.rankingMode,
    timeLimitMinutes: input.scoringMode === "Spil på tid" ? input.timeLimitMinutes : undefined,
  };
}

function isStandardTournamentTemplate(template: TournamentTemplate): template is TournamentTemplate {
  return isStandardTemplateFormat(template.format);
}

function isStandardTemplateFormat(format: TournamentSetupFormat): format is StandardTournamentTemplateFormat {
  return format !== "Team vs. Team" && format !== "Puljespil";
}

function createTemplateId(title: string): string {
  const normalizedTitle = title.trim().toLocaleLowerCase("da").replace(/[^a-z0-9æøå]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${normalizedTitle || "skabelon"}-${Date.now()}`;
}

