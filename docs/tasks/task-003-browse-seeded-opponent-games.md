# Task 003 — Browse seeded opponent games

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Requires Tasks 001 and 002 to be merged. Create this work on a dedicated feature branch from the latest `main`.

## Goal

Deliver the first real chess-preparation screen before investing in a self-service import system. The coach should be able to open a tournament opponent and immediately scan that player's known games from a global game library.

This task intentionally uses deterministic developer/fixture-loaded game data. That is enough to validate whether the player page and game-list information are useful. The web-based PGN import flow comes later in Tasks 006–008.

## User value

When this task is complete, the coach can open an opponent from a tournament and see a useful list of all known games associated with that player, including date, color, opponent, opponent rating, result, event, ECO/opening when available, and source.

A developer/administrator can load a small repeatable data set into the Preview database so the coach can test the real browsing workflow without waiting for self-service imports.

## Current state

Requires Tasks 001 and 002.

Before this task starts:

- tournaments can be created and opened;
- administrators can add potential opponents to a tournament;
- tournament rosters can be searched;
- a player page exists but only shows identity/tournament information and `No known games yet`;
- no global Game or Source schema exists;
- no PGN parser/import UI exists.

## Scope

Implement a global game-library slice plus a deterministic way to populate enough data for human testing.

### Global game data

Add the minimum schema necessary to represent a chess game globally and associate each side with a canonical Player when known.

Store structured metadata sufficient for the initial list and later filtering/viewer tasks, including where available:

- White and Black player links;
- raw/display White and Black names so imported/source identity is not lost;
- White and Black ratings;
- date;
- result;
- event;
- site and round if available;
- ECO and opening name if available;
- source/provenance reference;
- original PGN or equivalent raw PGN payload for fixture games;
- a structured move representation that can support Task 005 without reparsing PGN on each view.

The exact SQL shape is intentionally not prescribed. It is acceptable to store raw tags or structured moves in JSON where appropriate, provided commonly filtered/listed fields are represented in queryable columns.

### Source data

Add a simple Source concept so fixture/manual data has explicit provenance and Task 004 can later filter by source. A source should have a human-readable label such as `Manual` or `Fixture`.

### Developer/fixture loading

Add a small, deterministic, documented, idempotent developer data-loading mechanism suitable for the shared Preview database. Examples include a TypeScript seed script or equivalent project-native fixture loader.

Requirements for fixture loading:

- it must not run automatically during Vercel builds;
- it must be safe to run repeatedly without creating duplicate copies of the same fixture records;
- it must clearly distinguish fixture/demo data from real production data;
- it should create enough games to exercise both White/Black appearances, wins/draws/losses, different dates, opponent ratings, and at least two sources if practical;
- it should preserve original PGN text for the fixture games and populate the stored structured move representation rather than requiring the player page to parse PGN at read time;
- it should associate at least one fixture tournament participant with multiple games so the list is meaningful.

Do not build a general web importer in this task. The seed mechanism may be code/fixture based.

### Player game list

Extend the player page so it queries the global game library by canonical Player identity, not by Tournament ownership.

For each game show, when available:

- date;
- selected player's color;
- opponent name;
- opponent rating;
- result from the selected player's perspective (`Win`, `Draw`, `Loss`);
- event;
- ECO/opening;
- source.

Default order should be newest first. Unknown dates should not crash ordering and should appear after known dates unless a clear alternative is documented.

The page should display all globally known games linked to the Player, even if those games were loaded for another tournament context. Tournament context may remain in the route/navigation so the coach can go back to the current event.

At the end of this task, game rows do not need to open an interactive viewer yet. Task 005 owns that capability.

## UX requirements

Expected coach flow:

1. Open a tournament.
2. Search for an opponent.
3. Open the opponent.
4. See a game list instead of `No known games yet` when seeded games exist.
5. Scan date, color, opponent, opponent rating, result, event, opening/ECO, and source without opening another page.
6. If no games exist for another player, see the existing clear empty state.
7. Navigate back to the tournament roster easily.

Game rows should remain scannable on a laptop. On narrower tablet layouts, it is acceptable to wrap secondary metadata or use a card-like presentation, but the critical fields (date, color, opponent, result) must remain easy to identify.

## Data / schema changes

Conceptually add:

### Game

A global logical game with stable primary key, structured metadata, both side identities, and stored moves.

Important invariants:

- a Game is not owned by a Tournament;
- either side may have a nullable canonical Player link so future unresolved imports are possible;
- raw White/Black names remain available even when a Player link exists;
- result is stored in a standard game form (for example `1-0`, `0-1`, `1/2-1/2`, or unknown) and converted to Win/Draw/Loss relative to the selected player in query/view logic;
- date may need to tolerate incomplete/unknown PGN dates in the future; do not design a constraint that makes realistic PGN data impossible to store;
- original PGN/raw metadata is preserved;
- parsed/structured moves are persisted and are not recomputed on ordinary player-page reads.

