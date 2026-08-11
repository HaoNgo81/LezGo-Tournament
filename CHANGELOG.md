# Changelog

## 0.24.0

- Added the pool-play configuration model with player, pair, and team participation.
- Added validation for up to 8 pools, 32 players, 16 pairs, or 8 teams.
- Added placement-pool and cross-match progression choices with bye or walkover handling.
- Added 4-player and 6-player pool-team rules with 2 or 3 matches per team contest.
- Added deterministic participant distribution across the configured pools.
- Added complete round-robin encounter generation for pair and team pools.
- Marked player pools for dedicated Americano rotation scheduling.
- Added balanced Americano pool rotations with evenly distributed byes.
- Prioritized unique partners and balanced opponents throughout each player pool.
- Added an isolated live standings calculation for every initial pool.
- Ranked player pools individually, pair pools by pair, and team pools by team.
- Added placement pools that group equal ranks from every initial pool.
- Added final placement ranges and new Americano or round-robin schedules for each placement pool.
- Required at least four initial pools when individual players use placement pools.
- Added adjacent-pool cross matches with first place facing second place in the neighboring pool.
- Added Americano partner rotation for individual players who qualify for cross play.
- Added automatic bye or walkover advancement for both qualifiers from an unmatched final pool without inventing a score.
- Added a reusable responsive cross-match stage panel with source pool, rank, Americano court, team submatch, and automatic-advance details.
- Added live-state helpers for storing initial pool results and advancing complete pool play into placement pools or cross matches.
- Added a pool-play tournament setup factory that creates initial pools directly on live tournament state.
- Added live initial-pool scoring with pool progress, pool standings, and next-phase creation.
- Added live score registration for generated pool-play placement pools and cross matches.
- Added finish-page and PDF summaries for pool-play standings, next-phase results, and automatic advances.
- Added QR and TV read-only summaries for pool-play standings, next-phase matches, and automatic advances.
- Added pool-play creation controls to the tournament setup form.
- Prevented standard tournament templates from storing pool-play formats that require dedicated setup fields.
- Added precise pool-play participant, pool, and progression summaries to the tournament list.
- Normalized older saved pool-play tournaments so missing result arrays load safely.
- Added regression coverage for automatic pool-play advances in exports and read-only views.
- Documented implemented pool-play rules and the remaining undefined final-ranking rule boundary.
- Added a cross-match finals engine that creates final and bronze matches from non-drawn pair/team semifinals.
- Added live-state support for advancing pool-play cross matches into final and bronze stages.
- Added live-scoring UI for creating and scoring pool-play final and bronze matches after completed cross matches.
- Added pool-play final and bronze matches to finish, QR, TV, read-only, and PDF result summaries.
- Added pool-play final placement rows from decided final and bronze matches.
- Added pool-play placement-pool placement rows decided by score points.
- Added pool-play match-tiebreak result support for tied scorepoint matches in final and placement summaries.
- Added live-scoring input for pool-play match-tiebreak winners on tied scorepoint matches.
- Added separate placement-tiebreak result support for tied individual Americano cross-play placements.
- Added live-scoring input for separate individual Americano placement tiebreaks.
- Added Americano placement play for unmatched final player pools in cross-match progression.
- Added QR and TV regression coverage for unmatched final player-pool Americano placement play.
- Added final placement summaries to completed pool-play tournament history cards.
- Prevented hydration mismatches while storage-backed pages load saved tournaments, settings, and templates.
- Added five-round standard-format coverage and generated later Mexicano rounds from live standings.
- Generated later Fast Makker Mexicano rounds from the live pair standings.
- Changed Fast Makker Americano and Fast Makker Mexicano standings to one ranked row per pair.
- Added both player names to each fixed-pair standings row and count every result once per pair.
- Prevented hydration mismatch when the live page loads a locally saved tournament.
- Removed date and start time from tournament setup.
- Renamed visible parti-point terminology to scorepoint.
- Simplified standings to placement, name, matchpoint, scorepoint, wins, draws, and losses.
- Removed the separate Start kamp action before result registration.
- Opened new scorepoint fields empty while preserving saved scores during editing.
- Added stop, resume, and reset controls to the timed round clock.
- Added fixed scoring with organiser choice between playing to an exact score and using an exact combined score.
- Fixed GitHub Pages live/history navigation by using basePath-aware tournament links.
- Changed live and read-only match cards to show participants side by side with `vs`.
- Kept entered fixed-partner pairs together when randomizing Fast Makker Americano and Fast Makker Mexicano starts.
- Applied tournament templates after hydration, including fixed-score settings.
- Renamed the live standings section to Live score and added a direct TV-screen action.
- Allowed both horizontal and vertical app orientation in the web manifest.
- Started Mexicano and Fast Makker Mexicano from entered ranking order even when older saved setup data says random.
- Removed first-round order selection from the active standard tournament setup and templates.
- Put Puljespil and Team vs. Team on standby in the new-tournament UI.
- Stored up to five active standard tournaments and let the list choose which one opens live scoring.
- Clarified timed scoring inputs as minutes.
- Applied fixed-score validation to standard tournaments and Team vs. Team sets.
- Added pair-based player entry for fixed-partner formats and Team vs. Team.
- Limited fixed-partner court count to one court per two available pairs.
- Added Team vs Team pool play for 2 to 8 teams, with every unique team pairing scheduled once.
- Added pool match selection and complete pool standings to the active Team vs Team view.
- Extended Team vs Team knockout play to 2 through 8 teams.
- Added organiser choice between manual and random knockout distribution.
- Added knockout placement rounds that determine every final rank.

