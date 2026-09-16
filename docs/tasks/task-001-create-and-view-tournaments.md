# Task 001 — Create and view tournaments

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Create this work on a dedicated feature branch from the latest `main`. Do not begin player, game, or import functionality in this task.

## Goal

Establish the first product-facing vertical slice: an administrator can create a tournament and later reopen it from the application. A tournament is the preparation context that future tasks will populate with potential opponents.

The current repository contains only a skeleton home page and bootstrap database table. This task should replace the purely technical landing experience with the smallest useful tournament workflow while preserving the existing health check and deployment behavior.

## User value

When this task is complete, an administrator can create a named tournament through the deployed web UI, see it in a tournament list, open its detail page, refresh the browser, and see the same persisted tournament.

## Current state

This is the first product implementation task and has no task prerequisite beyond the repository state described in `docs/implementation-plan.md`.

Before this task starts:

- the root page only reports that the application skeleton is running;
- the database contains only the bootstrap `app_metadata` table;
- `GET /api/health` is the only database-backed product route;
- no tournament schema, pages, or mutations exist.

## Scope

Implement the complete create-and-view tournament slice.

- Add a `Tournament` domain record to the Drizzle schema and generate a committed migration.
- Store at minimum a stable primary key, required tournament name, and creation timestamp. Do not add speculative fields that are not needed by this task.
- Replace or extend the root page so it acts as the tournament landing page and lists existing tournaments in a useful order. Newest-created first is acceptable for this initial slice.
- Provide an obvious action for creating a tournament.
- Provide a create form with a required name field.
- Persist successful submissions server-side.
- After creation, take the user to the new tournament detail page or otherwise make the newly created tournament immediately accessible without manual URL editing.
- Add a tournament detail route/page that displays the tournament name and a clear empty state indicating that no opponents have been added yet.
- Handle an unknown/nonexistent tournament identifier with the normal Next.js not-found behavior or an equally clear 404 experience.
- Keep styling simple and consistent with the existing app. Establish only the minimal layout conventions that later tasks can reuse.
- Add high-value tests for validation and persistence behavior at the layer most practical in this repository.
- Ensure the flow remains usable at desktop and tablet widths.

Do not introduce a separate API layer merely for architectural symmetry if a server action or another existing Next.js pattern cleanly handles the mutation. Keep database access server-only.

## UX requirements

The intended flow is:

1. Open the application root.
2. If there are no tournaments, see an understandable empty state and a `Create tournament` action.
3. Open the create form.
4. Enter `Copenhagen Open 2026`.
5. Submit.
6. See the newly created tournament detail page, including an empty-opponents state.
7. Return to the tournament list and see `Copenhagen Open 2026`.
8. Refresh the page and verify the tournament remains.

Validation errors should be shown near the form and should preserve the entered value where practical.

## Data / schema changes

Add a tournament table/entity with the minimum fields needed for this slice:

- stable primary key;
- required name;
- creation timestamp.

Important invariants:

- tournament name must not be null or empty after trimming;
- tournament identifiers must be stable and safe to use in routes;
- do not make tournament names globally unique, because separate events may legitimately share a name in different years or contexts.

Generate the Drizzle migration using the repository's normal migration workflow and commit both schema and generated migration changes.

## Server behavior

- Validate the submitted tournament name on the server even if client-side validation is also present.
- Trim surrounding whitespace before persistence.
- Reject an empty/whitespace-only name with a clear user-facing validation error.
- Use a reasonable maximum length to prevent pathological input. A limit in the 200-character range is appropriate; keep the database constraint and application validation consistent.
- On a database failure, do not expose credentials, SQL, or internal stack traces in the UI. Present a generic actionable error and keep the application responsive.
- Reads must come from the database so persistence survives refresh and deployment process restarts.
- Existing `GET /api/health` behavior must remain unchanged.

## Explicitly out of scope

- Adding players or tournament participants.
- Editing tournament names.
- Deleting or archiving tournaments.
- Tournament dates, rounds, pairings, standings, or locations.
- PGN import.
- Game records.
- FIDE lookup.
- Authentication/authorization redesign.
- Automated tournament participant import.
- Any chess engine or analysis functionality.

## Acceptance criteria

- [ ] User can create a tournament through the deployed UI.
- [ ] Tournament name is required and whitespace-only input is rejected clearly.
- [ ] Successful creation persists to PostgreSQL.
- [ ] Created tournament appears in the root tournament list after navigation/refresh.
- [ ] User can open a tournament detail page from the list.
- [ ] Tournament detail page renders a clear empty state for opponents.
- [ ] A nonexistent tournament URL produces a clear 404/not-found response.
- [ ] No player, game, or import functionality is implemented.
- [ ] Existing `GET /api/health` still works after the migration is applied.
- [ ] The committed Drizzle migration applies successfully to the Preview database.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] Vercel Preview deployment renders the create/list/detail flow successfully.

## Automated tests

Add a small number of meaningful tests, for example:

- validation accepts a normal tournament name after trimming;
- validation rejects an empty/whitespace-only name and an over-limit name;
- any extracted persistence/service behavior used by the create flow is tested without making tests depend on production data;
- existing environment tests continue passing.

Do not build a large end-to-end framework solely for this task if the repository does not already have one. Prefer testable validation/domain functions plus manual Preview validation.

## Manual validation

Against the migrated Vercel Preview deployment:

1. Open the Preview URL.
2. Confirm the tournament list renders without an error.
3. Create `Test Open 2026`.
4. Confirm the tournament detail page shows `Test Open 2026` and an empty-opponents state.
5. Return to the root page and confirm `Test Open 2026` is listed.
6. Refresh the browser and confirm it remains listed.
7. Try to create a tournament with only spaces and confirm an understandable validation message is shown.
8. Open a clearly nonexistent tournament URL and confirm a 404/not-found experience.
9. Open `/api/health` and confirm the database health check succeeds.

## Deployment considerations

This task introduces the first product schema migration.

- Generate and commit the migration with Drizzle Kit.
- Apply it to the Neon `preview` branch before validating the Vercel Preview deployment; Vercel builds do not run migrations automatically.
- Do not change the application's migration strategy or add automatic migrations to the build.
- Before/around merge to `main`, ensure the same migration is intentionally applied to the Neon production `main` branch using the project's existing deployment process.
- The schema addition should be backward compatible with the current skeleton because it only adds new product data.
- No new environment variables should be required.

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
