# Chess Opponent Browser — Implementation Plan

## Product goal

Chess Opponent Browser is a private web application for tournament preparation. Its first users are a serious junior chess player, the player's online coach, and an administrator/parent who collects and manages chess data.

The first product phase should remove the time the coach currently spends searching multiple chess databases and websites for games by a possible opponent. Before a tournament, an administrator prepares the relevant participants and game data. The coach should then be able to open a tournament, find an opponent, see all known games for that player, narrow the list to the most useful preparation set, and replay individual games in an ordinary web browser on desktop, laptop, or tablet.

The primary product metric is time from an opponent's name to useful games. The first phase is therefore a game library and opponent browser, not a chess engine, automated preparation engine, repertoire manager, scraping platform, or AI chess coach.

## Product principles

### Optimize for fast preparation

The coach workflow is the organizing product constraint. A representative flow is:

1. Open `Copenhagen Open 2026`.
2. Search for `Jan Kowalski`.
3. Open the player.
4. Select `Opponent as Black`.
5. Select `Last 2 years`.
6. Select `Opponent rating >= 2000`.
7. Review the resulting games on an interactive board.

Each implementation task should shorten or enable this workflow rather than maximize architectural completeness.

### Games are global

A chess game should logically exist once in the application. Tournaments do not own copies of games. Tournaments reference players; player pages query the global game library. The same player and the same game can therefore be useful for many tournaments.

Conceptually:

```text
imports
   ↓
game library
   ↓
players
   ↓
tournaments
```

### Player identity is conservative

FIDE ID is the preferred canonical identifier when it is known, but imported PGNs may contain only names. The design must support a canonical player name, normalized names, FIDE ID, aliases, unresolved game-side identities, and later manual resolution.

Automatic matching must prefer false negatives over false positives. If identity is ambiguous, leave the game side unresolved rather than attaching it to the wrong player. Fuzzy matching and external FIDE lookup are intentionally deferred.

### Preserve provenance and original data

Games may eventually come from Danbase, TWIC, federation archives, ChessArbiter, Chess-Results, tournament sites, manual PGNs, and automated importers. The data model must preserve source/import provenance and the original PGN payload or equivalent raw information. Do not discard tags or annotations simply because the initial UI does not display them.

A global game may later be observed from more than one source. The model should permit multiple provenance records to refer to one logical game rather than forcing tournament-specific or source-specific game copies.

### Parse on ingestion, query structured data while browsing

PGN parsing belongs on an ingestion path. Normal tournament, player, filter, and game-viewer requests should use indexed database records and a stored structured move representation. The application should not repeatedly parse the original PGN every time a player or game page is rendered.

### Keep the first phase as one deployable application

Do not introduce microservices, queues, separate scraping services, or other distributed infrastructure for the first phase. Extend the existing Next.js application, PostgreSQL database, Drizzle schema/migrations, CI, and Vercel deployment model unless a concrete product requirement proves that insufficient.

### Deliver vertical slices

Every task below should leave the application working, deployable, and human-testable. A task may include database schema, migrations, server behavior, UI, tests, and responsive behavior when those are required to deliver one coherent user capability.

Avoid horizontal phases such as “build all tables,” “build all APIs,” then “build all UI.”

## Current architecture

The repository is an intentionally minimal full-stack skeleton with no chess product functionality yet.

- Next.js `16.3.5` using the App Router.
- React `19.3.0` and TypeScript.
- Tailwind CSS `4.3.3` via PostCSS.
- PostgreSQL hosted by Neon, accessed with `@neondatabase/serverless` and Drizzle ORM.
- Drizzle Kit for generated SQL migrations.
- Vitest for tests and ESLint for linting.
- Node.js 24 in CI.
- A single root page that reports that the application skeleton is running and displays the current environment label.
- `GET /api/health`, which executes `SELECT 1` through Drizzle and returns HTTP 503 if the database is unavailable.
- A bootstrap `app_metadata` table and one committed Drizzle migration. No tournament, player, game, source, or import schema exists yet.
- No chess/PGN parsing or board-viewer dependency is installed yet.
- No authentication or application-level authorization is implemented in the repository.
- GitHub Actions validates pull requests and pushes to `main` with `npm ci`, lint, typecheck, Vitest, and a production Next.js build.
- The repository documentation describes standard Vercel Git integration: `main` deploys to Production; feature branches/PRs deploy to Preview.
- Production is intended to use the Neon `main` branch. Preview and Development use a shared Neon `preview` branch.
- Database migrations are intentionally not run automatically during Vercel builds. Workers making schema changes must apply migrations to the correct Neon branch before validating database-backed Preview functionality.

