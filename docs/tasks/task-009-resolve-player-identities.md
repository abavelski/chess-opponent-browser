# Task 009 — Resolve player identities

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Requires Tasks 001–008 to be merged. Create this work on a dedicated feature branch from the latest `main`.

## Goal

Provide a safe administrator workflow for the imported game sides that conservative automatic matching intentionally leaves unresolved. Real PGN collections contain spelling variants, initials, transliterations, missing FIDE IDs, and duplicate names. Those records should not disappear, but they also must not be guessed onto the wrong canonical Player.

This task lets a human resolve those cases explicitly and optionally remember an unambiguous alias for future exact matching.

## User value

When this task is complete, an administrator can see unresolved imported player names, review the games/source context behind a name, attach that identity to the correct existing Player or create a distinct new Player, and immediately make the affected games visible in the coach's normal player browser.

Where an alias is safe and unambiguous, the administrator can remember it so future imports with the exact same normalized name can resolve automatically.

## Current state

Requires Tasks 001–008.

Before this task starts:

- tournaments, canonical Players, global Games, Sources, Imports, provenance, duplicate handling, and import history exist;
- imported game sides link automatically only by exact FIDE ID or a unique exact normalized canonical-name match;
- ambiguous/unknown sides remain unresolved while preserving raw name and metadata;
- self-service PGN import is usable without code/database edits;
- there is no administrator UI for resolving unresolved identities or maintaining aliases.

## Scope

Implement a complete manual identity-resolution vertical slice.

### Unresolved identity queue

Add an administrator-facing page that groups or lists unresolved game-side identities in a useful way.

At minimum show:

- raw imported name;
- normalized name/key used for grouping;
- FIDE ID from source when present but unmatched/conflicting;
- federation/rating hints when present;
- number of affected game sides/games;
- recent source/import context;
- enough White/Black/opponent/event/date context to help distinguish similarly named people.

Group exact normalized raw-name matches where safe for review, but do not assume every same-name record is the same person when conflicting FIDE IDs or obviously conflicting identity evidence exists. Split/group by FIDE ID when available and treat conflicts visibly.

Allow search/filter by unresolved name so the queue remains usable as it grows.

### Resolve to an existing Player

The administrator can choose an unresolved identity and select an existing canonical Player.

Before applying:

- show the target Player's canonical name/FIDE ID;
- show how many game sides will be affected;
- warn if the unresolved source identity contains a different non-empty FIDE ID than the target Player;
- block bulk resolution when there is a direct FIDE ID conflict unless the administrator instead handles records individually through a deliberately explicit path. Do not normalize a conflict away.

After confirmation, link the selected matching unresolved game sides to the canonical Player without modifying their raw source names/provenance.

The newly linked games should appear immediately in existing player lists/filters/viewer routes.

### Create a new canonical Player

For a truly new person, allow the administrator to create a canonical Player from the unresolved identity and link the selected game sides in the same operation.

- canonical name is required;
- FIDE ID is optional, but normal Player uniqueness rules apply;
- do not create a new Tournament participation automatically; a global Player may exist without belonging to the current tournament.

### Remember an alias

Allow the administrator to optionally remember the imported raw/normalized name as an alias of the resolved Player.

Alias rules:

- alias text/raw representation should be preserved for display/audit;
- store a normalized alias key used for exact future matching;
- a normalized alias may participate in automatic import matching only if it maps unambiguously to one canonical Player;
- if the same normalized alias is already associated with a different Player or is otherwise ambiguous, do not silently move it; block remembering it as an automatic alias and allow the administrator to complete the current one-off resolution without creating that alias;
- exact alias matching comes after exact FIDE ID and before falling back to canonical-name matching, or another clearly documented conservative order that gives FIDE ID precedence.

Extend Task 007/008 import matching so safe exact aliases can resolve future imports automatically.

### One-off versus remembered resolution

A manual resolution may link existing game sides even when the administrator chooses not to create an alias. This is important for common names and one-off ambiguous data.

Do not rewrite original PGN names when linking to a canonical Player.

## UX requirements

Expected administrator flow:

1. Open `Unresolved identities`.
2. Search for `Kowalski`.
3. Open an unresolved `J. Kowalski` group.
4. Review sample affected games, source information, and any FIDE/federation hints.
5. Choose existing canonical Player `Jan Kowalski`.
6. Confirm the number of affected game sides.
7. Optionally select `Remember “J. Kowalski” as an alias for future imports`.
8. Apply resolution.
9. See the unresolved count decrease.
10. Open Jan's player page and see the newly attached games.
11. Import a new PGN with the exact remembered alias and verify it resolves automatically.

For a truly new identity:

1. Open the unresolved name.
2. Choose `Create new player`.
3. Enter/confirm canonical name and optional FIDE ID.
4. Resolve the selected game sides to the new Player.

The UI should make identity resolution feel deliberate. Avoid bulk “accept suggestions” behavior in this first version.

## Data / schema changes

Conceptually add:

### Player alias

- stable ID;
- Player foreign key;
- original/display alias text;
- normalized alias key used for exact lookup;
- timestamps/audit fields if consistent with existing domain style.

Important invariants:

- FIDE ID remains the strongest canonical identifier and must not be contradicted by an alias-based automatic match;
- an alias used for automatic matching must resolve uniquely to one Player;
- original imported Game-side names/provenance are immutable historical source data and remain available after resolution;
- a nullable canonical Player link can be filled by manual resolution without changing Game identity/fingerprint semantics improperly;
- resolving identity should not create a duplicate Game or duplicate tournament participation;
- creating a new Player through resolution follows the same FIDE-ID uniqueness rules as Task 002.

