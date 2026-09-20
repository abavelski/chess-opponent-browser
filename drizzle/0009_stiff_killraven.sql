CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"kind" varchar(24) NOT NULL,
	"status" varchar(24) DEFAULT 'running' NOT NULL,
	"snapshot_hash" varchar(64),
	"summary_json" jsonb,
	"error_text" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "sync_runs_kind_valid" CHECK ("sync_runs"."kind" in ('participants', 'ratings', 'games', 'full')),
	CONSTRAINT "sync_runs_status_valid" CHECK ("sync_runs"."status" in ('running', 'completed', 'completed_with_errors', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "dsu_rating_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "fide_rating_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_runs_tournament_started_at_idx" ON "sync_runs" USING btree ("tournament_id","started_at");