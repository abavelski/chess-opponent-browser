"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";
import { parseTournamentId } from "@/lib/tournaments/validation";

export async function deleteTournament(formData: FormData) {
  const tournamentId = parseTournamentId(formData.get("tournamentId"));

  if (tournamentId === null) {
    redirect("/");
  }

  let deleted = false;

  try {
    const [deletedTournament] = await getDb()
      .delete(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .returning({ id: tournaments.id });

    deleted = Boolean(deletedTournament);
  } catch (error) {
    console.error("Failed to delete tournament", error);
    redirect(`/tournaments/${tournamentId}?deleteError=database`);
  }

  revalidatePath("/");
  revalidatePath(`/tournaments/${tournamentId}`);

  if (!deleted) {
    redirect("/");
  }

  redirect("/");
}
