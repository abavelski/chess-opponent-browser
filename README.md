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

Preview participant changes and game packs without changing the hosted database. The refreshed snapshot, extracted packs, and `sync-state.json` remain in the local tournament workspace:

```bash
npm run sync-tournament -- furesoe-open-2026 --dry-run
```

Roster removals above 25% are rejected unless the reviewed run is repeated with `--force`.

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

The nickname fetches that exact tournament's URL and optional participant group from the app, whether or not it is active. Omit the nickname to use the active tournament. A group-filtered sync reconciles only the selected roster while preserving global players and games. Defaults are `C:\dev\danbase.pgn`, per-tournament snapshot/pack paths, and the Production app URL. Override them with `--url`, `--danbase`, `--file`, `--packs-dir`, and `--app-url`. The browser's active tournament is never changed by CLI synchronization.

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

## Git workflow

This personal project normally commits directly to `main`; GitHub Actions and the Vercel Production deployment validate each push.
