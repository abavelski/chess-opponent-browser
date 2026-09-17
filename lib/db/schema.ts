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
  uniqueIndex,
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
    whiteFideId: varchar("white_fide_id", { length: 32 }),
    blackFideId: varchar("black_fide_id", { length: 32 }),
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
    duplicateFingerprint: varchar("duplicate_fingerprint", { length: 32 }),
    originalPgn: text("original_pgn").notNull(),
    structuredMoves: jsonb("structured_moves").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("games_source_game_key_unique").on(table.sourceId, table.sourceGameKey),
    index("games_white_player_played_on_idx").on(table.whitePlayerId, table.playedOn),
    index("games_black_player_played_on_idx").on(table.blackPlayerId, table.playedOn),
    uniqueIndex("games_duplicate_fingerprint_unique").on(table.duplicateFingerprint),
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
      "games_white_fide_id_not_blank",
      sql`${table.whiteFideId} is null or char_length(btrim(${table.whiteFideId})) > 0`,
    ),
    check(
      "games_black_fide_id_not_blank",
      sql`${table.blackFideId} is null or char_length(btrim(${table.blackFideId})) > 0`,
    ),
    check(
      "games_result_format",
      sql`${table.result} in ('1-0', '0-1', '1/2-1/2', '*')`,
    ),
  ],
);

export const imports = pgTable(
  "imports",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => gameSources.id),
    filename: text("filename").notNull(),
    parsedCount: integer("parsed_count").notNull(),
    parseErrorCount: integer("parse_error_count").notNull(),
    importedCount: integer("imported_count").default(0).notNull(),
    duplicateCount: integer("duplicate_count").default(0).notNull(),
    persistenceErrorCount: integer("persistence_error_count").default(0).notNull(),
    unresolvedSideCount: integer("unresolved_side_count").default(0).notNull(),
    status: varchar("status", { length: 24 }).default("processing").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("imports_source_created_at_idx").on(table.sourceId, table.createdAt),
    check("imports_filename_not_blank", sql`char_length(btrim(${table.filename})) > 0`),
    check(
      "imports_counts_nonnegative",
      sql`${table.parsedCount} >= 0 and ${table.parseErrorCount} >= 0 and ${table.importedCount} >= 0 and ${table.persistenceErrorCount} >= 0 and ${table.unresolvedSideCount} >= 0`,
    ),
    check("imports_duplicate_count_nonnegative", sql`${table.duplicateCount} >= 0`),
    check(
      "imports_status_valid",
      sql`${table.status} in ('processing', 'completed', 'completed_with_errors', 'failed')`,
    ),
  ],
);

export const importGameItems = pgTable(
  "import_game_items",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    sourceIndex: integer("source_index").notNull(),
    originalPgn: text("original_pgn").notNull(),
    rawTags: jsonb("raw_tags").notNull(),
    outcome: varchar("outcome", { length: 16 }).default("imported").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("import_game_items_import_id_idx").on(table.importId),
    index("import_game_items_game_id_idx").on(table.gameId),
    check("import_game_items_source_index_positive", sql`${table.sourceIndex} >= 1`),
    check(
      "import_game_items_original_pgn_not_blank",
      sql`char_length(btrim(${table.originalPgn})) > 0`,
    ),
    check(
      "import_game_items_outcome_valid",
      sql`${table.outcome} in ('imported', 'duplicate')`,
    ),
  ],
);

export const importErrors = pgTable(
  "import_errors",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    sourceIndex: integer("source_index").notNull(),
    phase: varchar("phase", { length: 16 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("import_errors_import_id_idx").on(table.importId),
    check("import_errors_source_index_positive", sql`${table.sourceIndex} >= 1`),
    check("import_errors_phase_valid", sql`${table.phase} in ('parse', 'persistence')`),
    check("import_errors_message_not_blank", sql`char_length(btrim(${table.message})) > 0`),
  ],
);