The existing infrastructure is sufficient for the planned first phase and should not be redesigned as part of product work.

## Target first-phase architecture

The first-phase target remains one Next.js application backed by one PostgreSQL database.

The application should use server-side code for database access and mutations, with React UI for the coach/admin workflows. Exact choices among server actions, route handlers, server components, and client components may evolve task by task; the durable constraint is that database credentials remain server-only and the browser receives only the data it needs.

The database should hold global domain records for tournaments, players, tournament participation, games, sources, and imports. Queryable game metadata should be stored in columns suitable for filtering and indexing. The original PGN and a structured representation of moves/comments/variations should be persisted so the game viewer does not need to reparse PGN on ordinary reads.

The initial application can use a single shared database for the private user group. Sophisticated role-based authorization is not required to validate the core workflow, but the absence of application-level authentication must be reviewed before broader or public-facing use. Do not expand the early implementation tasks into a general identity platform.

## Domain model

The descriptions below are conceptual. Individual task workers should choose a clean Drizzle/PostgreSQL representation without treating these notes as a frozen final SQL schema.

### Tournament

Represents a preparation context such as `Copenhagen Open 2026`. A tournament has a name and a set of potential opponents/participants. A tournament does not own games.

### Player

Represents a canonical chess person in the global library. Important identity attributes include a canonical name and optional FIDE ID. Names from imported PGNs may be normalized for matching, but name equality alone must not force unsafe merges.

### Tournament participant

Associates a global Player with a Tournament. It can preserve tournament-specific snapshot information such as rating and federation. This allows the same Player to appear in many tournaments without duplicating the Player record.

### Game

Represents one logical chess game in the global library. Important structured metadata includes the two sides, date, result, event, ratings, ECO/opening when available, and a structured move tree suitable for the game viewer. Game-side links to canonical Players may be unresolved when identity is not known safely.

A game should not be duplicated merely because it is relevant to more than one tournament or observed in more than one import.

### Source

Represents where data came from, for example `Manual`, `TWIC`, or `Danbase`. Initial source handling may be simple, but games/imports must retain enough provenance to support source filtering and later source-specific importers.

### Import

Represents one administrator ingestion attempt, including source, time, filename or equivalent input identity, summary counts, and per-game success/duplicate/error outcomes. Import/provenance records should retain the original PGN information and can point to an existing Game when a duplicate is detected.

### Player alias / unresolved identity

Later first-phase work introduces explicit resolution of imported names that could not be matched safely. A remembered alias may help future exact matching, but ambiguous aliases must not become automatic merge rules.

## Delivery strategy

The order below is intentionally optimized for learning.

Tasks 001–005 create the tournament-to-opponent-to-game-review workflow using developer/fixture-loaded game data. This lets the coach test the product's most important interaction before the project invests in a complete self-service ingestion flow.

Tasks 006–008 then make PGN ingestion self-service for the administrator. The parsing UI is separated from persistence so parser quality and error presentation can be validated independently. Persistence is separated from duplicate handling so each pull request remains a coherent, testable vertical slice.

Task 009 improves real-world data quality by letting an administrator resolve identities that conservative automatic matching intentionally leaves unresolved.

All tasks assume their stated prerequisite tasks have been merged. Each task should be implemented on its own feature branch and pull request.

## Ordered task list

