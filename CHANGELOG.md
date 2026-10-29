# Changelog

## Unreleased

- STEP 37B: The keep-alive workflow calls lezgotournament.vercel.app, because app.lezgopadel.dk has no DNS record pointing to Vercel (first run failed with no connection). README notes the missing DNS record.
- STEP 37A: Scheduled GitHub Actions workflow keeps the Supabase database active by calling a read-only production endpoint every second day. The project had been paused for inactivity (found 2026-10-29), which stops login, accounts, cloud saving and shared result links.
- STEP 36B: README describes guest vs. account storage, recommends `npm ci` and documents the Vercel deployment; CHANGELOG now lists STEP 28-31 (0.25.0); removed the unused GitHub Pages build switches (`GITHUB_PAGES`) from the code.
- STEP 36A: Fixed long player names overlapping the numbers in the live standings on laptop screens between 1024 and 1279 px wide (two-column live layout). Those widths now use slightly narrower number columns and normal text size; the large text starts at 1280 px. Phone, tablet and wide screens are unchanged. Below 360 px (small phones) the V/U/T columns are hidden so long names such as "Christoffersen" no longer run into the numbers; MP, Point and +/− stay visible. The browser tests now also check a 1180 px laptop and use long surnames.
- STEP 35A: New PDF design "Resultattavle" (owner choice): dark sidebar with logo, title, winner (or leader while running) and facts; main column with the final standings including a signed +/- column and one compact line per match grouped by round, winners in bold. Rounds are never split across pages; continuation pages repeat a slim sidebar. A running tournament shows "STILLING" and "FØRER" instead of "SLUTSTILLING" and "VINDER". Text is measured with real Helvetica widths, which fixes overlapping text in the old Overblik box. Pool-play PDFs are unchanged.
- STEP 34A: Added Playwright browser tests to CI. Every pull request now plays a full guest Fast Makker Americano tournament on phone (390 and 320 px) and tablet landscape, checks standings, +/− values, final standings, the PDF, the version label, and that the update notice does not appear on a first visit.
- STEP 33C: The "Ny version klar" notice no longer appears on the first visit (the service worker taking control of a fresh install is not an update), is shown at the top of the screen instead of over the score dialog's Gem button, and has a close button.
- STEP 33A: Added a +/− point difference column to the live standings, the finished-tournament standings, and the PDF (shown with sign, for example +4 and -4). Column widths were tightened so phone and tablet-landscape layouts keep the same name width as before; very long names may wrap to three lines on 320 px phones. The finished-tournament standings now use the same compact table as the live standings, so they fit on phone screens without sideways scrolling. Shared result links that contain the full tournament use the same table; older snapshot-only links are unchanged.
- STEP 33B: The home page shows the app version (short commit) at the bottom, marked "Testversion" on Vercel preview deployments, so testers can see which version they are using.
- STEP 32B: Removed the GitHub Pages workflow. Vercel is the only deployment target. The `GITHUB_PAGES` build switch in `next.config.ts` is left in place but is no longer used by any workflow.
- STEP 32A: Overall point difference now ranks before internal head-to-head in all standings. The new order also applies when finished tournaments are shown again.

## 0.25.0

- STEP 28A: Compact tablet-landscape layout for the live tournament page (courts in a 2 by 2 grid beside the standings); wider tablet-landscape detection.
- STEP 28B: Fixed validation of free scoring in timed tournaments.
- STEP 29A: Read-only sharing of completed tournaments via a result link.
- STEP 29C: Redesigned completed-tournament PDF (later replaced by the STEP 35A "Resultattavle" design).
- STEP 30B: Tournament fairness proof test infrastructure.
- STEP 30C: Americano automatic cycles with fair byes, shown in the live UI; fixed saving scores in later cycles.
- STEP 30D: Fast Makker Americano automatic cycles; improved bye order for 4 pairs.
- STEP 30E: Mixed Americano automatic cycles.
- STEP 30F: Open-ended Mexicano rounds generated from the live standings.
- STEP 30G: Open-ended Fast Makker Mexicano rounds; fixed ranking-based pairings.
- STEP 31A: Fixed cloud creation and live session continuity between devices.
- STEP 31B: Total-score input works in both directions (either side can be entered first).
- STEP 31C: Improved delete and finish controls in the tournament list.

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
- Added one-input fixed-total score registration for Americano live matches with automatic opponent score calculation.
- Added 16-player, 4-court, 8-round Americano regression coverage for free, fixed-total, and timed scoring.
- Added shared fixed-total score calculation and kept invalid Fast Makker Americano saves inside the live UI instead of crashing the page.
- Kept fixed target-score validation errors inside the live UI instead of showing the Next.js runtime error page.
- Added cyclic Americano and Fast Makker Americano rotation so pairings/opponents restart cleanly after each complete cycle.
- Added selectable timer alarm sounds with settings persistence and safe preview/playback.
- Balanced courts for Americano and Fast Makker Americano without changing generated matchups.
- Repeated the selected timed-round alarm three times from a single expiry trigger.
- Locked Mixed Americano tests for mixed-pair invariants, 8-round partner cycles, court balance, scoring, and result editing.
- Extended Mixed Americano coverage to the 10-round, 16-player, 4-court main scenario with cycle restart, scoring modes, and player court-history checks.
- Displayed Mixed Americano teams in male/female order while preserving mixed-pair rotation rules.
- Rebalanced older saved Mixed Americano court assignments on load so legacy tournaments no longer keep players locked to one court.
- Rebalanced older saved Fast Makker Americano court assignments on load using fixed-pair history without changing opponent cycles.
- Locked Mexicano and Fast Makker Mexicano live ranking mode after tournament start and verified ranking-driven court assignment without court balancing.
- Regenerated unplayed future Mexicano and Fast Makker Mexicano rounds after previous result edits while preserving already scored future rounds.
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
