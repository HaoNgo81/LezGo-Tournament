import type {
  CrossMatchEncounter,
  CrossMatchQualifier,
  CrossMatchStage,
  PoolAmericanoMatch,
  PoolParticipant,
} from "@/lib/tournament-setup";

interface CrossMatchStagePanelProps {
  stage: CrossMatchStage;
}

export function CrossMatchStagePanel({ stage }: CrossMatchStagePanelProps) {
  const participantById = new Map(stage.participants.map((participant) => [participant.id, participant]));

  return (
    <section className="grid gap-5" aria-label="Krydskampe">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase text-[var(--muted)]">Næste fase</p>
          <h2 className="text-2xl font-black">Krydskampe</h2>
        </div>
        <span className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm font-black text-[var(--primary-strong)]">
          {stage.groups.length} krydsspil
        </span>
      </div>

      {stage.groups.map((group) => (
        <section key={group.id} className="grid gap-3" aria-labelledby={`${group.id}-heading`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
            <h3 id={`${group.id}-heading`} className="text-xl font-black">{group.name}</h3>
            <p className="text-sm font-bold text-[var(--muted)]">
              {group.sourcePoolIds.map((poolId) => (
                group.qualifiers.find((qualifier) => qualifier.sourcePoolId === poolId)?.sourcePoolName ?? poolId
              )).join(" mod ")}
            </p>
          </div>

          {group.scheduleType === "crossMatches" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {group.encounters.map((encounter, encounterIndex) => (
                <EncounterCard
                  key={encounter.id}
                  encounter={encounter}
                  encounterNumber={encounterIndex + 1}
                  qualifiers={group.qualifiers}
                  participantById={participantById}
                  showMatchesPerTeam={stage.participantType === "team"}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              {group.americanoRounds.map((round) => (
                <article key={`${group.id}-round-${round.roundNumber}`} className="app-card p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-lg font-black">Runde {round.roundNumber}</h4>
                    <span className="text-sm font-bold text-[var(--muted)]">
                      {round.matches.length} {round.matches.length === 1 ? "bane" : "baner"}
                    </span>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {round.matches.map((match) => (
                      <AmericanoMatchCard
                        key={match.id}
                        match={match}
                        qualifiers={group.qualifiers}
                        participantById={participantById}
                      />
                    ))}
                  </div>
                  {round.byeParticipantIds.length > 0 ? (
                    <p className="mt-3 text-sm font-bold text-[var(--muted)]">
                      Oversidder: {round.byeParticipantIds.map((participantId) => (
                        getParticipantName(participantById, participantId)
                      )).join(", ")}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ))}

      {(stage.unmatchedPlacementGroups ?? []).length > 0 ? (
        <section className="grid gap-3" aria-labelledby="unmatched-placement-heading">
          <div className="border-b border-[var(--line)] pb-2">
            <p className="text-sm font-bold uppercase text-[var(--muted)]">Ulig sidste pulje</p>
            <h3 id="unmatched-placement-heading" className="text-xl font-black">Placeringsspil</h3>
          </div>
          {(stage.unmatchedPlacementGroups ?? []).map((group) => (
            <section key={group.id} className="grid gap-3" aria-labelledby={`${group.id}-heading`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 id={`${group.id}-heading`} className="text-lg font-black">{group.name}</h4>
                  <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                    {group.sourcePoolName} · placering {group.finalPlacementFrom}-{group.finalPlacementTo}
                  </p>
                </div>
              </div>
              <div className="grid gap-3">
                {group.americanoRounds.map((round) => (
                  <article key={`${group.id}-round-${round.roundNumber}`} className="app-card p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h5 className="text-lg font-black">Runde {round.roundNumber}</h5>
                      <span className="text-sm font-bold text-[var(--muted)]">
                        {round.matches.length} {round.matches.length === 1 ? "bane" : "baner"}
                      </span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {round.matches.map((match) => (
                        <AmericanoMatchCard
                          key={match.id}
                          match={match}
                          qualifiers={group.participants}
                          participantById={participantById}
                        />
                      ))}
                    </div>
                    {round.byeParticipantIds.length > 0 ? (
                      <p className="mt-3 text-sm font-bold text-[var(--muted)]">
                        Oversidder: {round.byeParticipantIds.map((participantId) => (
                          getParticipantName(participantById, participantId)
                        )).join(", ")}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>
      ) : null}

      {stage.automaticAdvances.length > 0 ? (
        <section className="grid gap-3" aria-labelledby="automatic-advance-heading">
          <div className="border-b border-[var(--line)] pb-2">
            <h3 id="automatic-advance-heading" className="text-xl font-black">Automatisk videre</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {stage.automaticAdvances.map((advance) => (
              <article key={advance.id} className="app-card p-4">
                <p className="text-sm font-black uppercase text-[var(--primary-strong)]">
                  {advance.resolution === "bye" ? "Oversidning" : "Walkover"}
                </p>
                <h4 className="mt-2 text-lg font-black">
                  {getParticipantName(participantById, advance.participantId)}
                </h4>
                <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                  {formatQualifierSource(advance)}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

interface EncounterCardProps {
  encounter: CrossMatchEncounter;
  encounterNumber: number;
  qualifiers: CrossMatchQualifier[];
  participantById: Map<string, PoolParticipant>;
  showMatchesPerTeam: boolean;
}

function EncounterCard({
  encounter,
  encounterNumber,
  qualifiers,
  participantById,
  showMatchesPerTeam,
}: EncounterCardProps) {
  const qualifierA = findEncounterQualifier(
    qualifiers,
    encounter.participantAId,
    encounter.sourcePoolAId,
    encounter.sourceRankA,
  );
  const qualifierB = findEncounterQualifier(
    qualifiers,
    encounter.participantBId,
    encounter.sourcePoolBId,
    encounter.sourceRankB,
  );

  return (
    <article className="app-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-lg font-black">Kamp {encounterNumber}</h4>
        {showMatchesPerTeam && encounter.matchesPerTeam ? (
          <span className="rounded-md bg-[var(--primary-soft)] px-3 py-1 text-sm font-black text-[var(--primary-strong)]">
            {encounter.matchesPerTeam} delkampe
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3">
        <ParticipantLine participant={participantById.get(encounter.participantAId)} qualifier={qualifierA} />
        <p className="text-sm font-black uppercase text-[var(--muted)]">mod</p>
        <ParticipantLine participant={participantById.get(encounter.participantBId)} qualifier={qualifierB} />
      </div>
    </article>
  );
}

interface AmericanoMatchCardProps {
  match: PoolAmericanoMatch;
  qualifiers: SourceParticipant[];
  participantById: Map<string, PoolParticipant>;
}

function AmericanoMatchCard({ match, qualifiers, participantById }: AmericanoMatchCardProps) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-white p-3">
      <p className="text-sm font-black uppercase text-[var(--primary-strong)]">Bane {match.courtNumber}</p>
      <div className="mt-3 grid gap-3">
        <AmericanoTeamLine playerIds={match.teamA.playerIds} qualifiers={qualifiers} participantById={participantById} />
        <p className="text-sm font-black uppercase text-[var(--muted)]">mod</p>
        <AmericanoTeamLine playerIds={match.teamB.playerIds} qualifiers={qualifiers} participantById={participantById} />
      </div>
    </div>
  );
}

interface AmericanoTeamLineProps {
  playerIds: [string, string];
  qualifiers: SourceParticipant[];
  participantById: Map<string, PoolParticipant>;
}

function AmericanoTeamLine({ playerIds, qualifiers, participantById }: AmericanoTeamLineProps) {
  return (
    <div>
      <p className="font-black">
        {playerIds.map((participantId) => getParticipantName(participantById, participantId)).join(" + ")}
      </p>
      <p className="mt-1 text-sm font-bold text-[var(--muted)]">
        {playerIds.map((participantId) => {
          const qualifier = qualifiers.find((candidate) => candidate.participantId === participantId);

          return qualifier ? formatQualifierSource(qualifier) : "Ukendt pulje";
        }).join(" / ")}
      </p>
    </div>
  );
}

interface ParticipantLineProps {
  participant?: PoolParticipant;
  qualifier?: CrossMatchQualifier;
}

function ParticipantLine({ participant, qualifier }: ParticipantLineProps) {
  return (
    <div>
      <p className="text-lg font-black">{participant?.name ?? "Ukendt deltager"}</p>
      <p className="mt-1 text-sm font-bold text-[var(--muted)]">
        {qualifier ? formatQualifierSource(qualifier) : "Ukendt pulje"}
      </p>
    </div>
  );
}

function findEncounterQualifier(
  qualifiers: CrossMatchQualifier[],
  participantId: string,
  sourcePoolId: string,
  sourceRank: number,
): CrossMatchQualifier | undefined {
  return qualifiers.find((qualifier) => (
    qualifier.participantId === participantId
    && qualifier.sourcePoolId === sourcePoolId
    && qualifier.sourceRank === sourceRank
  ));
}

function getParticipantName(participants: Map<string, PoolParticipant>, participantId: string): string {
  return participants.get(participantId)?.name ?? "Ukendt deltager";
}

function formatQualifierSource(qualifier: SourceParticipant): string {
  return `${qualifier.sourcePoolName}, nr. ${qualifier.sourceRank}`;
}

interface SourceParticipant {
  participantId: string;
  sourcePoolName: string;
  sourceRank: number;
}
