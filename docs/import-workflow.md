# PGN import workflow

The administrator import flow lives at `/imports/new`.

## Current workflow

1. Upload one `.pgn` file (maximum 3 MB) and provide a source label.
2. Review the server-parsed preview, including per-game parse errors.
3. Confirm the import explicitly.
4. The server reparses the original PGN, resolves player identities conservatively, and persists successfully parsed games.
5. Review the final counts for parsed, imported, failed, and unresolved sides.
6. When a matched player belongs to a tournament roster, use the result link to open that player and verify the game through the normal filter/viewer flow.

Imported games retain their exact PGN segment and raw tags in provenance records, while the Game row stores the structured move tree used by the existing replay viewer.

## Identity matching

A side is linked to an existing canonical Player only when either:

- its usable FIDE ID exactly matches one Player; or
- without a usable FIDE match, its normalized name exactly matches one and only one Player.

Unknown or ambiguous identities remain unresolved. Importing a PGN never creates a canonical Player automatically.

## Current limitation

Task 007 intentionally does **not** deduplicate arbitrary PGN imports. Importing the same game more than once can create multiple Game rows. Task 008 owns duplicate detection and durable import-history reporting.
