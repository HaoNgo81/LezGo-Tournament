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

## Player Setup

Standard formats use one player per line.

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

Parti points are entered manually as Team A score and Team B score.

Free scoring is available in the supported formats through manual parti-point entry.

## Ranking Modes

The organiser can choose:

- Match points first
- Parti points first

The selected ranking mode is used consistently in:

- Live standings
- QR view
- TV view
- Finished tournament view
- Tournament history

## Tie-Breaks

The implemented standings logic uses:

- Match points
- Won parti points
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

- 2 or 4 teams
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
