"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Section } from "@/components/ui/section";
import { scoringModes, tournamentTypes } from "@/lib/mock/tournament-data";
import {
  createTeamVsTeamTournamentFromSetup,
  createTournamentFromSetup,
  saveActiveTeamVsTeamTournament,
  saveActiveTournament,
  type ScoringMode,
  type TournamentSetupFormat,
} from "@/lib/tournament-setup";
import type { StandingsRankingMode } from "@/lib/tournament-engine";
import { getTeamVsTeamCaptainName, type TeamVsTeamMatchFormat, type TeamVsTeamPlayersPerTeam, type TeamVsTeamTeam } from "@/lib/team-vs-team";
import { loadTournamentSettings } from "@/lib/tournament-settings";
import { findTournamentTemplate } from "@/lib/tournament-templates";

const formatOptions = [...tournamentTypes] as TournamentSetupFormat[];

const rankingModeOptions: Array<{ label: string; value: StandingsRankingMode }> = [
  { label: "Flest matchpoint", value: "matchPointsFirst" },
  { label: "Flest partipoint", value: "partiPointsFirst" },
];

const defaultPlayerText = ["Anna", "Hassan", "Maja", "Noah", "Sofia", "Emil", "Clara", "Jonas"].join("\n");
const defaultFemaleText = ["Anna", "Maja", "Sofia", "Clara"].join("\n");
const defaultMaleText = ["Hassan", "Noah", "Emil", "Jonas"].join("\n");

