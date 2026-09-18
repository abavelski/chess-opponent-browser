import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const [tournament] = await getDb()
      .select({ id: tournaments.id })
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt), desc(tournaments.id))
      .limit(1);

    redirect(tournament ? `/tournaments/${tournament.id}` : "/admin");
  } catch (error) {
    console.error("Failed to open tournament", error);
    redirect("/admin");
  }
}
