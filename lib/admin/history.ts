import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { imports } from "@/lib/db/schema";

export function prunableImportCondition() {
  return and(
    eq(imports.status, "completed"),
    eq(imports.importedCount, 0),
    gt(imports.duplicateCount, 0),
    eq(imports.parseErrorCount, 0),
    eq(imports.persistenceErrorCount, 0),
    eq(imports.unresolvedSideCount, 0),
  );
}

export async function getPrunableImportCount() {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(imports)
    .where(prunableImportCondition());
  return Number(row?.count ?? 0);
}

export async function pruneDuplicateOnlyImports() {
  const removed = await getDb()
    .delete(imports)
    .where(prunableImportCondition())
    .returning({ id: imports.id });
  return removed.length;
}
