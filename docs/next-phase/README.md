# Next phase: tournament preparation roadmap

This folder captures the recommended direction after the first usable end-to-end version of Chess Opponent Browser.

The application already has a strong core loop:

1. create/configure a tournament in the hosted app;
2. fetch the tournament participants from DSU locally;
3. refresh DSU/FIDE identities and ratings when needed;
4. scan Danbase once for all participants;
5. upload extracted opponent packs;
6. study opponents in the browser and copy PGN into Lichess when needed.

The next phase should improve reliability, repeatability, source coverage, and data maintenance without turning a personal preparation tool into a large platform.

## Current state observed on 2026-09-20

Production currently contains:

- 2 tournaments;
- 170 canonical players;
- 78 tournament-participant rows;
- 1,848 canonical games;
- 153 import records;
- 1 player alias;
- 197 games with both player sides linked;
- 1,651 games with exactly one player side linked;
- 54 fully orphaned players with neither tournament membership nor linked games;
- 44 players linked to games but not currently in a tournament;
- 32 roster players with no known games;
- 40 roster players with at least one known game.

Import history currently contains substantial repeated work: 1,833 duplicate game occurrences have been encountered across prior imports. That is expected with opponent-pack imports, but it shows that "import history" and "sync history" are starting to become different concepts.

## What is already good

Several choices should be preserved:

- Neon is the durable canonical store for tournaments, players, identities, and games.
- Tournament participants are separate from global players and games.
- Tournament deletion does not destroy the global game collection.
- DSU ID and FIDE ID are first-class player identifiers.
- The Danbase batch extractor scans the source PGN once for the full roster rather than once per player.
- PGN source text is preserved.
- Game fingerprints prevent obvious duplicate game rows.
- The CLI is decomposed into participant, rating, app, and game stages.
- The browser preparation UI is intentionally compact instead of becoming a generic chess database UI.

## Main architectural tension

The hosted application is already multi-tournament and increasingly source-aware, while the local preparation workflow still behaves like one mutable workspace:

- one default `data/participants.json`;
- one default Danbase path;
- one `packs/` directory;
- sync by explicit nickname still requires that tournament to be active;
- opponent PGN upload always targets the active tournament.

This is the first thing to fix.

## Recommended direction

The design principle for the next phase is:

> Neon remains the canonical application database. The local machine gains a lightweight preparation catalog and source index, not a competing second source of truth.

The local side should become responsible for:

- tournament workspaces;
- expensive source indexing;
- cached external discovery;
- resumable sync state;
- local configuration.

The hosted side should remain responsible for:

- canonical player identities;
- tournament membership;
- canonical games;
- source provenance;
- cleanup/merge operations;
- the preparation UI.

## Priority order

1. Multi-tournament local workspaces and safer sync.
2. Better sync run tracking and Admin data-health tools.
3. Correct multi-source provenance and deduplication.
4. Local SQLite source catalog/index.
5. Additional game sources, starting with Lichess broadcasts and generic PGN sources.
6. A unified `prep` CLI and optional interactive slash-command shell.
7. Higher-level preparation features such as "what changed since last sync", opening summaries, notes, and bulk PGN export.

See:

- [roadmap.md](./roadmap.md) for the staged implementation plan.
- [architecture.md](./architecture.md) for the proposed technical shape and data-model changes.
