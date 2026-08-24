"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Section } from "@/components/ui/section";
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";
import { tournamentTypes } from "@/lib/mock/tournament-data";
import {
  createPoolTournamentFromSetup,
  createStandardShadowSaveLocalId,
  createTeamVsTeamTournamentFromSetup,
  createTeamVsTeamShadowSaveLocalId,
  createTournamentFromSetup,
  ensureStandardTournamentShadowSaveCompleted,
  ensureTeamVsTeamTournamentShadowSaveCompleted,
  isShadowSaveEnabled,
  saveActiveTeamVsTeamTournament,
  saveActiveTournament,
  type ShadowSaveMetadata,
  type FixedScoreRule,
  type PoolAdvancementMode,
  type PoolParticipantType,
  type PoolTeamPlayers,
  type PoolUnmatchedResolution,
  type ScoringMode,
  type TournamentSetupFormat,
} from "@/lib/tournament-setup";
import type { StandingsRankingMode } from "@/lib/tournament-engine";
import {
  getTeamVsTeamCaptainName,
  type TeamVsTeamCompetitionMode,
  type TeamVsTeamDrawMode,
  type TeamVsTeamMatchFormat,
  type TeamVsTeamPlayersPerTeam,
  type TeamVsTeamTeam,
  type TeamVsTeamTeamCount,
} from "@/lib/team-vs-team";
import { createDefaultTournamentSettings, loadTournamentSettings } from "@/lib/tournament-settings";

const formatOptions = tournamentTypes.filter((type) => type !== "Puljespil" && type !== "Team vs. Team") as TournamentSetupFormat[];

const rankingModeOptions: Array<{ labelKey: "mostMatchPoints" | "mostScorePoints"; value: StandingsRankingMode }> = [
  { labelKey: "mostMatchPoints", value: "matchPointsFirst" },
  { labelKey: "mostScorePoints", value: "partiPointsFirst" },
];

type ScoringChoice = "target" | "total" | "timed";

const scoringChoices: Array<{ labelKey: "playToScorePoints" | "totalScorePoints" | "timeFreeScoring"; value: ScoringChoice }> = [
  { labelKey: "playToScorePoints", value: "target" },
  { labelKey: "totalScorePoints", value: "total" },
  { labelKey: "timeFreeScoring", value: "timed" },
];

const automaticTournamentNames = new Set<string>(formatOptions);
const tapMovementThresholdPx = 10;
const suppressSyntheticClickMs = 750;

type FormatTapGesture = {
  cancelled: boolean;
  format: TournamentSetupFormat;
  moved: boolean;
  startX: number;
  startY: number;
};

