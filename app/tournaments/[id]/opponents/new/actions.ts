"use server";

import { and, eq, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import {
  playerAliases,
  players,
  tournamentParticipants,
  tournaments,
} from "@/lib/db/schema";
import { normalizeImportedPlayerName } from "@/lib/imports/persist";
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

function addOpponentUrl(tournamentId: number, query = "", error = "") {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (error) params.set("error", error);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return `/tournaments/${tournamentId}/opponents/new${suffix}`;
}

export async function addExistingOpponentAction(formData: FormData) {
  const tournamentId = parsePositiveId(formData.get("tournamentId"));
  const playerId = parsePositiveId(formData.get("playerId"));
  const query = String(formData.get("query") ?? "").trim();

  if (tournamentId === null) {
    redirect("/");
  }

  if (playerId === null) {
    redirect(addOpponentUrl(tournamentId, query, "Player could not be identified."));
  }

  const db = getDb();
  const [tournament] = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!tournament) {
    redirect("/");
  }

  const [player] = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!player) {
    redirect(addOpponentUrl(tournamentId, query, "That Player no longer exists."));
  }

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
    redirect(
      addOpponentUrl(
        tournamentId,
        query,
        `${player.name} is already in the tournament roster.`,
      ),
    );
  }

  try {
    await db.insert(tournamentParticipants).values({ tournamentId, playerId });
  } catch (error) {
    console.error("Failed to add existing Player to tournament", error);
    redirect(
      addOpponentUrl(
        tournamentId,
        query,
        "Player could not be added to the tournament. Refresh and try again.",
      ),
    );
  }

  redirect(`/tournaments/${tournamentId}`);
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
      const normalizedName = normalizeImportedPlayerName(validation.data.name);
      const [existingPlayer] = await db
        .selectDistinct({ id: players.id, name: players.name })
        .from(players)
        .leftJoin(playerAliases, eq(playerAliases.playerId, players.id))
        .where(
          or(
            eq(playerAliases.normalizedKey, normalizedName),
            sql`lower(regexp_replace(btrim(${players.name}), '[[:space:]]+', ' ', 'g')) = ${normalizedName}`,
          ),
        )
        .limit(1);

      if (existingPlayer) {
        return {
          values,
          error: `“${existingPlayer.name}” already exists. Search above and add the existing Player instead.`,
        };
      }

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
