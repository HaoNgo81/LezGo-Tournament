"use client";

import { useMemo, useState } from "react";
import {
  calculateLiveStandings,
  createPoolPlaySummary,
  getPlayerName,
  type LiveTournamentState,
  type PoolPlaySummary,
} from "@/lib/live-scoring";
import { StandingsTable } from "@/components/tournament/standings-table";
import { UnifiedCourtCard } from "@/components/tournament/unified-court-card";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { MatchResult, TournamentMatch, TournamentRound } from "@/lib/tournament-engine";

const rankingModeLabels = {
  matchPointsFirst: "mostMatchPoints",
  partiPointsFirst: "mostScorePoints",
} as const;

export function CompletedTournamentResults({ state, t }: { state: LiveTournamentState; t: (key: TranslationKey) => string }) {
  const standings = useMemo(() => calculateLiveStandings(state), [state]);
  const poolSummary = useMemo(() => (state.poolPlay ? createPoolPlaySummary(state.poolPlay, state.rankingMode) : null), [state.poolPlay, state.rankingMode]);
  const historyRounds = useMemo(() => getHistoryRounds(state), [state]);
  const [requestedHistoryRoundNumber, setRequestedHistoryRoundNumber] = useState(1);
  const selectedHistoryRoundNumber = historyRounds.some((round) => round.roundNumber === requestedHistoryRoundNumber)
    ? requestedHistoryRoundNumber
    : historyRounds[0]?.roundNumber ?? 1;

  if (poolSummary) {
    return <PoolPlayFinishSummary summary={poolSummary} />;
  }

  return (
    <>
      <section className="grid gap-3">
        <h2 className="text-xl font-black uppercase">{t("finalStandings")}</h2>
        <StandingsTable standings={standings} />
      </section>
      {state.status === "finished" ? (
        <RoundHistory
          historyRounds={historyRounds}
          selectedRoundNumber={selectedHistoryRoundNumber}
          state={state}
          t={t}
          onSelectRound={setRequestedHistoryRoundNumber}
        />
      ) : null}
    </>
  );
}

export function getRankingModeLabelKey(state: LiveTournamentState): TranslationKey {
  return rankingModeLabels[state.rankingMode];
}

export function formatFinishedTournamentSummary(state: LiveTournamentState, t: (key: TranslationKey) => string): string {
  const summaryParts = [
    formatTournamentType(state.format, t),
    formatParticipantCount(state, t),
    `${state.configuredRounds ?? state.rounds.length} ${t("rounds").toLowerCase()}`,
  ];

  if (state.finishedAt) {
    summaryParts.push(formatDate(state.finishedAt));
  }

  return summaryParts.join(" · ");
}

