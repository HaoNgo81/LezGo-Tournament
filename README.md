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

Data storage:

- **Guest** (not logged in): tournaments are stored only in the browser (`localStorage`) on that device. Guests can use up to 2 courts.
- **Account** (logged in with username or e-mail): tournaments are also saved in the cloud (Supabase), so a tournament created on a phone can be opened on a tablet with the same account.

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

- Match points (or won score points first, depending on the selected ranking mode)
- Won score points (or match points)
- Overall point difference
- Internal head-to-head match points between the tied players or teams
- Internal head-to-head point difference
- Name in alphabetical order as the final fixed fallback

The same ranking logic is used during live play and after the tournament is finished.

Standings show the overall point difference in a +/− column (for example +4 or -4), so players can see why tied rows are ordered as they are.

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

Install dependencies exactly as locked in `package-lock.json`:

```bash
npm ci
```

Use `npm ci`, not `npm install`: several packages are declared as `latest` in `package.json`, so `npm install` can pull in new major versions of Next.js or React.

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

Browser tests (Playwright) run the real app in Chromium on phone, small-phone and tablet-landscape sizes, play a full guest tournament and check standings, the final standings and the PDF. They need a production build first:

```bash
npm run build
npm run test:e2e
```

GitHub Actions runs them on every pull request after the unit tests. When they fail, the report and screenshots are uploaded as the `playwright-report` artifact.

`e2e/accessibility.spec.ts` checks the home page and `/new-tournament` at 375 and 1280 px with axe-core (no colour-contrast and no serious or critical findings), that pinch zoom is allowed, that inputs use at least 16 px text (no iOS auto-zoom), the text contrast of "Start turnering" and "Opret bruger", and the focus ring on the home cards.

Install link: `https://lezgotournament.vercel.app/?install=1` shows an install panel on the home page (used by the "Installer" button in the LEZGO Apps portal). Browsers only allow the install dialog on the app's own domain and after a tap, so the panel has the button; iPhone/iPad get Share > Add to Home Screen steps. `e2e/install-panel.spec.ts` tests the flow.

The workflow `Deployed app tests` runs the same accessibility tests against the real Vercel deployment when Vercel reports it ready: the preview of every pull request (shown as a check on the pull request) and, after a merge, the production deployment and `lezgotournament.vercel.app` as a smoke test. Run them yourself against any URL with `E2E_BASE_URL=https://... npx playwright test e2e/accessibility.spec.ts`.

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

## Deployment

Production runs on Vercel (project `lezgotournament`). Every merge to `main` deploys automatically to:

- https://lezgotournament.vercel.app (`lez-go-tournament.vercel.app` redirects here)

The custom domain `app.lezgopadel.dk` is not used (owner decision 2026-10-29). Old result links on that host are still rewritten to the Vercel domain.

Supabase pauses free-plan projects after about 7 days without activity. The scheduled GitHub Actions workflow `keep-database-awake.yml` calls a read-only production endpoint every second day so the database stays active. If login or cloud saving ever stops working, check the Supabase project status first.

Every pull request gets its own Vercel preview. Previews use the same Supabase database as production, so test previews as a guest. The home page shows the running version (short commit) and marks previews as "Testversion"; `/api/app-version` returns the full commit.

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
