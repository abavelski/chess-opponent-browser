# Task 007 — Persist PGN imports

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Requires Tasks 001–006 to be merged. Create this work on a dedicated feature branch from the latest `main`.

## Goal

Turn the parse preview from Task 006 into a real administrator ingestion workflow. After reviewing a PGN preview, the administrator should be able to confirm the import and persist successfully parsed games, their original PGN/provenance, and safe links to existing canonical Players.

This task deliberately does not implement robust duplicate detection yet. Task 008 owns duplicate prevention and durable import-history reporting. The priority here is to prove the end-to-end path from uploaded PGN to a game that immediately appears in the coach's existing player browser.

## User value

When this task is complete, an administrator can upload and preview a PGN file, confirm the import, and then open a safely matched player to see the newly imported game in the normal browse/filter/viewer workflow without manually editing code or database rows.

Games whose player identity cannot be matched conservatively are still preserved, but they remain unresolved instead of being attached to the wrong person.

## Current state

Requires Tasks 001–006.

Before this task starts:

- the coach can browse, filter, and replay global Game records;
- fixture/developer-loaded games already use the same structured game/viewer model;
- the administrator can upload one PGN file and preview multiple parsed games without persistence;
- no persistent Import entity/history exists;
- uploaded PGN games are not yet written to the database;
- duplicate detection for arbitrary imports does not exist.

## Scope

Implement the complete confirm-and-persist import slice.

### Confirm import

Extend the Task 006 preview so an administrator can explicitly confirm saving the parsed result.

The confirmation step should show enough context to avoid accidental imports:

- filename;
- source label;
- number of successfully parsed games;
- number of parse errors that will not be imported.

Only successfully parsed games should be eligible for persistence.

### Import/provenance records

Add a persistent Import concept and enough provenance structure to retain the origin of every imported game.

At minimum preserve:

- import timestamp;
- original filename or equivalent input label;
- source identity/label;
- original PGN segment for each successfully persisted game;
- raw/extra PGN tags not promoted to first-class columns;
- relation from an import item/provenance record to the global Game it created.

Design this so Task 008 can later point duplicate import items at an already-existing Game rather than needing a second Game row. A join/provenance record between Import and Game is acceptable and likely useful, but the exact SQL shape is left to the worker.

### Persist parsed games

Persist the structured metadata and move tree produced by Task 006 into the global Game library in the same representation consumed by Tasks 003–005.

A successfully imported game should be immediately available to existing list/filter/viewer queries if one or both sides are safely linked to canonical Players.

### Conservative identity association

For each White/Black side, try to associate the parsed identity with an existing canonical Player using conservative rules.

Initial matching order:

1. If the PGN contains a usable FIDE ID tag for that side and it exactly matches one existing Player, link that Player.
2. Otherwise, normalize the imported player name and compare it with canonical Player names. Link only when exactly one existing Player is an exact normalized-name match.
3. If zero or multiple candidates remain, store the game side as unresolved with its raw/imported name and metadata. Do not guess.

Task 009 will add aliases/manual resolution. This task should structure matching code so adding exact remembered aliases later is straightforward.

Do not automatically create canonical Players for every unknown PGN name. The game can exist globally with nullable/unresolved side links.

### Partial failures

An import should not be all-or-nothing merely because one game cannot be persisted.

- Successful parsed games should be saved when safe to do so.
- Per-game persistence failures should be reported in the final result.
- A catastrophic failure creating the Import itself or connecting to the database should fail the operation clearly.
- Use transactions at an appropriate granularity so one broken game does not leave a half-written Game/provenance pair.

### Result screen

After confirmation, show a result summary including at least:

```text
Parsed:       N
Imported:     N
Errors:       N
Unresolved sides: N
```

Duplicate count is not required until Task 008 and should not be faked.

Where practical, provide links to canonical Players affected by the import so the administrator can quickly verify that games became visible.

## UX requirements

Expected administrator flow:

1. Open `Import games`.
2. Choose a PGN and source.
3. Preview it.
4. Review counts/game metadata.
5. Click `Import games` / `Confirm import`.
6. See a completion result with parsed/imported/error/unresolved counts.
7. Click a matched player link or navigate to a tournament participant.
8. See the newly imported game in that player's game list.
9. Open the game and replay it using the existing viewer.

The UI must clearly distinguish parse errors from unresolved identity. An unresolved name is not a failed game import.

## Data / schema changes

Conceptually add or extend:

### Import

- stable ID;
- timestamp;
- source reference or source label relationship;
- original filename/input label;
- summary/status fields as useful for this slice.

### Import item / game provenance

A per-game provenance record should connect the import to the global Game and preserve source-specific raw PGN/tags. This relationship should be compatible with Task 008 assigning a later duplicate import item to an existing Game.

### Game side identity

Ensure White/Black canonical Player links can be nullable while raw imported names/ratings/IDs remain preserved.

Important invariants:

- canonical Player links are optional;
- raw source names are never replaced/destroyed by canonical links;
- imported structured moves/comments/variations match the viewer's stored representation;
- original PGN/raw tags are preserved in provenance;
- one game's persistence must not create only half of its required Game/provenance data;
- do not add unsafe normalized-name uniqueness to the Player table merely to simplify matching.

Generate and commit the required Drizzle migration(s).

## Server behavior

