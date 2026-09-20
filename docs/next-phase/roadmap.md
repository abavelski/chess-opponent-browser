# Roadmap

The stages below are ordered to minimize rework. Later stages should not be started merely because they are interesting; each should earn its complexity by removing a real preparation bottleneck.

## P0 — Make the current sync safely multi-tournament

### Goal

A local machine should be able to prepare any saved tournament without changing the hosted "active tournament", overwriting another tournament's local snapshot, or accidentally uploading games into the wrong roster.

### Changes

#### Per-tournament local workspace

Replace the singleton default:

```text
data/participants.json
packs/
```

with a structure derived from tournament nickname:

```text
data/
  config.json
  tournaments/
    dm2026u14/
      participants.json
      sync-state.json
    furesoe-open-2026/
      participants.json
      sync-state.json

packs/
  dm2026u14/
  furesoe-open-2026/
```

Explicit `--file` and `--packs-dir` overrides should continue to work.

Acceptance criteria:

- running sync for tournament A cannot overwrite the local state of tournament B;
- `sync-tournament <nickname>` works whether or not that tournament is the browser's active tournament;
- omitting nickname continues to mean "use the active tournament".

#### Decouple sync target from active tournament

The "active" flag is useful for the browser home page. It should not be required for explicit CLI operations.

Change the API semantics:

- no tournament identifier supplied -> use active tournament;
- explicit nickname supplied -> use that exact tournament;
- game upload accepts a tournament nickname/id rather than always targeting active.

This makes "active" a UI default, not a global synchronization lock.

#### Add dry-run and destructive-diff protection

Participant reconciliation can remove roster rows. Add:

```text
prep sync <nickname> --dry-run
```

The dry-run should report:

- participant additions;
- participant removals;
- identity matches/creates;
- rating changes;
- game packs that would be uploaded.

Add a safety threshold for unexpected roster shrinkage. For example, a large percentage removal should require an explicit `--force`.

The server-side roster reconciliation should execute transactionally so an error cannot leave half of the participants updated.

### Why this comes first

The current local snapshot and active-tournament assumptions are the main blockers to safely preparing more than one tournament.

---

## P1 — Make sync state observable and trustworthy

### Goal

After running a sync, it should be obvious what happened, what failed, what is stale, and what still needs attention.

### Add a sync-run concept

Import history was designed around PGN files. Tournament synchronization now deserves its own model.

Suggested hosted model:

```text
sync_runs
- id
- tournament_id
- kind                 # participants / ratings / games / full
- started_at
- completed_at
- status
- snapshot_hash
- summary_json
- error_text
```

Do not create one noisy "import" as the primary operational record for every focal opponent. Imports can remain as low-level PGN persistence history while sync runs summarize the actual preparation operation.

### Fix rating freshness semantics

The current local workflow has one `ratingsUpdatedAt` timestamp even though DSU and FIDE are fetched separately, and per-player failures can still result in the snapshot being marked freshly updated.

Replace this with provider-specific freshness, ideally per player:

```text
dsuRatingUpdatedAt
fideRatingUpdatedAt
```

At minimum:

- only mark a provider fresh when its fetch succeeded;
- do not overwrite a good hosted rating with null because a source failed;
- support `--ratings=stale` so normal sync refreshes only ratings older than a configurable TTL.

### Harden DSU/FIDE scraping

The Puppeteer selectors are currently embedded inside the CLI script.

Move them into source adapters with pure parser functions and saved HTML fixtures:

```text
lib/local/sources/dsu/
lib/local/sources/fide/
```

Tests should fail clearly when a provider changes page structure.

Prefer a stable HTTP/JSON endpoint over browser automation if one becomes available, but keep Puppeteer as an implementation detail behind the adapter.

### Build a parser regression corpus

Production import history currently contains parse failures, especially:

- games containing no moves;
- malformed/merged game boundaries;
- legal-move resolution failures.

Keep representative failing PGNs as regression fixtures. Do not silently broaden the parser until the specific input is understood.

---

## P2 — Add Admin data health and cleanup

**Status: implemented on 2026-09-20.** Archive/restore lifecycle, Admin health views, player health filters and merge history, conservative player merge, game/source inspection and deletion, sync-status view, and duplicate-only import-history pruning are now available. Source-occurrence removal remains intentionally deferred to P3 because the current game model does not yet represent independent source occurrences.

### Goal

The application should be maintainable after many tournament cycles without manually editing the database.

### Admin information architecture

Split Admin conceptually into:

- Tournaments
- Sync status
- Players
- Games and sources
- Import/sync history
- Data health

Keep the visual design compact.

### Tournament lifecycle

Add an archive concept instead of relying only on deletion.

Suggested states:

- active;
- inactive;
- archived.

The front page opens the active tournament. Old tournaments stay queryable but do not clutter normal preparation.

Permanent deletion remains an advanced action.

### Player cleanup

Add filters for:

