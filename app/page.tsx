import { desc } from "drizzle-orm";
import Link from "next/link";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type TournamentSummary = {
  id: number;
  name: string;
};

export default async function Home() {
  let tournamentRows: TournamentSummary[] = [];
  let loadError = false;

  try {
    tournamentRows = await getDb()
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt), desc(tournaments.id));
  } catch (error) {
    console.error("Failed to load tournaments", error);
    loadError = true;
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Tournament preparation</p>
          <h1>Chess Opponent Browser</h1>
          <p className="muted page-intro">
            Open a tournament to prepare for its potential opponents.
          </p>
        </div>
        <Link className="button" href="/tournaments/new">
          Create tournament
        </Link>
      </header>

      <section aria-labelledby="tournaments-heading" className="section-stack">
        <div className="section-heading">
          <h2 id="tournaments-heading">Tournaments</h2>
          <span className="count-badge">{tournamentRows.length}</span>
        </div>

        {loadError ? (
          <div className="panel empty-state" role="alert">
            <h3>Tournaments could not be loaded</h3>
            <p>Try refreshing the page. If the problem continues, check the database health.</p>
          </div>
        ) : tournamentRows.length === 0 ? (
          <div className="panel empty-state">
            <h3>No tournaments yet</h3>
            <p>Create the first tournament to start a preparation workspace.</p>
            <Link className="text-link" href="/tournaments/new">
              Create tournament →
            </Link>
          </div>
        ) : (
          <ul className="tournament-list">
            {tournamentRows.map((tournament) => (
              <li key={tournament.id}>
                <Link
                  className="tournament-card"
                  href={`/tournaments/${tournament.id}`}
                >
                  <span className="tournament-name">{tournament.name}</span>
                  <span aria-hidden="true" className="card-arrow">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
