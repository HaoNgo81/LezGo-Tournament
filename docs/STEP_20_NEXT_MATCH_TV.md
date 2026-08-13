# STEP 20 - Next Match TV Scoreboard

## Scope

STEP 20 improves the remote Scoreboard view for practical tournament-day TV use.

The change is UI/UX only:

- Scoreboard view now prioritizes Live Score first, then current matches, next match, and standings.
- The view shows `Næste kamp` / `Next match` or `Næste kampe` / `Next matches` when the next match can be derived safely from existing snapshot data.
- No tournament rules, scoring, ranking, round generation, persistence, remote-session, RLS, RPC, or database behavior was changed.

## How Next Match Is Determined

Standard tournament formats:

- The next match list is read from the already generated next round in `LiveTournamentState.rounds`.
- The target round is `activeRoundNumber + 1`.
- If that round is not present in the snapshot, Scoreboard view does not show a next-match section.
- No dynamic Mexicano/Americano round generation is performed by the TV view.

Team vs Team:

- The next match list is read from an already saved lineup for the next round of the active matchup.
- If the next lineup is not present, Scoreboard view does not show a next-match section.

Pool/later-stage:

- No extra next-match prediction is added.
- Existing pool/later-stage matches continue to render from the approved read-only summary.

## Layout

Desktop/TV:

- Header: compact LEZGO PADEL, tournament name, format, round, and live status.
- Main content: Live Score is the largest visual area.
- Side content: current matches and next matches.
- Bottom: top standings only.

Mobile/tablet portrait:

- Vertical stacking is allowed.
- Live Score appears before current matches.
- Next matches appear before standings when available.

## Security and Persistence

- Device B remains read-only.
- localStorage remains primary persistence on Device A.
- Supabase remains shadow/remote snapshot backend.
- Existing polling/recovery/session behavior is unchanged.
- No client secrets are introduced.

## Locked Formats

The locked formats were not changed:

- Americano
- Fast Makker Americano
- Mixed Americano
- Mexicano
- Fast Makker Mexicano

Team vs Team runtime rules were not changed.
