import { asc } from "drizzle-orm";
import Link from "next/link";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function NewImportPage() {
  const tournamentOptions = await getDb()
    .select({ id: tournaments.id, name: tournaments.name })
    .from(tournaments)
    .orderBy(asc(tournaments.name), asc(tournaments.id));

  return (
    <main className="app-shell">
      <Link className="back-link" href="/">
        ← Tournaments
      </Link>
      <ImportForm tournaments={tournamentOptions} />
    </main>
  );
}
