# Extract an opponent PGN pack locally

Task 012 adds a small Node.js CLI for extracting one player's games from a large local PGN such as Danbase.

The large database stays on your machine. The script reads it incrementally, keeps only games where the requested player appears in the `White` or `Black` tag, and writes those original PGN game blocks to a smaller file that can be uploaded to Chess Opponent Browser as an opponent pack.

## Usage

From the repository root:

```bash
npm run extract:opponent -- \
  --input /path/to/danbase.pgn \
  --name "Nielsen,Jens Ove Fries" \
  --output ./packs/jens-ove-fries.pgn
```

The output directory must already exist.

The command prints a summary similar to:

```text
Scanned 1250000 games; matched 119; wrote /absolute/path/packs/jens-ove-fries.pgn
```

## Name matching

Matching is deliberately exact after the same basic normalization used by the web importer:

- Unicode NFKC normalization;
- trim leading/trailing whitespace;
- collapse repeated whitespace;
- case-insensitive comparison.

There is no fuzzy matching.

If the source database contains known spelling variants, pass one or more explicit aliases:

```bash
npm run extract:opponent -- \
  --input /path/to/danbase.pgn \
  --name "Nielsen,Jens Ove Fries" \
  --alias "Jens Ove Fries Nielsen" \
  --alias "Nielsen, Jens Ove Fries" \
  --output ./packs/jens-ove-fries.pgn
```

Aliases are only used for this local extraction. They do not modify the website's Player aliases.

## Options

```text
-i, --input   Source PGN file
-n, --name    Primary player name (required)
-a, --alias   Additional exact normalized spelling; repeatable
-o, --output  Destination PGN file
-h, --help    Show command help
```

## Behavior

The script processes the file one game at a time instead of loading the full database into memory. Selected games keep their original tags, comments, variations, and move text; the script only normalizes line separation between copied games in the output file.

It exits with a clear error when the input cannot be read, the output cannot be created, the input and output paths are the same, a required argument is missing, or an unknown CLI argument is supplied.

A zero-match result is not an error: the command writes an empty output file and reports `matched 0`, which makes spelling mistakes or missing aliases easy to spot without inventing fuzzy matches.