export function TournamentSetupForm() {
  const router = useRouter();
  const initialSettings = useMemo(() => loadTournamentSettings(), []);
  const initialTemplate = useMemo(() => getInitialTemplate(), []);
  const [name, setName] = useState(initialTemplate?.title ?? "Fredag Americano");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [format, setFormat] = useState<TournamentSetupFormat>(initialTemplate?.format ?? "Americano");
  const [scoringMode, setScoringMode] = useState<ScoringMode>(initialTemplate?.scoringMode ?? initialSettings.scoringMode);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(initialTemplate?.timeLimitMinutes ?? initialSettings.timeLimitMinutes);
  const [playerText, setPlayerText] = useState(defaultPlayerText);
  const [femalePlayerText, setFemalePlayerText] = useState(defaultFemaleText);
  const [malePlayerText, setMalePlayerText] = useState(defaultMaleText);
  const [courts, setCourts] = useState(initialTemplate?.courts ?? initialSettings.courts);
  const [rounds, setRounds] = useState(initialTemplate?.rounds ?? initialSettings.rounds);
  const [teamCount, setTeamCount] = useState<2 | 4>(2);
  const [playersPerTeam, setPlayersPerTeam] = useState<TeamVsTeamPlayersPerTeam>(4);
  const [teamMatchFormat, setTeamMatchFormat] = useState<TeamVsTeamMatchFormat>("oneSet");
  const [teamDrafts, setTeamDrafts] = useState<TeamVsTeamTeam[]>(() => createDefaultTeams(4, 8));
  const [firstRoundOrder, setFirstRoundOrder] = useState<"manual" | "random">(initialTemplate?.firstRoundOrder ?? "manual");
  const [rankingMode, setRankingMode] = useState<StandingsRankingMode>(initialTemplate?.rankingMode ?? initialSettings.rankingMode);
  const [error, setError] = useState("");
  const isTeamVsTeam = format === "Team vs. Team";
  const teamRounds = playersPerTeam === 4 ? 3 : 2;

  const playerCount = useMemo(() => {
    if (isTeamVsTeam) {
      return teamCount * playersPerTeam;
    }

    if (format === "Mixed Americano") {
      return countLines(femalePlayerText) + countLines(malePlayerText);
    }

    return countLines(playerText);
  }, [femalePlayerText, format, isTeamVsTeam, malePlayerText, playerText, playersPerTeam, teamCount]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (isTeamVsTeam) {
        const tournament = createTeamVsTeamTournamentFromSetup({
          name,
          date,
          startTime,
          scoringMode,
          teamCount,
          playersPerTeam,
          matchFormat: teamMatchFormat,
          teams: teamDrafts.slice(0, teamCount).map((team) => ({ ...team, players: team.players.slice(0, playersPerTeam) })),
        });

        saveActiveTeamVsTeamTournament(tournament);
        router.push("/tournaments");
        return;
      }

      const tournament = createTournamentFromSetup({
        name,
        format,
        playerText,
        femalePlayerText,
        malePlayerText,
        courts,
        rounds,
        scoringMode,
        timeLimitMinutes,
        firstRoundOrder,
        rankingMode,
      });

      saveActiveTournament(tournament);
      router.push("/live");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Turneringen kunne ikke oprettes.");
    }
  }

  function updateTeam(teamIndex: number, nextTeam: TeamVsTeamTeam) {
    setTeamDrafts((currentTeams) => currentTeams.map((team, index) => (index === teamIndex ? nextTeam : team)));
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <Section title="1. Turneringsform">
        <div className="grid gap-3 sm:grid-cols-2">
          {formatOptions.map((option) => (
            <button
              key={option}
              className={`min-h-16 rounded-md border p-4 text-left text-lg font-black transition focus:outline-none focus:ring-4 focus:ring-green-100 ${format === option ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "border-[var(--line)] bg-white"}`}
              type="button"
              onClick={() => setFormat(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </Section>

      <Section title="2. Turneringsindstillinger">
        <div className="app-card grid gap-3 p-4 sm:p-5">
          <label className="grid gap-2 text-lg font-bold">
            Navn
            <input className="field-control" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-lg font-bold">
              Dato
              <input className="field-control" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="grid gap-2 text-lg font-bold">
              Starttidspunkt
              <input className="field-control" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
          </div>
          <label className="grid gap-2 text-lg font-bold">
            Scoring
            <select className="field-control" value={scoringMode} onChange={(event) => setScoringMode(event.target.value as ScoringMode)}>
              {scoringModes.map((mode) => <option key={mode}>{mode}</option>)}
            </select>
          </label>
          {scoringMode === "Spil på tid" ? (
            <label className="grid gap-2 text-lg font-bold">
              Spilletid pr. runde
              <input className="field-control" min="1" type="number" value={timeLimitMinutes} onChange={(event) => setTimeLimitMinutes(Number(event.target.value))} />
            </label>
          ) : null}
          {isTeamVsTeam ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-lg font-bold">
                  Antal hold
                  <select className="field-control" value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value) as 2 | 4)}>
                    <option value={2}>2 hold</option>
                    <option value={4}>4 hold</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Spillere pr. hold
                  <select className="field-control" value={playersPerTeam} onChange={(event) => setPlayersPerTeam(Number(event.target.value) as TeamVsTeamPlayersPerTeam)}>
                    <option value={4}>4 spillere</option>
                    <option value={6}>6 spillere</option>
                    <option value={8}>8 spillere</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Kampformat
                  <select className="field-control" value={teamMatchFormat} onChange={(event) => setTeamMatchFormat(event.target.value as TeamVsTeamMatchFormat)}>
                    <option value="oneSet">1 sæt</option>
                    <option value="bestOfThree">Bedst af 3 sæt</option>
                  </select>
                </label>
              </div>
              <p className="font-bold text-[var(--muted)]">{playersPerTeam === 4 ? "4 spillere pr. hold spiller 3 runder." : "6 eller 8 spillere pr. hold spiller 2 runder."}</p>
            </>
          ) : (
            <>
              <label className="grid gap-2 text-lg font-bold">
                Stilling sorteres efter
                <select className="field-control" value={rankingMode} onChange={(event) => setRankingMode(event.target.value as StandingsRankingMode)}>
                  {rankingModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-lg font-bold">
                  Baner
                  <input className="field-control" min="1" type="number" value={courts} onChange={(event) => setCourts(Number(event.target.value))} />
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Runder
                  <input className="field-control" min="1" type="number" value={rounds} onChange={(event) => setRounds(Number(event.target.value))} />
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Runde 1
                  <select className="field-control" value={firstRoundOrder} onChange={(event) => setFirstRoundOrder(event.target.value as "manual" | "random")}>
                    <option value="manual">Manuel rækkefølge</option>
                    <option value="random">Tilfældig</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </div>
      </Section>

      {isTeamVsTeam ? (
        <Section title="3. Hold">
          <div className="grid gap-3">
            {teamDrafts.slice(0, teamCount).map((team, index) => (
              <TeamEditor key={team.id} team={team} teamNumber={index + 1} playersPerTeam={playersPerTeam} onChange={(nextTeam) => updateTeam(index, nextTeam)} />
            ))}
          </div>
        </Section>
      ) : (
        <Section title="3. Spillere">
          {format === "Mixed Americano" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-lg font-bold">
                Kvinder
                <textarea className="field-control min-h-64 resize-y text-xl leading-8" value={femalePlayerText} onChange={(event) => setFemalePlayerText(event.target.value)} />
              </label>
              <label className="grid gap-2 text-lg font-bold">
                Mænd
                <textarea className="field-control min-h-64 resize-y text-xl leading-8" value={malePlayerText} onChange={(event) => setMalePlayerText(event.target.value)} />
              </label>
            </div>
          ) : (
            <textarea className="field-control min-h-64 resize-y text-xl leading-8" value={playerText} onChange={(event) => setPlayerText(event.target.value)} aria-label="Spillere, et navn pr. linje" />
          )}
        </Section>
      )}

      <Section title="4. Gennemse">
        <div className="app-card grid gap-1 p-4 text-lg leading-8 sm:p-5">
          <p><strong>Navn:</strong> {name || "-"}</p>
          <p><strong>Format:</strong> {format}</p>
          <p><strong>Scoring:</strong> {scoringMode}</p>
          {scoringMode === "Spil på tid" ? <p><strong>Spilletid:</strong> {timeLimitMinutes} min.</p> : null}
          <p><strong>{isTeamVsTeam ? "Hold" : "Spillere"}:</strong> {isTeamVsTeam ? teamCount : playerCount}</p>
          {isTeamVsTeam ? <p><strong>Spillere pr. hold:</strong> {playersPerTeam}</p> : null}
          {isTeamVsTeam ? <p><strong>Holdkaptajner:</strong> {teamDrafts.slice(0, teamCount).map((team) => `${team.name || "Hold"}: ${getTeamVsTeamCaptainName(team)}`).join(" · ")}</p> : null}
          {!isTeamVsTeam ? <p><strong>Baner:</strong> {courts}</p> : null}
          {!isTeamVsTeam ? <p><strong>Runder:</strong> {rounds}</p> : <p><strong>Holdkamp:</strong> {teamRounds} runder · 2 kampe pr. runde · {teamMatchFormat === "oneSet" ? "1 sæt" : "bedst af 3 sæt"}</p>}
          {!isTeamVsTeam ? <p><strong>Stilling:</strong> {rankingModeOptions.find((option) => option.value === rankingMode)?.label}</p> : null}
        </div>
      </Section>

      <Section title="5. Start turnering">
        {error ? <p className="mb-3 rounded-md bg-red-50 p-3 font-bold text-red-700">{error}</p> : null}
        <PrimaryButton type="submit">Start turnering</PrimaryButton>
      </Section>
    </form>
  );
}

function TeamEditor({ team, teamNumber, playersPerTeam, onChange }: { team: TeamVsTeamTeam; teamNumber: number; playersPerTeam: TeamVsTeamPlayersPerTeam; onChange: (team: TeamVsTeamTeam) => void }) {
  function updatePlayerName(playerIndex: number, name: string) {
    const players = team.players.map((player, index) => (index === playerIndex ? { ...player, name } : player));
    onChange({ ...team, players });
  }

  return (
    <article className="app-card grid gap-3 p-4 sm:p-5">
      <label className="grid gap-2 text-lg font-bold">
        Holdnavn
        <input className="field-control" value={team.name} onChange={(event) => onChange({ ...team, name: event.target.value })} aria-label={`Hold ${teamNumber} navn`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {team.players.slice(0, playersPerTeam).map((player, playerIndex) => (
          <label key={player.id} className="grid gap-2 text-base font-bold">
            Spiller {playerIndex + 1}
            <input className="field-control" value={player.name} onChange={(event) => updatePlayerName(playerIndex, event.target.value)} />
          </label>
        ))}
      </div>
      <label className="grid gap-2 text-lg font-bold">
        Holdkaptajn
        <select className="field-control" value={team.captainPlayerId} onChange={(event) => onChange({ ...team, captainPlayerId: event.target.value })}>
          {team.players.slice(0, playersPerTeam).map((player, playerIndex) => (
            <option key={player.id} value={player.id}>{player.name || `Spiller ${playerIndex + 1}`}</option>
          ))}
        </select>
      </label>
    </article>
  );
}

function getInitialTemplate() {
  if (typeof window === "undefined") {
    return null;
  }

  const templateId = new URLSearchParams(window.location.search).get("template");
  return templateId ? findTournamentTemplate(templateId) : null;
}

function createDefaultTeams(count: 4, playersPerTeam: 8): TeamVsTeamTeam[] {
  return Array.from({ length: count }, (_, teamIndex) => ({
    id: `team-${teamIndex + 1}`,
    name: `Hold ${teamIndex + 1}`,
    captainPlayerId: `team-${teamIndex + 1}-player-1`,
    players: Array.from({ length: playersPerTeam }, (_, playerIndex) => ({
      id: `team-${teamIndex + 1}-player-${playerIndex + 1}`,
      name: "",
    })),
  }));
}

function countLines(text: string): number {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}
