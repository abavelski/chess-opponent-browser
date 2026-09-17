import { desc } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

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

  if (!loadError && tournamentRows.length === 1) {
    redirect(`/tournaments/${tournamentRows[0].id}`);
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Coach preparation</p>
          <h1>Chess Opponent Browser</h1>
          <p className="muted page-intro">
            Open the preparation workspace, choose an opponent, and browse their games.
          </p>
        </div>
      </header>

      {loadError ? (
        <section className="panel empty-state" role="alert">
          <h2>Preparation workspaces could not be loaded</h2>
          <p>Try refreshing the page. If the problem continues, check the database health.</p>
        </section>
      ) : tournamentRows.length === 0 ? (
        <section className="panel empty-state">
          <p className="eyebrow">Administrator setup</p>
          <h2>Create the preparation workspace</h2>
          <p>Create one tournament, then import one opponent PGN pack per expected player.</p>
          <Link className="button" href="/tournaments/new">
            Create preparation tournament
          </Link>
        </section>
      ) : (
        <>
          <section aria-labelledby="workspaces-heading" className="section-stack">
            <div className="section-heading">
              <h2 id="workspaces-heading">Preparation workspaces</h2>
              <span className="count-badge">{tournamentRows.length}</span>
            </div>
            <p className="muted">
              Multiple tournaments exist, so choose the one you want to share. When only one remains,
              this page opens its opponent roster automatically.
            </p>
            <ul className="tournament-list">
              {tournamentRows.map((tournament) => (
                <li key={tournament.id}>
                  <Link className="tournament-card" href={`/tournaments/${tournament.id}`}>
                    <span className="tournament-name">{tournament.name}</span>
                    <span aria-hidden="true" className="card-arrow">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="admin-tools-heading" className="section-stack">
            <div className="section-heading">
              <h2 id="admin-tools-heading">Administration</h2>
            </div>
            <div className="panel empty-state">
              <p className="muted">
                Setup and troubleshooting tools stay available without taking over the coach-facing flow.
              </p>
              <div className="form-actions">
                <Link className="text-link" href="/tournaments/new">
                  Create another tournament
                </Link>
                <Link className="text-link" href="/imports/new">
                  Import opponent pack
                </Link>
                <Link className="text-link" href="/imports">
                  Import history
                </Link>
                <Link className="text-link" href="/unresolved-players">
                  Unresolved players
                </Link>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
