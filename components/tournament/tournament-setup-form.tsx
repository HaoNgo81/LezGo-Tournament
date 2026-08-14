"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Section } from "@/components/ui/section";
import { useAppTranslation } from "@/lib/preferences/client";
import type { TranslationKey } from "@/lib/i18n/translations";
import { tournamentTypes } from "@/lib/mock/tournament-data";
import {
  createPoolTournamentFromSetup,
  createTeamVsTeamTournamentFromSetup,
  createTournamentFromSetup,
  saveActiveTeamVsTeamTournament,
  saveActiveTournament,
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
import { loadTournamentSettings } from "@/lib/tournament-settings";
import { findTournamentTemplate } from "@/lib/tournament-templates";

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
const deviceDebugBuildMarker = "STEP20BC-DEVICE-TEST-01";
const deviceDebugBuildTimestamp = "2026-08-14T18:32:28.7924686+02:00";
const deviceDebugBundleVersion = "new-tournament-device-debug-v1";
const activeCodeMarker = "STEP20BC ACTIVE CODE TEST";

type DeviceDebugEvent = {
  type:
    | "INIT"
    | "CLIENT_HYDRATED"
    | "FORMAT_POINTER_DOWN"
    | "FORMAT_POINTER_UP"
    | "FORMAT_TOUCH_START"
    | "FORMAT_TOUCH_END"
    | "FORMAT_CLICK"
    | "SCORING_CHANGE"
    | "NAME_CHANGE"
    | "PLAYER_TEXT_CHANGE";
  value: string;
  timestamp: string;
};

type DeviceDebugButtonAudit = {
  ariaPressed: string;
  dataSelected: string;
  display: string;
  opacity: string;
  pointerEvents: string;
  position: string;
  text: string;
  type: string;
  visibility: string;
  zIndex: string;
};

type DeviceDebugAudit = {
  cacheNames: string[];
  cacheStorageAvailable: boolean;
  currentUrl: string;
  formatButtons: DeviceDebugButtonAudit[];
  localStorageKeys: string[];
  serviceWorkerControlled: boolean;
  serviceWorkerRegistrationCount: number | null;
  serviceWorkerSupported: boolean;
};

export function TournamentSetupForm({ initialDeviceDebugEnabled = false }: { initialDeviceDebugEnabled?: boolean } = {}) {
  const { t } = useAppTranslation();
  const router = useRouter();
  const initialSettings = useMemo(() => loadTournamentSettings(), []);
  const initialScoringMode = initialSettings.scoringMode === "Fri scoring" ? "Fast antal point" : initialSettings.scoringMode;
  const appliedTemplateId = useRef<string | null>(null);
  const nameRef = useRef("Americano");
  const [mountId] = useState(() => createDeviceDebugMountId());
  const [name, setName] = useState("Americano");
  const [format, setFormat] = useState<TournamentSetupFormat>("Americano");
  const [scoringMode, setScoringMode] = useState<ScoringMode>(initialScoringMode);
  const [fixedScoreRule, setFixedScoreRule] = useState<FixedScoreRule>("target");
  const [fixedScorePoints, setFixedScorePoints] = useState(21);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(initialSettings.timeLimitMinutes);
  const [playerText, setPlayerText] = useState("");
  const [femalePlayerText, setFemalePlayerText] = useState("");
  const [malePlayerText, setMalePlayerText] = useState("");
  const [courts, setCourts] = useState(initialSettings.courts);
  const [rounds, setRounds] = useState(initialSettings.rounds);
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
  const [deviceDebugEnabled, setDeviceDebugEnabled] = useState(initialDeviceDebugEnabled);
  const [deviceDebugParam, setDeviceDebugParam] = useState<"YES" | "NO">(initialDeviceDebugEnabled ? "YES" : "NO");
  const [clientHydrated, setClientHydrated] = useState(false);
  const [lastDebugEvent, setLastDebugEvent] = useState<DeviceDebugEvent>({
    type: "INIT",
    value: "mounted",
    timestamp: new Date().toISOString(),
  });
  const [renderCount, setRenderCount] = useState(1);
  const [deviceDebugAudit, setDeviceDebugAudit] = useState<DeviceDebugAudit>({
    cacheNames: [],
    cacheStorageAvailable: false,
    currentUrl: "",
    formatButtons: [],
    localStorageKeys: [],
    serviceWorkerControlled: false,
    serviceWorkerRegistrationCount: null,
    serviceWorkerSupported: false,
  });
  const isTeamVsTeam = format === "Team vs. Team";
  const isPoolPlay = format === "Puljespil";
  const isFixedPartner = format === "Fast Makker Americano" || format === "Fast Makker Mexicano";
  const fixedPartnerPairs = getFixedPartnerPairs(playerText);
  const teamRounds = playersPerTeam === 4 ? 3 : 2;
  const scoringChoice = getScoringChoice(scoringMode, fixedScoreRule);
  const scorePointFieldShouldRender = scoringMode === "Fast antal point";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const hasDebugParam = hasDeviceDebugParam();
      setClientHydrated(true);
      setDeviceDebugParam(hasDebugParam ? "YES" : "NO");
      setDeviceDebugEnabled(isDeviceDebugEnabled());
      if (hasDebugParam) {
        setLastDebugEvent(createDeviceDebugEvent("CLIENT_HYDRATED", window.location.href));
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const template = getInitialTemplate();

    if (!template || appliedTemplateId.current === template.id) {
      return;
    }

    appliedTemplateId.current = template.id;
    nameRef.current = template.title;
    setName(template.title);
    setFormat(template.format);
    setScoringMode(template.scoringMode);
    setFixedScoreRule(template.fixedScoreRule ?? "target");
    setFixedScorePoints(template.fixedScorePoints ?? 21);
    setTimeLimitMinutes(template.timeLimitMinutes ?? initialSettings.timeLimitMinutes);
    setCourts(template.courts);
    setRounds(template.rounds);
    setRankingMode(template.rankingMode);
    setError("");
  }, [initialSettings.timeLimitMinutes]);

  useEffect(() => {
    if (!deviceDebugEnabled) {
      return;
    }

    let isMounted = true;

    async function collectAudit() {
      const formatButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-device-debug-format-button]")).map((button) => {
        const style = window.getComputedStyle(button);

        return {
          ariaPressed: button.getAttribute("aria-pressed") ?? "",
          dataSelected: button.getAttribute("data-selected") ?? "",
          display: style.display,
          opacity: style.opacity,
          pointerEvents: style.pointerEvents,
          position: style.position,
          text: button.textContent?.trim() ?? "",
          type: button.getAttribute("type") ?? "",
          visibility: style.visibility,
          zIndex: style.zIndex,
        };
      });
      const serviceWorkerSupported = "serviceWorker" in navigator;
      const registrations = serviceWorkerSupported && navigator.serviceWorker.getRegistrations
        ? await navigator.serviceWorker.getRegistrations().catch(() => null)
        : null;
      const cacheNames = "caches" in window ? await window.caches.keys().catch(() => []) : [];

      if (!isMounted) {
        return;
      }

      setDeviceDebugAudit({
        cacheNames,
        cacheStorageAvailable: "caches" in window,
        currentUrl: window.location.href,
        formatButtons,
        localStorageKeys: Object.keys(window.localStorage).sort(),
        serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
        serviceWorkerRegistrationCount: registrations ? registrations.length : null,
        serviceWorkerSupported,
      });
    }

    void collectAudit();

    return () => {
      isMounted = false;
    };
  }, [deviceDebugEnabled, format, lastDebugEvent, scoringMode]);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      if (isTeamVsTeam) {
        const tournament = createTeamVsTeamTournamentFromSetup({
          name,
          scoringMode,
          fixedScoreRule,
          fixedScorePoints,
          teamCount,
          competitionMode,
          drawMode,
          playersPerTeam,
          matchFormat: teamMatchFormat,
          teams: teamDrafts.slice(0, teamCount).map((team) => ({ ...team, players: team.players.slice(0, playersPerTeam) })),
        });

        saveActiveTeamVsTeamTournament(tournament);
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
          fixedScorePoints,
          timeLimitMinutes,
          rankingMode,
          teamPlayersPerTeam: poolParticipantType === "team" ? poolTeamPlayersPerTeam : undefined,
        });

        saveActiveTournament(tournament);
        router.push("/live");
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
        fixedScoreRule,
        fixedScorePoints,
        timeLimitMinutes,
        firstRoundOrder: "manual",
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

  function handleFormatChange(nextFormat: TournamentSetupFormat) {
    setFormat(nextFormat);
    setName((currentName) => {
      const latestName = nameRef.current;
      const nextName = isAutomaticTournamentName(latestName) ? nextFormat : latestName;
      nameRef.current = nextName;
      return currentName === nextName ? currentName : nextName;
    });
    setError("");
  }

  function recordFormatInputEvent(type: DeviceDebugEvent["type"], nextFormat: TournamentSetupFormat, event: { currentTarget: EventTarget & HTMLElement; target: EventTarget | null }) {
    const target = event.target instanceof HTMLElement ? event.target.tagName.toLowerCase() : "unknown";
    const currentTarget = event.currentTarget.tagName.toLowerCase();
    recordDeviceDebugEvent(type, `${nextFormat} target=${target} currentTarget=${currentTarget}`);
  }

  function selectFormatFromInput(type: DeviceDebugEvent["type"], nextFormat: TournamentSetupFormat, event: { currentTarget: EventTarget & HTMLElement; target: EventTarget | null }) {
    recordFormatInputEvent(type, nextFormat, event);
    handleFormatChange(nextFormat);
  }

  function handleNameChange(nextName: string) {
    recordDeviceDebugEvent("NAME_CHANGE", nextName);
    nameRef.current = nextName;
    setName(nextName);
  }

  function handleScoringChoiceChange(nextChoice: ScoringChoice) {
    recordDeviceDebugEvent("SCORING_CHANGE", nextChoice);

    if (nextChoice === "timed") {
      setScoringMode("Spil på tid");
      return;
    }

    setScoringMode("Fast antal point");
    setFixedScoreRule(nextChoice);
  }

  function updateFixedPartnerPlayer(pairIndex: number, playerIndex: number, playerName: string) {
    const names = getFixedPartnerPlayerNames(playerText);
    names[pairIndex * 2 + playerIndex] = playerName;
    setPlayerText(names.join("\n"));
  }

  function addFixedPartnerPair() {
    setPlayerText([...getFixedPartnerPlayerNames(playerText), "", ""].join("\n"));
  }

  function removeFixedPartnerPair(pairIndex: number) {
    const names = getFixedPartnerPlayerNames(playerText);
    names.splice(pairIndex * 2, 2);
    setPlayerText(names.join("\n"));
  }

  function recordDeviceDebugEvent(type: DeviceDebugEvent["type"], value: string) {
    setLastDebugEvent(createDeviceDebugEvent(type, value));
    setRenderCount((currentCount) => currentCount + 1);
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      {process.env.NODE_ENV !== "production" ? (
        <section className="rounded-md border-4 border-blue-700 bg-blue-50 p-4 font-mono text-sm font-black text-blue-950" data-testid="active-code-marker">
          <p>{activeCodeMarker}</p>
          <p>DEVICE DEBUG PARAM: {deviceDebugParam}</p>
          <p>ACTIVE BUILD: {deviceDebugBuildMarker}</p>
        </section>
      ) : null}
      <Section title={`1. ${t("tournamentFormat")}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {formatOptions.map((option) => (
            <button
              key={option}
              aria-pressed={format === option}
              className={getFormatButtonClass(format === option)}
              data-selected={format === option ? "true" : "false"}
              data-device-debug-format-button="true"
              type="button"
              onPointerDown={(event) => recordFormatInputEvent("FORMAT_POINTER_DOWN", option, event)}
              onPointerUp={(event) => selectFormatFromInput("FORMAT_POINTER_UP", option, event)}
              onTouchStart={(event) => recordFormatInputEvent("FORMAT_TOUCH_START", option, event)}
              onTouchEnd={(event) => selectFormatFromInput("FORMAT_TOUCH_END", option, event)}
              onClick={(event) => {
                recordFormatInputEvent("FORMAT_CLICK", option, event);
                handleFormatChange(option);
              }}
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
              <input className="field-control" min="1" type="number" value={fixedScorePoints} onChange={(event) => setFixedScorePoints(Number(event.target.value))} />
            </label>
          ) : null}
          {scoringMode === "Spil på tid" ? (
            <label className="grid gap-2 text-lg font-bold">
              {t("timeLimitMinutes")}
              <input className="field-control" min="1" type="number" value={timeLimitMinutes} onChange={(event) => setTimeLimitMinutes(Number(event.target.value))} />
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
                    onChange={(event) => setCompetitionMode(event.target.value as TeamVsTeamCompetitionMode)}
                  >
                    <option value="knockout">Knockout</option>
                    <option value="pool">Puljespil</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Antal hold
                  <select className="field-control" value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value) as TeamVsTeamTeamCount)}>
                    {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} hold</option>)}
                  </select>
                </label>
                {competitionMode === "knockout" ? (
                  <label className="grid gap-2 text-lg font-bold">
                    Fordeling
                    <select className="field-control" value={drawMode} onChange={(event) => setDrawMode(event.target.value as TeamVsTeamDrawMode)}>
                      <option value="manual">Manuel</option>
                      <option value="random">Tilfældig</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
              <p className="font-bold text-[var(--muted)]">
                {competitionMode === "pool" ? `Alle ${teamCount} hold møder hinanden én gang. ` : ""}
                {playersPerTeam === 4 ? "4 spillere pr. hold spiller 3 runder." : "6 eller 8 spillere pr. hold spiller 2 runder."}
              </p>
            </>
          ) : isPoolPlay ? (
            <>
              <label className="grid gap-2 text-lg font-bold">
                {t("rankingSort")}
                <select className="field-control" value={rankingMode} onChange={(event) => setRankingMode(event.target.value as StandingsRankingMode)}>
                  {rankingModeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-lg font-bold">
                  Deltagertype
                  <select className="field-control" value={poolParticipantType} onChange={(event) => setPoolParticipantType(event.target.value as PoolParticipantType)}>
                    <option value="player">Spillere</option>
                    <option value="pair">Par</option>
                    <option value="team">Hold</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Antal puljer
                  <input className="field-control" min="1" max="8" type="number" value={poolCount} onChange={(event) => setPoolCount(Number(event.target.value))} />
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  {poolParticipantCountLabel(poolParticipantType)}
                  <input className="field-control" min={poolParticipantType === "player" ? 4 : 2} type="number" value={participantsPerPool} onChange={(event) => setParticipantsPerPool(Number(event.target.value))} />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-lg font-bold">
                  Progression
                  <select className="field-control" value={poolAdvancementMode} onChange={(event) => setPoolAdvancementMode(event.target.value as PoolAdvancementMode)}>
                    <option value="crossMatches">Krydskampe</option>
                    <option value="placementPools">Placeringspuljer</option>
                  </select>
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  Ulig sidste pulje
                  <select className="field-control" value={poolUnmatchedResolution} onChange={(event) => setPoolUnmatchedResolution(event.target.value as PoolUnmatchedResolution)}>
                    <option value="bye">Oversidning</option>
                    <option value="walkover">Walkover</option>
                  </select>
                </label>
                {poolParticipantType === "team" ? (
                  <label className="grid gap-2 text-lg font-bold">
                    Spillere pr. hold
                    <select className="field-control" value={poolTeamPlayersPerTeam} onChange={(event) => setPoolTeamPlayersPerTeam(Number(event.target.value) as PoolTeamPlayers)}>
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
                <select className="field-control" value={rankingMode} onChange={(event) => setRankingMode(event.target.value as StandingsRankingMode)}>
                  {rankingModeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-lg font-bold">
                  {t("courts")}
                  <input className="field-control" min="1" type="number" value={courts} onChange={(event) => setCourts(Number(event.target.value))} />
                </label>
                <label className="grid gap-2 text-lg font-bold">
                  {t("rounds")}
                  <input className="field-control" min="1" type="number" value={rounds} onChange={(event) => setRounds(Number(event.target.value))} />
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
                <textarea className="field-control min-h-64 resize-y text-xl leading-8" placeholder={t("oneNamePerLine")} value={femalePlayerText} onChange={(event) => setFemalePlayerText(event.target.value)} />
              </label>
              <label className="grid gap-2 text-lg font-bold">
                Mænd
                <textarea className="field-control min-h-64 resize-y text-xl leading-8" placeholder={t("oneNamePerLine")} value={malePlayerText} onChange={(event) => setMalePlayerText(event.target.value)} />
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
                recordDeviceDebugEvent("PLAYER_TEXT_CHANGE", `${event.target.value.length} chars`);
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
          {!isTeamVsTeam && !isPoolPlay ? <p><strong>{t("courts")}:</strong> {courts}</p> : null}
          {!isTeamVsTeam && !isPoolPlay ? <p><strong>{t("rounds")}:</strong> {rounds}</p> : isTeamVsTeam ? <p><strong>Holdkamp:</strong> {teamRounds} runder · 2 kampe pr. runde · {teamMatchFormat === "oneSet" ? "1 sæt" : "bedst af 3 sæt"}</p> : null}
          {!isTeamVsTeam ? <p><strong>Ranking:</strong> {t(rankingModeOptions.find((option) => option.value === rankingMode)?.labelKey ?? "mostMatchPoints")}</p> : null}
        </div>
      </Section>

      <Section title={`5. ${t("startTournament")}`}>
        {error ? <p className="mb-3 rounded-md bg-red-50 p-3 font-bold text-red-700">{error}</p> : null}
        <PrimaryButton type="submit">{t("startTournament")}</PrimaryButton>
      </Section>
      {deviceDebugEnabled ? (
        <DeviceDebugPanel
          audit={deviceDebugAudit}
          clientHydrated={clientHydrated}
          fixedScoreRule={fixedScoreRule}
          format={format}
          lastEvent={lastDebugEvent}
          mountId={mountId}
          name={name}
          playerCount={playerCount}
          renderCount={renderCount}
          scorePointFieldShouldRender={scorePointFieldShouldRender}
          scoringChoice={scoringChoice}
          scoringMode={scoringMode}
        />
      ) : null}
    </form>
  );
}

function DeviceDebugPanel({
  audit,
  clientHydrated,
  fixedScoreRule,
  format,
  lastEvent,
  mountId,
  name,
  playerCount,
  renderCount,
  scorePointFieldShouldRender,
  scoringChoice,
  scoringMode,
}: {
  audit: DeviceDebugAudit;
  clientHydrated: boolean;
  fixedScoreRule: FixedScoreRule;
  format: TournamentSetupFormat;
  lastEvent: DeviceDebugEvent;
  mountId: string;
  name: string;
  playerCount: number;
  renderCount: number;
  scorePointFieldShouldRender: boolean;
  scoringChoice: ScoringChoice;
  scoringMode: ScoringMode;
}) {
  return (
    <section className="rounded-md border-4 border-red-600 bg-yellow-50 p-4 font-mono text-sm text-black" data-testid="device-debug-panel">
      <h2 className="text-lg font-black">DEV BUILD DEBUG</h2>
      <dl className="mt-3 grid gap-2">
        <DebugRow label="DEV BUILD" value={deviceDebugBuildMarker} />
        <DebugRow label="BUILD TIMESTAMP" value={deviceDebugBuildTimestamp} />
        <DebugRow label="FRONTEND BUNDLE VERSION" value={deviceDebugBundleVersion} />
        <DebugRow label="RUNTIME" value={process.env.NODE_ENV} />
        <DebugRow label="clientHydrated" value={clientHydrated ? "YES" : "NO"} />
        <DebugRow label="selectedFormat" value={format} />
        <DebugRow label="scoringMode" value={scoringMode} />
        <DebugRow label="scoringChoice" value={scoringChoice} />
        <DebugRow label="fixedScoreRule" value={fixedScoreRule} />
        <DebugRow label="tournamentName" value={name || "-"} />
        <DebugRow label="playerCount" value={String(playerCount)} />
        <DebugRow label="renderCount" value={String(renderCount)} />
        <DebugRow label="mountId" value={mountId} />
        <DebugRow label="pathname" value={audit.currentUrl || "-"} />
        <DebugRow label="timestamp" value={new Date().toISOString()} />
        <DebugRow label="scorePointFieldShouldRender" value={scorePointFieldShouldRender ? "YES" : "NO"} />
        <DebugRow label="LAST EVENT" value={lastEvent.type} />
        <DebugRow label="VALUE" value={lastEvent.value} />
        <DebugRow label="EVENT TIMESTAMP" value={lastEvent.timestamp} />
        <DebugRow label="serviceWorkerSupported" value={audit.serviceWorkerSupported ? "YES" : "NO"} />
        <DebugRow label="serviceWorkerControlled" value={audit.serviceWorkerControlled ? "YES" : "NO"} />
        <DebugRow label="serviceWorkerRegistrations" value={audit.serviceWorkerRegistrationCount === null ? "unknown" : String(audit.serviceWorkerRegistrationCount)} />
        <DebugRow label="cacheStorageAvailable" value={audit.cacheStorageAvailable ? "YES" : "NO"} />
        <DebugRow label="cacheNames" value={audit.cacheNames.length ? audit.cacheNames.join(", ") : "none"} />
        <DebugRow label="localStorageKeys" value={audit.localStorageKeys.length ? audit.localStorageKeys.join(", ") : "none"} />
      </dl>
      <div className="mt-4">
        <h3 className="font-black">FORMAT BUTTON DOM AUDIT</h3>
        <div className="mt-2 grid gap-2">
          {audit.formatButtons.map((button) => (
            <pre key={button.text} className="overflow-x-auto whitespace-pre-wrap rounded-md border border-red-400 bg-white p-2">
              {JSON.stringify(button, null, 2)}
            </pre>
          ))}
        </div>
      </div>
      <p className="mt-4 font-black">
        Scoring render condition: scoringMode === &quot;Fast antal point&quot;
      </p>
    </section>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-yellow-700/30 pb-1 sm:grid-cols-[14rem_1fr]">
      <dt className="font-black">{label}:</dt>
      <dd className="break-words">{value}</dd>
    </div>
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

function getInitialTemplate() {
  if (typeof window === "undefined") {
    return null;
  }

  const templateId = new URLSearchParams(window.location.search).get("template");
  return templateId ? findTournamentTemplate(templateId) : null;
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

function createDeviceDebugEvent(type: DeviceDebugEvent["type"], value: string): DeviceDebugEvent {
  return {
    type,
    value,
    timestamp: new Date().toISOString(),
  };
}

function createDeviceDebugMountId(): string {
  return `mount-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isDeviceDebugEnabled(): boolean {
  return process.env.NODE_ENV !== "production" &&
    hasDeviceDebugParam();
}

function hasDeviceDebugParam(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("deviceDebug") === "1";
}

function getScoringChoice(scoringMode: ScoringMode, fixedScoreRule: FixedScoreRule): ScoringChoice {
  if (scoringMode === "Spil på tid") {
    return "timed";
  }

  return fixedScoreRule === "total" ? "total" : "target";
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
