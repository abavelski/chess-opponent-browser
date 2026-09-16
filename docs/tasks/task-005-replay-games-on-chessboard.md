# Task 005 — Replay games on a chessboard

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Requires Tasks 001–004 to be merged. Create this work on a dedicated feature branch from the latest `main`.

This task completes the **First Coach-Usable MVP** defined in `docs/implementation-plan.md`.

## Goal

Complete the core coach workflow by turning a filtered game row into an interactive game-review experience. The coach should be able to move rapidly through a selected game without desktop chess database software.

The viewer must consume the structured move data stored with the global Game record. It should not parse the original PGN on every page view. The viewer should also preserve comments and PGN variations present in the stored representation because those are part of useful chess source data even though engine analysis is deferred.

## User value

When this task is complete, the coach can open any listed game, see the board and notation, step forward/backward through moves, jump to the start/end, click notation to reach a position, and inspect comments/variations on desktop, laptop, or iPad/tablet.

Together with Tasks 001–004, this makes the application usable for genuine opponent preparation with manually/fixture-loaded data.

## Current state

Requires Tasks 001–004.

Before this task starts:

- tournaments and searchable opponent rosters exist;
- globally stored games appear on player pages;
- game metadata can be filtered/sorted into a useful preparation set;
- game records contain original PGN/raw metadata and a stored structured move representation intended for replay;
- game rows do not yet open an interactive board.

## Scope

Implement the complete game-viewer vertical slice.

### Navigation into the viewer

- Make each game row/list item open a dedicated game-viewer route.
- Preserve enough tournament/player/filter context in navigation so the coach can return to the preparation list without restarting the workflow. Browser Back is acceptable if state already lives in the URL; a clear back link is preferred.
- The viewer must load the Game from the database and use its structured move representation.

### Chessboard

Provide an interactive board that displays the position at the currently selected move.

Required controls:

- beginning of game;
- previous move;
- next move;
- end of game.

The board should update immediately when a control or notation move is selected.

A simple board-flip control is useful and may be included if it fits cleanly. Do not add analysis/evaluation panels.

### Notation

Display readable move notation for the main line and stored PGN variations.

- Clicking a main-line move must jump to that position.
- Clicking a move within a variation must display the corresponding variation position and keep the selected move visually identifiable.
- Comments attached to positions/moves must be visible in a way that preserves reading context.
- The current move/position should be visually highlighted in the notation.
- The UI must tolerate games with no comments or no variations.

The worker may choose an appropriate chessboard/rendering library and chess position library, but dependencies should be focused and actively maintained. Avoid introducing an engine or large analysis stack.

### Keyboard and touch behavior

- Board controls must have usable hit targets on touch/tablet.
- Left/right arrow-key navigation is recommended for desktop/laptop if it can be implemented accessibly without conflicting with form controls, but it is not required if it materially expands scope.
- Buttons need accessible names and disabled states at the beginning/end where appropriate.

### Game metadata

Show enough context above/beside the board to confirm which game is open:

- White and Black names;
- ratings when known;
- result;
- event/date when known;
- ECO/opening when known;
- source.

Do not duplicate the full player-list filter UI inside the viewer.

### Error handling

If a Game exists but its stored move representation is missing/corrupt, render metadata plus a controlled `Game moves unavailable` state rather than crashing the page. This should be exceptional because Task 003 fixtures should already validate the stored shape.

## UX requirements

Representative coach flow:

1. Open a tournament and opponent.
2. Apply preparation filters from Task 004.
3. Click a game.
4. See board + notation + game metadata without needing another desktop application.
5. Click `Next` repeatedly to replay the main line.
6. Click an earlier notation move and verify the board jumps back.
7. Open/click a stored variation and verify the board follows it.
8. Read any comment associated with the current line/position.
9. Jump to the beginning, then to the end.
10. Use the browser/back link and return to the previously filtered opponent list.

### Responsive expectations

Desktop/laptop:

- board and notation should both fit comfortably in the normal viewport where practical;
- notation may sit beside the board on wider screens.

Tablet/iPad:

- board must remain fully usable and sized to the available width;
- notation may move below the board;
- controls must remain touch-friendly;
- no horizontal page scrolling should be required for the primary experience.

Phone-specific optimization is not a milestone requirement, but the page should not catastrophically break on narrow screens.

## Data / schema changes

No new core domain entity is expected if Task 003 stored an adequate structured move representation.

If the Task 003 move shape proves insufficient for correct comments/variations, make the smallest backward-compatible schema adjustment needed to represent a move tree. Any migration must preserve existing games or provide a deterministic conversion for fixture data.

Important invariants:

