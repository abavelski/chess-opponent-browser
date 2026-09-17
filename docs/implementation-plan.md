# Chess Opponent Browser — Revised Implementation Plan

## Status

Tasks 001–009 delivered the original tournament, game-browser, PGN-import, deduplication, and manual player-resolution foundation. This document now defines the product direction from Task 010 onward.

The new direction is intentionally simpler. The application is not trying to become a general chess database or tournament-management system. Its job is to let an administrator prepare a small opponent library locally and share it with a coach through a simple web link.

## Product goal

The real workflow starts with a large local PGN database, such as Danbase opened through En Croissant.

Before an upcoming tournament, the administrator knows the likely field. For each opponent, the administrator extracts that player's games from the large local database into a smaller PGN file. That smaller PGN is an **opponent pack**.

The desired end-to-end workflow is:

1. Keep the large chess database local.
2. Run a small Node.js script for an opponent name, producing a PGN containing that opponent's games.
3. Upload that PGN to Chess Opponent Browser.
4. The website identifies the focal opponent for the pack, creates or reuses the canonical Player, adds that Player to the preparation tournament, and links the pack's games to that Player.
5. Repeat for the tournament field, for example 50 opponents in a Swiss tournament.
6. Share the website link with the coach.
7. The coach opens the opponent list, clicks a player, filters that player's games, and replays individual games.

The primary product metric remains **time from opponent name to useful games**, but the administrator workflow is now explicitly based on pre-filtered opponent packs rather than importing a general chess database into the website.

## Product principles

### 1. Opponent packs are the normal ingestion unit

A normal import is not an arbitrary PGN collection. It represents research for one focal opponent.

The website should therefore ask or infer: **Which player is this pack about?** Once that focal player is known, importing the pack should automatically make the player browsable in the preparation tournament.

The application should not require the administrator to import games, visit an unresolved-player queue, resolve the focal player, then separately add that Player to a tournament. That workflow is too indirect for the actual use case.

### 2. One preparation tournament is enough for the UI

The existing multi-tournament schema can remain because removing it would create unnecessary migration work. The user-facing product, however, should optimize for one active preparation tournament/workspace.

Do not invest in richer tournament management. New flows should default to the single preparation tournament and avoid asking the administrator to repeat tournament selection when it is unnecessary.

### 3. Player creation should happen during pack import

When an opponent pack is imported, the focal player should be reused when an unambiguous canonical Player already exists and otherwise created automatically.

A successful opponent-pack import should also ensure that Player is in the preparation tournament roster. Adding an existing resolved Player to a tournament must also work directly from the roster UI.

Manual unresolved-player resolution remains a fallback for ambiguous historical/general imports, not the expected path for opponent packs.

### 4. Existing deduplication may remain, but it must not block pack linking

Perfect duplicate handling is not a product priority. The local extraction workflow can already keep input reasonably clean.

The current global Game fingerprint/deduplication system does not need to be removed. A game between A and B does not need two physical Game rows just because it appears in both A's pack and B's pack. It is sufficient—and preferable—for the same Game to be visible from both Player pages.

The important requirement is this: **when an opponent pack hits an already-known duplicate Game, the import must still be allowed to attach the focal Player to the matching unresolved game side.** Deduplication must not cause the second player's research pack to disappear.

### 5. Preserve the existing coach experience

The already-delivered coach features remain useful and should not be redesigned unnecessarily:

- opponent list/search;
- player game list;
- color/date/rating/result/source filters;
- sorting;
- game detail page;
- interactive board and notation.

Future work should primarily simplify getting data into those views.

### 6. Keep the large source database local

Danbase synchronization, En Croissant integration, scraping, and large server-side database imports are not required.

The website receives only the smaller PGN packs that the administrator deliberately chooses to share. This keeps the deployed application small and the workflow understandable.

## Existing foundation

The following capabilities are already implemented and should be reused rather than replaced:

1. Tournament and tournament-participant schema/UI.
2. Canonical global Players.
3. Global Games with structured moves and original PGN.
4. Opponent game browsing, filtering, sorting, and replay.
5. PGN parsing and import preview.
6. Persistent imports and provenance.
7. Duplicate fingerprints and import history.
8. Player aliases and manual unresolved-player resolution.

The main gap is not storage or browsing. It is that import, canonical Player creation, and tournament participation are still separate workflows.

## Target workflow

### Administrator

For each expected opponent:

```text
large local Danbase PGN
        ↓
local extraction script --name "Opponent Name"
        ↓
opponent-name.pgn
        ↓
website import
        ↓
identify focal player
        ↓
create/reuse Player + add to preparation roster
        ↓
link imported/new-or-duplicate games to that Player
```

After importing all packs, the preparation roster is the complete coach-facing opponent list.

### Coach

```text
shared link
   ↓
opponent list
   ↓
player
   ↓
filtered games
   ↓
game board
```

No import history, unresolved-player tooling, tournament creation, or other administrator concepts need to be prominent in the coach path.

## Ordered incremental tasks

The tasks below are intentionally small and build on the current production application.

### Task 010 — Reuse existing Players when adding tournament opponents

Fix the current roster gap first.

The Add opponent flow should search existing canonical Players by canonical name, remembered alias, and FIDE ID. The administrator should be able to select an existing Player and add that Player to the tournament without creating a duplicate Player record.

Requirements:

- server-side search over canonical player name, alias text, and FIDE ID;
- clearly show canonical name and FIDE ID when available;
- exclude or label Players already in the tournament;
- selecting an existing Player creates only the `tournament_participants` row;
- keep the existing create-new-Player path for names that do not exist;
- no schema migration should be required.

Acceptance example: Production Player `alexeibavelski` can be found by name and added to the current tournament even though the Player has no FIDE ID.

