# Task 006 — Preview PGN imports

## Worker instruction

Read `docs/implementation-plan.md` first. Then implement this task completely.

Work only on this task and the minimum supporting changes it requires.

When finished, the application must remain deployable and all existing functionality must continue working.

Requires Tasks 001–005 to be merged. Create this work on a dedicated feature branch from the latest `main`.

## Goal

Begin the administrator self-service ingestion workflow without yet writing imported games to the database. The administrator should be able to upload a normal PGN file containing multiple games and understand what the application can parse before committing data.

Separating parsing/preview from persistence makes parser behavior, comments/variation preservation, malformed-game recovery, and user-facing error reporting testable before duplicate and identity logic are added.

## User value

When this task is complete, an administrator can upload a PGN file in the browser and receive a preview showing how many games were found, the key metadata for each successfully parsed game, and understandable errors for games that could not be parsed.

No database records are changed by this task.

## Current state

Requires Tasks 001–005.

Before this task starts:

- the full coach browse/filter/replay workflow works with fixture/developer-loaded data;
- games use a stored structured move representation that supports comments and variations;
- no user-facing PGN upload/parser flow exists;
- no Import entity/history exists;
- arbitrary uploaded PGNs are not persisted.

## Scope

Implement a browser-based PGN upload and parse-preview slice.

### Import page

Add an administrator-facing route such as `/imports/new` with:

- a single PGN file chooser;
- a source label field or simple source selector with `Manual` as an appropriate default;
- an action to parse/preview the file;
- clear guidance that preview does not save games yet.

The exact navigation location may fit the existing app layout, but the import page should be discoverable without typing a URL.

### File constraints

For this initial task:

- accept one `.pgn` text file per preview;
- support multiple games inside that file;
- enforce a reasonable serverless-safe upload limit, such as 10 MB, and keep the limit visible in validation/error copy;
- reject empty uploads and clearly non-PGN/binary input with a controlled error;
- do not depend on client-side parsing for correctness.

### PGN parsing

Choose a focused PGN parser/library or implement a narrow parser adapter that can preserve the information required by this project.

The parser path must support, where present:

- standard PGN tags;
- multiple games in one file;
- main-line moves;
- comments;
- recursive/nested variations sufficiently for the Task 005 viewer model;
- unknown/extra tags without discarding them;
- incomplete optional metadata;
- per-game error reporting/recovery where feasible.

Map successful parses into the application's structured Game representation or a preview DTO that can be persisted by Task 007 without reparsing.

Do not parse PGNs during ordinary player/game browsing.

### Preview result

Show an import summary such as:

```text
Games found: 327
Parsed:      325
Errors:        2
```

For each successfully parsed game, show enough metadata to identify it:

- White;
- Black;
- date;
- result;
- event;
- White/Black ratings when available;
- ECO/opening when available.

For parse failures, show a concise per-game/index error that helps the administrator locate the problem without dumping raw stack traces.

The preview should make clear that nothing has been saved yet. A confirm/import button may be visually present only if it is disabled/nonfunctional with an explicit `Persistence arrives in Task 007`-style product message avoided in the UI; preferably omit persistence controls entirely until Task 007.

### Raw-data preservation

The server-side preview representation must retain the original PGN text or exact source segment for each successfully parsed game and preserve unrecognized tags so Task 007 can save them. Do not display all raw data unless useful for troubleshooting.

## UX requirements

Expected administrator flow:

1. Open `Import games`.
2. Leave source as `Manual` or enter/select a source label.
3. Choose a PGN file containing several games.
4. Click `Preview`.
5. See total/parsed/error counts.
6. Scan parsed game metadata.
7. See any parse errors without losing successfully parsed games from the preview.
8. Navigate away knowing no game data was saved.

For a fully invalid file, show a clear failure state and allow selecting another file without reloading the whole application.

The preview table/list should remain usable on tablet, though large import review is primarily a desktop/admin workflow.

## Data / schema changes

No database schema change is expected in this task.

The parser should produce a typed internal representation compatible with the existing Game viewer model and future import persistence. If the existing stored move representation is too fixture-specific to represent real PGN comments/variations, it is acceptable to refine the TypeScript domain representation, but do not migrate or persist uploaded data yet unless a backward-compatible schema adjustment is absolutely necessary.

Important invariants:

- parsing happens during ingestion/preview, not browsing;
- original PGN segments and unknown tags are retained in the parsed result;
- parser output can represent comments and variations without flattening them away;
- a bad game should not unnecessarily hide successfully parsed sibling games in the same file.

