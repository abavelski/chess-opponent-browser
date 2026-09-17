CREATE TABLE "player_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"alias_text" varchar(200) NOT NULL,
	"normalized_key" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_aliases_text_not_blank" CHECK (char_length(btrim("player_aliases"."alias_text")) > 0),
	CONSTRAINT "player_aliases_normalized_key_not_blank" CHECK (char_length(btrim("player_aliases"."normalized_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "player_aliases" ADD CONSTRAINT "player_aliases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "player_aliases_player_id_idx" ON "player_aliases" USING btree ("player_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "player_aliases_normalized_key_unique" ON "player_aliases" USING btree ("normalized_key");