### Task 011 — Import an opponent pack directly into the preparation roster

Extend the existing PGN import flow with the concept of one focal player.

The preview should inspect the parsed games and find player names that occur throughout the pack. If exactly one imported name appears in every parsed game, preselect it as the focal player. If detection is not unique, let the administrator choose one of the player names found in the PGN.

On confirmation:

1. Resolve the focal imported identity by exact FIDE ID when safely available, then exact remembered alias/canonical name.
2. If no canonical Player exists, create one using the selected imported name; allow the administrator to edit the canonical display name before confirmation.
3. Ensure the Player is a participant in the preparation tournament; repeated imports must be idempotent here.
4. Link every matching White/Black side in newly inserted games to that Player.
5. When the Game is an existing duplicate, also link the matching side if that side is currently unresolved.
6. Never overwrite a side already linked to a different canonical Player. Report that as a conflict instead.
7. Leave the non-focal opponent side unresolved unless normal conservative matching can resolve it safely.

The import result should emphasize the useful outcome:

- focal opponent created or reused;
- opponent added/already present in preparation roster;
- number of games now visible for that opponent;
- duplicate games reused;
- conflicts/errors, if any.

The unresolved-player queue remains available for exceptional cases but should no longer be needed for a normal opponent-pack import.

### Task 012 — Add the local Danbase opponent-extraction script

Add a Node.js CLI script to the repository for local use. It should read a large PGN file and write a smaller PGN containing only games where the requested player appears as White or Black.

Example intended usage:

```bash
npm run extract:opponent -- \
  --input /path/to/danbase.pgn \
  --name "Nielsen,Jens Ove Fries" \
  --output ./packs/jens-ove-fries.pgn
```

Requirements:

- Node.js only; no separate service;
- process games incrementally/streamingly so a large PGN does not need to be loaded fully into memory;
- preserve each selected game's PGN text rather than rewriting moves/tags;
- compare the `White` and `Black` tags using the same basic Unicode/whitespace/case normalization used by the web importer;
- support repeatable optional aliases so local source spelling variants can be included deliberately;
- print a useful summary: games scanned, games matched, output path;
- fail clearly when the input file is missing, output cannot be written, or no player name is supplied;
- add a short usage document.

No automatic FIDE lookup, fuzzy matching, En Croissant plugin, or Danbase-specific network integration is needed.

### Task 013 — Simplify the application around one preparation tournament

After opponent-pack import works, reduce navigation friction without changing the underlying multi-tournament schema.

Requirements:

- make the single preparation tournament/opponent roster the primary landing experience;
- when there is exactly one tournament, go directly to or prominently render its opponent list rather than making the coach choose a tournament first;
- keep tournament creation/management secondary/admin-only in presentation;
- make `Import opponent pack` the primary administrator action from the preparation roster;
- keep Import history and Unresolved players available as secondary troubleshooting tools;
- preserve stable shareable URLs to opponent and game pages;
- no destructive migration to remove tournament tables.

If multiple old/test tournaments exist, preserve access to them rather than deleting data. The simplification is a UI/product default, not a destructive schema rewrite.

## Milestone — Coach-shareable tournament pack

After Task 013, the target workflow is complete:

- administrator extracts one PGN pack per opponent locally;
- administrator uploads each pack;
- focal Player is created/reused automatically;
- focal Player is added to the preparation roster automatically;
- the opponent's imported games are immediately browsable;
- importing the same A-vs-B game through both A's and B's packs can make that one logical Game visible under both Players;
- administrator repeats this for the tournament field;
- coach receives one link, opens the opponent list, filters games, and replays them.

This is the product milestone to optimize for. Work after it should be driven by real preparation/coach feedback rather than by database completeness.

## Implementation constraints

### Prefer incremental changes over redesign

Keep the current schema, importer, deduplication, aliases, tournament model, game browser, and board viewer unless a concrete task cannot be completed safely without changing them.

Do not rewrite Tasks 001–009 merely to fit the new mental model.

### Database migrations

Task 010 should require no migration. Task 011 should first attempt to implement pack behavior with the existing Player, alias, tournament-participant, Game, and Import tables. Add schema only if a concrete missing invariant requires it.

Task 013 explicitly should not remove the existing multi-tournament schema.

### Matching safety

The focal player is explicitly chosen by the administrator during an opponent-pack import, so linking that selected imported identity is deliberate rather than fuzzy inference.

Do not silently use substring, phonetic, or probabilistic name matching. Do not overwrite an existing conflicting canonical game-side link.

### Validation

Each implementation change should keep the existing validation gates green:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Database-backed changes should also validate the relevant import/roster behavior in Preview before Production release.

## Deprioritized or deferred work

The following should not drive near-term development:

- richer multi-tournament management;
- perfect global duplicate detection;
- automatic bulk tournament participant imports;
- server-side Danbase synchronization;
- direct En Croissant integration/plugin development;
- TWIC/federation/Chess-Results scrapers;
- fuzzy player matching;
- external FIDE API lookup;
- automatic resolution of every non-focal player in imported games;
- opening reports/statistics;
- engine analysis;
- Lichess Study synchronization;
- repertoire management;
- AI summaries;
- general-purpose accounts/roles beyond what is needed to protect the private shared application.

## Authoritative next order

Tasks 001–009 are complete historical foundation. The next implementation order is:

1. Task 010 — reuse existing Players in tournament roster;
2. Task 011 — opponent-pack import with automatic roster/player linking;
3. Task 012 — local Danbase opponent extraction script;
4. Task 013 — simplify the coach/admin UI around one preparation tournament.

If real use shows that Task 012 is needed earlier for testing, it can be implemented before Task 011 without architectural impact. Otherwise this order keeps the smallest production bug fix first and then delivers the core automated opponent-pack workflow.