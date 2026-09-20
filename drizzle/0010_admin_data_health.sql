ALTER TABLE "tournaments" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_active_not_archived" CHECK (not ("tournaments"."is_active" and "tournaments"."archived_at" is not null));--> statement-breakpoint
CREATE TABLE "player_merge_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "source_player_id" integer NOT NULL,
  "target_player_id" integer,
  "source_name" varchar(200) NOT NULL,
  "target_name" varchar(200) NOT NULL,
  "summary_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_merge_history_source_name_not_blank" CHECK (char_length(btrim("player_merge_history"."source_name")) > 0),
  CONSTRAINT "player_merge_history_target_name_not_blank" CHECK (char_length(btrim("player_merge_history"."target_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "player_merge_history" ADD CONSTRAINT "player_merge_history_target_player_id_players_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_merge_history_target_created_at_idx" ON "player_merge_history" USING btree ("target_player_id","created_at");