1. [Task 001 — Create and view tournaments](tasks/task-001-create-and-view-tournaments.md) — An administrator can create a tournament through the deployed UI and reopen it later.
2. [Task 002 — Manage tournament opponents](tasks/task-002-manage-tournament-opponents.md) — An administrator can add potential opponents to a tournament, and the coach can search and open them.
3. [Task 003 — Browse seeded opponent games](tasks/task-003-browse-seeded-opponent-games.md) — The coach can open an opponent and scan globally stored games loaded through deterministic developer/fixture data.
4. [Task 004 — Filter and sort opponent games](tasks/task-004-filter-and-sort-opponent-games.md) — The coach can narrow an opponent's games by color, date, opponent rating, result, and source, then sort the result set.
5. [Task 005 — Replay games on a chessboard](tasks/task-005-replay-games-on-chessboard.md) — The coach can open a game, step through moves, click notation, and inspect comments/variations on desktop and tablet.
6. [Task 006 — Preview PGN imports](tasks/task-006-preview-pgn-imports.md) — An administrator can upload a PGN file and see a recoverable parse preview and errors without writing to the database.
7. [Task 007 — Persist PGN imports](tasks/task-007-persist-pgn-imports.md) — An administrator can confirm a parsed import, persist games/provenance, and make safely matched games immediately visible to the coach.
8. [Task 008 — Deduplicate and track imports](tasks/task-008-deduplicate-and-track-imports.md) — Re-importing known games no longer creates obvious duplicates, and the administrator receives durable import summaries/history.
9. [Task 009 — Resolve player identities](tasks/task-009-resolve-player-identities.md) — An administrator can manually attach unresolved imported names to the correct player and optionally remember safe aliases.

This list is authoritative. If future work changes task order or scope, update this document and the affected task documents together.

## Milestones

### First Coach-Usable MVP — completed by Task 005

After Task 005, a developer/administrator may still need to load game data manually or through fixtures, but the coach can perform genuine preparation in a deployed application:

- open a tournament;
- search/select a potential opponent;
- see that player's known global games;
- filter by color, date, opponent rating, result, and source;
- sort the remaining games;
- open and replay a game on an interactive board with notation, comments, and variations.

This milestone should be tested with the coach before expanding the import system further.

### First Self-Service Import MVP — completed by Task 008

After Task 008, an administrator can add new PGN data without editing code or database records:

- upload a PGN file;
- receive a parse/import result;
- persist successfully parsed games with original PGN/provenance;
- have conservatively matched games appear for the relevant players;
- skip/report obvious duplicates rather than creating extra Game records;
- inspect import history and counts for parsed, imported, duplicate, and failed games.

Task 009 improves the unresolved-identity workflow but is not required to reach the first self-service import milestone.

## Cross-task implementation constraints

### Migrations

When a task changes the Drizzle schema, generate and commit the migration. Apply it to the Neon `preview` branch before testing the Vercel Preview deployment. Do not add automatic production migration execution to Vercel builds. Production migration timing should remain an explicit deployment step around merge/release.

### Validation

Unless a task explicitly has no relevant application changes, implementation pull requests should run the repository's current validation commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Database-backed tasks should also confirm `GET /api/health` against the migrated Preview environment.

### Backward-compatible slices

Each pull request should keep previously delivered user flows working. A later task may extend a schema or page, but it should not intentionally break an earlier milestone while waiting for another task.

### Responsive behavior

Coach-facing browsing and game review must remain usable on desktop, laptop, and iPad/tablet-sized screens. Admin-only import forms should also remain functional on tablet, but desktop-first density is acceptable where appropriate.

## Deferred functionality

The following are intentionally outside the first implementation phase unless a later planning revision explicitly promotes them:

- automatic TWIC updates;
- Danbase synchronization;
- Swedish federation importer;
- Polish ChessArbiter importer;
- Chess-Results integration;
- automated tournament participant imports;
- FIDE API lookup;
- fuzzy or advanced automated player-identity resolution;
- opening statistics and opening-tree generation;
- position search;
- opponent opening reports;
- Lichess Study synchronization;
- the player's repertoire import;
- position-based repertoire intersection;
- automatic coach preparation Studies;
- automatic Swiss-tournament preparation;
- offline/iPad tournament packs;
- Stockfish analysis/evaluations;
- LLM summaries;
- representative-game ranking;
- scraping infrastructure or scheduled national-source crawlers;
- general-purpose user/role management beyond what is necessary to keep the private application appropriately protected.

These ideas should not inflate the early task scopes. Validate the basic opponent-browsing workflow with real users first.