- duplicate candidates;
- no DSU/FIDE ID;
- fully orphaned;
- game-only;
- roster without games;
- unresolved aliases.

Production currently has 54 fully orphaned players, making this immediately useful.

#### Player merge

This is more important than a generic delete button.

A player merge should preview and then transactionally:

- move tournament memberships;
- move White/Black game links;
- move aliases;
- move external identities;
- resolve duplicate participant rows;
- preserve the target player's stronger identifiers/metadata;
- record the merge in an audit/history row.

Do not automatically delete "game-only" players; historical players are useful global data.

### Game cleanup

Provide:

- inspect game provenance;
- remove a bad source occurrence;
- delete a canonical game only when explicitly requested;
- show parser/import errors associated with it.

### History cleanup

Allow pruning low-value import-history rows without deleting canonical games.

A common candidate is old duplicate-only import history once sync-run summaries exist.

---

## P3 — Redesign game provenance before adding many sources

### Goal

One real chess game can be found in Danbase, a Lichess broadcast, another local PGN database, or a manually downloaded event file without losing any source-specific information.

### Problem in the current model

A canonical `games` row currently owns:

- one `source_id`;
- one `original_pgn`;
- one structured move representation.

The duplicate fingerprint is global.

If Danbase is imported first and a richer Lichess broadcast version of the same game arrives later, the later game can be recognized as a duplicate but its richer PGN does not naturally become the canonical representation.

Also, the current fingerprint includes normalized raw player names. Different spellings across sources can therefore prevent otherwise identical games from deduplicating.

### Introduce source occurrences

Suggested model:

```text
game_sources
- id
- key
- type
- label
- base_url
- metadata

game_occurrences
- id
- game_id
- source_id
- external_id
- source_url
- retrieved_at
- original_pgn
- raw_tags
- structured_moves
- quality_flags
- source_fingerprint
```

The canonical `games` row should contain the identity/search fields for the chess game, while source-specific raw data lives in occurrences.

Optionally add:

```text
games.preferred_occurrence_id
```

A preference policy can choose the richest occurrence for display/copy:

- reliable full PGN;
- clocks;
- comments/annotations;
- complete ratings/IDs;
- known source quality.

### Fingerprint v2

Design a fingerprint that is less dependent on source spelling.

Candidate inputs:

- main-line move hash;
- played date when known;
- result;
- resolved canonical player IDs or FIDE IDs when available.

Raw names can remain a fallback signal, not the primary identity.

Keep collision handling conservative. Ambiguous candidate duplicates should be reviewable rather than force-merged.

---

## P4 — Add a local SQLite source catalog

### Goal

Avoid rescanning every large local database on every tournament preparation run, and make multiple local databases cheap to search.

### Important boundary

Do not turn SQLite into a second canonical copy of the hosted application.

Use it as a local search/cache/index for source material.

Suggested local tables:

```text
sources
- id
- key
- type
- path_or_url
- file_size
- modified_at
- content_signature
- indexed_at

source_games
- id
- source_id
- source_game_key
- white_name
- black_name
- white_fide_id
- black_fide_id
- played_on
- result
- move_hash
- byte_offset / byte_length OR cached_pgn

source_player_names
- normalized_name
- source_game_id
- side

source_sync_state
- source_id
- status
- last_error
```

Two reasonable storage strategies:

1. Store source PGN byte offsets and read the original database on demand.
2. Store each extracted raw PGN in SQLite.

Start with whichever makes the implementation simpler and benchmark the index size before optimizing.

### Incremental re-indexing

Use file metadata/signatures to detect source changes.

For a replaced Danbase file:

- recognize that the source changed;
- rebuild or incrementally replace its index;
- do not rescan unchanged sources.

### Multi-source configuration

Example local config:

```json
{
  "appUrl": "https://chess-opponent-browser.vercel.app",
  "sources": [
    {
      "key": "danbase",
      "type": "pgn-file",
      "path": "C:/dev/danbase.pgn"
    },
    {
      "key": "club-archive",
      "type": "pgn-directory",
      "path": "C:/chess/pgn"
    }
  ]
}
```

Then tournament preparation queries all enabled local sources in one pass against the index.

---

## P5 — Add more game sources through adapters

### Goal

Source expansion should be additive rather than adding source-specific logic to the central sync script.

Define a common conceptual interface:

```text
source.status()
source.discover(player/tournament)
source.fetch(candidate)
source.normalize(raw)
source.provenance()
```

Not every adapter needs every operation.

### Recommended source order

#### 1. Additional local PGN files/directories

Lowest risk and immediately useful.

Support:

- one PGN file;
- a directory of PGN files;
- multiple configured source roots.

Index them into the same local catalog.

#### 2. Lichess broadcasts

This is the best first online source.

Lichess broadcasts provide downloadable tournament/round PGNs and a streaming API. Official broadcast games are also published in Lichess' open broadcast database.

Start with explicit URLs/IDs:

