"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Section } from "@/components/ui/section";
import { scoringModes, tournamentTypes } from "@/lib/mock/tournament-data";
import {
  createDefaultTournamentTemplates,
  deleteTournamentTemplate,
  loadTournamentTemplates,
  saveTournamentTemplate,
  type TournamentTemplate,
  type TournamentTemplateInput,
} from "@/lib/tournament-templates";
import type { StandingsRankingMode } from "@/lib/tournament-engine";
import type { ScoringMode } from "@/lib/tournament-setup";
import { useHasHydrated } from "@/hooks/use-has-hydrated";

const formatOptions = tournamentTypes.filter((type) => type !== "Team vs. Team" && type !== "Puljespil") as TournamentTemplateInput["format"][];
const rankingOptions: Array<{ label: string; value: StandingsRankingMode }> = [
  { label: "Flest matchpoint", value: "matchPointsFirst" },
  { label: "Flest scorepoint", value: "partiPointsFirst" },
];
const defaultDraft: TournamentTemplateInput = {
  title: "Ny skabelon",
  format: "Americano",
  scoringMode: "Fri scoring",
  courts: 2,
  rounds: 2,
  firstRoundOrder: "manual",
  rankingMode: "matchPointsFirst",
  timeLimitMinutes: 15,
};

export function TemplatesApp() {
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
    return <p className="app-card p-4 font-bold text-[var(--muted)]">Indlæser skabeloner...</p>;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const nextTemplates = saveTournamentTemplate(draft, editingId ?? undefined);
      setTemplates(nextTemplates);
      setDraft(defaultDraft);
      setEditingId(null);
      setIsEditing(false);
      setMessage("Skabelon gemt.");
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Skabelonen kunne ikke gemmes.");
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
    setMessage("Skabelon slettet.");
  }

  return (
    <div className="grid gap-5">
      <button className="btn-primary min-h-14 text-lg" type="button" onClick={() => { setDraft(defaultDraft); setEditingId(null); setIsEditing(true); }}>
        Opret skabelon
      </button>

      {isEditing ? (
        <Section title={editingId ? "Rediger skabelon" : "Opret skabelon"}>
          <form className="app-card grid gap-3 p-4 sm:p-5" onSubmit={handleSubmit}>
            <label className="grid gap-2 text-lg font-bold">
              Navn
              <input className="field-control" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label className="grid gap-2 text-lg font-bold">
              Format
              <select className="field-control" value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as TournamentTemplateInput["format"] })}>
                {formatOptions.map((format) => <option key={format}>{format}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-lg font-bold">
              Scoring
              <select className="field-control" value={draft.scoringMode} onChange={(event) => setDraft({ ...draft, scoringMode: event.target.value as ScoringMode })}>
                {scoringModes.map((mode) => <option key={mode}>{mode}</option>)}
              </select>
            </label>
            {draft.scoringMode === "Spil på tid" ? (
              <label className="grid gap-2 text-lg font-bold">
                Spilletid
                <input className="field-control" min="1" type="number" value={draft.timeLimitMinutes ?? 15} onChange={(event) => setDraft({ ...draft, timeLimitMinutes: Number(event.target.value) })} />
              </label>
            ) : null}
            <div className="action-grid">
              <label className="grid gap-2 text-lg font-bold">
                Baner
                <input className="field-control" min="1" type="number" value={draft.courts} onChange={(event) => setDraft({ ...draft, courts: Number(event.target.value) })} />
              </label>
              <label className="grid gap-2 text-lg font-bold">
                Runder
                <input className="field-control" min="1" type="number" value={draft.rounds} onChange={(event) => setDraft({ ...draft, rounds: Number(event.target.value) })} />
              </label>
              <label className="grid gap-2 text-lg font-bold">
                Runde 1
                <select className="field-control" value={draft.firstRoundOrder} onChange={(event) => setDraft({ ...draft, firstRoundOrder: event.target.value as "manual" | "random" })}>
                  <option value="manual">Manuel rækkefølge</option>
                  <option value="random">Tilfældig</option>
                </select>
              </label>
            </div>
            <label className="grid gap-2 text-lg font-bold">
              Stilling
              <select className="field-control" value={draft.rankingMode} onChange={(event) => setDraft({ ...draft, rankingMode: event.target.value as StandingsRankingMode })}>
                {rankingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="action-grid">
              <button className="btn-primary" type="submit">Gem</button>
              <button className="btn-secondary" type="button" onClick={() => setIsEditing(false)}>Annuller</button>
            </div>
          </form>
        </Section>
      ) : null}

      {message ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{message}</p> : null}

      <Section title="Skabeloner">
        <div className="grid gap-3">
          {templates.map((template) => (
            <article key={template.id} className="app-card p-4 sm:p-5">
              <h3 className="text-xl font-black">{template.title}</h3>
              <p className="mt-1 font-bold text-[var(--muted)]">{template.format} · {template.scoringMode}</p>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">{template.courts} baner · {template.rounds} runder{template.timeLimitMinutes ? ` · ${template.timeLimitMinutes} min.` : ""}</p>
              <div className="mt-4 action-grid">
                <Link className="btn-primary-soft" href={`/new-tournament?template=${encodeURIComponent(template.id)}`}>Start</Link>
                <button className="btn-secondary" type="button" onClick={() => editTemplate(template)}>Rediger</button>
                <button className="btn-danger" type="button" onClick={() => removeTemplate(template.id)}>Slet</button>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

