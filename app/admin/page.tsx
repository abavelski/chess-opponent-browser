import { desc } from "drizzle-orm";
import Link from "next/link";

import { DeleteTournamentForm } from "@/app/tournaments/[id]/delete-tournament-form";
import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{ deleteError?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { deleteError } = await searchParams;
  let tournamentRows: Array<{ id: number; name: string }> = [];
  let loadError = false;

  try {
    tournamentRows = await getDb()
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt), desc(tournaments.id));
  } catch (error) {
    console.error("Failed to load admin tournaments", error);
    loadError = true;
  }

  return (
    <main className="app-shell admin-shell">
      <header className="admin-header">
        <h1>Admin</h1>
        <Link className="text-link" href="/">
          Open preparation
        </Link>
      </header>

      {loadError ? (
        <p className="simple-load-error">Admin data could not be loaded.</p>
      ) : null}

      {deleteError === "database" ? (
        <p className="simple-load-error">Tournament could not be deleted.</p>
      ) : null}

      <nav aria-label="Administration" className="admin-links">
        <Link href="/tournaments/new">Create tournament</Link>
        <Link href="/imports">Import history</Link>
        <Link href="/unresolved-players">Unresolved players</Link>
      </nav>

      <section className="admin-tournaments">
        {tournamentRows.map((tournament) => (
          <article className="admin-tournament-row" key={tournament.id}>
            <div>
              <strong>{tournament.name}</strong>
              <div className="admin-row-links">
                <Link href={`/tournaments/${tournament.id}`}>Open</Link>
                <Link href={`/imports/new?tournamentId=${tournament.id}`}>Import games</Link>
                <Link href={`/tournaments/${tournament.id}/opponents/new`}>Add opponent</Link>
              </div>
            </div>
            <DeleteTournamentForm
              tournamentId={tournament.id}
              tournamentName={tournament.name}
            />
          </article>
        ))}
      </section>
    </main>
  );
}