```text
prep source add lichess-broadcast <url>
prep source sync lichess-broadcast <id>
```

Do not begin by trying to automatically identify every possible broadcast from a player's name.

Useful references:

- https://lichess.org/broadcast/help
- https://database.lichess.org/
- https://lichess.org/page/api-tips

#### 3. Generic PGN URL

Many tournament sites expose a PGN endpoint even when their UI is different.

A generic HTTP PGN adapter gives broad value without site-specific scraping.

#### 4. Lichess user games

Only do this when a canonical player has an explicitly mapped Lichess account.

Add a provider identity model such as:

```text
player_external_accounts
- player_id
- provider
- external_id
- profile_url
```

Never infer a Lichess username solely from display name.

#### 5. Web discovery

Google/web search is useful for finding candidate event pages and Lichess broadcasts, but it should initially be a discovery aid rather than a trusted ingestion source.

Preferred workflow:

1. search;
2. show candidate URLs;
3. select/approve a candidate;
4. hand it to a provider-specific adapter.

This avoids making core preparation dependent on brittle search-result scraping.

---

## P6 — Replace the collection of npm scripts with one preparation CLI

### Goal

Make the local workflow discoverable without memorizing script names and flags.

### First build a conventional command tree

Example:

```text
prep tournament list
prep tournament use dm2026u14
prep tournament status dm2026u14

prep sync dm2026u14
prep sync dm2026u14 --ratings=stale
prep sync dm2026u14 --dry-run
prep sync dm2026u14 --source danbase

prep source list
prep source add pgn-file danbase C:/dev/danbase.pgn
prep source index danbase
prep source status

prep player find "Nikolaj Bavelski"
prep doctor
```

Useful global options:

- `--dry-run`
- `--json`
- `--verbose`
- `--resume`
- `--app-url`
- `--config`

### Refactor before adding the UI

The current `scripts/sync-tournament.mjs` mixes:

- CLI parsing;
- Puppeteer;
- provider parsing;
- local persistence;
- app API calls;
- orchestration;
- console output.

Extract reusable services first. The interactive CLI should call the same command functions as normal non-interactive commands.

### Then add an optional interactive shell

A Copilot-like local shell can be useful once commands are stable:

```text
prep shell

/use dm2026u14
/status
/sync
/sync ratings
/sources
/find Nikolaj Bavelski
/discover Nikolaj Bavelski
/doctor
/quit
```

Start with Node readline and simple completion/history. A full TUI framework is unnecessary unless the shell proves useful.

The slash shell should be a convenience layer, not a separate implementation.

---

## P7 — Higher-value preparation features

These should come after synchronization and provenance are reliable.

### "What changed?" report

After each sync show:

- new participants;
- removed participants;
- rating changes;
- newly discovered games;
- opponents with no games;
- source/parser failures.

This is likely more valuable before a tournament than raw import-history pages.

### Coverage indicators

For each opponent show compact preparation health:

- games known;
- newest game date;
- sources represented;
- DSU/FIDE freshness;
- whether new games appeared since last review.

Keep this mostly in Admin or a subtle roster column so the preparation UI stays uncluttered.

### Opening/preparation summary

For an opponent:

- most frequent first-move/opening families by color;
- recent opening choices;
- performance against rating bands;
- recent deviations;
- quick links into representative games.

Avoid pretending small samples are statistically strong.

### Notes and preparation status

Simple per-tournament notes can add a lot of value:

- "reviewed";
- "priority";
- free-text coach/player notes;
- tagged games;
- external Lichess study URL.

These should be tournament-specific, not global player attributes.

### Better PGN export

Extend the current single-game Copy PGN workflow with:

- copy/download all currently filtered games;
- download an opponent pack;
- optionally export selected games in one multi-game PGN for a coach.

---

## P8 — Small hardening tasks worth doing before destructive Admin APIs

Authentication is not a current product priority, but the Production sync endpoints are public mutation endpoints.

Before adding player merge, cleanup, or bulk delete APIs, add at least a lightweight shared CLI/Admin token or another simple request guard.

Also add:

- request size limits per endpoint;
- structured error codes;
- an operation/request ID in sync logs;
- explicit confirmation for destructive cleanup;
- dry-run support wherever practical.

---

## Suggested immediate implementation sequence

The next commits should probably be:

1. derive local snapshot/pack paths from tournament nickname;
2. allow explicit tournament sync/upload without requiring active status;
3. add `--dry-run` plus roster-removal safety checks;
4. make server roster reconciliation transactional;
5. split DSU/FIDE/Danbase/app-client logic out of the monolithic sync script;
6. record provider-specific rating freshness;
7. add Admin data-health counts and player merge design;
8. introduce game-source occurrence/provenance schema;
9. only then add Lichess broadcast ingestion;
10. add the local SQLite source index when multiple source scans become the bottleneck;
11. consolidate commands under `prep`;
12. add `prep shell` if the command workflow still benefits from an interactive layer.
