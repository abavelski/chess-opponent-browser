import { and, eq, notInArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { playerAliases, players, tournamentParticipants, tournaments } from "@/lib/db/schema";
import { normalizeImportedPlayerName } from "@/lib/imports/persist";
import { calculateRemovalSafety, ratingChanged, reconciledProviderRating } from "@/lib/participants/reconciliation";
import { parseParticipantSnapshot } from "@/lib/participants/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(message: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, message, ...details }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  let snapshot;
  try {
    body = await request.json();
    snapshot = parseParticipantSnapshot(body);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid participant snapshot.", 400);
  }

  const controls = body as Record<string, unknown>;
  const dryRun = controls.dryRun === true;
  const force = controls.force === true;

  try {
    const db = getDb();
    const [targetTournament] = await db
      .select({ id: tournaments.id, name: tournaments.name, nickname: tournaments.nickname })
      .from(tournaments)
      .where(snapshot.tournamentNickname
        ? eq(tournaments.nickname, snapshot.tournamentNickname)
        : eq(tournaments.isActive, true))
      .limit(1);

    if (!targetTournament) {
      return errorResponse(
        snapshot.tournamentNickname
          ? `Tournament '${snapshot.tournamentNickname}' was not found.`
          : "No active tournament exists.",
        404,
      );
    }

    const [canonicalPlayers, aliases, currentRoster] = await Promise.all([
      db.select().from(players),
      db.select().from(playerAliases),
      db.select({ playerId: tournamentParticipants.playerId, name: players.name })
        .from(tournamentParticipants)
        .innerJoin(players, eq(players.id, tournamentParticipants.playerId))
        .where(eq(tournamentParticipants.tournamentId, targetTournament.id)),
    ]);

    const byDsu = new Map(canonicalPlayers.filter((player) => player.dsuId).map((player) => [player.dsuId!, player]));
    const byFide = new Map(canonicalPlayers.filter((player) => player.fideId).map((player) => [player.fideId!, player]));
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
    const matchedPlayerIds = new Set<number>();
    const planned: Array<{
      participant: (typeof snapshot.players)[number];
      player: (typeof canonicalPlayers)[number] | null;
      nextDsuRating: number | null;
      nextFideRating: number | null;
    }> = [];
    const createdNames: string[] = [];
    const addedNames: string[] = [];
    const matchedNames: string[] = [];
    const ratingChanges: Array<{
      name: string;
      dsu: [number | null, number | null];
      fide: [number | null, number | null];
    }> = [];

    for (const participant of snapshot.players) {
      const dsuMatch = participant.dsuId ? byDsu.get(participant.dsuId) : undefined;
      const fideMatch = participant.fideId ? byFide.get(participant.fideId) : undefined;
      if (dsuMatch && fideMatch && dsuMatch.id !== fideMatch.id) {
        return errorResponse(`DSU and FIDE identities conflict for ${participant.name}.`, 409);
      }

      const nameMatches = byName.get(normalizeImportedPlayerName(participant.name)) ?? [];
      const player = dsuMatch ?? fideMatch ?? (nameMatches.length === 1 ? nameMatches[0] : null);
      const nextDsuRating = player
        ? reconciledProviderRating(player.currentDsuRating, participant.actualDsuRating, participant.dsuRatingUpdatedAt)
        : participant.actualDsuRating;
      const nextFideRating = player
        ? reconciledProviderRating(player.currentFideRating, participant.actualFideRating, participant.fideRatingUpdatedAt)
        : participant.actualFideRating;
      if (player) {
        if (matchedPlayerIds.has(player.id)) {
          return errorResponse(`Multiple snapshot participants resolve to ${player.name}.`, 409);
        }
        matchedPlayerIds.add(player.id);
        matchedNames.push(participant.name);
        if (!existingRoster.has(player.id)) addedNames.push(participant.name);
        if (ratingChanged(
          player.currentDsuRating,
          player.currentFideRating,
          nextDsuRating,
          nextFideRating,
        )) {
          ratingChanges.push({
            name: participant.name,
            dsu: [player.currentDsuRating, nextDsuRating],
            fide: [player.currentFideRating, nextFideRating],
          });
        }
      } else {
        createdNames.push(participant.name);
        addedNames.push(participant.name);
      }
      planned.push({ participant, player, nextDsuRating, nextFideRating });
    }

    const removedRows = currentRoster.filter((row) => !matchedPlayerIds.has(row.playerId));
    const safety = calculateRemovalSafety(currentRoster.length, removedRows.length);
    const participantCounts = {
      total: snapshot.players.length,
      matched: matchedNames.length,
      created: createdNames.length,
      added: addedNames.length,
      removed: removedRows.length,
      ratingChanges: ratingChanges.length,
    };
    const changes = {
      matched: matchedNames,
      created: createdNames,
      additions: addedNames,
      removals: removedRows.map((row) => row.name),
      ratingChanges,
    };

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        tournament: targetTournament,
        participants: participantCounts,
        changes,
        safety,
      });
    }

    if (safety.requiresForce && !force) {
      return errorResponse(
        `Sync would remove ${removedRows.length} of ${currentRoster.length} participants (${safety.removalPercent}%). Re-run with --force after reviewing a dry run.`,
        409,
        {
          code: "ROSTER_REMOVAL_REQUIRES_FORCE",
          tournament: targetTournament,
          participants: participantCounts,
          changes,
          safety,
        },
      );
    }

    const operations = [];
    if (removedRows.length > 0) {
      operations.push(matchedPlayerIds.size === 0
        ? db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, targetTournament.id))
        : db.delete(tournamentParticipants).where(and(
            eq(tournamentParticipants.tournamentId, targetTournament.id),
            notInArray(tournamentParticipants.playerId, [...matchedPlayerIds]),
          )));
    }

    const syncedAt = new Date();
    for (const { participant, player, nextDsuRating, nextFideRating } of planned) {
      const participantValues = {
        rating: nextDsuRating ?? nextFideRating,
        groupName: participant.group,
        club: participant.club,
        tournamentDsuRating: participant.tournamentDsuRating,
        tournamentFideRating: participant.tournamentFideRating,
        registeredAtText: participant.registeredAt,
        syncedAt,
      };

      if (player) {
        operations.push(db.update(players).set({
          name: participant.name,
          dsuId: participant.dsuId ?? player.dsuId,
          fideId: participant.fideId ?? player.fideId,
          currentDsuRating: nextDsuRating,
          currentFideRating: nextFideRating,
          dsuProfileUrl: participant.dsuProfileUrl ?? player.dsuProfileUrl,
          fideProfileUrl: participant.fideProfileUrl ?? player.fideProfileUrl,
          dsuRatingUpdatedAt: participant.dsuRatingUpdatedAt
            ? new Date(participant.dsuRatingUpdatedAt)
            : player.dsuRatingUpdatedAt,
          fideRatingUpdatedAt: participant.fideRatingUpdatedAt
            ? new Date(participant.fideRatingUpdatedAt)
            : player.fideRatingUpdatedAt,
        }).where(eq(players.id, player.id)));
        operations.push(db.insert(tournamentParticipants).values({
          tournamentId: targetTournament.id,
          playerId: player.id,
          ...participantValues,
        }).onConflictDoUpdate({
          target: [tournamentParticipants.tournamentId, tournamentParticipants.playerId],
          set: participantValues,
        }));
      } else {
        operations.push(db.execute(sql`
          with inserted_player as (
            insert into players (
              name, dsu_id, fide_id, current_dsu_rating, current_fide_rating,
              dsu_profile_url, fide_profile_url, dsu_rating_updated_at, fide_rating_updated_at
            ) values (
              ${participant.name}, ${participant.dsuId}, ${participant.fideId},
              ${nextDsuRating}, ${nextFideRating},
              ${participant.dsuProfileUrl}, ${participant.fideProfileUrl},
              ${participant.dsuRatingUpdatedAt ? new Date(participant.dsuRatingUpdatedAt) : null},
              ${participant.fideRatingUpdatedAt ? new Date(participant.fideRatingUpdatedAt) : null}
            )
            returning id
          )
          insert into tournament_participants (
            tournament_id, player_id, rating, group_name, club,
            tournament_dsu_rating, tournament_fide_rating, registered_at_text, synced_at
          )
          select
            ${targetTournament.id}, id, ${participantValues.rating}, ${participantValues.groupName},
            ${participantValues.club}, ${participantValues.tournamentDsuRating},
            ${participantValues.tournamentFideRating}, ${participantValues.registeredAtText}, ${syncedAt}
          from inserted_player
        `));
      }
    }

    if (snapshot.sourceUrl || snapshot.participantGroup !== null) {
      operations.push(db.update(tournaments).set({
        ...(snapshot.sourceUrl ? { sourceUrl: snapshot.sourceUrl } : {}),
        participantGroup: snapshot.participantGroup,
      }).where(eq(tournaments.id, targetTournament.id)));
    }

    if (operations.length > 0) {
      await db.batch([operations[0]!, ...operations.slice(1)]);
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      tournament: targetTournament,
      participants: participantCounts,
      changes,
      safety,
    });
  } catch (error) {
    console.error("Failed to sync tournament participants", error);
    return errorResponse(error instanceof Error ? error.message : "Participant sync failed.", 500);
  }
}
