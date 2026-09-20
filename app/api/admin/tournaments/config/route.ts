import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const nickname = new URL(request.url).searchParams.get("nickname")?.trim().toLowerCase();
  const selection = nickname
    ? eq(tournaments.nickname, nickname)
    : eq(tournaments.isActive, true);

  try {
    const [tournament] = await getDb()
      .select({
        id: tournaments.id,
        name: tournaments.name,
        nickname: tournaments.nickname,
        sourceUrl: tournaments.sourceUrl,
        participantGroup: tournaments.participantGroup,
        isActive: tournaments.isActive,
        archivedAt: tournaments.archivedAt,
      })
      .from(tournaments)
      .where(selection)
      .limit(1);

    if (!tournament) {
      return NextResponse.json(
        { ok: false, message: nickname ? `Tournament '${nickname}' was not found.` : "No active tournament exists." },
        { status: 404 },
      );
    }

    if (tournament.archivedAt) {
      return NextResponse.json(
        { ok: false, message: `Tournament \'${nickname || tournament.nickname}\' is archived. Restore it in Admin before syncing.` },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, tournament });
  } catch (error) {
    console.error("Failed to load tournament sync configuration", error);
    return NextResponse.json(
      { ok: false, message: "Tournament sync configuration could not be loaded." },
      { status: 500 },
    );
  }
}
