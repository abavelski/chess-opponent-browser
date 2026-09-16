"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { players, tournamentParticipants, tournaments } from "@/lib/db/schema";
import {
  type OpponentFieldErrors,
  type OpponentFormValues,
  validateOpponentInput,
} from "@/lib/players/validation";

export type AddOpponentState = {
  error?: string;
  fieldErrors?: OpponentFieldErrors;
  values: OpponentFormValues;
};

function parsePositiveId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function getValues(formData: FormData): OpponentFormValues {
  return {
    name: String(formData.get("name") ?? ""),
    fideId: String(formData.get("fideId") ?? ""),
    federation: String(formData.get("federation") ?? ""),
    rating: String(formData.get("rating") ?? ""),
  };
}

export async function addOpponentAction(
  _previousState: AddOpponentState,
  formData: FormData,
): Promise<AddOpponentState> {
  const tournamentId = parsePositiveId(formData.get("tournamentId"));
  const values = getValues(formData);

  if (tournamentId === null) {
    return { values, error: "Tournament could not be identified. Return to the tournament and try again." };
  }

  const validation = validateOpponentInput(values);
  if (!validation.ok) {
    return { values, fieldErrors: validation.errors };
  }

  const db = getDb();

  try {
    const [tournament] = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      return { values, error: "Tournament no longer exists." };
    }

    let playerId: number;

    if (validation.data.fideId) {
      const [existingPlayer] = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.fideId, validation.data.fideId))
        .limit(1);

      if (existingPlayer) {
        playerId = existingPlayer.id;

        const [existingParticipation] = await db
          .select({ id: tournamentParticipants.id })
          .from(tournamentParticipants)
          .where(
            and(
              eq(tournamentParticipants.tournamentId, tournamentId),
              eq(tournamentParticipants.playerId, playerId),
            ),
          )
          .limit(1);

        if (existingParticipation) {
          return {
            values,
            error: "This player is already in the tournament roster.",
          };
        }
      } else {
        const [createdPlayer] = await db
          .insert(players)
          .values({ name: validation.data.name, fideId: validation.data.fideId })
          .returning({ id: players.id });

        playerId = createdPlayer.id;
      }
    } else {
      const [createdPlayer] = await db
        .insert(players)
        .values({ name: validation.data.name })
        .returning({ id: players.id });

      playerId = createdPlayer.id;
    }

    await db.insert(tournamentParticipants).values({
      tournamentId,
      playerId,
      federation: validation.data.federation,
      rating: validation.data.rating,
    });
  } catch (error) {
    console.error("Failed to add tournament opponent", error);
    return {
      values,
      error: "Opponent could not be added. Check the details and try again.",
    };
  }

  redirect(`/tournaments/${tournamentId}`);
}
