CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"fide_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_fide_id_unique" UNIQUE("fide_id"),
	CONSTRAINT "players_name_not_blank" CHECK (char_length(btrim("players"."name")) > 0),
	CONSTRAINT "players_fide_id_not_blank" CHECK ("players"."fide_id" is null or char_length(btrim("players"."fide_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "tournament_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"rating" integer,
	"federation" varchar(3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_participants_tournament_player_unique" UNIQUE("tournament_id","player_id"),
	CONSTRAINT "tournament_participants_rating_range" CHECK ("tournament_participants"."rating" is null or ("tournament_participants"."rating" >= 1 and "tournament_participants"."rating" <= 4000)),
	CONSTRAINT "tournament_participants_federation_format" CHECK ("tournament_participants"."federation" is null or "tournament_participants"."federation" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
