# Architecture notes

This document records the main design choices behind the roadmap.

## 1. Hosted canonical database vs local preparation catalog

### Hosted Neon database

Authoritative for:

- tournament definitions;
- active/archive state;
- canonical players;
- DSU/FIDE identity;
- aliases;
- tournament membership;
- canonical games;
- game provenance;
- notes/preparation status;
- cleanup/merge history.

### Local catalog

Authoritative only for local machine state:

- configured source paths;
- source indexes;
- cached remote source responses;
- per-tournament participant snapshot cache;
- resumable sync checkpoints;
- local aliases that have not yet been promoted into canonical hosted aliases.

This avoids two-way database synchronization as a primary architecture problem.

## 2. Tournament addressing

"Active tournament" should be a browser convenience.

All synchronization APIs should support an explicit stable tournament identifier, preferably nickname.

Rules:

- explicit nickname -> target it directly;
- no nickname -> use active;
- browser root -> active;
- archived tournament -> explicit operations allowed only when intentionally requested.

A sync should never silently switch the global active tournament.

## 3. Tournament sources

A tournament now has one generic `sourceUrl`, but future preparation naturally has multiple sources:

- DSU participant list;
- Lichess broadcast;
- official event PGN;
- standings page;
- manually supplied source.

Longer term, replace/augment `sourceUrl` with:

```text
tournament_sources
- tournament_id
- role          # participants / games / standings
- provider
- external_key
- url
- enabled
- metadata
```

Do not make this migration until at least the second source type is implemented.

## 4. Player identity

Current DSU ID and FIDE ID uniqueness is a strong base.

Add external identities only when needed:

```text
player_external_accounts
- player_id
- provider       # lichess, chesscom, etc.
- external_id
- profile_url
- verified_at
```

Important rule:

> Never auto-link an online chess account to a canonical person from display-name similarity alone.

Aliases remain useful for PGN name variants.

### Identity backfill

When a new canonical player/alias is created, offer a conservative relink job for currently-null game sides.

Safe matching order:

1. exact FIDE ID;
2. known alias;
3. unique normalized canonical name with no ID conflict.

This can gradually improve the 1,651 currently one-sided game links without inventing identities.

## 5. Canonical game and occurrences

A canonical chess game and a source copy of that game are different entities.

### Canonical game

Useful searchable identity:

- players;
- date;
- result;
- main-line move hash;
- canonical event fields.

### Occurrence

What a particular source said:

- source;
- source game ID/URL;
- raw PGN;
- raw tags;
- comments;
- clocks;
- source ratings;
- retrieval timestamp.

This makes it safe for the same game to exist in Danbase and Lichess.

### Preferred occurrence

For board display and Copy PGN, either:

- select the preferred occurrence dynamically, or
- materialize `preferred_occurrence_id`.

A simple quality ranking is sufficient initially.

## 6. Sync model

Treat synchronization as a planned reconciliation operation, not a sequence of unrelated imports.

Suggested lifecycle:

1. load tournament config;
2. load previous local state;
3. fetch participant source;
4. calculate participant diff;
5. refresh stale external metadata;
6. query enabled game sources;
7. calculate game/source diff;
8. print dry-run plan;
9. apply hosted roster transaction;
10. upload new/changed game occurrences;
11. record sync run summary;
12. update local checkpoint.

### Idempotency

Use stable source keys and game occurrence keys so repeated runs converge.

### Resume

If game upload fails on player 27/50, the next run should not need to repeat all successful uploads.

The local catalog can record per-source/per-game sync state.

## 7. Safety rules

### Roster reconciliation

- calculate removals before writing;
- abort surprising large removals unless forced;
- apply participant reconciliation in one server transaction;
- return exact add/update/remove counts.

### Player cleanup

- auto-delete only provably empty orphan players;
- merge duplicates rather than deleting identities with data;
- preview every merge.

### Game cleanup

- remove an occurrence before removing the canonical game;
- preserve the canonical game when another occurrence still supports it.

### Source failure

A failed DSU/FIDE fetch must not turn a known rating into null or claim the data was freshly updated.

## 8. CLI module boundaries

A practical target structure:

```text
cli/
  index.ts
  commands/
    sync.ts
    source.ts
    tournament.ts
    player.ts
    doctor.ts
  shell.ts

lib/local/
  config.ts
  workspace.ts
  catalog.ts
  app-client.ts
  sync/
    planner.ts
    runner.ts
  sources/
    dsu/
    fide/
    pgn/
    lichess/
```

The Next.js application should not import local-only modules that require filesystem/Puppeteer access.

Shared domain types can live in normal `lib/` modules that are environment-neutral.

## 9. Why a local SQLite catalog is useful

The current batch extractor already made an important optimization: Danbase is scanned once for all tournament participants.

SQLite becomes worthwhile when any of the following becomes true:

- several local PGN databases are enabled;
- Danbase scans take noticeable time;
- repeated tournament preparation scans the same unchanged files;
- online-source discovery results need caching;
- resumable per-game sync becomes useful.

Until then, per-tournament JSON workspaces are simpler.

When SQLite is introduced, it should accelerate discovery rather than become required for viewing the web app.

## 10. Lichess source strategy

Use source-specific APIs/PGNs rather than scraping Lichess HTML.

First support explicit Lichess Broadcast URLs/IDs.

Lichess documents real-time round/tournament PGN export and publishes official broadcast games in its open database. This makes broadcasts a better first online integration than general web scraping.

For player-account exports, require a manually verified Lichess username mapping.

## 11. Web search strategy

General search should answer "where might more games exist?", not "what is canonical data?"

A future `discover` command can output candidates:

```text
prep discover "Player Name"
- Lichess broadcast candidate
- event PGN candidate
- tournament page candidate
```

The user then approves a source adapter/import.

This keeps search engine variability outside the canonical import path.

## 12. Admin direction

The Admin page should become an operations console, not a larger version of the preparation UI.

Useful compact summaries:

- active tournament;
- participant count;
- last participant sync;
- rating freshness;
- game coverage;
- unresolved identity count;
- source health;
- last sync result.

Detailed maintenance pages can sit behind links.

The tournament/player study pages should remain clean.