## Server behavior

- Perform authoritative file validation and PGN parsing server-side.
- Enforce upload-size limits server-side.
- Never evaluate uploaded content as code or write it to executable paths.
- Treat uploaded filenames/source labels as untrusted display data and escape/render safely.
- Return controlled validation errors for missing/oversized/invalid files.
- Recover per game when the parser/library makes safe recovery possible. If a syntax error prevents reliable boundary recovery, report that limitation clearly rather than inventing successful parses.
- Keep parser errors free of server filesystem paths, secrets, or stack traces.
- Do not write Tournament, Player, Game, Source, or Import records from this flow.
- Do not rely on a browser-only preview token that cannot survive the Task 007 design; keep the parsing layer reusable.

## Explicitly out of scope

- Persisting uploaded games.
- Creating Import history records.
- Duplicate detection.
- Associating imported sides with canonical Players.
- Creating Players from PGN names.
- Manual identity resolution.
- Multiple-file batch upload.
- ZIP/archive upload.
- Remote URL imports.
- TWIC/Danbase/federation scraping or scheduled imports.
- Editing PGN in the browser.
- Engine analysis.

## Acceptance criteria

- [ ] Administrator can open a discoverable import page.
- [ ] User can select one PGN file and request a preview.
- [ ] One file containing multiple games is parsed into individual preview entries.
- [ ] Preview shows total/found, parsed, and error counts in an understandable summary.
- [ ] Successful games show White, Black, date, result, event, ratings, and ECO/opening when available.
- [ ] Comments and variations survive in the internal parsed representation used by the existing viewer model.
- [ ] Unknown/extra PGN tags are retained rather than silently discarded.
- [ ] Original PGN text/segment for each successful game is retained in the preview result.
- [ ] A malformed game can be reported without discarding unrelated valid games when safe recovery is possible.
- [ ] Empty, oversized, and clearly invalid uploads produce controlled errors.
- [ ] Previewing a file creates no new Game/Player/Import/Source database records.
- [ ] Existing coach workflows continue working.
- [ ] No ordinary browse/view route reparses PGN.
- [ ] Import page is functional on tablet-sized screens.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass.
- [ ] Vercel Preview deployment can preview representative PGNs successfully.

## Automated tests

Add parser-focused fixtures/tests covering a small representative set:

- single normal game;
- multiple games in one file;
- comments;
- one or more variations, including nested variation if the selected parser supports it;
- extra/unknown tags;
- missing optional date/rating/ECO;
- malformed game among valid games and the expected recovery behavior;
- empty input;
- upload-size/validation helper behavior;
- mapping parser output into the application's structured move model.

Use small PGN fixtures with known expected data. Avoid a huge corpus in this task.

## Manual validation

Against Vercel Preview:

1. Open the import page.
2. Upload a small PGN containing at least three valid games.
3. Confirm the preview count and metadata are correct.
4. Upload a PGN containing a comment and variation and verify the preview/parser diagnostics indicate successful parsing; if the preview includes a temporary replay/detail affordance, verify the structure matches the existing viewer model.
5. Upload a file containing one intentionally malformed game plus valid games and verify the documented recovery behavior.
6. Try an empty file and confirm a controlled error.
7. Try a file over the configured size limit (or exercise the equivalent validation in a safe local/manual way) and confirm the error is clear.
8. Return to an existing player and verify no new games appeared as a result of previews.
9. Confirm existing game viewer still works.
10. Confirm `/api/health` succeeds.

## Deployment considerations

No database migration is expected.

A new PGN parsing dependency is allowed if necessary; commit the lockfile and keep the dependency set focused. Confirm the parser works in the Vercel server runtime used by the application and does not require unsupported native binaries.

Do not add file-storage infrastructure in this task. Uploaded content is processed for preview only.

No new environment variables should be necessary.

## Completion requirements

The implementation worker should:

1. create an appropriately named feature branch;
2. implement only this task and the minimum supporting changes it requires;
3. run validation locally where possible;
4. push changes;
5. confirm CI;
6. confirm Vercel Preview deployment;
7. fix failures;
8. create a pull request into `main`;
9. report:
   - PR URL;
   - Preview URL;
   - CI status;
   - migration status (`none` expected);
   - manual validation result, including representative PGN parse cases.

Do not merge unless explicitly requested.