If unresolved groups require no separate persistent entity, derive them from unresolved game sides/provenance. Do not create a complicated identity-workflow table unless it clearly simplifies consistency/audit behavior.

Generate and commit required Drizzle migration(s).

## Server behavior

- Search unresolved records server-side; do not load every raw import into the browser unnecessarily.
- Revalidate the unresolved selection at submit time so a stale page cannot relink records that have already been resolved differently.
- Applying a bulk group resolution should only update game sides that still match the reviewed unresolved identity key/evidence.
- Use a transaction for creating a new Player/alias and applying the selected links so partial resolution does not leave confusing half-state.
- FIDE ID conflicts must not be silently overridden.
- Alias creation must detect normalized collisions with aliases belonging to another Player.
- Future import matching must prefer exact FIDE ID over aliases and must only use an alias when it is unambiguous and non-conflicting with source FIDE ID evidence.
- If a manual one-off resolution is applied without an alias, future imports of that same raw name may remain unresolved; that is expected and should be understandable.
- Identity linking must not mutate original PGN/provenance content.
- Database errors should produce controlled UI errors and never expose SQL/secrets.

## Explicitly out of scope

- Fuzzy/phonetic name matching.
- Automated probabilistic identity suggestions.
- External FIDE API lookup.
- Automatic federation archive lookup.
- Merging two existing canonical Players and all their history.
- Undo/audit-history UI for prior resolutions beyond normal database records.
- Bulk import of a standalone alias file.
- Automatic tournament participant creation from newly resolved Players.
- Editing imported PGN source text.
- Deleting imports/games.
- Stockfish, AI summaries, opening reports, repertoire logic.

## Acceptance criteria

- [ ] Administrator can open a discoverable unresolved-identity queue.
- [ ] Queue shows raw name, useful identity hints, affected-game count, and source/game context.
- [ ] Administrator can search/filter unresolved identities by name.
- [ ] Administrator can resolve selected unresolved game sides to an existing canonical Player.
- [ ] Original raw PGN/player-name provenance remains unchanged after resolution.
- [ ] Newly resolved games appear immediately in the target Player's existing game list and filters.
- [ ] Administrator can create a new canonical Player as part of resolving an identity.
- [ ] New Player creation enforces existing FIDE-ID uniqueness/validation rules.
- [ ] Administrator can optionally remember a safe exact alias.
- [ ] A normalized alias cannot silently map to two different canonical Players for automatic matching.
- [ ] Alias collision can be handled as a one-off resolution without creating an unsafe alias.
- [ ] Direct FIDE ID conflicts are warned/blocked from unsafe bulk linking.
- [ ] Future imports with a safe remembered exact alias resolve to the intended Player when no stronger conflicting FIDE evidence exists.
- [ ] FIDE ID matching retains precedence over alias/name matching.
- [ ] Resolving identity does not create duplicate Game records or tournament-specific copies.
- [ ] Existing import history, duplicate handling, coach browse/filter/viewer flows continue working.
- [ ] Migration succeeds on Preview.
- [ ] `GET /api/health` succeeds.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] Vercel Preview demonstrates unresolved → manual resolution → player visibility → alias reuse end to end.

## Automated tests

Prioritize conservative identity invariants:

- unresolved group/query selects only still-unresolved matching sides;
- resolving to an existing Player updates selected canonical links but preserves raw names/provenance;
- new Player + resolution is atomic;
- source FIDE ID conflicting with target Player blocks unsafe bulk resolution;
- alias normalization is deterministic;
- alias collision with another Player is rejected for automatic matching;
- one-off resolution can succeed without alias creation;
- future import exact alias resolves the intended Player;
- exact FIDE ID takes precedence over alias/canonical-name match;
- ambiguous alias does not auto-resolve;
- resolution does not alter Game duplicate fingerprint in a way that creates a second Game.

Use focused domain/service tests plus existing parser/import fixtures. Avoid building probabilistic matching tests because fuzzy matching is out of scope.

## Manual validation

Against the migrated Vercel Preview deployment:

1. Import a PGN with a deliberately unmatched name such as `J. Kowalski` that should remain unresolved.
2. Open the unresolved queue and find that name.
3. Verify affected game/source context is sufficient to identify the intended person.
4. Resolve it to an existing canonical `Jan Kowalski` and select the option to remember the alias.
5. Confirm Jan's player page now shows the newly linked game.
6. Confirm the original imported name still appears in provenance/raw source context where shown.
7. Import another PGN using the exact alias and no conflicting FIDE ID; verify the new game auto-links to Jan.
8. Create a test alias collision scenario and verify the UI refuses to create an unsafe automatic alias while still allowing a deliberate one-off resolution if appropriate.
9. Create/use a conflicting FIDE ID scenario and verify unsafe bulk resolution is blocked.
10. Resolve a different unmatched identity by creating a new canonical Player and verify the game becomes visible on that new player's page.
11. Confirm import history and duplicate handling still work.
12. Confirm `/api/health` succeeds.

## Deployment considerations

This task introduces Player alias schema and updates import identity-matching behavior.

- Generate and commit Drizzle migration(s).
- Apply migrations to Neon `preview` before Preview validation.
- If adding a unique index on normalized aliases, confirm existing data contains no conflicting rows; the table is new in this planned sequence so this should be straightforward.
- Keep the migration additive and preserve all existing unresolved/canonical game-side links.
- No external identity service or new environment variable is required.
- Do not introduce FIDE network calls in deployment/runtime.

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
   - manual validation result, including alias reuse and conflict handling.

Do not merge unless explicitly requested.
