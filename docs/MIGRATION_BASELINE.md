# Migration Baseline

Baseline for the Vercel, backend, and Postgres migration.

## Baseline

- Baseline commit SHA: `8c3d1e05d0a59c043da05164f6ad11f233da9c53`
- Baseline branch at time of capture: `main`
- Baseline tag: `pre-vercel-backend-v1`
- Baseline backup branch: `backup/pre-vercel-backend-v1`
- Baseline date: `2026-08-12 13:36:12 +02:00`

## Verification

- Build: PASS (`npm.cmd run build`)
- Typecheck: PASS (`npm.cmd run typecheck`)
- Lint: PASS (`npm.cmd run lint`)
- Tests: PASS (`npm.cmd run test`, 30 test files / 341 tests)
- Local start: PASS (`http://127.0.0.1:3010/`)

## Locked Tournament Formats

The following formats were already practically tested and are locked before backend migration:

- Americano: OK / LOCKED
- Fast Makker Americano: OK / LOCKED
- Mixed Americano: OK / LOCKED
- Mexicano: OK / LOCKED
- Fast Makker Mexicano: OK / LOCKED

Backend migration must move storage and synchronization only. It must not redesign or change:

- scoring
- rotation
- court rotation
- Mexicano ranking
- court assignment
- match points
- score points
- free scoring
- fixed scoring
- timed play
- timer
- alarm
- Live Score
- result editing

## Restore Instructions

To inspect the baseline without changing the current branch:

```powershell
git switch --detach pre-vercel-backend-v1
```

To restore the working branch to the baseline after explicit approval:

```powershell
git switch main
git reset --hard pre-vercel-backend-v1
```

To create a new branch from the baseline:

```powershell
git switch -c restore/pre-vercel-backend-v1 pre-vercel-backend-v1
```

The local backup branch also points to the same baseline commit:

```powershell
git switch backup/pre-vercel-backend-v1
```

## GitHub

The baseline tag and backup branch were created locally only. They were not pushed to GitHub during STEP 0.
