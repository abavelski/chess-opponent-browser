ALTER TABLE "games" ADD COLUMN "white_fide_id" varchar(32);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "black_fide_id" varchar(32);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"filename" text NOT NULL,
	"parsed_count" integer NOT NULL,
	"parse_error_count" integer NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"persistence_error_count" integer DEFAULT 0 NOT NULL,
	"unresolved_side_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_filename_not_blank" CHECK (char_length(btrim("imports"."filename")) > 0),
	CONSTRAINT "imports_counts_nonnegative" CHECK ("imports"."parsed_count" >= 0 and "imports"."parse_error_count" >= 0 and "imports"."imported_count" >= 0 and "imports"."persistence_error_count" >= 0 and "imports"."unresolved_side_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "import_game_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"source_index" integer NOT NULL,
	"original_pgn" text NOT NULL,
	"raw_tags" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_game_items_source_index_positive" CHECK ("import_game_items"."source_index" >= 1),
	CONSTRAINT "import_game_items_original_pgn_not_blank" CHECK (char_length(btrim("import_game_items"."original_pgn")) > 0)
);
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_source_id_game_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."game_sources"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_game_items" ADD CONSTRAINT "import_game_items_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_game_items" ADD CONSTRAINT "import_game_items_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "imports_source_created_at_idx" ON "imports" USING btree ("source_id","created_at");
--> statement-breakpoint
CREATE INDEX "import_game_items_import_id_idx" ON "import_game_items" USING btree ("import_id");
--> statement-breakpoint
CREATE INDEX "import_game_items_game_id_idx" ON "import_game_items" USING btree ("game_id");
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_fide_id_not_blank" CHECK ("games"."white_fide_id" is null or char_length(btrim("games"."white_fide_id")) > 0);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_fide_id_not_blank" CHECK ("games"."black_fide_id" is null or char_length(btrim("games"."black_fide_id")) > 0);
