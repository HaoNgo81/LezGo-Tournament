# STEP 19 - TV Scoreboard Polish

## Scope

STEP 19 adds a dedicated read-only Scoreboard View for remote/TV displays.

The change is limited to the remote presentation layer:

- Remote Device B can switch between Standard view, TV view, and Scoreboard view.
- A direct remote URL can open Scoreboard view with `?display=scoreboard`.
- Scoreboard view prioritizes the tournament name, current format/round, live status, current matches, large live scores, and a compact standings summary.
- Fullscreen, manual refresh, standard view, and close controls remain available as small recovery controls.
- The read-only banner and detailed sync telemetry are hidden in Scoreboard view to reduce TV clutter.

## Persistence

- localStorage remains primary persistence.
- Supabase remains a shadow/remote snapshot backend.
- Device B remains read-only.
- No save, edit, write, delete, migration, RPC, RLS, or database behavior was changed.

## Locked Formats

The locked sports formats were not changed:

- Americano
- Fast Makker Americano
- Mixed Americano
- Mexicano
- Fast Makker Mexicano

Team vs Team runtime behavior was not changed.

## UI Behavior

Scoreboard view:

- Uses a compact LEZGO PADEL header.
- Shows tournament name, format, round, and live status.
- Shows current matches and live scores as the primary content.
- Shows top standings as secondary content.
- Adapts the match grid for one, two, or multiple courts.
- Preserves fullscreen and manual refresh controls.
- Uses the existing remote session, polling, reconnect, expiry, and terminal-error flows.

## QA Expectations

STEP 19 must pass:

- Build
- Typecheck
- Lint
- All automated tests
- Remote UI regression tests
- Supabase remote E2E regression where credentials are available
- Client bundle secret scan
- Git diff secret scan
- Browser screenshot QA for TV, desktop, tablet, and mobile viewports
