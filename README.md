# LezGo Tournament

LEZGO PADEL is a mobile-first padel tournament app.

## First delivery

This delivery contains the navigable mock application shell for:

- Home
- New tournament flow
- Tournament templates
- Tournaments
- Settings
- Live tournament
- TV view
- QR read-only view
- Finish tournament confirmation

## Tournament engine

The first tournament engine module supports:

- Americano
- Mexicano
- Mixed Americano
- Fast Makker Americano
- Fast Makker Mexicano

Implemented rules:

- Player count must be divisible by 4.
- Courts are selected manually and must match 4 players per court in this version.
- The organiser selects the number of rounds.
- Scoring uses 3 match points for a win, 1 for a draw, and 0 for a loss.
- The organiser can rank standings by either most match points or most won parti points.
- Standings track parti points, point difference, wins, draws, losses, and head-to-head results.
- Mixed Americano uses separate women and men player groups through player gender metadata.

Club vs Club and persistence are intentionally not implemented in this module.

## Live scoring

The live scoring module uses local state and mock data. It supports:

- Result entry per match as Team A parti points and Team B parti points.
- Immediate standings updates after saving.
- Match status: Ikke spillet or Gemt.
- Editing saved results by opening the match again.
- Live selection of standings ranking by most match points or most won parti points.
- Round progress for the active round.
- Previous and next round navigation.
- Next round is locked until every match in the active round is saved.
- The same standings calculation for live and final standings.

## Tournament setup

The tournament setup module supports:

- Creating a local tournament from the New tournament screen.
- Tournament name, format, courts, rounds, first round order, and standings ranking mode.
- One-player-per-line entry for standard formats.
- Separate women and men text fields for Mixed Americano.
- Validation before starting the live tournament.

## Finish tournament

The finish module supports:

- Finishing a tournament immediately, even before all planned rounds are played.
- Final standings for all participants using the selected ranking mode.
- Local storage of finished tournaments.
- Editing results after a tournament is finished.

## Read-only views

The read-only views module supports:

- QR view from the active local tournament.
- TV view from the active local tournament.
- Current active round matches, all standings, and round status.
- QR player overview for all players with court, partner, opponents, and rank.
- Read-only presentation with no result entry.

## Sharing

The sharing module supports:

- A Share tournament page with a QR code for `/qr`.
- Copy link action for the QR read-only view.
- Quick actions for opening QR and TV views.
- A share action from the live tournament screen.

## Scripts

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```
