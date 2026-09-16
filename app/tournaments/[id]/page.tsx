import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type TournamentPageProps = {
  params: Promise<{ id: string }>;
};

type TournamentDetail = {
  id: number;
  name: string;
};

function parseTournamentId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export default async function TournamentPage({ params }: TournamentPageProps) {
  const { id: rawId } = await params;
  const tournamentId = parseTournamentId(rawId);

  if (tournamentId === null) {
    notFound();
  }

  let tournament: TournamentDetail | undefined;

  try {
    [tournament] = await getDb()
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);
  } catch (error) {
    console.error("Failed to load tournament", error);

    return (
      <main className="app-shell narrow-shell">
        <Link className="back-link" href="/">
          ← Tournaments
        </Link>
        <section className="panel empty-state" role="alert">
          <h1>Tournament couldn't be loaded</h1>
          <p>Try refreshing the page. If the problem continues, check the database health.</p>
        </section>
      </main>
    );
  }

  if (!tournament) {
    notFound();
  }

  return (
    <main className="app-shell narrow-shell">
      <Link className="back-link" href="/">
        ← Tournaments
      </Link>

      <header className="detail-header">
        <p className="eyebrow">Tournament</p>
        <h1>{tournament.name}</h1>
      </header>

      <section aria-labelledby="opponents-heading" className="section-stack">
        <div className="section-heading">
          <h2 id="opponents-heading">Potential opponents</h2>
          <span className="count-badge">0</span>
        </div>
        <div className="panel empty-state">
          <h3>No opponents added yet</h3>
          <p>
            This tournament is ready. Adding and searching potential opponents
            is part of the next implementation task.
          </p>
        </div>
      </section>
    </main>
  );
}
