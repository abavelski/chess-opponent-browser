import { sql } from "drizzle-orm";
import {
  check,
  integer,
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
