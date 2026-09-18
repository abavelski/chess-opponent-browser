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
    redirect("/admin");
  }

  try {
    await getDb().delete(tournaments).where(eq(tournaments.id, tournamentId));
  } catch (error) {
    console.error("Failed to delete tournament", error);
    redirect("/admin?deleteError=database");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}
