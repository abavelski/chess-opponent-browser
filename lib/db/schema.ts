import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const appMetadata = pgTable("app_metadata", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
