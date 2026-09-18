import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function Home() {
  let tournamentId: number | null = null;

  try {
    const [tournament] = await getDb()
      .select({ id: tournaments.id })
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt), desc(tournaments.id))
      .limit(1);

    tournamentId = tournament?.id ?? null;
  } catch (error) {
    console.error("Failed to open tournament", error);
  }

  redirect(tournamentId ? `/tournaments/${tournamentId}` : "/admin");
}
