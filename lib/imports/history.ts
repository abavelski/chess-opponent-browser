import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  gameSources,
  games,
  importErrors,
  importGameItems,
  imports as importRecords,
} from "@/lib/db/schema";

export function importStatusLabel(status: string) {
  if (status === "completed") return "Completed";
  if (status === "completed_with_errors") return "Completed with errors";
  if (status === "failed") return "Failed";
  return "Processing";
}

export async function listImportHistory() {
  return getDb()
    .select({
      id: importRecords.id,
      filename: importRecords.filename,
      sourceLabel: gameSources.label,
      parsedCount: importRecords.parsedCount,
      importedCount: importRecords.importedCount,
      duplicateCount: importRecords.duplicateCount,
      parseErrorCount: importRecords.parseErrorCount,
      persistenceErrorCount: importRecords.persistenceErrorCount,
      unresolvedSideCount: importRecords.unresolvedSideCount,
      status: importRecords.status,
      createdAt: importRecords.createdAt,
    })
    .from(importRecords)
    .innerJoin(gameSources, eq(importRecords.sourceId, gameSources.id))
    .orderBy(desc(importRecords.createdAt), desc(importRecords.id));
}

export async function getImportHistoryDetail(importId: number) {
  const [summary] = await getDb()
    .select({
      id: importRecords.id,
      filename: importRecords.filename,
      sourceLabel: gameSources.label,
      parsedCount: importRecords.parsedCount,
      importedCount: importRecords.importedCount,
      duplicateCount: importRecords.duplicateCount,
      parseErrorCount: importRecords.parseErrorCount,
      persistenceErrorCount: importRecords.persistenceErrorCount,
      unresolvedSideCount: importRecords.unresolvedSideCount,
      status: importRecords.status,
      createdAt: importRecords.createdAt,
    })
    .from(importRecords)
    .innerJoin(gameSources, eq(importRecords.sourceId, gameSources.id))
    .where(eq(importRecords.id, importId))
    .limit(1);

  if (!summary) return null;

  const [items, errors] = await Promise.all([
    getDb()
      .select({
        id: importGameItems.id,
        sourceIndex: importGameItems.sourceIndex,
        outcome: importGameItems.outcome,
        gameId: games.id,
        whiteName: games.whiteName,
        blackName: games.blackName,
        playedOn: games.playedOn,
        result: games.result,
        event: games.event,
      })
      .from(importGameItems)
      .innerJoin(games, eq(importGameItems.gameId, games.id))
      .where(eq(importGameItems.importId, importId))
      .orderBy(asc(importGameItems.sourceIndex), asc(importGameItems.id)),
    getDb()
      .select({
        id: importErrors.id,
        sourceIndex: importErrors.sourceIndex,
        phase: importErrors.phase,
        message: importErrors.message,
      })
      .from(importErrors)
      .where(eq(importErrors.importId, importId))
      .orderBy(asc(importErrors.sourceIndex), asc(importErrors.id)),
  ]);

  return { summary, items, errors };
}
