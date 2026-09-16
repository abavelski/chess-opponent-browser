# Task 004 — Filter and sort opponent games

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Requires Tasks 001–003 to be merged. Create this work on a dedicated feature branch from the latest `main`.

## Goal

Make the opponent game list useful for actual tournament preparation. A coach rarely wants every known game at once; the immediate preparation set depends on which color the opponent will play, how recent the game is, how strong the opponent was, the result, and where the game came from.

This task should optimize the time from opening a player to a short, relevant list. It should use indexed structured game metadata already stored by Task 003 rather than adding PGN parsing or analysis.

## User value

When this task is complete, the coach can combine useful filters for color, date, opponent rating, result, and source, see how many games remain, and sort the list by recency or opponent strength.

A workflow such as `Opponent as Black` + `Last 2 years` + `Opponent rating >= 2000` should immediately produce the relevant games without leaving the player page.

## Current state

Requires Tasks 001–003.

Before this task starts:

- tournaments and participants exist;
- the coach can search a tournament roster and open a player;
- the player page shows all globally linked games in newest-first order;
- structured fields such as colors, ratings, dates, result, and source are available in the database;
- no filtering or alternate sorting UI exists;
- no interactive game viewer exists yet.

## Scope

Implement filtering and sorting as a complete coach-facing slice on the existing player game list.

### Filters

Support the following initial filters.

#### Color

- `All`
- `Opponent as White`
- `Opponent as Black`

“Opponent” means the selected player whose page the coach is viewing.

#### Date

- `Last 6 months`
- `Last year`
- `Last 2 years`
- `Last 5 years`
- `All`

Date presets are relative to the current date at request/query time. A game with an unknown/unusable date should be included for `All` and excluded from bounded date presets.

#### Opponent rating

- `All`
- `>= 1800`
- `>= 2000`
- `>= 2200`

The rating is the rating of the selected player's opponent in that game, not the selected player's rating. If opponent rating is unknown, include the game for `All` and exclude it when a numeric threshold is active.

#### Result

- `All`
- `Win`
- `Draw`
- `Loss`

Result is always from the selected player's perspective.

#### Source

- `All`
- one option per available source represented in the selected player's known games, for example `Manual`, `TWIC`, or `Danbase` as data becomes available.

Do not hard-code only the example source names if source records already exist in the database.

### Sorting

Support:

- `Newest first` — default;
- `Oldest first`;
- `Strongest opponent first`.

For date sorting, unknown dates should sort after known dates. For strongest-opponent sorting, unknown ratings should sort after known ratings. Choose deterministic secondary ordering so repeated renders do not visibly jump.

### Combination behavior

- Active filters combine with logical AND.
- A change to one filter should preserve the others.
- The page should show the number of games matching the current filter set.
- When no games match, show a specific no-results state and an easy way to clear/reset filters.
- Provide a `Reset`/`Clear filters` action whenever filters differ from defaults.
- Keep defaults simple: all filters set to `All`, sort `Newest first`.

### URL state

Represent filter/sort state in URL query parameters (or an equally durable navigable URL mechanism) so refresh/back/forward navigation preserves the selected preparation set and a coach can copy the current URL. Invalid/unknown query values should fall back safely to defaults rather than crashing.

### Query behavior

Apply filtering/sorting in server/database query logic rather than fetching the full global game library and filtering everything in the browser. It is acceptable for small UI state controls to be client components.

Add or adjust indexes when the implemented query plan reasonably benefits from them. Do not create speculative indexes for deferred features.

## UX requirements

Representative flow:

1. Open `Copenhagen Open 2026`.
2. Search `Jan Kowalski`.
3. Open Jan's player page.
4. Select `Opponent as Black`.
5. Select `Last 2 years`.
6. Select `>= 2000` for opponent rating.
7. See a matching count such as `12 games`.
8. Change sorting to `Strongest opponent first`.
9. Refresh the browser and confirm the same filters/sort remain active.
10. Clear filters and return to all games, newest first.

Controls should be compact enough for rapid repeated use on a laptop. On tablet, controls may wrap or use select menus, but they must remain easy to operate without horizontal page overflow.

Do not require an `Apply` button unless necessary for a deliberate server interaction pattern; immediate application after changing a control is preferred when it can be implemented clearly and accessibly.

## Data / schema changes

No new core domain entity is expected.

Schema changes should be limited to indexes or small metadata adjustments proven necessary for the implemented query path.

Important invariants:

- queries are based on the selected Player's canonical links to White/Black sides;
- opponent rating is derived from the opposite side in each game;
- result is interpreted from the selected Player's perspective;
- games remain global and are not copied or tagged per tournament simply to support filters.

If a migration is added for indexes, generate and commit it normally.

## Server behavior

