"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";
import {
  type TournamentNameErrorCode,
  validateTournamentName,
} from "@/lib/tournaments/validation";

type CreateTournamentErrorCode = TournamentNameErrorCode | "database";

function redirectToForm(
  error: CreateTournamentErrorCode,
  name: string,
): never {
  const params = new URLSearchParams({ error, name });
  redirect(`/tournaments/new?${params.toString()}`);
}

export async function createTournament(formData: FormData) {
  const rawName = formData.get("name");
  const enteredName = typeof rawName === "string" ? rawName : "";
  const validation = validateTournamentName(rawName);

  if (!validation.success) {
    redirectToForm(validation.error, enteredName);
  }

  let tournamentId: number;

  try {
    const [createdTournament] = await getDb()
      .insert(tournaments)
      .values({ name: validation.name })
      .returning({ id: tournaments.id });

    if (!createdTournament) {
      throw new Error("Tournament insert returned no row");
    }

    tournamentId = createdTournament.id;
  } catch (error) {
    console.error("Failed to create tournament", error);
    redirectToForm("database", enteredName);
  }

  revalidatePath("/");
  redirect(`/tournaments/${tournamentId}`);
}
