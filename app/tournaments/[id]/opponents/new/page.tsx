import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

import { AddOpponentForm } from "./form";

export const dynamic = "force-dynamic";

type AddOpponentPageProps = {
  params: Promise<{ id: string }>;
};

function parseTournamentId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export default async function AddOpponentPage({ params }: AddOpponentPageProps) {
  const { id: rawId } = await params;
  const tournamentId = parseTournamentId(rawId);

  if (tournamentId === null) {
    notFound();
  }

  const [tournament] = await getDb()
    .select({ id: tournaments.id, name: tournaments.name })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!tournament) {
    notFound();
  }

  return (
    <main className="app-shell narrow-shell">
      <Link className="back-link" href={`/tournaments/${tournament.id}`}>
        ← {tournament.name}
      </Link>

      <section className="panel form-panel">
        <p className="eyebrow">Tournament roster</p>
        <h1>Add opponent</h1>
        <p className="muted">
          Add one potential opponent. FIDE ID is the only field used to safely
          reuse an existing global player in this task.
        </p>
        <AddOpponentForm tournamentId={tournament.id} />
      </section>
    </main>
  );
}
