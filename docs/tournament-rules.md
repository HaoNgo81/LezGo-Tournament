# Tournament Rules

This document describes the tournament rules currently implemented in LEZGO Tournament.

## Formats

Implemented:

- Americano
- Mexicano
- Fast Makker Americano
- Fast Makker Mexicano
- Mixed Americano
- Team vs Team
- Puljespil

Americano, Mexicano, Mixed Americano, Fast Makker Americano, and Fast Makker Mexicano are the active standard-format focus while Puljespil is on standby for later work. The standard formats are tested with 16 players on 4 courts, or 8 fixed pairs on 4 courts, for at least 5 rounds.

## Player Setup

Standard formats use one player per line.

Fast Makker Americano and Fast Makker Mexicano use two separate player fields per pair. Court capacity is one court per two available pairs.

Team vs Team setup also groups players in pairs. These setup pairs do not lock later rounds; the organiser can still select new pair combinations between rounds.

Team vs Team supports 2 to 8 teams in pool play and knockout play. In pool play, every unique pair of teams plays one holdkamp, and the complete team standing remains visible throughout the tournament.

Puljespil supports players, pairs, and teams. Player pools use Americano rotation, while pair and team pools use round robin matches.

Mixed Americano uses separate text fields:

- Women
- Men

Mixed Americano requires the same number of women and men.

## Courts And Rounds

The organiser selects:

- Number of courts
- Number of rounds
- First round order
- Ranking mode
- Optional time limit

The app validates setup before a tournament can be started.

## Scoring

Match points:

- Win: 3
- Draw: 1
- Loss: 0

Score points are entered manually as Team A score and Team B score.

Free scoring is available in all supported formats through manual scorepoint entry.

With fixed scoring, the organiser selects both a scorepoint value and one of these rules:

- Play to the selected scorepoint value: one side must reach the value exactly.
- Fixed combined scorepoint value: the two scores must add up to the value exactly.

The same fixed-score validation is applied to standard tournaments and each Team vs. Team set.

## Ranking Modes

The organiser can choose:

- Match points first
- Score points first

The selected ranking mode is used consistently in:

- Live standings
- QR view
- TV view
- Finished tournament view
- Tournament history

## Tie-Breaks

The implemented standings logic uses:

- Match points
- Won score points
- Point difference
- Internal head-to-head result when relevant

Internal head-to-head compares the direct result between the tied players or teams.

## Live Tournament

During the tournament, the organiser can:

- Enter results manually
- Edit saved results
- Start matches
- See match status
- Move between rounds
- Finish the tournament early

Participants can see read-only standings and match information through the QR view.

## Finished Tournament

After finishing a tournament:

- Final standings are shown for all participants
- The tournament is saved locally
- The organiser can reopen and edit results
- Updated results recalculate standings

## Team vs Team

Team vs Team supports:

- 2 to 8 teams
- Pool play where every team meets every other team once
- Knockout play with manual or random team distribution
- Knockout placement matches that determine every final rank
- 4, 6, or 8 players per team
- 4 players per team: 3 rounds
- 6 or 8 players per team: 2 rounds
- 2 matches per round
- Manual lineup selection by the organiser
- One selected captain per team, visible in setup, active play, history, QR, and TV
- 1 set or best of 3 sets per match

The old automatic 6-0 team-mate penalty rule is not used. A 6-0 result only counts for the match where it was entered.

If a holdkamp is tied after all rounds, the organiser enters a Match Tie-break to decide the winner.

Team vs Team tournaments can be finished immediately. Finished Team vs Team tournaments are saved in local history, can be reopened as a final standing, and can be reopened for result corrections.

QR and TV views show Team vs Team holdstilling, captains, and the active holdkamp without result editing.

## Puljespil

Puljespil supports:

- Players, pairs, or teams as participants
- 1 to 8 initial pools
- Up to 32 players, 16 pairs, or 8 teams
- Player pools with Americano partner rotation
- Pair pools with every pair meeting every other pair in the same pool
- Team pools with 4 or 6 players per team
- 4-player teams: 2 delkampe per team match
- 6-player teams: 3 delkampe per team match
- Isolated standings per initial pool
- Ranking by match points first or score points first
- Progression to placement pools or cross matches

Placement pools group participants with the same rank from every initial pool. Pair and team placement pools use round robin matches. Player placement pools use Americano rotation and require at least four initial pools.

Cross matches pair neighboring pools as 1+2, 3+4, and so on. For pairs and teams, first place from one pool meets second place from the neighboring pool, and vice versa. For individual players, the four qualifiers in each neighboring-pool group play Americano rotation. If the last player pool has no neighboring pool, that pool plays a separate Americano placement game instead of automatic bye or walkover advancement.

If the final initial pair or team pool has no neighboring pool in cross-match progression, both top qualifiers from that pool are marked as automatically advanced. The organiser chooses whether that is shown as oversidning or walkover. No score is invented for automatic advances.

Live puljespil supports scoring initial pool matches, creating the next phase after all initial pool matches are saved, scoring generated placement-pool or cross-match matches, and creating final/bronze matches after completed pair/team cross matches. Editing an initial pool result resets generated next-phase matches, final matches, and their results.

Finished puljespil, PDF export, QR view, TV view, and tournament history show pool standings, next-phase matches, final/bronze matches, saved results, automatic advances, and final placement rows when placement pools or final/bronze matches are decided.

Match tiebreak can decide tied pool-play scorepoint results. When a pool-play score is tied, the live score sheet can store the match-tiebreak winner, and summaries mark the result with MTB.

Individual Americano cross-play placements are decided by scorepoints. If two players are tied on scorepoints, a separate placement tiebreak between those players is required before the final placement rows are shown. The separate placement tiebreak is registered from the live score page.

Unmatched final-pool Americano placement uses the same scorepoint-first placement and separate placement-tiebreak rule as individual Americano cross play.
