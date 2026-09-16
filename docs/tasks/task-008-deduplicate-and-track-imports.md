# Task 008 — Deduplicate and track imports

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Requires Tasks 001–007 to be merged. Create this work on a dedicated feature branch from the latest `main`.

This task completes the **First Self-Service Import MVP** defined in `docs/implementation-plan.md`.

## Goal

Make repeated administrator imports safe and auditable. By the end of this task, importing a PGN that contains already-known games should not create obvious duplicate global Game rows, and the administrator should be able to see durable import results/history with counts for parsed, imported, duplicate, and failed games.

This task should preserve the architectural rule that one logical chess game is global while allowing more than one source/import to provide provenance for that same game.

## User value

When this task is complete, an administrator can repeatedly upload real PGN files without fear that re-importing the same games will clutter player pages with duplicates. The administrator also gets a durable record of what each import did and can verify how many games were added, skipped as duplicates, or failed.

At this point, new game data can be added self-service through the application and made available to the coach without code or direct database edits.

## Current state

Requires Tasks 001–007.

Before this task starts:

- administrators can upload one PGN file, preview it, and confirm persistence;
- imported games preserve source/original PGN/provenance;
- safely matched player sides become visible in the existing coach workflow;
- unresolved sides are preserved without guessing;
- repeated imports may still create duplicate Game rows;
- an Import record may exist, but there is no complete duplicate-aware import history UI/result model.

## Scope

Implement duplicate detection, provenance reuse, and durable import history as one vertical slice.

### Duplicate fingerprint

Introduce a deterministic “obvious duplicate” identity for imported games.

The exact algorithm may be chosen by the worker, but it must be documented in code and satisfy these principles:

- it should be based on stable chess/game identity data, not database IDs or file formatting;
- it should normalize irrelevant PGN formatting differences;
- it should include the players/sides and the actual main-line movetext/sequence so two unrelated games between the same players are not collapsed;
- it may also use date/event/round/result when available to reduce accidental collisions;
- it should not depend solely on comments, annotations, source labels, whitespace, or header ordering;
- the same logical game imported from another source with equivalent main-line play should normally be recognized as the same Game;
- when data is too incomplete/ambiguous for a safe duplicate decision, prefer creating a distinct Game over incorrectly merging two different games.

A canonical hash/fingerprint stored/indexed on Game is a reasonable implementation, but the task does not require a specific hashing algorithm.

### Duplicate handling

During confirmed import:

- compute the duplicate identity for each successfully parsed game;
- if no existing Game safely matches, create a new global Game as Task 007 does;
- if an existing Game safely matches, do not create a second Game row;
- still create/import the source/import provenance item and point it to the existing Game so the new source observation is not lost;
- preserve the newly imported original PGN/source metadata in provenance even when the global Game is reused;
- report the item as `duplicate`/`already known`, not as an error.

Do not silently overwrite the canonical Game's useful existing annotations with poorer data. If the new source has richer comments/variations, it is acceptable to keep both source-specific raw PGNs/provenance and leave richer-record merging for later unless a simple, deterministic, non-destructive rule is obvious.

### Import results

Final import result must report at least:

```text
Games parsed:       327
Games imported:     291
Duplicates:          34
Errors:               2
```

Also retain/report unresolved-side counts if Task 007 already does.

Counts must have unambiguous meanings:

- `parsed`: games successfully parsed from input;
- `imported`: newly created global Game records;
- `duplicates`: parsed games linked to an already-existing global Game;
- `errors`: games that could not be parsed or persisted successfully, with enough detail to investigate.

### Import history

Add a durable administrator-facing import history page/list.

Each import entry should show enough information to identify the run:

- timestamp;
- filename/input label;
- source;
- parsed/imported/duplicate/error counts;
- unresolved count if available;
- overall status such as completed/completed-with-errors/failed.

Opening an import detail should show per-game outcomes at a useful summary level, including which items were duplicates and which failed. Avoid dumping full raw PGN for every item by default; provide it only where useful for troubleshooting.

### Existing data/backfill

If Task 007 already created imported/fixture Game rows without a fingerprint, create a deterministic backfill/migration or application-side backfill strategy so existing records participate in duplicate detection. Do not delete existing Games automatically merely because two old rows appear similar unless the rule is demonstrably safe.

## UX requirements

Expected administrator flow:

1. Upload and import a PGN containing several new games.
2. See result counts including imported/duplicate/error.
3. Open Import History and see the run.
4. Import the exact same file again.
5. See `0` new imported games (assuming no prior errors changed) and the valid games counted as duplicates.
6. Open a matched player's page and confirm each game appears only once.
7. Open the second import detail and confirm its provenance/items still exist even though the global Games were reused.

The import history should prioritize clarity over dense database terminology. `Already known` is acceptable user-facing copy for duplicate items.

## Data / schema changes

Conceptually add/extend:

### Game duplicate identity

- a stored canonical duplicate fingerprint/hash or equivalent indexed identity;
- uniqueness only where the fingerprint is considered safe enough to enforce it;
- compatibility with existing fixture/imported Games.

### Import summary

Persist the counts/status needed to render history efficiently, or derive them reliably from import items if that remains performant and simple.

### Import item/provenance

Ensure an import item can point to either:

- a newly created Game; or
- an already-existing Game detected as duplicate.

It should also preserve its own source-specific original PGN/raw tags/outcome.

Important invariants:

- duplicate detection never creates tournament-specific Game copies;
- duplicate import provenance is retained;
- obvious duplicates do not create a second Game row;
- provenance from one source is not destroyed when another source reports the same logical Game;
- import result counts reconcile with per-item outcomes;
- collision/ambiguity must fail safe rather than merging unrelated Games.

