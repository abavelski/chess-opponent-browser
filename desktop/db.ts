import "server-only";

import type { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { createSqliteClient } from "./sqlite.cjs";

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

// Derive SQLite's initial schema from the same tables, keys, checks and indexes.
// PostgreSQL migrations remain exclusively owned by the hosted application.
export function desktopSchema() {
  const dialect = new PgDialect();
  const expression = (value: SQL) => dialect.sqlToQuery(value).sql;
  const statements: string[] = [];
  for (const key of Object.keys(schema).sort()) {
    const table = schema[key as keyof typeof schema];
    const config = getTableConfig(table);
    const definitions = config.columns.map((column) => {
      const type = column.getSQLType();
      let definition = `${quote(column.name)} ${/^(serial|integer|boolean)/.test(type) ? "integer" : "text"}`;
      if (column.primary) definition += " primary key autoincrement";
      if (column.notNull) definition += " not null";
      if (column.default !== undefined && !column.primary) {
        const value = column.default;
        definition += ` default ${value instanceof SQL ? `(${expression(value)})` : typeof value === "string" ? `'${value.replaceAll("'", "''")}'` : Number(value)}`;
      }
      if (column.isUnique) definition += " unique";
      const length = /^varchar\((\d+)\)$/.exec(type)?.[1];
      if (length) definition += ` check(length(${quote(column.name)}) <= ${length})`;
      if (type === "boolean") definition += ` check(${quote(column.name)} in (0, 1))`;
      return definition;
    });
    for (const key of config.foreignKeys) {
      const ref = key.reference();
      definitions.push(`foreign key (${ref.columns.map(c => quote(c.name))}) references ${quote(getTableConfig(ref.foreignTable).name)} (${ref.foreignColumns.map(c => quote(c.name))}) on delete ${key.onDelete ?? "no action"}`);
    }
    for (const key of config.uniqueConstraints) {
      definitions.push(`unique (${key.columns.map(c => quote(c.name))})`);
    }
    for (const check of config.checks) definitions.push(`check (${expression(check.value)})`);
    statements.push(`create table ${quote(config.name)} (${definitions.join(", ")})`);
    for (const index of config.indexes) {
      const c = index.config;
      const columns = c.columns.map(column => column instanceof SQL ? expression(column) : quote((column as { name: string }).name));
      statements.push(`create ${c.unique ? "unique " : ""}index ${quote(c.name!)} on ${quote(config.name)} (${columns})${c.where ? ` where ${expression(c.where)}` : ""}`);
    }
  }
  return statements;
}

export function createDesktopDatabase(filename: string) {
  const client = createSqliteClient(filename, desktopSchema());
  return drizzle({ client: client as unknown as ReturnType<typeof neon>, schema });
}

let database: ReturnType<typeof createDesktopDatabase> | undefined;

export function getDb() {
  if (!database) {
    const filename = process.env.CHESS_SQLITE_PATH;
    if (!filename) throw new Error("Desktop SQLite path is not configured");
    // Retain Drizzle's PostgreSQL encoders/result mapping and the existing batch API.
    // The desktop transport executes these queries against SQLite, never Neon.
    try {
      database = createDesktopDatabase(filename);
    } catch (error) {
      console.error("Could not initialize the desktop SQLite database", error);
      throw error;
    }
  }
  return database;
}
