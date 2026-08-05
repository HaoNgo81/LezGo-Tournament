"use client";

import { useState } from "react";
import {
  calculateTeamVsTeamMatchScore,
  getTeamVsTeamPairConstitutions,
  validateTeamVsTeamLineup,
  type TeamVsTeamMatchup,
  type TeamVsTeamRoundLineup,
  type TeamVsTeamRoundResult,
  type TeamVsTeamSetResult,
  type TeamVsTeamTeam,
  type TeamVsTeamTieBreak,
} from "@/lib/team-vs-team";
import {
  advanceTeamVsTeamFourTeamBracket,
  calculateTeamVsTeamPlacements,
  loadActiveTeamVsTeamTournament,
  saveActiveTeamVsTeamTournament,
  saveTeamVsTeamTieBreak,
  type TeamVsTeamMatchState,
  type TeamVsTeamTournamentState,
} from "@/lib/tournament-setup";

export function TeamVsTeamApp() {
  const [state, setState] = useState<TeamVsTeamTournamentState | null>(() => loadActiveTeamVsTeamTournament());

  if (!state) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">Ingen Team vs. Team-turnering er oprettet endnu.</p>;
  }

  const tournament = state;
  const activeMatch = tournament.matchups.find((match) => match.id === tournament.activeMatchupId) ?? tournament.matchups[0];

  if (!activeMatch) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">Ingen holdkamp er oprettet endnu.</p>;
  }

  const teamA = tournament.teams.find((team) => team.id === activeMatch.teamAId);
  const teamB = tournament.teams.find((team) => team.id === activeMatch.teamBId);

  if (!teamA || !teamB) {
    return <p className="app-card p-4 font-bold text-[var(--muted)]">Holdkampen mangler et gyldigt hold.</p>;
  }

  const placements = calculateTeamVsTeamPlacements(tournament);
  const canAdvanceBracket =
    tournament.teamCount === 4 &&
    tournament.matchups.length === 2 &&
    tournament.matchups.every((match) => {
      const pendingMatchup = getMatchupFromState(tournament, match);
      return pendingMatchup ? Boolean(calculateTeamVsTeamMatchScore(pendingMatchup, match.roundResults, match.tieBreak).winnerTeamId) : false;
    });

  function commit(nextState: TeamVsTeamTournamentState) {
    saveActiveTeamVsTeamTournament(nextState);
    setState(nextState);
  }

  function selectMatch(matchId: string) {
    commit({ ...tournament, activeMatchupId: matchId });
  }

  function advanceBracket() {
    commit(advanceTeamVsTeamFourTeamBracket(tournament));
  }

  return (
    <div className="grid gap-5">
      {tournament.teamCount === 4 ? (
        <TeamVsTeamBracketPanel activeMatchId={activeMatch.id} canAdvanceBracket={canAdvanceBracket} state={tournament} onAdvance={advanceBracket} onSelectMatch={selectMatch} />
      ) : null}
      {placements.length ? <TeamVsTeamPlacements placements={placements} state={tournament} /> : null}
      <ActiveTeamVsTeamFlow key={activeMatch.id} activeMatch={activeMatch} matchup={{ id: activeMatch.id, teamA, teamB }} state={tournament} setState={setState} />
    </div>
  );
}

