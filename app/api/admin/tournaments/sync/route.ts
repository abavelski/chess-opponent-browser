import { and, eq, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { playerAliases, players, tournamentParticipants, tournaments } from "@/lib/db/schema";
import { normalizeImportedPlayerName } from "@/lib/imports/persist";
import { parseParticipantSnapshot } from "@/lib/participants/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  let snapshot;
  try {
    snapshot = parseParticipantSnapshot(await request.json());
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid participant snapshot.", 400);
  }

  try {
    const db = getDb();
    const [activeTournament] = await db
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .where(eq(tournaments.isActive, true))
      .limit(1);

    if (!activeTournament) return errorResponse("No active tournament exists.", 409);

    const [canonicalPlayers, aliases, currentRoster] = await Promise.all([
      db.select().from(players),
      db.select().from(playerAliases),
      db.select({ playerId: tournamentParticipants.playerId }).from(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, activeTournament.id)),
    ]);

    const byDsu = new Map(canonicalPlayers.filter((p) => p.dsuId).map((p) => [p.dsuId!, p]));
    const byFide = new Map(canonicalPlayers.filter((p) => p.fideId).map((p) => [p.fideId!, p]));
    const byName = new Map<string, typeof canonicalPlayers>();
    for (const player of canonicalPlayers) {
      const key = normalizeImportedPlayerName(player.name);
      byName.set(key, [...(byName.get(key) ?? []), player]);
    }
    for (const alias of aliases) {
      const player = canonicalPlayers.find((candidate) => candidate.id === alias.playerId);
      if (!player) continue;
      const key = normalizeImportedPlayerName(alias.normalizedKey);
      const matches = byName.get(key) ?? [];
      if (!matches.some((candidate) => candidate.id === player.id)) byName.set(key, [...matches, player]);
    }

    const existingRoster = new Set(currentRoster.map((row) => row.playerId));
    const syncedPlayerIds: number[] = [];
    let created = 0;
    let added = 0;

    for (const participant of snapshot.players) {
      const dsuMatch = participant.dsuId ? byDsu.get(participant.dsuId) : undefined;
      const fideMatch = participant.fideId ? byFide.get(participant.fideId) : undefined;
      if (dsuMatch && fideMatch && dsuMatch.id !== fideMatch.id) {
        throw new Error(`DSU and FIDE identities conflict for ${participant.name}.`);
      }

      const nameMatches = byName.get(normalizeImportedPlayerName(participant.name)) ?? [];
      let player = dsuMatch ?? fideMatch ?? (nameMatches.length === 1 ? nameMatches[0] : undefined);
      const ratingsUpdatedAt = snapshot.ratingsUpdatedAt ? new Date(snapshot.ratingsUpdatedAt) : null;

      if (player) {
        const [updated] = await db.update(players).set({
          name: participant.name,
          dsuId: participant.dsuId ?? player.dsuId,
          fideId: participant.fideId ?? player.fideId,
          currentDsuRating: participant.actualDsuRating,
          currentFideRating: participant.actualFideRating,
          dsuProfileUrl: participant.dsuProfileUrl,
          fideProfileUrl: participant.fideProfileUrl,
          ratingsUpdatedAt,
        }).where(eq(players.id, player.id)).returning();
        player = updated;
      } else {
        const [inserted] = await db.insert(players).values({
          name: participant.name,
          dsuId: participant.dsuId,
          fideId: participant.fideId,
          currentDsuRating: participant.actualDsuRating,
          currentFideRating: participant.actualFideRating,
          dsuProfileUrl: participant.dsuProfileUrl,
          fideProfileUrl: participant.fideProfileUrl,
          ratingsUpdatedAt,
        }).returning();
        if (!inserted) throw new Error(`Could not create ${participant.name}.`);
        player = inserted;
        canonicalPlayers.push(inserted);
        if (inserted.dsuId) byDsu.set(inserted.dsuId, inserted);
        if (inserted.fideId) byFide.set(inserted.fideId, inserted);
        const insertedNameKey = normalizeImportedPlayerName(inserted.name);
        byName.set(insertedNameKey, [...(byName.get(insertedNameKey) ?? []), inserted]);
        created += 1;
      }

      syncedPlayerIds.push(player.id);
      if (!existingRoster.has(player.id)) added += 1;

      await db.insert(tournamentParticipants).values({
        tournamentId: activeTournament.id,
        playerId: player.id,
        rating: participant.actualDsuRating ?? participant.actualFideRating,
        groupName: participant.group,
        club: participant.club,
        tournamentDsuRating: participant.tournamentDsuRating,
        tournamentFideRating: participant.tournamentFideRating,
        registeredAtText: participant.registeredAt,
        syncedAt: new Date(),
      }).onConflictDoUpdate({
        target: [tournamentParticipants.tournamentId, tournamentParticipants.playerId],
        set: {
          rating: participant.actualDsuRating ?? participant.actualFideRating,
          groupName: participant.group,
          club: participant.club,
          tournamentDsuRating: participant.tournamentDsuRating,
          tournamentFideRating: participant.tournamentFideRating,
          registeredAtText: participant.registeredAt,
          syncedAt: new Date(),
        },
      });
    }

    let removed = 0;
    if (syncedPlayerIds.length === 0) {
      const deleted = await db.delete(tournamentParticipants)
        .where(eq(tournamentParticipants.tournamentId, activeTournament.id)).returning({ id: tournamentParticipants.id });
      removed = deleted.length;
    } else {
      const deleted = await db.delete(tournamentParticipants).where(and(
        eq(tournamentParticipants.tournamentId, activeTournament.id),
        notInArray(tournamentParticipants.playerId, syncedPlayerIds),
      )).returning({ id: tournamentParticipants.id });
      removed = deleted.length;
    }

    if (snapshot.sourceUrl) {
      await db.update(tournaments).set({ sourceUrl: snapshot.sourceUrl })
        .where(eq(tournaments.id, activeTournament.id));
    }

    return NextResponse.json({
      ok: true,
      tournament: activeTournament,
      participants: { total: syncedPlayerIds.length, created, added, removed },
    });
  } catch (error) {
    console.error("Failed to sync tournament participants", error);
    return errorResponse(error instanceof Error ? error.message : "Participant sync failed.", 500);
  }
}