- the viewer reads stored parsed/structured moves;
- original PGN remains preserved for provenance/debugging but is not the normal render-time source of truth for navigation;
- game identity remains global and independent of Tournament;
- comments and variations must not be discarded merely to simplify the viewer.

## Server behavior

- Fetch Game data server-side by stable ID.
- Return a not-found response for an unknown game ID.
- Only send viewer data required by the page/client components; never expose server secrets.
- Validate/deserialise the stored structured move shape before handing it to interactive viewer logic.
- Do not parse original PGN as the ordinary request-time path.
- If move data is invalid, return/render a controlled unavailable state and log enough server-side context to diagnose the bad record without leaking internal details to the user.

## Explicitly out of scope

- Stockfish or any chess engine.
- Evaluations, best lines, blunder detection, or engine arrows.
- AI/LLM summaries.
- Opening statistics.
- Position search.
- Repertoire overlays/intersection.
- Lichess Study export/sync.
- Editing moves/comments/variations.
- Drawing arrows/highlights as saved annotations.
- PGN upload/import UI.
- Representative-game ranking.
- Offline packs.

## Acceptance criteria

- [ ] Every game row can open a dedicated viewer route.
- [ ] Viewer displays White/Black, result, and available event/date/rating/opening/source metadata.
- [ ] Board renders the initial position correctly.
- [ ] `Next` and `Previous` controls update the board one ply/move at a time as designed.
- [ ] Beginning/end controls jump to the correct positions.
- [ ] Clicking main-line notation jumps the board to the selected position.
- [ ] Stored PGN variations are rendered and their moves are clickable/navigable.
- [ ] Stored comments are visible in their correct context.
- [ ] Current notation position is visibly identifiable.
- [ ] Controls have appropriate disabled/accessibility behavior at line boundaries.
- [ ] Viewer works well at desktop/laptop widths.
- [ ] Viewer remains usable at iPad/tablet widths with touch-friendly controls and no primary horizontal overflow.
- [ ] Returning from the viewer preserves/reaches the prior filtered preparation list without forcing the coach to rebuild it.
- [ ] Ordinary viewer requests use stored structured moves and do not repeatedly parse original PGN.
- [ ] Corrupt/missing move data produces a controlled state rather than a crash.
- [ ] Existing tournament/player/filter flows continue working.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] If a migration is introduced, it succeeds on Preview.
- [ ] Vercel Preview deployment supports full replay of fixture games with comments/variations.

## Automated tests

Focus on viewer state logic that is deterministic and valuable:

- initial position maps to move index/root correctly;
- next/previous boundaries do not underflow/overflow;
- jump-to-move produces the expected FEN/position for a known short fixture game;
- a variation branch can be selected independently of the main line;
- comments remain associated with the correct move/node;
- invalid structured move data is rejected into the controlled unavailable path;
- game metadata formatting handles missing optional values.

If a third-party board component is used, do not over-test the library itself. Test the application's move-tree/navigation adapter and manually validate rendering/interactions.

## Manual validation

Use a fixture game containing at least one comment and one variation on the Vercel Preview deployment:

1. Open a tournament, player, and filtered game list.
2. Open the fixture game.
3. Confirm the starting position and metadata are correct.
4. Advance several moves and verify board positions against notation.
5. Move backward several moves.
6. Click a notation move in the middle and verify the board jumps correctly.
7. Click into the stored variation and verify the expected branch position is shown.
8. Confirm the fixture comment is visible in the right context.
9. Jump to the beginning and end.
10. Verify disabled-state behavior at the beginning/end.
11. Return to the opponent page and confirm the previously selected filters/sort remain available through URL/back navigation.
12. Repeat core navigation at an iPad/tablet viewport using touch/click controls.
13. Confirm `/api/health` succeeds.

## Deployment considerations

Prefer no schema migration if the Task 003 structured move model is adequate.

If a schema adjustment is necessary:

- generate and commit the migration;
- migrate existing fixture data safely;
- apply the migration to Neon `preview` before Preview validation;
- keep the change backward compatible with existing Game records or explicitly handle older records with the controlled unavailable state.

New frontend dependencies for board/position rendering are allowed when necessary, but keep them focused and commit the lockfile changes. No new hosted service or environment variable should be required.

## Completion requirements

The implementation worker should:

1. create an appropriately named feature branch;
2. implement only this task and the minimum supporting changes it requires;
3. run validation locally where possible;
4. push changes;
5. confirm CI;
6. apply any required migration and confirm Vercel Preview deployment;
7. fix failures;
8. create a pull request into `main`;
9. report:
   - PR URL;
   - Preview URL;
   - CI status;
   - migration status (`none` if not applicable);
   - manual validation result, including desktop and tablet replay.

Do not merge unless explicitly requested.
