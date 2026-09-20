import "server-only";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  games,
  gameSources,
  importErrors,
  importGameItems,
  imports,
} from "@/lib/db/schema";

export type AdminGameFilter = "all" | "unresolved";

export function parseAdminGameFilter(value: unknown): AdminGameFilter {
  return value === "unresolved" ? "unresolved" : "all";
}

export async function listGameSources() {
  return getDb()
    .select({
      id: gameSources.id,
      label: gameSources.label,
      sourceKey: gameSources.sourceKey,
      gameCount: sql<number>`count(${games.id})::int`,
    })
    .from(gameSources)
    .leftJoin(games, eq(games.sourceId, gameSources.id))
    .groupBy(gameSources.id, gameSources.label, gameSources.sourceKey)
    .orderBy(desc(sql`count(${games.id})`), gameSources.label);
}

export async function listAdminGames(input: {
  query?: string;
  filter: AdminGameFilter;
  sourceId?: number | null;
}) {
  const query = input.query?.trim().slice(0, 200) ?? "";
  const pattern = `%${query}%`;
  const conditions = [];

  if (query) {
    conditions.push(
      or(
        ilike(games.whiteName, pattern),
        ilike(games.blackName, pattern),
        ilike(games.event, pattern),
        ilike(games.site, pattern),
      ),
    );
  }
  if (input.filter === "unresolved") {
    conditions.push(
      sql`(${games.whitePlayerId} is null or ${games.blackPlayerId} is null)`,
    );
  }
  if (input.sourceId) {
    conditions.push(eq(games.sourceId, input.sourceId));
  }

  return getDb()
    .select({
      id: games.id,
      whiteName: games.whiteName,
      blackName: games.blackName,
      playedOn: games.playedOn,
      result: games.result,
      event: games.event,
      sourceLabel: gameSources.label,
      whitePlayerId: games.whitePlayerId,
      blackPlayerId: games.blackPlayerId,
      occurrenceCount: sql<number>`(
        select count(*)::int from import_game_items igi where igi.game_id = ${games.id}
      )`,
    })
    .from(games)
    .innerJoin(gameSources, eq(games.sourceId, gameSources.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(games.playedOn), desc(games.id))
    .limit(250);
}

export async function getAdminGameDetail(gameId: number) {
  const db = getDb();
  const [game] = await db
    .select({
      id: games.id,
      whiteName: games.whiteName,
      blackName: games.blackName,
      whitePlayerId: games.whitePlayerId,
      blackPlayerId: games.blackPlayerId,
      whiteFideId: games.whiteFideId,
      blackFideId: games.blackFideId,
      whiteRating: games.whiteRating,
      blackRating: games.blackRating,
      playedOn: games.playedOn,
      result: games.result,
      event: games.event,
      site: games.site,
      round: games.round,
      eco: games.eco,
      opening: games.opening,
      sourceId: games.sourceId,
      sourceLabel: gameSources.label,
      sourceKey: gameSources.sourceKey,
      sourceGameKey: games.sourceGameKey,
      duplicateFingerprint: games.duplicateFingerprint,
      originalPgn: games.originalPgn,
      createdAt: games.createdAt,
    })
    .from(games)
    .innerJoin(gameSources, eq(games.sourceId, gameSources.id))
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game) return null;

  const [occurrences, errors] = await Promise.all([
    db
    .select({
      id: importGameItems.id,
      importId: importGameItems.importId,
      sourceIndex: importGameItems.sourceIndex,
      outcome: importGameItems.outcome,
      filename: imports.filename,
      importStatus: imports.status,
      importedAt: importGameItems.createdAt,
      errorCount: sql<number>`(
        select count(*)::int
        from import_errors ie
        where ie.import_id = ${importGameItems.importId}
          and ie.source_index = ${importGameItems.sourceIndex}
      )`,
    })
    .from(importGameItems)
    .innerJoin(imports, eq(importGameItems.importId, imports.id))
    .where(eq(importGameItems.gameId, gameId))
    .orderBy(desc(importGameItems.createdAt), desc(importGameItems.id)),
    db
      .selectDistinct({
        id: importErrors.id,
        importId: importErrors.importId,
        sourceIndex: importErrors.sourceIndex,
        phase: importErrors.phase,
        message: importErrors.message,
      })
      .from(importErrors)
      .innerJoin(
        importGameItems,
        and(
          eq(importGameItems.importId, importErrors.importId),
          eq(importGameItems.sourceIndex, importErrors.sourceIndex),
        ),
      )
      .where(eq(importGameItems.gameId, gameId))
      .orderBy(desc(importErrors.id)),
  ]);

  return { game, occurrences, errors };
}

export async function deleteCanonicalGame(gameId: number) {
  const db = getDb();
  const [existing] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (!existing) return false;

  await db.batch([
    db.delete(importGameItems).where(eq(importGameItems.gameId, gameId)),
    db.delete(games).where(eq(games.id, gameId)),
  ]);
  return true;
}