- Revalidate/secure the preview-to-confirm boundary. Do not trust client-submitted parsed JSON as authoritative if it could be tampered with; either reparse the uploaded payload, use a server-owned short-lived representation, or otherwise ensure persisted game data comes from trusted server parsing.
- Enforce the same upload constraints used in Task 006.
- Match FIDE IDs exactly when a usable ID is present.
- Normalize names consistently with existing Player search/identity utilities, but only auto-link a name when exactly one canonical Player matches.
- If multiple same-name canonical Players exist, leave the side unresolved.
- Unresolved side identity must not prevent the Game itself from being stored.
- Persist original source data and extra tags.
- Database failures must not expose sensitive internals.
- Keep individual game save units transactional enough to avoid orphaned or half-written provenance records.
- Existing player pages should discover imported games through canonical Player links without special tournament-specific copies.

## Explicitly out of scope

- Duplicate detection/skipping for arbitrary imports.
- Import-history browsing beyond the immediate result screen.
- Multiple file upload.
- Remote/scheduled imports.
- Creating canonical Players automatically for every imported name.
- Fuzzy identity matching.
- Player aliases/manual resolution UI.
- FIDE API lookup.
- Editing imported PGN/game metadata.
- Deleting/rolling back an import.
- Stockfish/AI/opening analysis.

## Acceptance criteria

- [ ] Administrator can confirm a successful Task 006 preview and persist games.
- [ ] Successfully parsed games are stored as global Game records using the existing structured viewer model.
- [ ] Import/source/provenance records preserve filename/source, original PGN segment, and extra/raw tags.
- [ ] Existing Player is linked by exact FIDE ID when a usable matching ID is present.
- [ ] Without a matching FIDE ID, exactly one normalized canonical-name match may be linked.
- [ ] Zero or multiple name matches remain unresolved rather than being guessed.
- [ ] Unknown imported names do not automatically create canonical Player records.
- [ ] Unresolved game sides retain their raw name and available metadata.
- [ ] A safely linked imported game appears immediately on the canonical Player's existing game list.
- [ ] Imported games participate in existing color/date/rating/result/source filters.
- [ ] Imported game opens successfully in the existing viewer with comments/variations preserved.
- [ ] One per-game persistence failure can be reported without necessarily losing other successful games in the import.
- [ ] Final result distinguishes imported games, errors, and unresolved sides.
- [ ] Existing fixture games and coach workflows continue working.
- [ ] Migration succeeds on Preview.
- [ ] `GET /api/health` succeeds.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] Vercel Preview supports upload → preview → confirm → browse → replay end to end.

## Automated tests

Prioritize identity and persistence-boundary tests:

- exact FIDE-ID match links the correct existing Player;
- no FIDE ID + exactly one normalized canonical-name match links that Player;
- no name match remains unresolved;
- multiple normalized same-name candidates remain unresolved;
- unresolved identity does not prevent Game persistence mapping;
- original PGN/extra tags survive the mapping into provenance;
- structured comments/variations survive into the persisted viewer representation;
- one simulated per-game persistence failure produces a failed item/result without corrupting a successful sibling item's data unit;
- client cannot alter a trusted server parse result into arbitrary persisted move data through the confirmation boundary.

Do not attempt to solve duplicate behavior in these tests yet except ensuring the task does not claim deduplication.

## Manual validation

Against the migrated Vercel Preview deployment:

1. Ensure a tournament contains a known player such as `Jan Kowalski` with a test FIDE ID.
2. Upload a PGN containing Jan's exact FIDE ID and at least one game; preview and confirm it.
3. Verify the import result reports the game as imported and the side as resolved.
4. Open Jan's player page and confirm the game appears.
5. Apply an existing filter that should include the game.
6. Open and replay the imported game; verify any test comment/variation is preserved.
7. Upload/import a game for a deliberately unknown player name and confirm the game imports while the side is reported unresolved.
8. If practical, create two same-name Player records without FIDE IDs, import that exact name, and verify the side stays unresolved rather than being guessed.
9. Verify existing fixture games remain available.
10. Confirm `/api/health` succeeds.

Note the known limitation in the PR/manual report: repeated imports can still create duplicate Games until Task 008.

## Deployment considerations

This task introduces persistent Import/provenance schema.

- Generate and commit Drizzle migration(s).
- Apply them to Neon `preview` before testing the Preview import flow.
- Ensure existing Game/Source fixture data remains readable. If provenance schema changes existing fixture representation, include a safe migration/backfill or compatibility path.
- Do not run migrations automatically in Vercel builds.
- No file-storage service should be necessary if original PGN segments fit comfortably in PostgreSQL text/JSON storage for this phase.
- No new environment variables should be required unless the chosen secure preview-confirm mechanism genuinely needs one; prefer avoiding new infrastructure.

## Completion requirements

The implementation worker should:

1. create an appropriately named feature branch;
2. implement only this task and the minimum supporting changes it requires;
3. run validation locally where possible;
4. push changes;
5. confirm CI;
6. apply required migrations to the correct Preview database and confirm Vercel Preview deployment;
7. fix failures;
8. create a pull request into `main`;
9. report:
   - PR URL;
   - Preview URL;
   - CI status;
   - migration status;
   - manual validation result, including a safely matched and an unresolved import case.

Do not merge unless explicitly requested.
