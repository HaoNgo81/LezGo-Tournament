"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Section } from "@/components/ui/section";
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";
import { tournamentTypes } from "@/lib/mock/tournament-data";
import {
  createDefaultTournamentTemplates,
  deleteTournamentTemplate,
  loadTournamentTemplates,
  saveTournamentTemplate,
  type TournamentTemplate,
  type TournamentTemplateInput,
} from "@/lib/tournament-templates";
import type { StandingsRankingMode } from "@/lib/tournament-engine";
import type { FixedScoreRule, ScoringMode } from "@/lib/tournament-setup";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

const formatOptions = tournamentTypes.filter((type) => type !== "Team vs. Team" && type !== "Puljespil") as TournamentTemplateInput["format"][];
const scoringOptions: Array<{ labelKey: "playToScorePoints" | "totalScorePoints" | "timeFreeScoring"; value: ScoringMode }> = [
  { labelKey: "playToScorePoints", value: "Fast antal point" },
  { labelKey: "totalScorePoints", value: "Fri scoring" },
  { labelKey: "timeFreeScoring", value: "Spil på tid" },
];
const rankingOptions: Array<{ labelKey: "mostMatchPoints" | "mostScorePoints"; value: StandingsRankingMode }> = [
  { labelKey: "mostMatchPoints", value: "matchPointsFirst" },
  { labelKey: "mostScorePoints", value: "partiPointsFirst" },
];
const defaultDraft: TournamentTemplateInput = {
  title: "Ny skabelon",
  format: "Americano",
  scoringMode: "Fri scoring",
  courts: 2,
  rounds: 2,
  firstRoundOrder: "manual",
  rankingMode: "matchPointsFirst",
  fixedScoreRule: "target",
  fixedScorePoints: 21,
  timeLimitMinutes: 15,
};