## 0.23.0

- Registered the app service worker so the PWA shell is installable.
- Added a regression test for service worker registration.

## 0.22.0

- Added Team vs Team read-only QR and TV views with holdstilling, captains, and active match data.
- Added Team vs Team read-only view-model tests.

## 0.21.0

- Added visible Team vs Team captain summaries during setup, active play, and tournament history.
- Added a Team vs Team captain display helper with regression tests.

## 0.20.0

- Added Team vs Team finish, local history, reopen, and delete flows.
- Added complete Team vs Team standings for active and finished views.
- Removed Club vs Club from the product scope and visible format lists.
- Removed the Team vs Team automatic 6-0 team-mate penalty rule.
- Added 4, 6, and 8 players per team setup options.
- Limited 6-player and 8-player Team vs Team tournaments to 2 rounds.
- Added 1 set and best-of-3 set scoring options per Team vs Team match.
- Added backward-compatible loading for older saved Team vs Team results.

## 0.19.0

- Updated README with current project scope, routes, formats, scoring, ranking, CI, and development commands.
- Added tournament rules documentation.
- Added development process documentation.

## 0.10.0

- Added Share tournament page.
- Added local QR-code SVG generation for the QR read-only link.
- Added copy-link action for `/qr`.
- Added quick actions for QR and TV views.
- Added Share tournament action from the live scoring screen.
- Added tests for share URL and QR matrix generation.

## 0.9.0

- Added QR player overview for all players.
- Added court, partner, opponents, and rank to each QR player row.
- Kept QR player view read-only with no player search or result entry.
- Added tests for QR player info generation.

## 0.8.0

- Added read-only QR view using the active local tournament.
- Added TV view using the active local tournament.
- Replaced QR and TV mock standings with active tournament standings.
- Added shared read-only tournament view model.
- Added tests for read-only match, standings, and round data.

## 0.7.0

- Added finish tournament flow with final standings for all participants.
- Allowed tournaments to be finished immediately, even before all planned rounds are played.
- Added local storage for finished tournaments.
- Kept finished tournaments editable from the live scoring screen.
- Added tests for finish state and post-finish result editing.

## 0.6.0

- Added active round progress during live scoring.
- Added previous and next round navigation.
- Locked next round until every match in the active round is saved.
- Persisted round navigation changes in local active tournament storage.
- Added tests for round progress and navigation guards.

## 0.5.0

- Added tournament setup from the New tournament screen.
- Added local active tournament storage for the live tournament screen.
- Added one-player-per-line entry for standard formats.
- Added separate women and men player fields for Mixed Americano.
- Added setup validation and tests for tournament creation.

## 0.4.0

- Added organiser-selected standings ranking mode.
- Added support for ranking by most match points or most won parti points.
- Added live standings control for switching ranking mode during a tournament.
- Added regression tests for both ranking modes in engine and live scoring.

## 0.3.0

- Added local-state live scoring for the live tournament screen.
- Added score entry and editing per match.
- Added match status for Ikke spillet and Gemt.
- Connected live standings to the tournament engine.
- Added tests for saving, editing, status, validation, and immediate standings updates.

## 0.2.0

- Added the first tournament engine module.
- Added round generation for Americano, Mexicano, Mixed Americano, Fast Makker Americano, and Fast Makker Mexicano.
- Added standings calculation with 3/1/0 match points, parti points, and head-to-head tie-break data.
- Added tests for engine generation, validation, mixed teams, fixed partners, and standings.

## 0.1.0

- Created initial project structure.
- Added navigable mock screens for the first delivery.
- Added shared mock tournament data and baseline tests.