export function TournamentSetupForm() {
  const { t } = useAppTranslation();
  const router = useRouter();
  const initialSettings = useMemo(() => createDefaultTournamentSettings(), []);
  const initialScoringMode = getInitialScoringMode(initialSettings.scoringMode);
  const formDirtyRef = useRef(false);
  const nameRef = useRef("Americano");
  const formatTapGesture = useRef<FormatTapGesture | null>(null);
  const suppressNextFormatClick = useRef<{ format: TournamentSetupFormat } | null>(null);
  const [name, setName] = useState("Americano");
  const [format, setFormat] = useState<TournamentSetupFormat>("Americano");
  const [scoringMode, setScoringMode] = useState<ScoringMode>(initialScoringMode);
  const [fixedScoreRule, setFixedScoreRule] = useState<FixedScoreRule>("target");
  const [fixedScorePoints, setFixedScorePoints] = useState("21");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(String(initialSettings.timeLimitMinutes));
  const [playerText, setPlayerText] = useState("");
  const [femalePlayerText, setFemalePlayerText] = useState("");
  const [malePlayerText, setMalePlayerText] = useState("");
  const [courts, setCourts] = useState(String(initialSettings.courts));
  const [rounds, setRounds] = useState(String(initialSettings.rounds));
  const [teamCount, setTeamCount] = useState<TeamVsTeamTeamCount>(2);
  const [competitionMode, setCompetitionMode] = useState<TeamVsTeamCompetitionMode>("knockout");
  const [drawMode, setDrawMode] = useState<TeamVsTeamDrawMode>("manual");
  const [playersPerTeam, setPlayersPerTeam] = useState<TeamVsTeamPlayersPerTeam>(4);
  const [teamMatchFormat, setTeamMatchFormat] = useState<TeamVsTeamMatchFormat>("oneSet");
  const [teamDrafts, setTeamDrafts] = useState<TeamVsTeamTeam[]>(() => createDefaultTeams(8, 8));
  const [poolParticipantType, setPoolParticipantType] = useState<PoolParticipantType>("player");
  const [poolCount, setPoolCount] = useState(2);
  const [participantsPerPool, setParticipantsPerPool] = useState(4);
  const [poolAdvancementMode, setPoolAdvancementMode] = useState<PoolAdvancementMode>("crossMatches");
  const [poolUnmatchedResolution, setPoolUnmatchedResolution] = useState<PoolUnmatchedResolution>("bye");
  const [poolTeamPlayersPerTeam, setPoolTeamPlayersPerTeam] = useState<PoolTeamPlayers>(4);
  const [rankingMode, setRankingMode] = useState<StandingsRankingMode>(initialSettings.rankingMode);
  const [error, setError] = useState("");
  const isTeamVsTeam = format === "Team vs. Team";
  const isPoolPlay = format === "Puljespil";
  const isFixedPartner = format === "Fast Makker Americano" || format === "Fast Makker Mexicano";
  const fixedPartnerPairs = getFixedPartnerPairs(playerText);
  const teamRounds = playersPerTeam === 4 ? 3 : 2;
  const scoringChoice = getScoringChoice(scoringMode, fixedScoreRule);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (formDirtyRef.current) {
        return;
      }

      const savedSettings = loadTournamentSettings();
      setScoringMode(getInitialScoringMode(savedSettings.scoringMode));
      setTimeLimitMinutes(String(savedSettings.timeLimitMinutes));
      setCourts(String(savedSettings.courts));
      setRounds(String(savedSettings.rounds));
      setRankingMode(savedSettings.rankingMode);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const playerCount = useMemo(() => {
    if (isTeamVsTeam) {
      return teamCount * playersPerTeam;
    }

    if (isPoolPlay) {
      return countLines(playerText);
    }

    if (format === "Mixed Americano") {
      return countLines(femalePlayerText) + countLines(malePlayerText);
    }

    return countLines(playerText);
  }, [femalePlayerText, format, isPoolPlay, isTeamVsTeam, malePlayerText, playerText, playersPerTeam, teamCount]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (isTeamVsTeam) {
        const tournament = createTeamVsTeamTournamentFromSetup({
          name,
          scoringMode,
          fixedScoreRule,
          fixedScorePoints: parsePositiveIntegerInput(fixedScorePoints, "Antal scorepoint"),
          teamCount,
          competitionMode,
          drawMode,
          playersPerTeam,
          matchFormat: teamMatchFormat,
          teams: teamDrafts.slice(0, teamCount).map((team) => ({ ...team, players: team.players.slice(0, playersPerTeam) })),
        });

        saveActiveTeamVsTeamTournament(tournament);
        assertInitialCloudShadowSave(await ensureTeamVsTeamTournamentShadowSaveCompleted(createTeamVsTeamShadowSaveLocalId(tournament), tournament));
        router.push("/team-vs-team");
        return;
      }

      if (isPoolPlay) {
        const tournament = createPoolTournamentFromSetup({
          name,
          participantType: poolParticipantType,
          participantText: playerText,
          poolCount,
          participantsPerPool,
          advancementMode: poolAdvancementMode,
          unmatchedResolution: poolUnmatchedResolution,
          scoringMode,
          fixedScoreRule,
          fixedScorePoints: parsePositiveIntegerInput(fixedScorePoints, "Antal scorepoint"),
          timeLimitMinutes: parsePositiveIntegerInput(timeLimitMinutes, "Spilletid"),
          rankingMode,
          teamPlayersPerTeam: poolParticipantType === "team" ? poolTeamPlayersPerTeam : undefined,
        });

        saveActiveTournament(tournament);
        assertInitialCloudShadowSave(await ensureStandardTournamentShadowSaveCompleted(createStandardShadowSaveLocalId(tournament), tournament));
        router.push("/live");
        return;
      }

      const tournament = createTournamentFromSetup({
        name,
        format,
        playerText,
        femalePlayerText,
        malePlayerText,
        courts: parsePositiveIntegerInput(courts, "Baner"),
        rounds: parsePositiveIntegerInput(rounds, "Runder"),
        scoringMode,
        fixedScoreRule,
        fixedScorePoints: parsePositiveIntegerInput(fixedScorePoints, "Antal scorepoint"),
        timeLimitMinutes: parsePositiveIntegerInput(timeLimitMinutes, "Spilletid"),
        firstRoundOrder: "random",
        rankingMode,
      });

      saveActiveTournament(tournament);
      assertInitialCloudShadowSave(await ensureStandardTournamentShadowSaveCompleted(createStandardShadowSaveLocalId(tournament), tournament));
      router.push("/live");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Turneringen kunne ikke oprettes.");
    }
  }

  function updateTeam(teamIndex: number, nextTeam: TeamVsTeamTeam) {
    markFormDirty();
    setTeamDrafts((currentTeams) => currentTeams.map((team, index) => (index === teamIndex ? nextTeam : team)));
  }

  function handleFormatChange(nextFormat: TournamentSetupFormat) {
    markFormDirty();
    setFormat(nextFormat);
    setName((currentName) => {
      const latestName = nameRef.current;
      const nextName = isAutomaticTournamentName(latestName) ? nextFormat : latestName;
      nameRef.current = nextName;
      return currentName === nextName ? currentName : nextName;
    });
    setError("");
  }

  function startFormatTapGesture(nextFormat: TournamentSetupFormat, startX: number, startY: number) {
    formatTapGesture.current = {
      cancelled: false,
      format: nextFormat,
      moved: false,
      startX,
      startY,
    };
  }

  function updateFormatTapGesture(nextFormat: TournamentSetupFormat, currentX: number, currentY: number): { active: boolean; deltaX: number; deltaY: number; moved: boolean } {
    const gesture = formatTapGesture.current;

    if (!gesture || gesture.format !== nextFormat || gesture.cancelled) {
      return { active: false, deltaX: 0, deltaY: 0, moved: false };
    }

    const deltaX = Math.abs(currentX - gesture.startX);
    const deltaY = Math.abs(currentY - gesture.startY);
    const moved = deltaX > tapMovementThresholdPx || deltaY > tapMovementThresholdPx;

    if (moved) {
      gesture.moved = true;
    }

    return { active: true, deltaX, deltaY, moved: gesture.moved };
  }

  function finishFormatTapGesture(nextFormat: TournamentSetupFormat, currentX: number, currentY: number): { shouldSelect: boolean; deltaX: number; deltaY: number; moved: boolean } {
    const gesture = formatTapGesture.current;

    if (!gesture || gesture.format !== nextFormat || gesture.cancelled) {
      formatTapGesture.current = null;
      return { shouldSelect: false, deltaX: 0, deltaY: 0, moved: false };
    }

    const movement = updateFormatTapGesture(nextFormat, currentX, currentY);
    formatTapGesture.current = null;

    return {
      shouldSelect: movement.active && !movement.moved,
      deltaX: movement.deltaX,
      deltaY: movement.deltaY,
      moved: movement.moved,
    };
  }

  function cancelFormatTapGesture(nextFormat: TournamentSetupFormat) {
    if (formatTapGesture.current?.format === nextFormat) {
      formatTapGesture.current.cancelled = true;
    }

    formatTapGesture.current = null;
  }

  function suppressSyntheticClickForFormat(nextFormat: TournamentSetupFormat) {
    suppressNextFormatClick.current = { format: nextFormat };
    window.setTimeout(() => {
      if (suppressNextFormatClick.current?.format === nextFormat) {
        suppressNextFormatClick.current = null;
      }
    }, suppressSyntheticClickMs);
  }

  function handleFormatPointerDown(nextFormat: TournamentSetupFormat, event: PointerEvent<HTMLButtonElement>) {
    startFormatTapGesture(nextFormat, event.clientX, event.clientY);
  }

  function handleFormatPointerMove(nextFormat: TournamentSetupFormat, event: PointerEvent<HTMLButtonElement>) {
    updateFormatTapGesture(nextFormat, event.clientX, event.clientY);
  }

  function handleFormatPointerUp(nextFormat: TournamentSetupFormat, event: PointerEvent<HTMLButtonElement>) {
    const result = finishFormatTapGesture(nextFormat, event.clientX, event.clientY);

    if (result.shouldSelect) {
      suppressSyntheticClickForFormat(nextFormat);
      handleFormatChange(nextFormat);
    }
  }

  function getFirstTouchPoint(event: TouchEvent<HTMLButtonElement>): { clientX: number; clientY: number } | null {
    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
  }

  function handleFormatTouchStart(nextFormat: TournamentSetupFormat, event: TouchEvent<HTMLButtonElement>) {
    const touchPoint = getFirstTouchPoint(event);

    if (touchPoint) {
      startFormatTapGesture(nextFormat, touchPoint.clientX, touchPoint.clientY);
    }
  }

  function handleFormatTouchMove(nextFormat: TournamentSetupFormat, event: TouchEvent<HTMLButtonElement>) {
    const touchPoint = getFirstTouchPoint(event);
    if (touchPoint) {
      updateFormatTapGesture(nextFormat, touchPoint.clientX, touchPoint.clientY);
    }
  }

  function handleFormatTouchEnd(nextFormat: TournamentSetupFormat, event: TouchEvent<HTMLButtonElement>) {
    const touchPoint = getFirstTouchPoint(event);
    const result = touchPoint ? finishFormatTapGesture(nextFormat, touchPoint.clientX, touchPoint.clientY) : { shouldSelect: false, deltaX: 0, deltaY: 0, moved: false };

    if (result.shouldSelect) {
      suppressSyntheticClickForFormat(nextFormat);
      handleFormatChange(nextFormat);
    }
  }

  function handleFormatClick(nextFormat: TournamentSetupFormat) {
    const suppressedClick = suppressNextFormatClick.current;

    if (suppressedClick?.format === nextFormat) {
      suppressNextFormatClick.current = null;
      return;
    }

    suppressNextFormatClick.current = null;
    handleFormatChange(nextFormat);
  }

  function handleNameChange(nextName: string) {
    markFormDirty();
    nameRef.current = nextName;
    setName(nextName);
  }

  function handleScoringChoiceChange(nextChoice: ScoringChoice) {
    markFormDirty();

    if (nextChoice === "timed") {
      setScoringMode("Spil på tid");
      return;
    }

    setScoringMode("Fast antal point");
    setFixedScoreRule(nextChoice);
  }

  function updateFixedPartnerPlayer(pairIndex: number, playerIndex: number, playerName: string) {
    markFormDirty();
    const names = getFixedPartnerPlayerNames(playerText);
    names[pairIndex * 2 + playerIndex] = playerName;
    setPlayerText(names.join("\n"));
  }

  function addFixedPartnerPair() {
    markFormDirty();
    setPlayerText([...getFixedPartnerPlayerNames(playerText), "", ""].join("\n"));
  }

  function removeFixedPartnerPair(pairIndex: number) {
    markFormDirty();
    const names = getFixedPartnerPlayerNames(playerText);
    names.splice(pairIndex * 2, 2);
    setPlayerText(names.join("\n"));
  }

  function markFormDirty() {
    formDirtyRef.current = true;
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <Section title={`1. ${t("tournamentFormat")}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {formatOptions.map((option) => (
            <button
              key={option}
              aria-pressed={format === option}
              className={getFormatButtonClass(format === option)}
              data-selected={format === option ? "true" : "false"}
              type="button"
              onPointerCancel={() => cancelFormatTapGesture(option)}
              onPointerDown={(event) => handleFormatPointerDown(option, event)}
              onPointerMove={(event) => handleFormatPointerMove(option, event)}
              onPointerUp={(event) => handleFormatPointerUp(option, event)}
              onTouchCancel={() => cancelFormatTapGesture(option)}
              onTouchEnd={(event) => handleFormatTouchEnd(option, event)}
              onTouchMove={(event) => handleFormatTouchMove(option, event)}
              onTouchStart={(event) => handleFormatTouchStart(option, event)}
              onClick={() => handleFormatClick(option)}
            >
              {getFormatDisplayName(option, t)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={`2. ${t("tournamentSettings")}`}>
        <div className="app-card grid gap-3 p-4 sm:p-5">
          <label className="grid gap-2 text-lg font-bold">
            {t("name")}
            <input className="field-control" value={name} onChange={(event) => handleNameChange(event.target.value)} />
          </label>
          <label className="grid gap-2 text-lg font-bold">
            Scoring
            <select className="field-control" value={scoringChoice} onChange={(event) => handleScoringChoiceChange(event.target.value as ScoringChoice)}>
              {scoringChoices.map((choice) => <option key={choice.value} value={choice.value}>{t(choice.labelKey)}</option>)}
            </select>
          </label>
          {scoringMode === "Fast antal point" ? (
            <label className="grid gap-2 text-lg font-bold">
              {fixedScoreRule === "total" ? t("totalScorePointsCount") : t("numberOfScorePoints")}
              <input
                className="field-control"
                min="1"
                type="number"
                value={fixedScorePoints}
                onBlur={() => setFixedScorePoints(normalizeIntegerInputValue(fixedScorePoints))}
                onChange={(event) => {
                  markFormDirty();
                  setFixedScorePoints(event.target.value);
                }}
              />
            </label>
          ) : null}
          {scoringMode === "Spil på tid" ? (
            <label className="grid gap-2 text-lg font-bold">
              {t("timeLimitMinutes")}
              <input
                className="field-control"
                min="1"
                type="number"
                value={timeLimitMinutes}
                onBlur={() => setTimeLimitMinutes(normalizeIntegerInputValue(timeLimitMinutes))}
                onChange={(event) => {
                  markFormDirty();
                  setTimeLimitMinutes(event.target.value);
                }}
              />
            </label>
          ) : null}
          {isTeamVsTeam ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-lg font-bold">
                  Afvikling
                  <select
                    className="field-control"
                    value={competitionMode}
                    onChange={(event) => {
                      markFormDirty();
                      setCompetitionMode(event.target.value as TeamVsTeamCompetitionMode);
                    }}
                  >
                    <option value="knockout">Knockout</option>
                    <option value="pool">Puljespil</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Antal hold
                  <select
                    className="field-control"
                    value={teamCount}
                    onChange={(event) => {
                      markFormDirty();
                      setTeamCount(Number(event.target.value) as TeamVsTeamTeamCount);
                    }}
                  >
                    {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} hold</option>)}
                  </select>
                </label>
                {competitionMode === "knockout" ? (
                  <label className="grid gap-2 text-lg font-bold">
                    Fordeling
                    <select
                      className="field-control"
                      value={drawMode}
                      onChange={(event) => {
                        markFormDirty();
                        setDrawMode(event.target.value as TeamVsTeamDrawMode);
                      }}
                    >
                      <option value="manual">Manuel</option>
                      <option value="random">Tilfældig</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-lg font-bold">
                  Spillere pr. hold
                  <select
                    className="field-control"
                    value={playersPerTeam}
                    onChange={(event) => {
                      markFormDirty();
                      setPlayersPerTeam(Number(event.target.value) as TeamVsTeamPlayersPerTeam);
                    }}
                  >
                    <option value={4}>4 spillere</option>
                    <option value={6}>6 spillere</option>
                    <option value={8}>8 spillere</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Kampformat
                  <select
                    className="field-control"
                    value={teamMatchFormat}
                    onChange={(event) => {
                      markFormDirty();
                      setTeamMatchFormat(event.target.value as TeamVsTeamMatchFormat);
                    }}
                  >
                    <option value="oneSet">1 sæt</option>
                    <option value="bestOfThree">Bedst af 3 sæt</option>
                  </select>
                </label>
              </div>
              <p className="font-bold text-[var(--muted)]">
                {competitionMode === "pool" ? `Alle ${teamCount} hold møder hinanden én gang. ` : ""}
                {playersPerTeam === 4 ? "4 spillere pr. hold spiller 3 runder." : "6 eller 8 spillere pr. hold spiller 2 runder."}
              </p>
            </>
          ) : isPoolPlay ? (
            <>
              <label className="grid gap-2 text-lg font-bold">
                {t("rankingSort")}
                <select
                  className="field-control"
                  value={rankingMode}
                  onChange={(event) => {
                    markFormDirty();
                    setRankingMode(event.target.value as StandingsRankingMode);
                  }}
                >
                  {rankingModeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-lg font-bold">
                  Deltagertype
                  <select
                    className="field-control"
                    value={poolParticipantType}
                    onChange={(event) => {
                      markFormDirty();
                      setPoolParticipantType(event.target.value as PoolParticipantType);
                    }}
                  >
                    <option value="player">Spillere</option>
                    <option value="pair">Par</option>
                    <option value="team">Hold</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Antal puljer
                  <input
                    className="field-control"
                    min="1"
                    max="8"
                    type="number"
                    value={poolCount}
                    onChange={(event) => {
                      markFormDirty();
                      setPoolCount(Number(event.target.value));
                    }}
                  />
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  {poolParticipantCountLabel(poolParticipantType)}
                  <input
                    className="field-control"
                    min={poolParticipantType === "player" ? 4 : 2}
                    type="number"
                    value={participantsPerPool}
                    onChange={(event) => {
                      markFormDirty();
                      setParticipantsPerPool(Number(event.target.value));
                    }}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-lg font-bold">
                  Progression
                  <select
                    className="field-control"
                    value={poolAdvancementMode}
                    onChange={(event) => {
                      markFormDirty();
                      setPoolAdvancementMode(event.target.value as PoolAdvancementMode);
                    }}
                  >
                    <option value="crossMatches">Krydskampe</option>
                    <option value="placementPools">Placeringspuljer</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Ulig sidste pulje
                  <select
                    className="field-control"
                    value={poolUnmatchedResolution}
                    onChange={(event) => {
                      markFormDirty();
                      setPoolUnmatchedResolution(event.target.value as PoolUnmatchedResolution);
                    }}
                  >
                    <option value="bye">Oversidning</option>
                    <option value="walkover">Walkover</option>
                  </select>
                </label>
                {poolParticipantType === "team" ? (
                  <label className="grid gap-2 text-lg font-bold">
                    Spillere pr. hold
                    <select
                      className="field-control"
                      value={poolTeamPlayersPerTeam}
                      onChange={(event) => {
                        markFormDirty();
                        setPoolTeamPlayersPerTeam(Number(event.target.value) as PoolTeamPlayers);
                      }}
                    >
                      <option value={4}>4 spillere</option>
                      <option value={6}>6 spillere</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <p className="font-bold text-[var(--muted)]">
                {poolCount * participantsPerPool} {poolParticipantTotalLabel(poolParticipantType)} fordeles i {poolCount} puljer.
              </p>
            </>
          ) : (
            <>
              <label className="grid gap-2 text-lg font-bold">
                {t("rankingSort")}
                <select
                  className="field-control"
                  value={rankingMode}
                  onChange={(event) => {
                    markFormDirty();
                    setRankingMode(event.target.value as StandingsRankingMode);
                  }}
                >
                  {rankingModeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-lg font-bold">
                  {t("courts")}
                  <input
                    className="field-control"
                    min="1"
                    type="number"
                    value={courts}
                    onBlur={() => setCourts(normalizeIntegerInputValue(courts))}
                    onChange={(event) => {
                      markFormDirty();
                      setCourts(event.target.value);
                    }}
                  />
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  {t("rounds")}
                  <input
                    className="field-control"
                    min="1"
                    type="number"
                    value={rounds}
                    onBlur={() => setRounds(normalizeIntegerInputValue(rounds))}
                    onChange={(event) => {
                      markFormDirty();
                      setRounds(event.target.value);
                    }}
                  />
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
        <Section title={`3. ${participantSectionTitle(format, poolParticipantType, t)}`}>
          {format === "Mixed Americano" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-lg font-bold">
                Kvinder
                <textarea
                  className="field-control min-h-64 resize-y text-xl leading-8"
                  placeholder={t("oneNamePerLine")}
                  value={femalePlayerText}
                  onChange={(event) => {
                    markFormDirty();
                    setFemalePlayerText(event.target.value);
                  }}
                />
              </label>
              <label className="grid gap-2 text-lg font-bold">
                Mænd
                <textarea
                  className="field-control min-h-64 resize-y text-xl leading-8"
                  placeholder={t("oneNamePerLine")}
                  value={malePlayerText}
                  onChange={(event) => {
                    markFormDirty();
                    setMalePlayerText(event.target.value);
                  }}
                />
              </label>
            </div>
          ) : isFixedPartner ? (
            <div className="grid gap-3">
              {fixedPartnerPairs.map((pair, pairIndex) => (
                <article key={`pair-${pairIndex + 1}`} className="rounded-md border border-[var(--line)] bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-black">Par {pairIndex + 1}</h3>
                    {fixedPartnerPairs.length > 2 ? (
                      <button className="font-bold text-red-700" type="button" onClick={() => removeFixedPartnerPair(pairIndex)}>Fjern par</button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {pair.map((playerName, playerIndex) => (
                      <label key={playerIndex} className="grid gap-2 text-base font-bold">
                        Spiller {playerIndex + 1}
                        <input
                          aria-label={`Par ${pairIndex + 1}, spiller ${playerIndex + 1}`}
                          className="field-control"
                          placeholder="Spillernavn"
                          value={playerName}
                          onChange={(event) => updateFixedPartnerPlayer(pairIndex, playerIndex, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </article>
              ))}
              <button className="min-h-12 rounded-md border border-[var(--line)] bg-white px-4 font-black" type="button" onClick={addFixedPartnerPair}>Tilføj par</button>
            </div>
          ) : (
            <textarea
              className="field-control min-h-64 resize-y text-xl leading-8"
              placeholder={t("oneNamePerLine")}
              value={playerText}
              onChange={(event) => {
                markFormDirty();
                setPlayerText(event.target.value);
              }}
              aria-label={`${participantTextareaLabel(format, poolParticipantType, t)}, ${t("oneNamePerLine")}`}
            />
          )}
        </Section>
      )}

      <Section title={`4. ${t("review")}`}>
        <div className="app-card grid gap-1 p-4 text-lg leading-8 sm:p-5">
          <p><strong>{t("name")}:</strong> {name || "-"}</p>
          <p><strong>{t("format")}:</strong> {getFormatDisplayName(format, t)}</p>
          <p><strong>{t("scoring")}:</strong> {t(scoringChoices.find((choice) => choice.value === scoringChoice)?.labelKey ?? "playToScorePoints")}</p>
          {scoringMode === "Fast antal point" ? <p><strong>{t("fixedScore")}:</strong> {fixedScoreRule === "target" ? `${t("playToScorePoints")} ${fixedScorePoints}` : `${fixedScorePoints} ${t("totalScorePoints").toLowerCase()}`}</p> : null}
          {scoringMode === "Spil på tid" ? <p><strong>Spilletid:</strong> {timeLimitMinutes} minutter</p> : null}
          <p><strong>{isTeamVsTeam ? "Hold" : participantSummaryLabel(format, poolParticipantType, t)}:</strong> {isTeamVsTeam ? teamCount : playerCount}</p>
          {isTeamVsTeam ? <p><strong>Afvikling:</strong> {competitionMode === "pool" ? "Puljespil · alle mødes én gang" : `Knockout · ${drawMode === "manual" ? "manuel" : "tilfældig"} fordeling`}</p> : null}
          {isPoolPlay ? <p><strong>Puljer:</strong> {poolCount} · {participantsPerPool} pr. pulje</p> : null}
          {isPoolPlay ? <p><strong>Progression:</strong> {poolAdvancementMode === "crossMatches" ? "Krydskampe" : "Placeringspuljer"} · {poolUnmatchedResolution === "bye" ? "oversidning" : "walkover"}</p> : null}
          {isPoolPlay && poolParticipantType === "team" ? <p><strong>Spillere pr. hold:</strong> {poolTeamPlayersPerTeam}</p> : null}
          {isTeamVsTeam ? <p><strong>Spillere pr. hold:</strong> {playersPerTeam}</p> : null}
          {isTeamVsTeam ? <p><strong>Holdkaptajner:</strong> {teamDrafts.slice(0, teamCount).map((team) => `${team.name || "Hold"}: ${getTeamVsTeamCaptainName(team)}`).join(" · ")}</p> : null}
          {!isTeamVsTeam && !isPoolPlay ? <p><strong>{t("courts")}:</strong> {courts || "-"}</p> : null}
          {!isTeamVsTeam && !isPoolPlay ? <p><strong>{t("rounds")}:</strong> {rounds || "-"}</p> : isTeamVsTeam ? <p><strong>Holdkamp:</strong> {teamRounds} runder · 2 kampe pr. runde · {teamMatchFormat === "oneSet" ? "1 sæt" : "bedst af 3 sæt"}</p> : null}
          {!isTeamVsTeam ? <p><strong>Ranking:</strong> {t(rankingModeOptions.find((option) => option.value === rankingMode)?.labelKey ?? "mostMatchPoints")}</p> : null}
        </div>
      </Section>

      <Section title={`5. ${t("startTournament")}`}>
        {error ? <p className="mb-3 rounded-md bg-red-50 p-3 font-bold text-red-700">{error}</p> : null}
        <PrimaryButton type="submit">{t("startTournament")}</PrimaryButton>
      </Section>
    </form>
  );
}

function assertInitialCloudShadowSave(metadata: ShadowSaveMetadata | null): void {
  if (!isShadowSaveEnabled()) {
    return;
  }

  if (metadata?.status === "synced" && metadata.supabaseTournamentId) {
    return;
  }

  throw new Error("Turneringen blev gemt lokalt, men kunne ikke synkroniseres til skyen. Prøv igen.");
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
      <div className="grid gap-3">
        {Array.from({ length: playersPerTeam / 2 }, (_, pairIndex) => team.players.slice(pairIndex * 2, pairIndex * 2 + 2)).map((pair, pairIndex) => (
          <fieldset key={`team-${teamNumber}-pair-${pairIndex + 1}`} className="grid gap-3 border-t border-[var(--line)] pt-3">
            <legend className="pr-3 text-lg font-black">Par {pairIndex + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {pair.map((player, playerIndex) => {
                const absolutePlayerIndex = pairIndex * 2 + playerIndex;
                return (
                  <label key={player.id} className="grid gap-2 text-base font-bold">
                    Spiller {playerIndex + 1}
                    <input
                      aria-label={`Hold ${teamNumber}, par ${pairIndex + 1}, spiller ${playerIndex + 1}`}
                      className="field-control"
                      value={player.name}
                      onChange={(event) => updatePlayerName(absolutePlayerIndex, event.target.value)}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
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

function createDefaultTeams(count: 8, playersPerTeam: 8): TeamVsTeamTeam[] {
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

function getScoringChoice(scoringMode: ScoringMode, fixedScoreRule: FixedScoreRule): ScoringChoice {
  if (scoringMode === "Spil på tid") {
    return "timed";
  }

  return fixedScoreRule === "total" ? "total" : "target";
}

function getInitialScoringMode(scoringMode: ScoringMode): ScoringMode {
  return scoringMode === "Fri scoring" ? "Fast antal point" : scoringMode;
}

function normalizeIntegerInputValue(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  const numericValue = Number(trimmedValue);
  return Number.isInteger(numericValue) && numericValue >= 0 ? String(numericValue) : value;
}

function parsePositiveIntegerInput(value: string, label: string): number {
  const normalizedValue = normalizeIntegerInputValue(value);
  const numericValue = Number(normalizedValue);

  if (!normalizedValue || !Number.isInteger(numericValue) || numericValue < 1) {
    throw new Error(`${label} skal være mindst 1.`);
  }

  return numericValue;
}

function isAutomaticTournamentName(name: string): boolean {
  const trimmedName = name.trim();
  return trimmedName === "" || automaticTournamentNames.has(trimmedName);
}

function getFormatDisplayName(format: TournamentSetupFormat, t: (key: TranslationKey) => string): string {
  switch (format) {
    case "Fast Makker Americano":
      return t("fixedPartnerAmericano");
    case "Fast Makker Mexicano":
      return t("fixedPartnerMexicano");
    default:
      return format;
  }
}

function countLines(text: string): number {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

function getFixedPartnerPlayerNames(text: string): string[] {
  const names = text.split(/\r?\n/);

  while (names.length < 4) {
    names.push("");
  }

  if (names.length % 2 !== 0) {
    names.push("");
  }

  return names;
}

function getFixedPartnerPairs(text: string): Array<[string, string]> {
  const names = getFixedPartnerPlayerNames(text);
  return Array.from({ length: names.length / 2 }, (_, index) => [names[index * 2], names[index * 2 + 1]] as [string, string]);
}

function poolParticipantCountLabel(participantType: PoolParticipantType): string {
  switch (participantType) {
    case "player":
      return "Spillere pr. pulje";
    case "pair":
      return "Par pr. pulje";
    case "team":
      return "Hold pr. pulje";
  }
}

function poolParticipantTotalLabel(participantType: PoolParticipantType): string {
  switch (participantType) {
    case "player":
      return "spillere";
    case "pair":
      return "par";
    case "team":
      return "hold";
  }
}

function participantSectionTitle(format: TournamentSetupFormat, poolParticipantType: PoolParticipantType, t: (key: TranslationKey) => string): string {
  if (format !== "Puljespil") {
    return t("players");
  }

  switch (poolParticipantType) {
    case "player":
      return t("players");
    case "pair":
      return "Par";
    case "team":
      return "Hold";
  }
}

function participantTextareaLabel(format: TournamentSetupFormat, poolParticipantType: PoolParticipantType, t: (key: TranslationKey) => string): string {
  if (format !== "Puljespil") {
    return t("players");
  }

  return participantSectionTitle(format, poolParticipantType, t);
}

function participantSummaryLabel(format: TournamentSetupFormat, poolParticipantType: PoolParticipantType, t: (key: TranslationKey) => string): string {
  return participantTextareaLabel(format, poolParticipantType, t);
}

function getFormatButtonClass(isSelected: boolean): string {
  return `tournament-format-button ${isSelected ? "tournament-format-button-selected" : "tournament-format-button-unselected"}`;
}
