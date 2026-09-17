ALTER TABLE "games" ADD COLUMN "duplicate_fingerprint" varchar(32);
--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "duplicate_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "status" varchar(24) DEFAULT 'processing' NOT NULL;
--> statement-breakpoint
ALTER TABLE "import_game_items" ADD COLUMN "outcome" varchar(16) DEFAULT 'imported' NOT NULL;
--> statement-breakpoint
CREATE TABLE "import_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"source_index" integer NOT NULL,
	"phase" varchar(16) NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_errors_source_index_positive" CHECK ("import_errors"."source_index" >= 1),
	CONSTRAINT "import_errors_phase_valid" CHECK ("import_errors"."phase" in ('parse', 'persistence')),
	CONSTRAINT "import_errors_message_not_blank" CHECK (char_length(btrim("import_errors"."message")) > 0)
);
--> statement-breakpoint
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "import_errors_import_id_idx" ON "import_errors" USING btree ("import_id");
--> statement-breakpoint
ALTER TABLE "imports" DROP CONSTRAINT "imports_counts_nonnegative";
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_counts_nonnegative" CHECK ("imports"."parsed_count" >= 0 and "imports"."parse_error_count" >= 0 and "imports"."imported_count" >= 0 and "imports"."duplicate_count" >= 0 and "imports"."persistence_error_count" >= 0 and "imports"."unresolved_side_count" >= 0);
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_status_valid" CHECK ("imports"."status" in ('processing', 'completed', 'completed_with_errors', 'failed'));
--> statement-breakpoint
ALTER TABLE "import_game_items" ADD CONSTRAINT "import_game_items_outcome_valid" CHECK ("import_game_items"."outcome" in ('imported', 'duplicate'));
--> statement-breakpoint
UPDATE "imports"
SET "status" = CASE
  WHEN "parse_error_count" + "persistence_error_count" > 0 THEN 'completed_with_errors'
  ELSE 'completed'
END;
--> statement-breakpoint
WITH candidates AS (
  SELECT
    g."id",
    md5(
      'v1|' ||
      lower(regexp_replace(btrim(g."white_name"), '[[:space:]]+', ' ', 'g')) || '|' ||
      lower(regexp_replace(btrim(g."black_name"), '[[:space:]]+', ' ', 'g')) || '|' ||
      coalesce(g."played_on"::text, '-') || '|' ||
      g."result" || '|' ||
      line."moves"
    ) AS fingerprint
  FROM "games" g
  CROSS JOIN LATERAL (
    SELECT
      string_agg(move.value->>'uci', ' ' ORDER BY move.ordinality) AS moves,
      count(*)::integer AS move_count,
      bool_and(nullif(btrim(move.value->>'uci'), '') IS NOT NULL) AS all_uci
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(g."structured_moves"->'mainline') = 'array'
          THEN g."structured_moves"->'mainline'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS move(value, ordinality)
  ) line
  WHERE line.move_count > 0
    AND line.all_uci IS TRUE
    AND (g."played_on" IS NOT NULL OR line.move_count >= 12)
), ranked AS (
  SELECT
    "id",
    fingerprint,
    row_number() OVER (PARTITION BY fingerprint ORDER BY "id") AS fingerprint_rank
  FROM candidates
)
UPDATE "games" g
SET "duplicate_fingerprint" = ranked.fingerprint
FROM ranked
WHERE g."id" = ranked."id"
  AND ranked.fingerprint_rank = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "games_duplicate_fingerprint_unique" ON "games" USING btree ("duplicate_fingerprint");
