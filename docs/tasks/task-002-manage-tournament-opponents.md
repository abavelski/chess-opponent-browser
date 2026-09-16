# Task 002 — Manage tournament opponents

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Requires Task 001 to be merged. Create this work on a dedicated feature branch from the latest `main`.

## Goal

Turn a tournament from an empty container into a useful preparation roster. The administrator needs to associate potential opponents with a tournament, while the coach needs to find and open a player quickly.

This task introduces the distinction between a global chess Player and that player's participation in one Tournament. It should establish conservative identity behavior early so later game imports do not have to undo unsafe name-based merges.

## User value

When this task is complete, an administrator can open a tournament, add a potential opponent with a name and optional FIDE ID/federation/rating, and see that opponent in the tournament roster. The coach can search the roster by name and open the player entry that later tasks will populate with games.

## Current state

Requires Task 001.

Before this task starts:

- tournaments can be created, listed, and opened;
- tournament detail pages show an empty-opponents state;
- no Player or tournament-participation schema exists;
- there is no player search or player detail page.

## Scope

Implement the complete tournament-opponent management slice.

- Add a global `Player` concept.
- Add a tournament-participation relationship between Tournament and Player.
- Allow an administrator to add a potential opponent from the tournament detail page.
- Capture:
  - required canonical/display name;
  - optional FIDE ID;
  - optional federation code;
  - optional rating snapshot for this tournament.
- Show tournament participants in a clear list/table appropriate for a typical roster of 20–100 people.
- Add tournament-local search that filters participants by name and, where useful, FIDE ID.
- Make each participant row/card open a player detail route in the context of the tournament.
- The initial player detail page should display identity/tournament information and a clear `No known games yet` state. Game functionality belongs to Task 003.
- Keep the same global Player reusable across multiple tournaments.
- Preserve tournament-specific rating/federation values as participation context rather than assuming they are timeless properties of the person.
- Add validation, error handling, migration(s), and high-value tests.
- Keep roster search and add-player flow usable on tablet-sized screens.

### Initial identity rules

Use conservative rules in this task:

- If a FIDE ID is supplied and exactly matches an existing Player's FIDE ID, reuse that Player instead of creating a second canonical Player.
- If no FIDE ID is supplied, do not automatically merge by name. Create a distinct Player unless the UI explicitly selects/reuses an existing player through a safe exact-identity mechanism implemented within this task.
- Never silently merge two existing Players because their normalized names look similar.
- The same Player may not be added to the same Tournament twice.

The exact UI for reusing an existing FIDE-ID-matched player may be simple; correctness is more important than sophisticated autocomplete.

## UX requirements

Expected administrator flow:

1. Open `Copenhagen Open 2026`.
2. Click `Add opponent`.
3. Enter `Jan Kowalski`.
4. Optionally enter FIDE ID, federation, and rating.
5. Save.
6. See Jan immediately in the tournament roster.
7. Refresh and confirm Jan remains.

Expected coach flow:

1. Open the tournament.
2. Type `Jan` into the roster search.
3. See matching participants only.
4. Click `Jan Kowalski`.
5. See the player page with identity/tournament information and a `No known games yet` state.
6. Navigate back to the tournament without losing the basic workflow.

When no participant matches a search, show a clear empty-search state rather than a blank area.

## Data / schema changes

Conceptually add:

### Player

- stable primary key;
- required canonical/display name;
- optional FIDE ID, unique when present;
- created timestamp or equivalent audit field if consistent with the project style.

### Tournament participation

- stable relationship between one Tournament and one Player;
- optional rating snapshot;
- optional federation snapshot;
- uniqueness for `(tournament, player)` so the same canonical Player cannot be added twice to one event.

Important invariants:

- Player name is required after trimming.
- FIDE ID, when supplied, should be stored in a representation that preserves exact identity and supports indexed equality lookup. Treat it as an identifier, not a quantity used for arithmetic.
- Federation is optional; if validated, accept the common three-letter form and normalize casing.
- Rating is optional; if present, require a positive integer in a sensible chess-rating range (for example 1–4000). Unrated should be represented as absent, not a made-up zero.
- Do not encode tournament games on the participation row.

