"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";
import {
  type TournamentDetailsErrorCode,
  validateTournamentDetails,
} from "@/lib/tournaments/validation";

type CreateTournamentErrorCode = TournamentDetailsErrorCode | "database";

function redirectToForm(
  error: CreateTournamentErrorCode,
  values: Record<string, string>,
): never {
  const params = new URLSearchParams({ error, ...values });
  redirect(`/tournaments/new?${params.toString()}`);
}

export async function createTournament(formData: FormData) {
  const textValue = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const entered = {
    name: textValue("name"),
    nickname: textValue("nickname"),
    sourceUrl: textValue("sourceUrl"),
    participantGroup: textValue("participantGroup"),
  };
  const validation = validateTournamentDetails(entered);

  if (!validation.success) {
    redirectToForm(validation.error, entered);
  }

  let tournamentId: number;

  try {
    const [createdTournament] = await getDb()
      .insert(tournaments)
      .values(validation.details)
      .returning({ id: tournaments.id });

    if (!createdTournament) {
      throw new Error("Tournament insert returned no row");
    }

    tournamentId = createdTournament.id;
  } catch (error) {
    console.error("Failed to create tournament", error);
    redirectToForm("database", entered);
  }

  revalidatePath("/");
  redirect(`/tournaments/${tournamentId}`);
}
