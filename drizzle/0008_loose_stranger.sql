ALTER TABLE "tournaments" ADD COLUMN "nickname" varchar(80);--> statement-breakpoint
WITH candidates AS (
	SELECT
		"id",
		COALESCE(
			NULLIF(trim(BOTH '-' FROM lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))), ''),
			'tournament'
		) AS "base_nickname"
	FROM "tournaments"
), ranked AS (
	SELECT
		"id",
		"base_nickname",
		row_number() OVER (PARTITION BY "base_nickname" ORDER BY "id") AS "position"
	FROM candidates
)
UPDATE "tournaments" AS tournament
SET "nickname" = CASE
	WHEN ranked."position" = 1 AND char_length(ranked."base_nickname") <= 80 THEN ranked."base_nickname"
	ELSE left(ranked."base_nickname", 69) || '-' || tournament."id"
END
FROM ranked
WHERE tournament."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "tournaments" ALTER COLUMN "nickname" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "participant_group" varchar(120);--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_nickname_unique" UNIQUE("nickname");--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_nickname_format" CHECK ("tournaments"."nickname" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_participant_group_not_blank" CHECK ("tournaments"."participant_group" is null or char_length(btrim("tournaments"."participant_group")) > 0);
