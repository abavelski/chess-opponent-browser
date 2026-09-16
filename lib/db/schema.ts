import { sql } from "drizzle-orm";
import { check, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

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