Generate and commit required Drizzle migration(s).

## Server behavior

- Generate fingerprints from a canonical server-side parsed representation, not from untrusted client values.
- Normalize player names/identifiers and main-line moves consistently.
- Handle concurrent/import-race duplicates safely. If a unique index is used, catch the race and attach provenance to the winning existing Game rather than surfacing a raw database error.
- Run each game/provenance persistence unit transactionally enough to avoid orphaned records.
- Mark duplicate outcomes explicitly.
- Preserve Task 007 conservative identity matching independently of duplicate detection; recognizing the same Game must not force unsafe canonical Player merges.
- Keep parse errors and persistence errors distinguishable in details, even if both contribute to the headline `Errors` count.
- History/detail routes must not expose credentials, raw stack traces, or unrestricted server internals.
- Do not reparse the original PGN when rendering ordinary import history if structured result/provenance data is already stored.

## Explicitly out of scope

- Sophisticated near-duplicate/fuzzy game matching.
- Automatically merging pre-existing duplicate Game rows from before this task.
- Choosing the “best” annotated version of a duplicate game.
- Multiple-file upload in one submission.
- Import rollback/deletion.
- Scheduled/source synchronization.
- Manual player-identity resolution (Task 009).
- FIDE API lookup.
- Opening statistics, engine analysis, AI summaries, representative-game ranking.

## Acceptance criteria

- [ ] Every newly imported game receives a deterministic duplicate identity suitable for the documented obvious-duplicate rule.
- [ ] Re-importing the exact same valid PGN games does not create additional global Game rows.
- [ ] A duplicate import item still preserves its source/original PGN provenance and points to the existing Game.
- [ ] Same logical game from a second source can be recorded as new provenance without duplicating the Game.
- [ ] Duplicate handling does not collapse two games merely because player names/event are similar if movetext/identity differs.
- [ ] Final import result shows parsed, imported, duplicate, and error counts with documented meanings.
- [ ] Unresolved-side reporting from Task 007 remains available.
- [ ] Administrator can open an import history list.
- [ ] Import history shows timestamp, filename, source, counts, and status.
- [ ] Administrator can open import detail and see per-game outcome summaries.
- [ ] Result/history counts reconcile with the underlying item outcomes.
- [ ] Existing Task 007 games are backfilled/handled so they can participate in duplicate detection without destructive guessing.
- [ ] Existing player pages show one logical Game once even after duplicate re-import.
- [ ] Existing browse/filter/viewer workflows still work.
- [ ] Migration succeeds on Preview.
- [ ] `GET /api/health` succeeds.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] Vercel Preview demonstrates duplicate-safe re-import and history successfully.

## Automated tests

Prioritize deterministic duplicate and accounting behavior:

- identical parsed game imported twice yields one Game and two provenance/import-item records;
- harmless header ordering/whitespace differences still produce the same fingerprint if the algorithm claims to normalize them;
- same players/date/event but different main-line moves do not collide;
- same game from a different Source is a duplicate Game with distinct provenance;
- incomplete data that cannot be safely fingerprinted follows the documented safe fallback;
- concurrent/unique-constraint duplicate path attaches provenance rather than failing the whole import;
- import summary counts match per-item outcome states;
- existing/backfilled Game fingerprint generation is deterministic;
- conservative Player-link behavior from Task 007 remains unchanged by duplicate detection.

Use small PGN fixtures that make expected duplicate/non-duplicate cases obvious.

## Manual validation

Against the migrated Vercel Preview deployment:

1. Import a small PGN file with several new games and note the result counts.
2. Open a matched player and count/identify the imported games.
3. Import the exact same file again.
4. Confirm the second result reports those games as duplicates/already known and does not report them as newly imported.
5. Return to the matched player and confirm the games still appear only once.
6. Open Import History and verify both import runs appear with correct counts/source/filename.
7. Open the second import detail and confirm duplicate items refer to already-known Games while preserving their import provenance.
8. Import a modified fixture containing the same players but different movetext and confirm it is not incorrectly collapsed as the same Game.
9. If available, import the same known game under a second source label and confirm one Game has both provenance observations represented.
10. Confirm an unresolved player side remains unresolved rather than becoming linked because of duplicate logic.
11. Confirm `/api/health` succeeds.

## Deployment considerations

This task adds/changes duplicate identity and import-history schema.

- Generate and commit Drizzle migration(s).
- Backfill fingerprints for existing data conservatively; do not destructively merge old rows during migration.
- Apply migration/backfill to Neon `preview` before Preview testing.
- Consider index creation cost, but expected current data volume is small enough for a straightforward migration.
- If a unique constraint/index is introduced, ensure existing rows are compatible before enabling it; ambiguous pre-existing collisions may require leaving uniqueness unenforced until cleaned manually.
- Do not run migrations automatically in Vercel builds.
- No new external service/environment variable should be required.

## Completion requirements

The implementation worker should:

1. create an appropriately named feature branch;
2. implement only this task and the minimum supporting changes it requires;
3. run validation locally where possible;
4. push changes;
5. confirm CI;
6. apply required migrations/backfill to the correct Preview database and confirm Vercel Preview deployment;
7. fix failures;
8. create a pull request into `main`;
9. report:
   - PR URL;
   - Preview URL;
   - CI status;
   - migration/backfill status;
   - manual validation result, including exact re-import behavior and import-history verification.

Do not merge unless explicitly requested.
