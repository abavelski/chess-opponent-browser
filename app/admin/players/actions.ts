"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mergeCanonicalPlayers } from "@/lib/admin/players";

function positiveId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export async function mergePlayers(formData: FormData) {
  const sourcePlayerId = positiveId(formData.get("sourcePlayerId"));
  const targetPlayerId = positiveId(formData.get("targetPlayerId"));

  if (!sourcePlayerId || !targetPlayerId || sourcePlayerId === targetPlayerId) {
    redirect("/admin/players?mergeError=invalid");
  }

  try {
    await mergeCanonicalPlayers(sourcePlayerId, targetPlayerId);
  } catch (error) {
    const code =
      error instanceof Error &&
      ["same_player", "player_missing", "dsu_conflict", "fide_conflict"].includes(error.message)
        ? error.message
        : "database";
    redirect(`/admin/players/${sourcePlayerId}/merge?target=${targetPlayerId}&error=${code}`);
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/players");
  revalidatePath("/admin/data-health");
  revalidatePath("/unresolved-players");
  redirect(`/admin/players?merged=${targetPlayerId}`);
}
