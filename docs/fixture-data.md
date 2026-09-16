# Task 003 fixture data

Task 003 includes a deterministic fixture loader so the seeded opponent-game workflow can be tested before the user-facing PGN importer exists.

## Safety

The fixture loader is for Preview/development data only. It never runs during `next build` or Vercel deployment. The script refuses to run unless `FIXTURE_SEED_TARGET=preview` is set, and it also refuses when `VERCEL_ENV=production`.

Do not run the fixture command with the Production `DATABASE_URL`.

## Run the fixture loader

Point `DATABASE_URL` at the intended migrated Preview database, then run:

```bash
FIXTURE_SEED_TARGET=preview npm run db:seed:task-003
```

The loader validates the fixture move documents before writing data. It creates or updates:

- two clearly labeled fixture sources;
- `Task 003 Fixture Open`;
- `Jan Kowalski` (synthetic FIDE ID `99000001`) plus fixture opponents;
- `No Games Player` for empty-state testing;
- tournament participation for Jan and the no-games player;
- five globally stored games linked to Jan, covering both colors, Win/Draw/Loss, known and unknown dates, different opponent ratings, openings, and two sources.

Fixture PGNs and structured moves are defined in `scripts/task-003-fixtures.mjs`. The structured move representation is persisted in `games.structured_moves`; normal player-page requests do not parse `games.original_pgn`.

## Idempotency

Each fixture game gets a deterministic source-scoped key. The database has a unique constraint on `(source_id, source_game_key)`, and the loader uses upserts. Re-running the command updates the same fixture records rather than adding duplicate games.

The fixture tournament ID is stored in `app_metadata` under `fixture.task003.tournament_id`, so repeated runs reuse the same tournament even though normal tournament names are intentionally not globally unique.

## Manual validation

After seeding Preview:

1. Open `Task 003 Fixture Open`.
2. Open `Jan Kowalski` and verify five games are listed newest-first, with the unknown-date game last.
3. Confirm Jan appears as both White and Black and that Win/Draw/Loss are from Jan's perspective.
4. Confirm event, opponent rating, ECO/opening, and fixture source labels render when present.
5. Open `No Games Player` and confirm the empty state remains.
6. Run the seed command again and confirm Jan still has five games.
7. Confirm `/api/health` returns an OK database status.

Production receives the Task 003 schema migration when the feature is promoted, but fixture/demo rows must not be seeded into Production.
