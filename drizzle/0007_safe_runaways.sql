ALTER TABLE "tournaments" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "dsu_id" varchar(32);--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "current_dsu_rating" integer;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "current_fide_rating" integer;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "dsu_profile_url" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "fide_profile_url" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "ratings_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "group_name" varchar(120);--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "club" varchar(200);--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "tournament_dsu_rating" integer;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "tournament_fide_rating" integer;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "registered_at_text" varchar(120);--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
UPDATE "tournaments" SET "is_active" = true
WHERE "id" = (
	SELECT "id" FROM "tournaments" ORDER BY "created_at" DESC, "id" DESC LIMIT 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_one_active_unique" ON "tournaments" USING btree ("is_active") WHERE "tournaments"."is_active" = true;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_dsu_id_unique" UNIQUE("dsu_id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_dsu_id_not_blank" CHECK ("players"."dsu_id" is null or char_length(btrim("players"."dsu_id")) > 0);
