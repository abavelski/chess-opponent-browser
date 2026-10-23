# Chess Opponent Browser

Chess Opponent Browser is a web application for tournament preparation and browsing chess opponents and their games.

## Stack

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS
- PostgreSQL hosted by Neon
- Drizzle ORM and Drizzle Kit
- Vitest
- ESLint
- npm
- Vercel

Game replay uses [Lichess PGN Viewer](https://github.com/lichess-org/pgn-viewer) (GPL-3.0-or-later). Its CSS and SVG chess pieces are bundled locally from the npm package.

## Local Stockfish analysis

Game review offers optional, entirely browser-side Stockfish 19 Lite evaluation. It uses
[Stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0) and
[chessops](https://github.com/niklasf/chessops) for SAN variation previews.
Click the evaluation switch above the notation to enable a single-threaded WebAssembly
worker; use the gear to adjust depth (12–24), number of principal variations (1–3),
or hash memory (16–64 MB). The worker shuts down when analysis is turned off or
the game viewer unmounts, and restarts when settings change. Moving through the PGN
stops the prior search before analyzing the selected position. Scores are from
White's perspective, with mate scores shown as #+N / #-N.

`npm run engine:assets` copies the engine JavaScript, WebAssembly and GPL license
from the pinned npm package into `public/stockfish/`. This is run automatically
before development and production builds; it does not require a third-party CDN,
shared-memory isolation headers, a server engine, or a database migration. The
Lite model is intentionally smaller and weaker than Stockfish's full-size network.

## Requirements

- Node.js 24 LTS
- npm
- Access to the Vercel project and its environment variables for hosted development
- Access to the Neon project when changing or inspecting the database

## Local development

```bash
git clone https://github.com/abavelski/chess-opponent-browser.git
cd chess-opponent-browser
npm install
cp .env.example .env.local
npm run dev
```

Set `DATABASE_URL` in `.env.local` before using database-backed routes. After the Vercel project-level environment variables are configured, developers with project access can pull the Development environment instead:

```bash
npx vercel env pull .env.local
```

The application is available at `http://localhost:3000`. The database-backed health check is available at `http://localhost:3000/api/health`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Server-only PostgreSQL connection string used by Drizzle and the health endpoint. |

Never expose `DATABASE_URL` through a `NEXT_PUBLIC_` variable and never commit local environment files.

The intended hosted environment mapping is:

- Vercel Production -> Neon `main`
- Vercel Preview -> a Neon Preview branch
- Vercel Development -> Neon Preview/development data

## Database migrations

Database schema lives in `lib/db/schema.ts`. Generated migrations are committed under `drizzle/`.

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

Generate and review migrations after changing the schema, then run migrations against the intended Neon branch. Production and Preview use separate Neon branches. Migrations do not run automatically during Vercel builds, which avoids a Preview deployment mutating Production data.

## Fixture game data

Task 003 includes an explicit, idempotent fixture loader for testing the opponent game browser before self-service PGN import exists.

```bash
FIXTURE_SEED_TARGET=preview npm run db:seed:task-003
```

`DATABASE_URL` must point at the intended migrated Preview database. The loader refuses to run without the explicit Preview target flag and must never be pointed at Production. See `docs/fixture-data.md` for the seeded tournament, players, games, safety rules, and validation steps.

## Tournament synchronization

The tournament sync keeps a separate gitignored workspace under `data/tournaments/<nickname>/`, reconciles that tournament's roster, extracts each participant's Danbase games into `packs/<nickname>/`, and uploads the resulting PGN packs to the same explicit tournament. It is safe to run repeatedly: removed participants leave only the tournament roster, while global players and games remain; existing games are deduplicated. The normal workflow preserves previously fetched ratings without requesting DSU or FIDE pages.

Run the complete workflow:

```bash
npm run sync-tournament -- furesoe-open-2026
```

To explicitly refresh DSU and FIDE ratings as part of the complete workflow:

```bash
npm run sync-tournament -- furesoe-open-2026 --ratings
```

To refresh only ratings whose provider-specific timestamp is older than 30 days:

```bash
npm run sync-tournament -- furesoe-open-2026 --ratings=stale
```

Override the freshness window with `--rating-ttl-days <days>`. Successful DSU and FIDE fetches are timestamped independently. A failed provider request preserves the last known rating and remains stale for retry.

An empty FIDE profile is retried once with a fresh URL to bypass cached empty responses. Lichess requests retry HTTP 429 twice, respecting `Retry-After` and waiting at least 60 seconds before the first retry and 120 seconds before the second. Increase `--lichess-throttle` when syncing a large roster.

Preview participant changes and game packs without changing the hosted database. The refreshed snapshot, extracted packs, and `sync-state.json` remain in the local tournament workspace:

```bash
npm run sync-tournament -- furesoe-open-2026 --dry-run
```

Roster removals above 25% are rejected unless the reviewed run is repeated with `--force`.

Unattributed bye/oversidder rows without player IDs, profiles, or ratings are ignored. A `-` placeholder is never treated as a DSU identity.

Individual stages are also available:

```bash
npm run sync-participants -- furesoe-open-2026 # refresh additions/removals from the saved URL/group
npm run sync-ratings -- furesoe-open-2026 # refresh ratings in this tournament workspace
npm run sync-dsu -- furesoe-open-2026
npm run sync-fide -- furesoe-open-2026
npm run sync-app -- furesoe-open-2026     # reconcile this tournament's local snapshot
npm run sync-games -- furesoe-open-2026   # upload packs to this exact tournament
npm run sync-lichess -- furesoe-open-2026 # import recent broadcasts by exact FIDE ID
```

Lichess broadcast discovery is opt-in. Add `--lichess` to `sync-tournament` or
`sync-games`, or run `sync-lichess` by itself. The command checks up to three recent
broadcasts per FIDE-rated participant, retains source files locally, and sends only
small player packs to the app. Historical downloads are reused; recent broadcasts are
refetched so reruns pick up newly streamed games. See `docs/add-opponents.md` for limits
and options.

For reliable bulk Lichess synchronization, set `LICHESS_TOKEN` with the `study:read` scope. Public tournament API requests are heavily rate limited.

The nickname fetches that exact tournament's URL and optional participant group from the app, whether or not it is active. Omit the nickname to use the active tournament. A group-filtered sync reconciles only the selected roster while preserving global players and games. Defaults are `data/danbase.pgn`, per-tournament snapshot/pack paths, and the Production app URL. Override them with `--url`, `--danbase`, `--file`, `--packs-dir`, and `--app-url`. The browser's active tournament is never changed by CLI synchronization.

Full syncs and standalone game syncs reconcile the roster again after imports, because a historical PGN name can resolve to a different canonical player and add that player to the roster. The saved participant snapshot remains authoritative; removing an extra roster entry preserves its global player and games. Review ambiguous identities in Admin before merging them.

Danbase extraction also uses each participant's FIDE ID, rejects name matches with a different explicit FIDE ID, and passes local aliases to the importer. The import API rejects a conflicting focal FIDE ID and prefers the requested FIDE identity over a source-name alias.

Each non-dry-run CLI operation creates one high-level sync record. Recent runs and failures are visible on `/admin`; low-level PGN imports remain in Import history. Provider parsers and representative malformed PGNs are covered by saved fixtures under `tests/fixtures/`.

If Danbase uses an older spelling for a player, add a local `danbaseAliases` array to that player in the snapshot. Participant refreshes preserve this local field.

## Tests

```bash
npm test
```

The Vitest suite covers non-network domain and validation logic and does not require database access.

## Build

Run the same checks used by CI:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The normal application build does not require a live database connection. `GET /api/health` performs `SELECT 1` at request time and returns HTTP 503 with a non-sensitive response if the database is unavailable.

## Deployment

The Vercel project is named `chess-opponent-browser` and uses the Next.js framework preset. Its intended Git integration is the standard Vercel model:

- pushes to `main` create Production deployments;
- feature branches and pull requests create Preview deployments;
- `DATABASE_URL` is stored in Vercel, never in Git;
- Production points to the Neon `main` branch;
- Preview deployments use non-production Neon data.

No custom domain or custom deployment script is required for the current milestone.

## Offline desktop application

The same pages, server actions, PGN importer, game viewer and Stockfish engine can
also run in Electron with a local SQLite database. The hosted PostgreSQL app and
its Vercel/GitHub workflows keep their existing commands and configuration.

On Windows or macOS, install the normal dependencies, then run:

```bash
npm ci
npm run desktop:build
```

This builds an installer for the current machine: a Windows `.exe` or a macOS
`.dmg`, in `desktop-dist/`. Build on each target operating system; installers are
unsigned personal builds. The first build needs internet access to install the
separately locked Electron tools under `desktop/`. Subsequent builds reuse them.
Node.js 22.17 or newer is required for local development (CI uses Node.js 24).
Installed desktop applications include their own runtime and require neither
Node.js nor a database server.

For an unpacked application, use `npm run desktop:pack`. To open the most recent
desktop build from the source checkout, use `npm run desktop:start`.
The standalone Next.js server and its assets are built into `.next-desktop/`,
independently of the web app's `.next/` output. Desktop-only generated TypeScript
configuration lives in the ignored `tsconfig.desktop.json` file.

On first launch, the app creates an **empty, independent** `chess.sqlite` database
under Electron's application-data directory:

- Windows: `%APPDATA%/chess-opponent-browser-desktop/chess.sqlite`
- macOS: `~/Library/Application Support/chess-opponent-browser-desktop/chess.sqlite`

Create tournaments and import PGN files in the app. Data persists across restarts
and installer upgrades. No hosted data is copied or synchronized automatically,
and desktop operations do not access `DATABASE_URL`. Close the app before backing
up the database; SQLite may use adjacent `-wal` and `-shm` files while it is open.
Browsing saved data, imports, replay and engine analysis work without internet.
External profile links and fetching new data from online providers still require
an internet connection. The existing CLI synchronization commands retain their
hosted-app defaults; they are not background tasks in Electron.

To copy the active web tournament into the desktop database, run:

```bash
npm run desktop:sync
```

Set `DATABASE_URL` in the shell or a local `.env.local` file to the source web
database. This command uses read-only PostgreSQL transactions and never changes
the hosted database. It backs up SQLite before merging, preserves existing local
data and annotations, reuses saved PGN packs and `data/danbase.pgn`, and downloads
only game bodies that are missing locally. The web roster selects which players
and games to copy; local participant snapshots supply cached ratings and roster
details where available. Sources, aliases and player IDs are mapped into the
independent SQLite database. Distinct web games remain distinct, including games
without duplicate fingerprints. Import history records this local copy rather
than copying unrelated hosted import history.

Re-running the command adds missing data without duplicating already copied
games. Backups, downloaded game bodies and the last summary are kept under the
ignored `data/desktop-sync/<nickname>/` directory. Use `--nickname <nickname>`
to select a different tournament, `--database <sqlite-file>` to select another
local database, `--local-pgn <file>` to scan one explicit PGN instead of the
default local files, or `--cache-dir <directory>` to change the cache location.
Reload the desktop window after a sync to display the new data. Credentials are
used only by this explicit local command and are never bundled in Electron.

The desktop build replaces only the database module. Its SQLite transport retains
Drizzle's existing PostgreSQL parameter/result mapping and translates the SQL
features currently used by the app, including atomic batches and writable CTEs.
The initial SQLite tables, constraints and indexes are derived from
`lib/db/schema.ts`; hosted Drizzle migrations are never run against SQLite.
The desktop database records a schema version and fingerprint. Future schema
changes must add an explicit desktop migration before opening older databases;
an unrecognized schema is refused without discarding existing data. New
PostgreSQL-specific query features need corresponding SQLite support and tests.

`tests/desktop-database.test.ts` runs actual import, identity and administration
queries against SQLite as part of the normal test suite, without installing
Electron. After `desktop:pack`, this additional check uses Electron's own runtime
and a hidden browser with nonlocal requests blocked:

```bash
node desktop/node_modules/electron/cli.js scripts/desktop-smoke.cjs
```

On Windows, add `--packaged` to check the unpacked installer contents as well.
This check uses a temporary database and covers tournament creation/activation,
PGN import, replay, local engine assets and saved data after a server restart.

## Git workflow

This personal project normally commits directly to `main`; GitHub Actions and the Vercel Production deployment validate each push.
