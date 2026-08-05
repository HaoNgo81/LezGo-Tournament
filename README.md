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

Data is stored locally in the browser with `localStorage`.

## Tournament Formats

Implemented formats:

- Americano
- Mexicano
- Fast Makker Americano
- Fast Makker Mexicano
- Mixed Americano
- Team vs Team
  - 2 or 4 teams
  - 4 players per team: 3 rounds
  - 6 or 8 players per team: 2 rounds
  - 1 set or best of 3 sets per match
  - No automatic 6-0 team-mate penalty

Club vs Club is not implemented yet because the full specification has not been defined.

## Scoring And Ranking

The organiser can choose whether standings are ranked by:

- Match points first
- Parti points first

Match points:

- Win: 3 points
- Draw: 1 point
- Loss: 0 points

Tie-break handling follows the implemented tournament engine rules:

- Match points
- Won parti points
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