Generate and commit the required Drizzle migration(s).

## Server behavior

- Validate all submitted fields server-side.
- Trim player names.
- Normalize FIDE ID input to a canonical string representation without leading/trailing whitespace.
- If a supplied FIDE ID already belongs to exactly one Player, reuse that Player.
- If the current Tournament already contains that Player, return an understandable `already added` error instead of creating a duplicate relationship.
- If a submitted FIDE ID conflicts with data in a way that cannot be resolved safely, fail the mutation and ask the administrator to correct the input; do not silently reassign identity.
- If no FIDE ID is supplied, do not merge on normalized name alone.
- Tournament roster search should be case-insensitive and should not require loading unrelated application data into the browser.
- Unknown tournament/player route parameters should produce a proper not-found response.
- Database errors must not expose SQL, credentials, or stack traces.

## Explicitly out of scope

- Chess games or game lists.
- PGN import.
- FIDE API/network lookup.
- Fuzzy name matching.
- Player aliases.
- Manual imported-name resolution.
- Editing or deleting players.
- Removing participants from a tournament.
- Bulk participant import/CSV/Chess-Results integration.
- Tournament pairings, rounds, standings, or expected colors.
- Authentication/role management.

## Acceptance criteria

- [ ] Administrator can add an opponent to a tournament through the deployed UI.
- [ ] Player name is required and validated server-side.
- [ ] FIDE ID, federation, and rating are optional and validated when supplied.
- [ ] Tournament roster persists after refresh.
- [ ] Roster shows participant name plus useful available identity/context fields.
- [ ] Coach can search a tournament roster by player name case-insensitively.
- [ ] Clicking a participant opens a player page in tournament context.
- [ ] Player page shows a clear `No known games yet` state.
- [ ] A Player can participate in more than one Tournament without duplicating the canonical Player when a supplied FIDE ID identifies the same person.
- [ ] The same Player cannot be added twice to the same Tournament.
- [ ] Name-only additions do not silently merge with an existing same/similar-name Player.
- [ ] Existing tournament create/list/detail flow still works.
- [ ] Existing `GET /api/health` still works.
- [ ] Migration succeeds on the Preview database.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] Vercel Preview deployment supports the complete add/search/open flow.

## Automated tests

Prioritize tests around identity and validation behavior:

- required-name validation;
- valid/invalid optional rating and federation inputs;
- FIDE ID normalization;
- duplicate `(tournament, player)` prevention;
- an exact existing FIDE ID reuses the same Player;
- two name-only submissions with the same/similar name do not get silently merged by a helper/service that claims to identify canonical players;
- search normalization/case-insensitive matching if search logic is extracted and testable.

Use integration/database tests only if the repository can support them without turning this task into test-infrastructure work. Otherwise cover pure/domain logic automatically and exercise persistence manually on Preview.

## Manual validation

Against the migrated Vercel Preview deployment:

1. Create or open `Test Open 2026`.
2. Add `Jan Kowalski`, federation `POL`, rating `2140`, and a test FIDE ID.
3. Refresh and verify Jan remains in the roster.
4. Search for `jan` and confirm Jan is returned.
5. Search for a nonexistent name and confirm a clear no-results state.
6. Open Jan and verify the player page shows identity information plus `No known games yet`.
7. Return to the tournament.
8. Try adding the same FIDE ID again to the same tournament and confirm an understandable duplicate/already-added response.
9. Create a second test tournament, add the same FIDE ID there, and confirm it reuses the same canonical Player while preserving the second tournament's rating/federation snapshot.
10. Confirm `/api/health` succeeds.

## Deployment considerations

This task adds Player and tournament-participation schema.

- Generate and commit Drizzle migration(s).
- Apply migrations to the shared Neon `preview` branch before Preview validation.
- Keep migrations additive/backward compatible with Task 001 data.
- Do not delete or rewrite existing tournament rows.
- No new environment variables are expected.
- Production migration remains an explicit step; do not add automatic migration execution to Vercel builds.

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
   - manual validation result.

Do not merge unless explicitly requested.