function TeamVsTeamBracketPanel({ activeMatchId, canAdvanceBracket, state, onAdvance, onSelectMatch }: { activeMatchId: string; canAdvanceBracket: boolean; state: TeamVsTeamTournamentState; onAdvance: () => void; onSelectMatch: (matchId: string) => void }) {
  return (
    <section className="app-card grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">4-holds flow</p>
          <h2 className="text-xl font-black">Holdkampe</h2>
        </div>
        {canAdvanceBracket ? <button className="min-h-11 rounded-md bg-[var(--primary)] px-4 font-black text-white" type="button" onClick={onAdvance}>Dan finale og placeringskamp</button> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {state.matchups.map((match) => {
          const matchup = getMatchupFromState(state, match);
          const score = matchup ? calculateTeamVsTeamMatchScore(matchup, match.roundResults, match.tieBreak) : undefined;
          return (
            <button key={match.id} className={`rounded-md border p-3 text-left font-bold ${match.id === activeMatchId ? "border-[var(--primary)] bg-green-50" : "border-[var(--border)] bg-white"}`} type="button" onClick={() => onSelectMatch(match.id)}>
              <span className="block text-sm uppercase text-[var(--muted)]">{match.label}</span>
              <span className="block text-lg font-black">{getTeamNameById(state, match.teamAId)} mod {getTeamNameById(state, match.teamBId)}</span>
              <span className="block text-sm text-[var(--muted)]">{score ? `${score.teamAWins}-${score.teamBWins}` : "Afventer"}{score?.winnerTeamId ? ` · Vinder: ${getTeamNameById(state, score.winnerTeamId)}` : ""}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TeamVsTeamPlacements({ placements, state }: { placements: Array<{ rank: 1 | 2 | 3 | 4; teamId: string }>; state: TeamVsTeamTournamentState }) {
  return (
    <section className="app-card grid gap-3 p-4 sm:p-5">
      <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">Slutstilling</p>
      <div className="grid gap-2">
        {placements.map((placement) => (
          <div key={placement.rank} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-white p-3 font-black">
            <span>{placement.rank}. plads</span>
            <span>{getTeamNameById(state, placement.teamId)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActiveTeamVsTeamFlow({ activeMatch, matchup, state, setState }: { activeMatch: TeamVsTeamMatchState; matchup: TeamVsTeamMatchup; state: TeamVsTeamTournamentState; setState: (state: TeamVsTeamTournamentState) => void }) {
  const [message, setMessage] = useState("");
  const score = calculateTeamVsTeamMatchScore(matchup, activeMatch.roundResults, activeMatch.tieBreak);
  const nextRoundNumber = Math.min(activeMatch.roundResults.length + 1, 3) as 1 | 2 | 3;
  const currentLineup = activeMatch.lineups.find((lineup) => lineup.roundNumber === nextRoundNumber) ?? createDefaultLineup(matchup, nextRoundNumber);
  const currentResult = activeMatch.roundResults.find((result) => result.roundNumber === nextRoundNumber) ?? createEmptyResult(nextRoundNumber);
  const canEditRound = activeMatch.roundResults.length < 3;

  function commit(nextState: TeamVsTeamTournamentState) {
    saveActiveTeamVsTeamTournament(nextState);
    setState(nextState);
  }

  function updateActiveMatch(updater: (match: TeamVsTeamMatchState) => TeamVsTeamMatchState) {
    commit({
      ...state,
      status: "active",
      matchups: state.matchups.map((match) => (match.id === activeMatch.id ? updater(match) : match)),
    });
  }

  function handleSaveLineup(lineup: TeamVsTeamRoundLineup) {
    try {
      const previousLineups = activeMatch.lineups.filter((savedLineup) => savedLineup.roundNumber !== lineup.roundNumber);
      const warnings = validateTeamVsTeamLineup(matchup, lineup, previousLineups);

      updateActiveMatch((match) => ({
        ...match,
        lineups: [...previousLineups, lineup].sort((left, right) => left.roundNumber - right.roundNumber),
      }));
      setMessage(warnings[0] ?? `Opstilling for runde ${lineup.roundNumber} er gemt.`);
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Opstillingen kunne ikke gemmes.");
    }
  }

  function handleSaveResult(result: TeamVsTeamRoundResult) {
    try {
      const nextResults = [...activeMatch.roundResults.filter((roundResult) => roundResult.roundNumber !== result.roundNumber), result].sort((left, right) => left.roundNumber - right.roundNumber);
      calculateTeamVsTeamMatchScore(matchup, nextResults);
      updateActiveMatch((match) => ({ ...match, roundResults: nextResults }));
      setMessage(`Resultat for runde ${result.roundNumber} er gemt.`);
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Resultatet kunne ikke gemmes.");
    }
  }

  function handleSaveTieBreak(tieBreak: TeamVsTeamTieBreak) {
    try {
      const nextState = saveTeamVsTeamTieBreak(state, matchup, tieBreak);
      saveActiveTeamVsTeamTournament(nextState);
      setState(nextState);
      setMessage("Match Tie-break er gemt.");
    } catch (caughtError) {
      setMessage(caughtError instanceof Error ? caughtError.message : "Match Tie-break kunne ikke gemmes.");
    }
  }

  return (
    <div className="grid gap-5">
      <section className="app-card grid gap-3 p-4 sm:p-5">
        <p className="text-sm font-bold uppercase text-[var(--primary-strong)]">{activeMatch.label}</p>
        <h2 className="text-2xl font-black">{state.name}</h2>
        <p className="font-bold text-[var(--muted)]">{matchup.teamA.name} mod {matchup.teamB.name} · {state.scoringMode}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">{matchup.teamA.name}</p><p className="mt-1 text-3xl font-black">{score.teamAWins}</p></div>
          <div className="metric-card"><p className="text-sm font-bold text-[var(--muted)]">{matchup.teamB.name}</p><p className="mt-1 text-3xl font-black">{score.teamBWins}</p></div>
        </div>
        {score.winnerTeamId ? <p className="rounded-md bg-green-50 p-3 font-black text-[var(--primary-strong)]">Vinder: {getTeamName(matchup, score.winnerTeamId)}</p> : null}
        {score.tieBreakRequired && !score.winnerTeamId ? <p className="rounded-md bg-yellow-50 p-3 font-black text-yellow-800">Holdkampen står 3-3. Vælg Match Tie-break nedenfor.</p> : null}
      </section>

      {message ? <p className="rounded-md bg-green-50 p-3 font-bold text-[var(--primary-strong)]">{message}</p> : null}

      {canEditRound ? (
        <section className="grid gap-3">
          <h2 className="text-xl font-black">Runde {nextRoundNumber}</h2>
          <LineupEditor matchup={matchup} lineup={currentLineup} previousLineups={activeMatch.lineups.filter((lineup) => lineup.roundNumber !== nextRoundNumber)} onSave={handleSaveLineup} />
          <RoundResultEditor matchup={matchup} result={currentResult} onSave={handleSaveResult} />
        </section>
      ) : null}

      {score.tieBreakRequired ? (
        <section className="grid gap-3">
          <h2 className="text-xl font-black">Match Tie-break</h2>
          <TieBreakEditor matchup={matchup} tieBreak={activeMatch.tieBreak ?? createDefaultTieBreak(matchup)} onSave={handleSaveTieBreak} />
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="text-xl font-black">Gemte runder</h2>
        {score.roundScores.length ? score.roundScores.map((roundScore) => (
          <article key={roundScore.roundNumber} className="app-card grid gap-2 p-4">
            <h3 className="text-lg font-black">Runde {roundScore.roundNumber}</h3>
            <p className="font-bold text-[var(--muted)]">Faktisk: {matchup.teamA.name} {roundScore.actualMatchWins.teamA} - {roundScore.actualMatchWins.teamB} {matchup.teamB.name}</p>
            <p className="font-bold">Tildelt: {matchup.teamA.name} {roundScore.awardedMatchWins.teamA} - {roundScore.awardedMatchWins.teamB} {matchup.teamB.name}</p>
            {roundScore.ruleMessage ? <p className="rounded-md bg-yellow-50 p-3 font-black text-yellow-800">{roundScore.ruleMessage}</p> : null}
          </article>
        )) : <p className="app-card p-4 font-bold text-[var(--muted)]">Ingen runder er gemt endnu.</p>}
      </section>
    </div>
  );
}

function LineupEditor({ matchup, lineup, previousLineups, onSave }: { matchup: TeamVsTeamMatchup; lineup: TeamVsTeamRoundLineup; previousLineups: TeamVsTeamRoundLineup[]; onSave: (lineup: TeamVsTeamRoundLineup) => void }) {
  const [draft, setDraft] = useState(lineup);
  const repeatedPairWarning = getRepeatedPairWarning(matchup, draft, previousLineups);

  return (
    <div className="app-card grid gap-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <TeamPairSelect team={matchup.teamA} title={`${matchup.teamA.name} kamp 1`} value={draft.match1.teamAPlayerIds} onChange={(playerIds) => setDraft({ ...draft, match1: { ...draft.match1, teamAPlayerIds: playerIds } })} />
        <TeamPairSelect team={matchup.teamB} title={`${matchup.teamB.name} kamp 1`} value={draft.match1.teamBPlayerIds} onChange={(playerIds) => setDraft({ ...draft, match1: { ...draft.match1, teamBPlayerIds: playerIds } })} />
        <TeamPairSelect team={matchup.teamA} title={`${matchup.teamA.name} kamp 2`} value={draft.match2.teamAPlayerIds} onChange={(playerIds) => setDraft({ ...draft, match2: { ...draft.match2, teamAPlayerIds: playerIds } })} />
        <TeamPairSelect team={matchup.teamB} title={`${matchup.teamB.name} kamp 2`} value={draft.match2.teamBPlayerIds} onChange={(playerIds) => setDraft({ ...draft, match2: { ...draft.match2, teamBPlayerIds: playerIds } })} />
      </div>
      {repeatedPairWarning ? <p className="rounded-md bg-yellow-50 p-3 font-bold text-yellow-800">{repeatedPairWarning}</p> : null}
      <label className="flex items-center gap-3 font-bold">
        <input className="h-5 w-5 accent-[var(--primary)]" type="checkbox" checked={Boolean(draft.overrideRepeatedPairs)} onChange={(event) => setDraft({ ...draft, overrideRepeatedPairs: event.target.checked })} />
        Tilsidesæt advarsel om gentaget makkerpar
      </label>
      <button className="min-h-12 rounded-md bg-[var(--primary)] px-4 font-black text-white" type="button" onClick={() => onSave(draft)}>Gem opstilling</button>
    </div>
  );
}

function TeamPairSelect({ team, title, value, onChange }: { team: TeamVsTeamTeam; title: string; value: [string, string]; onChange: (playerIds: [string, string]) => void }) {
  return (
    <div className="grid gap-2">
      <p className="font-black">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <select className="field-control" value={value[0]} onChange={(event) => onChange([event.target.value, value[1]])}>
          {team.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
        <select className="field-control" value={value[1]} onChange={(event) => onChange([value[0], event.target.value])}>
          {team.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
      </div>
    </div>
  );
}

function RoundResultEditor({ matchup, result, onSave }: { matchup: TeamVsTeamMatchup; result: TeamVsTeamRoundResult; onSave: (result: TeamVsTeamRoundResult) => void }) {
  const [draft, setDraft] = useState(result);

  return (
    <div className="app-card grid gap-4 p-4 sm:p-5">
      <SetResultInputs title="Kamp 1" matchup={matchup} result={draft.match1} onChange={(match1) => setDraft({ ...draft, match1 })} />
      <SetResultInputs title="Kamp 2" matchup={matchup} result={draft.match2} onChange={(match2) => setDraft({ ...draft, match2 })} />
      <button className="min-h-12 rounded-md bg-[var(--primary)] px-4 font-black text-white" type="button" onClick={() => onSave(draft)}>Gem runderesultat</button>
    </div>
  );
}

function TieBreakEditor({ matchup, tieBreak, onSave }: { matchup: TeamVsTeamMatchup; tieBreak: TeamVsTeamTieBreak; onSave: (tieBreak: TeamVsTeamTieBreak) => void }) {
  const [draft, setDraft] = useState(tieBreak);

  return (
    <div className="app-card grid gap-4 p-4 sm:p-5">
      <p className="font-bold text-[var(--muted)]">Der skal vælges præcis 2 spillere fra hvert hold. Der spilles til mindst 10 point og skal vindes med 2.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TeamPairSelect team={matchup.teamA} title={matchup.teamA.name} value={draft.teamAPlayerIds} onChange={(teamAPlayerIds) => setDraft({ ...draft, teamAPlayerIds })} />
        <TeamPairSelect team={matchup.teamB} title={matchup.teamB.name} value={draft.teamBPlayerIds} onChange={(teamBPlayerIds) => setDraft({ ...draft, teamBPlayerIds })} />
      </div>
      <SetResultInputs title="Match Tie-break resultat" matchup={matchup} result={draft.result} onChange={(result) => setDraft({ ...draft, result })} />
      <button className="min-h-12 rounded-md bg-[var(--primary)] px-4 font-black text-white" type="button" onClick={() => onSave(draft)}>Gem Match Tie-break</button>
    </div>
  );
}

function SetResultInputs({ title, matchup, result, onChange }: { title: string; matchup: TeamVsTeamMatchup; result: TeamVsTeamSetResult; onChange: (result: TeamVsTeamSetResult) => void }) {
  return (
    <div className="grid gap-2">
      <p className="font-black">{title}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <label className="grid gap-1 font-bold text-[var(--muted)]">
          {matchup.teamA.name}
          <input className="field-control text-center text-2xl font-black" inputMode="numeric" pattern="[0-9]*" value={result.teamAPoints} onChange={(event) => onChange({ ...result, teamAPoints: Number(event.target.value) })} />
        </label>
        <span className="pt-7 text-xl font-black">-</span>
        <label className="grid gap-1 font-bold text-[var(--muted)]">
          {matchup.teamB.name}
          <input className="field-control text-center text-2xl font-black" inputMode="numeric" pattern="[0-9]*" value={result.teamBPoints} onChange={(event) => onChange({ ...result, teamBPoints: Number(event.target.value) })} />
        </label>
      </div>
    </div>
  );
}

function createDefaultLineup(matchup: TeamVsTeamMatchup, roundNumber: 1 | 2 | 3): TeamVsTeamRoundLineup {
  const teamAConstitution = getTeamVsTeamPairConstitutions(matchup.teamA)[roundNumber - 1];
  const teamBConstitution = getTeamVsTeamPairConstitutions(matchup.teamB)[roundNumber - 1];

  return {
    roundNumber,
    match1: { teamAPlayerIds: teamAConstitution[0], teamBPlayerIds: teamBConstitution[0] },
    match2: { teamAPlayerIds: teamAConstitution[1], teamBPlayerIds: teamBConstitution[1] },
  };
}

function createEmptyResult(roundNumber: 1 | 2 | 3): TeamVsTeamRoundResult {
  return { roundNumber, match1: { teamAPoints: 6, teamBPoints: 0 }, match2: { teamAPoints: 0, teamBPoints: 6 } };
}

function createDefaultTieBreak(matchup: TeamVsTeamMatchup): TeamVsTeamTieBreak {
  return {
    teamAPlayerIds: [matchup.teamA.players[0].id, matchup.teamA.players[1].id],
    teamBPlayerIds: [matchup.teamB.players[0].id, matchup.teamB.players[1].id],
    result: { teamAPoints: 10, teamBPoints: 8 },
  };
}

function getRepeatedPairWarning(matchup: TeamVsTeamMatchup, lineup: TeamVsTeamRoundLineup, previousLineups: TeamVsTeamRoundLineup[]): string {
  try {
    return validateTeamVsTeamLineup(matchup, { ...lineup, overrideRepeatedPairs: true }, previousLineups)[0] ?? "";
  } catch {
    return "";
  }
}

function getTeamName(matchup: TeamVsTeamMatchup, teamId: string): string {
  return teamId === matchup.teamA.id ? matchup.teamA.name : matchup.teamB.name;
}

function getMatchupFromState(state: TeamVsTeamTournamentState, match: TeamVsTeamMatchState): TeamVsTeamMatchup | undefined {
  const teamA = state.teams.find((team) => team.id === match.teamAId);
  const teamB = state.teams.find((team) => team.id === match.teamBId);

  return teamA && teamB ? { id: match.id, teamA, teamB } : undefined;
}

function getTeamNameById(state: TeamVsTeamTournamentState, teamId: string): string {
  return state.teams.find((team) => team.id === teamId)?.name ?? teamId;
}