### Source / provenance

Add a source record or equivalent provenance model with a stable ID and display label. Keep the model extensible enough that later Import records can reference it.

### Indexing

Add indexes needed for the current query path: finding games where the selected Player is White or Black and ordering by date. Do not prematurely add every future filter index before measuring/querying the implemented workload.

Generate and commit the required Drizzle migration(s).

## Server behavior

- Player game queries must be server-side and use the database rather than embedding fixture data in React components.
- Query games where the selected Player is linked on either side.
- Compute selected-player color, opponent identity/rating, and perspective result consistently.
- Do not infer opponent identity by comparing names when canonical links exist.
- Unknown optional fields should render as an unobtrusive placeholder such as `—`, not cause errors.
- Invalid player/tournament route combinations should retain the not-found behavior established earlier.
- Fixture loading must fail clearly on malformed fixture data and must not partially create duplicate fixture rows on repeated runs.
- Ordinary page rendering must not parse original PGN text.

## Explicitly out of scope

- Filtering controls beyond the default newest-first list.
- Alternate sorting controls.
- Interactive board/game viewer.
- User-facing PGN upload or import.
- General PGN parsing infrastructure for arbitrary uploads.
- Duplicate detection for arbitrary real-world imports.
- Import history.
- Fuzzy player matching.
- Manual identity resolution.
- Opening statistics or aggregation.
- Engine analysis.
- Editing/deleting games.

## Acceptance criteria

- [ ] Global Game data exists independently of Tournament records.
- [ ] Source/provenance exists and is displayed in the game list.
- [ ] A documented idempotent fixture/seed mechanism can populate meaningful Preview data.
- [ ] Re-running the fixture loader does not create duplicate fixture games/players/relationships.
- [ ] Player page lists all globally linked games for the selected Player.
- [ ] Game list shows date, selected-player color, opponent, opponent rating, perspective result, event, ECO/opening when available, and source.
- [ ] Default ordering is newest first with graceful handling of unknown dates.
- [ ] Perspective result is correct whether the selected player was White or Black.
- [ ] A player with no games still shows a clear empty state.
- [ ] Game list works on desktop/laptop and remains usable at tablet widths.
- [ ] Ordinary browsing does not parse PGN text at request/render time.
- [ ] Existing tournament create and opponent-management flows continue working.
- [ ] Existing `GET /api/health` still works.
- [ ] Migration succeeds on the Preview database.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] Vercel Preview deployment renders seeded game data successfully after fixture loading.

## Automated tests

Prioritize tests for the transformations that are easy to get subtly wrong:

- selected player as White produces the correct opponent/color/perspective result;
- selected player as Black produces the correct opponent/color/perspective result;
- draw handling is correct;
- unknown optional metadata does not break list-view mapping;
- fixture identity/fingerprint logic used for idempotent loading is deterministic;
- any structured-move fixture validation needed by the future viewer rejects obviously invalid fixture shapes.

If practical, add a small repository-level test around the query/service mapping without requiring live Neon access. Do not add a broad integration-test platform solely for this task.

## Manual validation

Against the migrated Vercel Preview deployment:

1. Apply migrations and run the documented fixture loader against the Preview database.
2. Open the fixture tournament or create a tournament containing the seeded test player as documented by the fixture.
3. Search for and open the seeded opponent.
4. Verify multiple games appear.
5. Verify at least one game shows the selected player as White and one as Black.
6. Verify Win/Draw/Loss labels are correct from the selected player's perspective.
7. Verify opponent rating, event, opening/ECO, and source values render where fixture data provides them.
8. Refresh and confirm the list persists.
9. Run the fixture loader a second time, refresh, and confirm no fixture game duplicates appear.
10. Open a player with no linked games and confirm the empty state.
11. Check the page at an iPad/tablet viewport and verify the game list remains readable.
12. Confirm `/api/health` succeeds.

## Deployment considerations

This task introduces Game and Source/provenance schema plus fixture data tooling.

- Generate and commit Drizzle migration(s).
- Apply migrations to the Neon `preview` branch before fixture loading and Preview validation.
- Fixture loading must be an explicit developer action, never an automatic Vercel build step.
- Do not seed demo data into Production as part of deployment.
- Ensure the fixture mechanism makes its target database obvious enough to reduce accidental production use.
- Schema changes must remain compatible with existing Tournament/Player data.
- No new hosted service is required.

## Completion requirements

The implementation worker should:

1. create an appropriately named feature branch;
2. implement only this task and the minimum supporting changes it requires;
3. run validation locally where possible;
4. push changes;
5. confirm CI;
6. apply required migrations and fixture data to the correct Preview database and confirm Vercel Preview deployment;
7. fix failures;
8. create a pull request into `main`;
9. report:
   - PR URL;
   - Preview URL;
   - CI status;
   - migration status;
   - fixture/seed status;
   - manual validation result.

Do not merge unless explicitly requested.
