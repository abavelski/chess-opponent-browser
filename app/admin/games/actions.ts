"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteCanonicalGame } from "@/lib/admin/games";

function positiveId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export async function deleteGame(formData: FormData) {
  const gameId = positiveId(formData.get("gameId"));
  if (!gameId) redirect("/admin/games?deleteError=invalid");

  let deleted = false;
  try {
    deleted = await deleteCanonicalGame(gameId);
  } catch (error) {
    console.error("Failed to delete canonical game", error);
    redirect(`/admin/games/${gameId}?deleteError=database`);
  }

  if (!deleted) redirect("/admin/games?deleteError=missing");

  revalidatePath("/admin");
  revalidatePath("/admin/games");
  revalidatePath("/admin/data-health");
  revalidatePath("/imports");
  redirect("/admin/games?deleted=1");
}
