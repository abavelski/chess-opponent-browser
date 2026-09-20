# Extract and upload opponents from Danbase

The local opponent CLI extracts small PGN packs from a large Danbase file and uploads them directly into the active tournament, or into an explicit tournament nickname.

The full Danbase file never leaves your computer. Only each extracted opponent pack is sent to the app. Extracted packs are kept under `./packs` by default.

## Single opponent

From the repository root:

```bash
npm run add-opponent -- "Nielsen, Jens Ove Fries"
```

The default source database is:

```text
C:/dev/danbase.pgn
```

Override it when needed:

```bash
npm run add-opponent -- "Nielsen, Jens Ove Fries" --input /path/to/danbase.pgn
```

## Multiple opponents

Create a text file with one name per line:

```text
Nielsen, Jens Ove Fries
Bavelski, Nikolaj
Another Player
```

Blank lines and lines beginning with `#` are ignored. Duplicate names are collapsed.

Then run:

```bash
npm run add-opponents -- ./opponents.txt
```

The command extracts and uploads each opponent sequentially.

## Options

```text
-i, --input <path>      Danbase PGN (default: ~/Downloads/danbase.pgn)
-f, --file <path>       Text file with one opponent name per line
-u, --url <url>         App URL
    --packs-dir <path>  Extracted packs folder (default: ./packs)
    --tournament <name> Explicit tournament nickname (default: active)
-h, --help              Show help
```

The default target is `https://chess-opponent-browser.vercel.app`. You can also set `OPPONENT_BROWSER_URL` or pass `--url`, for example when testing locally.

## Duplicate behavior

The import path is idempotent at the game and tournament-roster level.

- an opponent already in the active tournament is not added twice;
- games already stored are counted as duplicates instead of being recreated;
- rerunning an unchanged opponent pack exits successfully and reports it as already up to date;
- if Danbase has gained new games, only the new games are added.

The command keeps the extracted PGN file in `packs/` even when upload fails, so it can be inspected or retried.

## API endpoint

The CLI posts each extracted pack to:

```text
POST /api/admin/opponents/import
```

The endpoint accepts multipart form data with `name`, `pgnFile`, and an optional `tournamentNickname`. An explicit nickname targets that tournament directly; when omitted, the endpoint uses the active tournament.

This endpoint is intentionally unauthenticated for the current personal-project setup.
