import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { syncRuns, tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const kinds = new Set(["participants", "ratings", "games", "full"]);
const finalStatuses = new Set(["completed", "completed_with_errors", "failed"]);

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function nickname(value: unknown) {
  const parsed = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed) ? parsed : "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const tournamentNickname = nickname(body?.tournamentNickname);
  const kind = typeof body?.kind === "string" ? body.kind : "";
  if (!tournamentNickname) return errorResponse("Tournament nickname is invalid.", 400);
  if (!kinds.has(kind)) return errorResponse("Sync run kind is invalid.", 400);

  try {
    const db = getDb();
    const [tournament] = await db.select({ id: tournaments.id, name: tournaments.name, nickname: tournaments.nickname, archivedAt: tournaments.archivedAt })
      .from(tournaments)
      .where(eq(tournaments.nickname, tournamentNickname))
      .limit(1);
    if (!tournament) return errorResponse(`Tournament '${tournamentNickname}' was not found.`, 404);
    if (tournament.archivedAt) return errorResponse(`Tournament '${tournamentNickname}' is archived. Restore it before syncing.`, 409);

    const [run] = await db.insert(syncRuns).values({ tournamentId: tournament.id, kind }).returning({
      id: syncRuns.id,
      startedAt: syncRuns.startedAt,
    });
    return NextResponse.json({ ok: true, tournament, run }, { status: 201 });
  } catch (error) {
    console.error("Failed to start tournament sync run", error);
    return errorResponse("Sync run could not be started.", 500);
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = Number(body?.id);
  const tournamentNickname = nickname(body?.tournamentNickname);
  const status = typeof body?.status === "string" ? body.status : "";
  const snapshotHash = typeof body?.snapshotHash === "string" ? body.snapshotHash : null;
  const errorText = typeof body?.errorText === "string" ? body.errorText.slice(0, 4000) : null;
  const summary = body?.summary && typeof body.summary === "object" && !Array.isArray(body.summary)
    ? body.summary as Record<string, unknown>
    : null;

  if (!Number.isSafeInteger(id) || id < 1) return errorResponse("Sync run ID is invalid.", 400);
  if (!tournamentNickname) return errorResponse("Tournament nickname is invalid.", 400);
  if (!finalStatuses.has(status)) return errorResponse("Sync run status is invalid.", 400);
  if (snapshotHash && !/^[a-f0-9]{64}$/.test(snapshotHash)) {
    return errorResponse("Snapshot hash is invalid.", 400);
  }

  try {
    const db = getDb();
    const [updated] = await db.update(syncRuns).set({
      status,
      snapshotHash,
      summaryJson: summary,
      errorText,
      completedAt: new Date(),
    }).from(tournaments).where(and(
      eq(syncRuns.id, id),
      eq(syncRuns.tournamentId, tournaments.id),
      eq(tournaments.nickname, tournamentNickname),
      eq(syncRuns.status, "running"),
    )).returning({ id: syncRuns.id, status: syncRuns.status, completedAt: syncRuns.completedAt });

    if (!updated) return errorResponse("Running sync run was not found.", 404);
    return NextResponse.json({ ok: true, run: updated });
  } catch (error) {
    console.error("Failed to finish tournament sync run", error);
    return errorResponse("Sync run could not be completed.", 500);
  }
}
