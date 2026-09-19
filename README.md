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

The tournament sync keeps an authoritative local participant snapshot in `data/participants.json` (gitignored), reconciles the active tournament roster, extracts each participant's Danbase games, and uploads the resulting PGN packs. It is safe to run repeatedly: removed participants leave only the tournament roster, while global players and games remain; existing games are deduplicated. The normal workflow preserves previously fetched ratings without requesting DSU or FIDE pages.

Run the complete workflow:

```bash
npm run sync-tournament -- furesoe-open-2026
```

To explicitly refresh DSU and FIDE ratings as part of the complete workflow:

```bash
npm run sync-tournament -- furesoe-open-2026 --ratings
```

Individual stages are also available:

```bash
npm run sync-participants -- furesoe-open-2026 # refresh additions/removals from the saved URL/group
npm run sync-ratings      # refresh both DSU and FIDE ratings in the local file
npm run sync-dsu
npm run sync-fide
npm run sync-app          # reconcile the local file with the active app tournament
npm run sync-games        # scan Danbase once, then upload one pack per participant
```

The nickname fetches the tournament URL and optional participant group from the app. A group-filtered sync reconciles the roster, removing participants outside that group while preserving global players and games. Defaults are `C:\dev\danbase.pgn`, `data/participants.json`, `packs/`, and the Production app URL. Override them with `--url`, `--danbase`, `--file`, `--packs-dir`, and `--app-url`. New tournaments are inactive; use **Make active** on `/admin` before syncing one. Only the active tournament can be synced.

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
