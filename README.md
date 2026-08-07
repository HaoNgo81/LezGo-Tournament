# LEZGO Tournament

Mobile-first padel tournament app for arranging, running, sharing, and finishing local padel tournaments.

## Current Scope

The app currently supports:

- Tournament setup from `/new-tournament`
- Live scoring from `/live`
- Running standings during the tournament
- Finished tournament view from `/finish`
- Tournament history from `/tournaments`
- Tournament templates from `/templates`
- Default organiser settings from `/settings`
- Read-only player view from `/qr`
- TV/read-only overview from `/tv`
- Share page with QR code from `/share`
- Team vs Team flow from `/team-vs-team` with 4, 6, or 8 players per team
- Team vs Team finish and history from `/tournaments`
- Puljespil setup, live scoring, finish summaries, PDF export, QR view, TV view, and history summaries. Puljespil is currently on standby while standard formats are made ready for active use.
- PWA installation support with a registered service worker

Data is stored locally in the browser with `localStorage`.

## Tournament Formats

Implemented formats:

- Americano
- Mexicano
- Fast Makker Americano
- Fast Makker Mexicano
- Mixed Americano
- Team vs Team
  - 2 to 8 teams in pool play
  - Every pool team meets every other team once
  - 2 to 8 teams in knockout play
  - Manual or random knockout distribution
  - Placement matches determine every final rank
  - 4 players per team: 3 rounds
  - 6 or 8 players per team: 2 rounds
  - 1 set or best of 3 sets per match
  - No automatic 6-0 team-mate penalty
- Puljespil
  - Players, pairs, or teams as participants
  - Up to 8 initial pools
  - Americano rotation for player pools
  - Round robin matches for pair and team pools
  - Placement-pool or cross-match progression
  - Automatic oversidning or walkover for unmatched final pair/team cross-match pools
  - Americano placement play for unmatched final player pools
  - Final and bronze matches for completed pair/team cross matches
  - Final placement rows from completed placement pools, pair/team final matches, and individual Americano cross play
  - Finish, PDF, QR, TV, and history summaries

Fixed-partner formats are entered as named pairs. Two pairs fill one court, four pairs fill two courts, and six pairs fill three courts. Team vs Team players are also entered as pairs, while the organiser can still create new pair combinations between rounds.

Fast Makker Americano and Fast Makker Mexicano standings rank complete pairs and display both partner names in each row. Team vs Team standings rank complete teams.

Standardformat-status: Americano, Mexicano, Mixed Americano, Fast Makker Americano, and Fast Makker Mexicano are the current ready-to-use focus. They are covered with 16 players on 4 courts, or 8 fixed pairs on 4 courts, for at least 5 rounds. Mexicano generates later rounds from the live player standings, while Fast Makker Mexicano generates later rounds from the live pair standings.

Puljespil currently shows pool standings, generated next-phase results, and placement rows from completed placement pools, pair/team final and bronze matches, individual Americano cross play, or unmatched final player-pool Americano placement play. Match tiebreaks can resolve tied pool-play scorepoint results and are marked as MTB in summaries. Individual Americano cross-play ties require a separate placement tiebreak before final placements are shown, and those tiebreaks can be registered from live scoring.

## Scoring And Ranking

The organiser can choose free scoring, timed play, or fixed scoring. Fixed scoring supports either playing until one side reaches the selected score or requiring both scores to equal the selected combined total.

The organiser can choose whether standings are ranked by:

- Match points first
- Score points first

Match points:

- Win: 3 points
- Draw: 1 point
- Loss: 0 points

Tie-break handling follows the implemented tournament engine rules:

- Match points
- Won score points
- Point difference
- Internal head-to-head result when relevant

The same ranking logic is used during live play and after the tournament is finished.

## Key Features

- Manual result entry
- Editable results during and after tournament completion
- Ability to finish a tournament early
- Result and standings visibility for all participants
- Read-only QR and TV views
- Partner and opponent visibility in player view
- Bye/pause handling
- Match statuses: ready, in progress, completed
- Optional timed play with countdown and alarm
- Tournament templates without saved player lists
- Default organiser settings

## Project Structure

```text
app/          Next.js routes and pages
components/   Reusable UI and feature components
docs/         Project documentation
hooks/        React hooks
lib/          Tournament logic, storage, templates, settings, exports
public/       Static public assets
styles/       Style-related project assets
tests/        Vitest test suite
```

## Development

Install dependencies:

```bash
npm install
```

Start local development:

```bash
npm run dev
```

Run the required quality checks:

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`:

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
```

## Continuous Integration

GitHub Actions runs the same quality gate on `main` pushes and pull requests:

- Install dependencies with `npm ci`
- Build
- TypeScript check
- Lint
- Tests

Workflow file:

```text
.github/workflows/ci.yml
```

## Development Rule

Each new module must follow this order:

1. Implement one module.
2. Build the project.
3. Run TypeScript check.
4. Run lint.
5. Fix all errors.
6. Run tests.
7. Fix all errors.
8. Continue only when everything is green.