export function TemplatesApp() {
  const { t } = useAppTranslation();
  const hasHydrated = useHasHydrated();
  const [templates, setTemplates] = useState<TournamentTemplate[]>(() => createDefaultTournamentTemplates());
  const [draft, setDraft] = useState<TournamentTemplateInput>(defaultDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!hasHydrated) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setTemplates(loadTournamentTemplates());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated]);

  if (!hasHydrated) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">{t("loadingTemplates")}</p>;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const nextTemplates = saveTournamentTemplate(draft, editingId ?? undefined);
      setTemplates(nextTemplates);
      setDraft(defaultDraft);
      setEditingId(null);
      setIsEditing(false);
      setMessage(`${t("templates")} gemt.`);
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : `${t("templates")} kunne ikke gemmes.`);
    }
  }

  function editTemplate(template: TournamentTemplate) {
    setDraft({
      title: template.title,
      format: template.format,
      scoringMode: template.scoringMode,
      courts: template.courts,
      rounds: template.rounds,
      firstRoundOrder: template.firstRoundOrder,
      rankingMode: template.rankingMode,
      fixedScoreRule: template.fixedScoreRule ?? "target",
      fixedScorePoints: template.fixedScorePoints ?? 21,
      timeLimitMinutes: template.timeLimitMinutes ?? 15,
    });
    setEditingId(template.id);
    setIsEditing(true);
    setMessage("");
  }

  function removeTemplate(templateId: string) {
    setTemplates(deleteTournamentTemplate(templateId));
    if (editingId === templateId) {
      setEditingId(null);
      setIsEditing(false);
      setDraft(defaultDraft);
    }
    setMessage(`${t("templates")} slettet.`);
  }

  return (
    <div className="grid gap-5">
      <button className="btn-primary min-h-14 text-lg" type="button" onClick={() => { setDraft(defaultDraft); setEditingId(null); setIsEditing(true); }}>
        {t("createTemplate")}
      </button>

      {isEditing ? (
        <Section title={editingId ? t("editTemplate") : t("createTemplate")}>
          <form className="app-card grid gap-3 p-4 sm:p-5" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-lg font-bold">
              {t("name")}
              <input className="field-control" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label className="grid gap-2 text-lg font-bold">
              {t("format")}
              <select className="field-control" value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as TournamentTemplateInput["format"] })}>
                {formatOptions.map((format) => <option key={format} value={format}>{getTemplateFormatDisplayName(format, t)}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-lg font-bold">
              {t("scoring")}
              <select className="field-control" value={draft.scoringMode} onChange={(event) => setDraft({ ...draft, scoringMode: event.target.value as ScoringMode })}>
                {scoringOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
              </select>
            </label>
            {draft.scoringMode === "Spil på tid" ? (
              <label className="grid gap-2 text-lg font-bold">
                {t("timeLimitMinutes")}
                <input className="field-control" min="1" type="number" value={draft.timeLimitMinutes ?? 15} onChange={(event) => setDraft({ ...draft, timeLimitMinutes: Number(event.target.value) })} />
              </label>
            ) : null}
            {draft.scoringMode === "Fast antal point" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-lg font-bold">
                  {t("fixedScore")}
                  <select className="field-control" value={draft.fixedScoreRule ?? "target"} onChange={(event) => setDraft({ ...draft, fixedScoreRule: event.target.value as FixedScoreRule })}>
                    <option value="target">{t("playToScorePoints")}</option>
                    <option value="total">{t("totalScorePoints")}</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  {t("numberOfScorePoints")}
                  <input className="field-control" min="1" type="number" value={draft.fixedScorePoints ?? 21} onChange={(event) => setDraft({ ...draft, fixedScorePoints: Number(event.target.value) })} />
                </label>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-lg font-bold">
                {t("courts")}
                <input className="field-control" min="1" type="number" value={draft.courts} onChange={(event) => setDraft({ ...draft, courts: Number(event.target.value) })} />
              </label>
              <label className="grid gap-2 text-lg font-bold">
                {t("rounds")}
                <input className="field-control" min="1" type="number" value={draft.rounds} onChange={(event) => setDraft({ ...draft, rounds: Number(event.target.value) })} />
              </label>
            </div>
            <label className="grid gap-2 text-lg font-bold">
              {t("rankingSort")}
              <select className="field-control" value={draft.rankingMode} onChange={(event) => setDraft({ ...draft, rankingMode: event.target.value as StandingsRankingMode })}>
                {rankingOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
              </select>
            </label>
            <div className="action-grid">
              <button className="btn-primary" type="submit">{t("save")}</button>
              <button className="btn-secondary" type="button" onClick={() => setIsEditing(false)}>{t("cancel")}</button>
            </div>
          </form>
        </Section>
      ) : null}

      {message ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{message}</p> : null}

      <Section title={t("templates")}>
        <div className="grid gap-3">
          {templates.map((template) => (
            <article key={template.id} className="app-card p-4 sm:p-5">
              <h3 className="text-xl font-black">{template.title}</h3>
              <p className="mt-1 font-bold text-[var(--muted)]">{getTemplateFormatDisplayName(template.format, t)} · {formatScoringMode(template.scoringMode, t)}</p>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">{template.courts} {t("courts").toLowerCase()} · {template.rounds} {t("rounds").toLowerCase()}{template.timeLimitMinutes ? ` · ${template.timeLimitMinutes} min.` : ""}</p>
              <div className="mt-4 action-grid">
                <Link className="btn-primary-soft" href={`/new-tournament?template=${encodeURIComponent(template.id)}`}>{t("startTemplate")}</Link>
                <button className="btn-secondary" type="button" onClick={() => editTemplate(template)}>{t("edit")}</button>
                <button className="btn-danger" type="button" onClick={() => removeTemplate(template.id)}>{t("delete")}</button>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

function getTemplateFormatDisplayName(format: TournamentTemplateInput["format"], t: (key: TranslationKey) => string): string {
  switch (format) {
    case "Fast Makker Americano":
      return t("fixedPartnerAmericano");
    case "Fast Makker Mexicano":
      return t("fixedPartnerMexicano");
    default:
      return format;
  }
}

function formatScoringMode(scoringMode: ScoringMode, t: (key: TranslationKey) => string): string {
  return scoringOptions.find((option) => option.value === scoringMode)
    ? t(scoringOptions.find((option) => option.value === scoringMode)?.labelKey ?? "playToScorePoints")
    : scoringMode;
}