- Parse and validate URL filter/sort parameters server-side.
- Unsupported values must fall back to safe defaults.
- Apply all active filters as AND conditions.
- Color logic must work correctly whether the selected Player is linked as White or Black.
- Rating filtering must inspect the opposite side's rating.
- Result filtering must map `1-0`, `0-1`, and `1/2-1/2` correctly relative to selected-player color.
- Date thresholds should be calculated consistently and not depend on browser timezone surprises. Treat stored chess dates as game dates rather than user-local timestamps where appropriate.
- Unknown dates/ratings follow the inclusion/exclusion rules in Scope.
- Source filtering must use provenance/source identity rather than searching display strings in PGN text.
- Preserve not-found handling for invalid tournament/player routes.
- Database failures should render a controlled error state and never expose sensitive internals.

## Explicitly out of scope

- Interactive board/game viewer.
- Opening-tree or position-based filters.
- Free-text PGN search.
- Engine evaluation filters.
- Representative-game ranking or AI relevance ranking.
- Saved filter presets/user preferences.
- Pagination/infinite scrolling unless real fixture volume makes it necessary to keep the page functional.
- PGN upload/import.
- Editing games or metadata.
- Tournament-specific copies of game records.

## Acceptance criteria

- [ ] Coach can filter by selected player as White/Black/All.
- [ ] Coach can filter by Last 6 months, Last year, Last 2 years, Last 5 years, or All.
- [ ] Coach can filter by opponent rating All/`>=1800`/`>=2000`/`>=2200`.
- [ ] Coach can filter by Win/Draw/Loss from the selected player's perspective.
- [ ] Coach can filter by source using available source records.
- [ ] Multiple active filters combine correctly with AND semantics.
- [ ] Matching game count is visible.
- [ ] No-results state is understandable and offers a clear reset path.
- [ ] Sorting supports newest first, oldest first, and strongest opponent first.
- [ ] Newest first remains the default.
- [ ] Unknown dates/ratings are handled according to the documented rules and never crash the page.
- [ ] Filter/sort state survives browser refresh and normal back/forward navigation through URL state.
- [ ] Invalid query parameter values fall back safely.
- [ ] Filtering occurs in server/database query logic rather than by loading the entire global game library into the browser.
- [ ] Existing tournament/player/game-list functionality continues working.
- [ ] Page remains usable at tablet widths.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] If a migration is introduced, it succeeds on the Preview database.
- [ ] Vercel Preview deployment supports the representative preparation flow.

## Automated tests

Add high-value tests for filter semantics, ideally against extracted query/filter mapping logic or a testable repository layer:

- selected player as White + `Opponent as White/Black` behavior;
- selected player as Black + color behavior;
- opponent-rating threshold uses the opposite side rating;
- unknown opponent rating is excluded only when a threshold is active;
- perspective Win/Draw/Loss mapping for both selected-player colors;
- bounded date filters exclude unknown dates and apply the correct threshold;
- source filter maps to source/provenance identity;
- sort handling places unknown dates/ratings last;
- invalid URL enum values resolve to defaults.

A few table-driven tests are preferable to many brittle UI snapshot tests.

## Manual validation

Using fixture data on the Vercel Preview deployment:

1. Open a seeded player with games as both White and Black.
2. Select `Opponent as Black` and confirm only games where the selected player is Black remain.
3. Select `Last 2 years` and confirm older/unknown-date games are removed.
4. Select `>= 2000` and confirm the threshold applies to the selected player's opponents, not the selected player's own ratings.
5. Select each result value and verify perspective logic using known fixture games.
6. Select a source and confirm only that source remains.
7. Combine color + date + rating + result/source filters and verify the count/list is plausible from fixture data.
8. Sort strongest opponent first and verify descending opponent rating with unknowns last.
9. Copy the filtered URL, reload it, and confirm the same controls and game set appear.
10. Force a combination with no matches and confirm the no-results/reset experience.
11. Check an iPad/tablet viewport for overflow/usability.
12. Confirm `/api/health` succeeds.

## Deployment considerations

A migration may be needed for indexes; no new domain table is expected.

- If schema/index changes are made, generate and commit the Drizzle migration and apply it to Neon `preview` before Preview validation.
- Keep migrations additive and compatible with existing data.
- No new environment variables or services should be required.
- Do not introduce background jobs or caches for this initial query volume without evidence they are necessary.

If no migration is needed, deployment considerations are otherwise **None** beyond normal CI and Preview validation.

## Completion requirements

The implementation worker should:

1. create an appropriately named feature branch;
2. implement only this task and the minimum supporting changes it requires;
3. run validation locally where possible;
4. push changes;
5. confirm CI;
6. apply any required migration to the correct Preview database and confirm Vercel Preview deployment;
7. fix failures;
8. create a pull request into `main`;
9. report:
   - PR URL;
   - Preview URL;
   - CI status;
   - migration status (`none` if not applicable);
   - manual validation result.

Do not merge unless explicitly requested.
