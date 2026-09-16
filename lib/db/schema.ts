import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const appMetadata = pgTable("app_metadata", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tournaments = pgTable(
  "tournaments",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "tournaments_name_not_blank",
      sql`char_length(btrim(${table.name})) > 0`,
    ),
  ],
);

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    fideId: varchar("fide_id", { length: 32 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("players_name_not_blank", sql`char_length(btrim(${table.name})) > 0`),
    check(
      "players_fide_id_not_blank",
      sql`${table.fideId} is null or char_length(btrim(${table.fideId})) > 0`,
    ),
  ],
);

export const tournamentParticipants = pgTable(
  "tournament_participants",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    rating: integer("rating"),
    federation: varchar("federation", { length: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("tournament_participants_tournament_player_unique").on(
      table.tournamentId,
      table.playerId,
    ),
    check(
      "tournament_participants_rating_range",
      sql`${table.rating} is null or (${table.rating} >= 1 and ${table.rating} <= 4000)`,
    ),
    check(
      "tournament_participants_federation_format",
      sql`${table.federation} is null or ${table.federation} ~ '^[A-Z]{3}$'`,
    ),
  ],
);

export const gameSources = pgTable(
  "game_sources",
  {
    id: serial("id").primaryKey(),
    sourceKey: varchar("source_key", { length: 64 }).notNull().unique(),
    label: varchar("label", { length: 120 }).notNull(),
    isFixture: boolean("is_fixture").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "game_sources_source_key_not_blank",
      sql`char_length(btrim(${table.sourceKey})) > 0`,
    ),
    check(
      "game_sources_label_not_blank",
      sql`char_length(btrim(${table.label})) > 0`,
    ),
  ],
);

export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    whitePlayerId: integer("white_player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    blackPlayerId: integer("black_player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    whiteName: varchar("white_name", { length: 200 }).notNull(),
    blackName: varchar("black_name", { length: 200 }).notNull(),
    whiteRating: integer("white_rating"),
    blackRating: integer("black_rating"),
    playedOn: date("played_on"),
    result: varchar("result", { length: 7 }).default("*").notNull(),
    event: varchar("event", { length: 250 }),
    site: varchar("site", { length: 250 }),
    round: varchar("round", { length: 50 }),
    eco: varchar("eco", { length: 8 }),
    opening: varchar("opening", { length: 200 }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => gameSources.id),
    sourceGameKey: varchar("source_game_key", { length: 160 }),
    originalPgn: text("original_pgn").notNull(),
    structuredMoves: jsonb("structured_moves").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("games_source_game_key_unique").on(table.sourceId, table.sourceGameKey),
    index("games_white_player_played_on_idx").on(table.whitePlayerId, table.playedOn),
    index("games_black_player_played_on_idx").on(table.blackPlayerId, table.playedOn),
    check("games_white_name_not_blank", sql`char_length(btrim(${table.whiteName})) > 0`),
    check("games_black_name_not_blank", sql`char_length(btrim(${table.blackName})) > 0`),
    check(
      "games_white_rating_range",
      sql`${table.whiteRating} is null or (${table.whiteRating} >= 1 and ${table.whiteRating} <= 4000)`,
    ),
    check(
      "games_black_rating_range",
      sql`${table.blackRating} is null or (${table.blackRating} >= 1 and ${table.blackRating} <= 4000)`,
    ),
    check(
      "games_result_format",
      sql`${table.result} in ('1-0', '0-1', '1/2-1/2', '*')`,
    ),
  ],
);
