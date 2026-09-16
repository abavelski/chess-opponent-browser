CREATE TABLE "game_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_key" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"is_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_sources_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "game_sources_source_key_not_blank" CHECK (char_length(btrim("game_sources"."source_key")) > 0),
	CONSTRAINT "game_sources_label_not_blank" CHECK (char_length(btrim("game_sources"."label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"white_player_id" integer,
	"black_player_id" integer,
	"white_name" varchar(200) NOT NULL,
	"black_name" varchar(200) NOT NULL,
	"white_rating" integer,
	"black_rating" integer,
	"played_on" date,
	"result" varchar(7) DEFAULT '*' NOT NULL,
	"event" varchar(250),
	"site" varchar(250),
	"round" varchar(50),
	"eco" varchar(8),
	"opening" varchar(200),
	"source_id" integer NOT NULL,
	"source_game_key" varchar(160),
	"original_pgn" text NOT NULL,
	"structured_moves" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_source_game_key_unique" UNIQUE("source_id","source_game_key"),
	CONSTRAINT "games_white_name_not_blank" CHECK (char_length(btrim("games"."white_name")) > 0),
	CONSTRAINT "games_black_name_not_blank" CHECK (char_length(btrim("games"."black_name")) > 0),
	CONSTRAINT "games_white_rating_range" CHECK ("games"."white_rating" is null or ("games"."white_rating" >= 1 and "games"."white_rating" <= 4000)),
	CONSTRAINT "games_black_rating_range" CHECK ("games"."black_rating" is null or ("games"."black_rating" >= 1 and "games"."black_rating" <= 4000)),
	CONSTRAINT "games_result_format" CHECK ("games"."result" in ('1-0', '0-1', '1/2-1/2', '*'))
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_player_id_players_id_fk" FOREIGN KEY ("white_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_player_id_players_id_fk" FOREIGN KEY ("black_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_source_id_game_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."game_sources"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "games_white_player_played_on_idx" ON "games" USING btree ("white_player_id","played_on");
--> statement-breakpoint
CREATE INDEX "games_black_player_played_on_idx" ON "games" USING btree ("black_player_id","played_on");
