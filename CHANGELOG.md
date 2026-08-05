# Changelog

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
