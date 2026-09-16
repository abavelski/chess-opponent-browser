# Chess Opponent Browser

Chess Opponent Browser will become a web application for browsing chess opponents and their games.

> Chess functionality has intentionally not been implemented yet.

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
- Vercel Preview -> Neon `preview`
- Vercel Development -> Neon `preview`

## Database migrations

Database schema lives in `lib/db/schema.ts`. Generated migrations are committed under `drizzle/`.

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

Generate and review migrations after changing the schema, then run migrations against the intended Neon branch. Production and Preview use separate Neon branches. This bootstrap does not run migrations automatically during Vercel builds, which avoids a Preview deployment mutating Production data.

For this first milestone, all Vercel Preview deployments share a dedicated Neon `preview` branch. Production uses the Neon `main` branch. Per-PR database branches can be introduced later if stronger isolation becomes necessary.

## Tests

```bash
npm test
```

The initial Vitest suite covers non-network environment logic and does not require database access.

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
- Preview and Development point to the dedicated Neon `preview` branch.

Connect the Vercel project to `abavelski/chess-opponent-browser` and configure the environment mapping above before relying on automatic deployments. No custom domain or custom deployment script is required for this milestone.

## Git workflow

Create feature branches from `main`, open pull requests back into `main`, and let GitHub Actions plus the Vercel Preview deployment validate changes before merging.

The bootstrap branch for this milestone is `chore/bootstrap-app`.
