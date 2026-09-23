ALTER TABLE "games" ADD COLUMN "move_fingerprint" varchar(32);--> statement-breakpoint
CREATE TABLE "_migration_0011_game_move_dedup" AS
WITH "keyed" AS (
  SELECT
    "games"."id",
    md5(
      'v2|' ||
      coalesce(
        'fide:' || nullif(btrim("games"."white_fide_id"), ''),
        'fide:' || nullif(btrim("white_player"."fide_id"), ''),
        'player:' || "games"."white_player_id"::text
      ) || '|' ||
      coalesce(
        'fide:' || nullif(btrim("games"."black_fide_id"), ''),
        'fide:' || nullif(btrim("black_player"."fide_id"), ''),
        'player:' || "games"."black_player_id"::text
      ) || '|' ||
      "games"."result" || '|' ||
      "moves"."uci"
    ) AS "move_fingerprint",
    ("games"."original_pgn" like '%[%eval %' or "games"."original_pgn" like '%[%clk %') AS "has_annotations",
    length("games"."original_pgn") AS "pgn_length"
  FROM "games"
  LEFT JOIN "players" AS "white_player" ON "white_player"."id" = "games"."white_player_id"
  LEFT JOIN "players" AS "black_player" ON "black_player"."id" = "games"."black_player_id"
  CROSS JOIN LATERAL (
    SELECT string_agg("move"->>'uci', ' ' ORDER BY "ordinality") AS "uci"
    FROM jsonb_array_elements("games"."structured_moves"->'mainline')
      WITH ORDINALITY AS "mainline"("move", "ordinality")
  ) AS "moves"
  WHERE jsonb_array_length("games"."structured_moves"->'mainline') >= 12
    AND coalesce(
      nullif(btrim("games"."white_fide_id"), ''),
      nullif(btrim("white_player"."fide_id"), ''),
      "games"."white_player_id"::text
    ) IS NOT NULL
    AND coalesce(
      nullif(btrim("games"."black_fide_id"), ''),
      nullif(btrim("black_player"."fide_id"), ''),
      "games"."black_player_id"::text
    ) IS NOT NULL
), "ranked" AS (
  SELECT
    "keyed".*,
    min("id") OVER (PARTITION BY "move_fingerprint") AS "keeper_id",
    row_number() OVER (
      PARTITION BY "move_fingerprint"
      ORDER BY "has_annotations" DESC, "pgn_length" DESC, "id"
    ) AS "richness_rank"
  FROM "keyed"
)
SELECT
  "id",
  "move_fingerprint",
  "keeper_id",
  max("id") FILTER (WHERE "richness_rank" = 1)
    OVER (PARTITION BY "move_fingerprint") AS "preferred_id"
FROM "ranked";--> statement-breakpoint
UPDATE "games" AS "keeper"
SET
  "source_id" = "preferred"."source_id",
  "original_pgn" = "preferred"."original_pgn",
  "structured_moves" = "preferred"."structured_moves"
FROM (
  SELECT DISTINCT "keeper_id", "preferred_id"
  FROM "_migration_0011_game_move_dedup"
) AS "choice"
JOIN "games" AS "preferred" ON "preferred"."id" = "choice"."preferred_id"
WHERE "keeper"."id" = "choice"."keeper_id";--> statement-breakpoint
UPDATE "import_game_items" AS "item"
SET "game_id" = "mapping"."keeper_id"
FROM "_migration_0011_game_move_dedup" AS "mapping"
WHERE "item"."game_id" = "mapping"."id"
  AND "mapping"."id" <> "mapping"."keeper_id";--> statement-breakpoint
DELETE FROM "games" AS "game"
USING "_migration_0011_game_move_dedup" AS "mapping"
WHERE "game"."id" = "mapping"."id"
  AND "mapping"."id" <> "mapping"."keeper_id";--> statement-breakpoint
UPDATE "games" AS "game"
SET "move_fingerprint" = "mapping"."move_fingerprint"
FROM "_migration_0011_game_move_dedup" AS "mapping"
WHERE "game"."id" = "mapping"."keeper_id";--> statement-breakpoint
DROP TABLE "_migration_0011_game_move_dedup";--> statement-breakpoint
CREATE UNIQUE INDEX "games_move_fingerprint_unique" ON "games" USING btree ("move_fingerprint");
