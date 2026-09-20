"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { pruneDuplicateOnlyImports } from "@/lib/admin/history";

export async function pruneImportHistory() {
  let removed = 0;

  try {
    removed = await pruneDuplicateOnlyImports();
  } catch (error) {
    console.error("Failed to prune duplicate-only imports", error);
    redirect("/imports?pruneError=database");
  }

  revalidatePath("/imports");
  revalidatePath("/admin");
  revalidatePath("/admin/data-health");
  redirect(`/imports?pruned=${removed}`);
}
