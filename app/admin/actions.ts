"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";
import {
  parseTournamentId,
  validateTournamentName,
} from "@/lib/tournaments/validation";

function redirectWithRenameError(
  tournamentId: number | null,
  error: "required" | "too_long" | "database",
): never {
  const params = new URLSearchParams({ renameError: error });

  if (tournamentId !== null) {
    params.set("tournamentId", String(tournamentId));
  }

  redirect(`/admin?${params.toString()}`);
}

export async function renameTournament(formData: FormData) {
  const tournamentId = parseTournamentId(formData.get("tournamentId"));
  const validation = validateTournamentName(formData.get("name"));

  if (tournamentId === null) {
    redirectWithRenameError(null, "database");
  }

  if (!validation.success) {
    redirectWithRenameError(tournamentId, validation.error);
  }

  try {
    const [updated] = await getDb()
      .update(tournaments)
      .set({ name: validation.name })
      .where(eq(tournaments.id, tournamentId))
      .returning({ id: tournaments.id });

    if (!updated) {
      throw new Error("Tournament update returned no row");
    }
  } catch (error) {
    console.error("Failed to rename tournament", error);
    redirectWithRenameError(tournamentId, "database");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/tournaments/${tournamentId}`);
  redirect("/admin");
}

export async function activateTournament(formData: FormData) {
  const tournamentId = parseTournamentId(formData.get("tournamentId"));

  if (tournamentId === null) {
    redirect("/admin?activateError=database");
  }

  try {
    const result = await getDb().execute(sql`
      with target as (
        select "id" from "tournaments" where "id" = ${tournamentId}
      ), deactivated as (
        update "tournaments" set "is_active" = false
        where "is_active" = true
          and "id" <> ${tournamentId}
          and exists (select 1 from target)
        returning "id"
      )
      update "tournaments" set "is_active" = true
      where "id" = ${tournamentId}
        and (select count(*) from deactivated) >= 0
      returning "id"
    `);

    if (result.rows.length === 0) throw new Error("Tournament not found");
  } catch (error) {
    console.error("Failed to activate tournament", error);
    redirect("/admin?activateError=database");
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}