function RoundHistory({
  historyRounds,
  onSelectRound,
  selectedRoundNumber,
  state,
  t,
}: {
  historyRounds: TournamentRound[];
  onSelectRound: (roundNumber: number) => void;
  selectedRoundNumber: number;
  state: LiveTournamentState;
  t: (key: TranslationKey) => string;
}) {
  const resultByMatchId = new Map(state.results.map((result) => [result.matchId, result]));

  if (!historyRounds.length) {
    return (
      <section className="grid gap-3" data-testid="finished-round-history">
        <h2 className="text-xl font-black uppercase">{t("matchResults")}</h2>
        <p className="app-card p-4 font-bold text-[var(--muted)]">{t("matchHistoryUnavailable")}</p>
      </section>
    );
  }

  const selectedRound = historyRounds.find((round) => round.roundNumber === selectedRoundNumber) ?? historyRounds[0];

  return (
    <section className="grid gap-3" data-testid="finished-round-history">
      <div>
        <h2 className="text-xl font-black uppercase">{t("matchResults")}</h2>
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2" aria-label={t("round")}>
          {historyRounds.map((round) => (
            <button
              key={round.roundNumber}
              aria-pressed={selectedRound.roundNumber === round.roundNumber}
              className={selectedRound.roundNumber === round.roundNumber ? "btn-primary min-h-11 shrink-0 px-4 text-sm" : "btn-secondary min-h-11 shrink-0 px-4 text-sm"}
              type="button"
              onClick={() => onSelectRound(round.roundNumber)}
            >
              {t("round")} {round.roundNumber}
            </button>
          ))}
        </div>
      </div>

      <section className="grid gap-3" aria-label={`${t("round")} ${selectedRound.roundNumber}`}>
        <h3 className="text-lg font-black">{t("round")} {selectedRound.roundNumber}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {selectedRound.matches.map((match) => (
            <HistoryMatchCard
              key={match.id}
              match={match}
              result={resultByMatchId.get(match.id)}
              state={state}
              t={t}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

function HistoryMatchCard({ match, result, state, t }: { match: TournamentMatch; result?: MatchResult; state: LiveTournamentState; t: (key: TranslationKey) => string }) {
  return (
    <UnifiedCourtCard
      articleProps={{ "aria-label": `${t("court")} ${match.courtNumber} ${t("completed").toLocaleLowerCase("da")}` }}
      className="text-left"
      court={`${t("court")} ${match.courtNumber}`}
      density="standard"
      leftPlayers={formatHistoryTeamPlayers(match.teamA.playerIds, state)}
      leftScore={result?.teamAPoints}
      rightPlayers={formatHistoryTeamPlayers(match.teamB.playerIds, state)}
      rightScore={result?.teamBPoints}
      status={formatHistoryStatus(result, t)}
      testId="finished-history-match-card"
      testIdPrefix="finished-history-court"
      tone="completed"
      unsavedLabel={result ? undefined : "-"}
    />
  );
}

function getHistoryRounds(state: LiveTournamentState): TournamentRound[] {
  if (!Array.isArray(state.rounds) || !Array.isArray(state.results)) {
    return [];
  }

  const resultByMatchId = new Set(state.results.filter(isHistoryResult).map((result) => result.matchId));

  return state.rounds
    .filter(isHistoryRound)
    .map((round) => ({
      ...round,
      matches: round.matches.filter((match) => resultByMatchId.has(match.id)),
    }))
    .filter((round) => round.matches.length > 0);
}

function isHistoryRound(value: unknown): value is TournamentRound {
  const round = value as { roundNumber?: unknown; matches?: unknown };
  return Boolean(round)
    && typeof round === "object"
    && typeof round.roundNumber === "number"
    && Array.isArray(round.matches)
    && round.matches.every(isHistoryMatch);
}

function isHistoryMatch(value: unknown): value is TournamentMatch {
  const match = value as { id?: unknown; courtNumber?: unknown; teamA?: { playerIds?: unknown }; teamB?: { playerIds?: unknown } };
  return Boolean(match)
    && typeof match === "object"
    && typeof match.id === "string"
    && typeof match.courtNumber === "number"
    && Array.isArray(match.teamA?.playerIds)
    && Array.isArray(match.teamB?.playerIds);
}

function isHistoryResult(value: unknown): value is MatchResult {
  const result = value as { matchId?: unknown; teamAPoints?: unknown; teamBPoints?: unknown };
  return Boolean(result)
    && typeof result === "object"
    && typeof result.matchId === "string"
    && typeof result.teamAPoints === "number"
    && typeof result.teamBPoints === "number";
}

function formatHistoryTeamPlayers(playerIds: readonly string[], state: LiveTournamentState): string[] {
  return playerIds.map((playerId) => getPlayerName(state.players, playerId));
}

function formatHistoryStatus(result: MatchResult | undefined, t: (key: TranslationKey) => string): string {
  if (!result?.tieBreakWinner) {
    return t("completed");
  }

  return `${t("completed")} · MTB ${result.tieBreakWinner === "teamA" ? "A" : "B"}`;
}

function formatTournamentType(format: LiveTournamentState["format"], t: (key: TranslationKey) => string): string {
  switch (format) {
    case "americano":
      return t("formatAmericano");
    case "mexicano":
      return t("formatMexicano");
    case "mixed-americano":
      return t("formatMixedAmericano");
    case "fixed-partner-americano":
      return t("fixedPartnerAmericano");
    case "fixed-partner-mexicano":
      return t("fixedPartnerMexicano");
    case "pool-play":
      return t("formatPoolPlay");
  }
}

function formatParticipantCount(state: LiveTournamentState, t: (key: TranslationKey) => string): string {
  if (state.format === "fixed-partner-americano" || state.format === "fixed-partner-mexicano") {
    return `${state.players.length / 2} ${t("teams").toLowerCase()}`;
  }

  return `${state.players.length} ${t("players").toLowerCase()}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function PoolPlayFinishSummary({ summary }: { summary: PoolPlaySummary }) {
  return (
    <div className="grid gap-5">
      {summary.finalPlacements.length > 0 ? (
        <section className="grid gap-3" aria-label="Slutplaceringer">
          <h2 className="text-xl font-black">Slutplaceringer</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.finalPlacements.map((placement) => (
              <article key={`${placement.groupName}-${placement.rank}`} className="app-card flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{placement.groupName}</p>
                  <h3 className="mt-1 text-lg font-black">{placement.participantName}</h3>
                </div>
                <span className="text-3xl font-black">{placement.rank}.</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="text-xl font-black">Puljestillinger</h2>
        <div className="grid gap-4">
          {summary.initialStandings.map((table) => (
            <section key={table.poolId} className="grid gap-3" aria-labelledby={`${table.poolId}-finish-heading`}>
              <h3 id={`${table.poolId}-finish-heading`} className="text-lg font-black">{table.poolName}</h3>
              <StandingsTable standings={table.rows} />
            </section>
          ))}
        </div>
      </section>

      {summary.nextPhaseMatches.length > 0 ? (
        <PoolMatchSummarySection title="Næste fase" label="Næste fase" matches={summary.nextPhaseMatches} />
      ) : null}

      {summary.finalMatches.length > 0 ? (
        <PoolMatchSummarySection title="Finaler" label="Finaler" matches={summary.finalMatches} />
      ) : null}

      {summary.placementTiebreakMatches.length > 0 ? (
        <PoolMatchSummarySection title="Tiebreak om placering" label="Tiebreak om placering" matches={summary.placementTiebreakMatches} />
      ) : null}

      {summary.automaticAdvances.length > 0 ? (
        <section className="grid gap-3" aria-label="Automatisk videre">
          <h2 className="text-xl font-black">Automatisk videre</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {summary.automaticAdvances.map((advance) => (
              <article key={advance.id} className="app-card p-4">
                <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{advance.resolution === "bye" ? "Oversidning" : "Walkover"}</p>
                <h3 className="mt-1 text-lg font-black">{advance.participantName}</h3>
                <p className="mt-2 text-sm font-bold text-[var(--muted)]">{advance.sourcePoolName}, nr. {advance.sourceRank}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PoolMatchSummarySection({
  label,
  matches,
  title,
}: {
  label: string;
  matches: PoolPlaySummary["nextPhaseMatches"];
  title: string;
}) {
  return (
    <section className="grid gap-3" aria-label={label}>
      <h2 className="text-xl font-black">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {matches.map((match) => (
          <article key={match.id} className="app-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{match.groupName}</p>
                <h3 className="mt-1 text-lg font-black">{match.label}</h3>
              </div>
              {match.matchesPerTeam ? <span className="rounded-md bg-[var(--primary-soft)] px-3 py-1 text-sm font-black text-[var(--primary-strong)]">{match.matchesPerTeam} delkampe</span> : null}
            </div>
            <p className="mt-3 font-bold">{match.teamAName}</p>
            <p className="text-sm font-bold uppercase text-[var(--muted)]">mod</p>
            <p className="font-bold">{match.teamBName}</p>
            <p className="mt-3 text-2xl font-black">{match.result ? formatPoolResultScore(match.result) : "Ikke spillet"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatPoolResultScore(result: NonNullable<PoolPlaySummary["nextPhaseMatches"][number]["result"]>): string {
  const baseScore = `${result.teamAPoints} - ${result.teamBPoints}`;

  return result.tieBreakWinner ? `${baseScore} (MTB: ${result.tieBreakWinner === "teamA" ? "hold A" : "hold B"})` : baseScore;
}
