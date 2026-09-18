import { desc } from "drizzle-orm";
import Link from "next/link";

import { DeleteTournamentForm } from "@/app/tournaments/[id]/delete-tournament-form";
import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

import { activateTournament, renameTournament } from "./actions";

export const dynamic = "force-dynamic";

type RenameError = "required" | "too_long" | "database";

type AdminPageProps = {
  searchParams: Promise<{
    deleteError?: string;
    activateError?: string;
    renameError?: RenameError;
    tournamentId?: string;
  }>;
};

function renameErrorMessage(error: RenameError | undefined) {
  if (error === "required") return "Tournament name is required.";
  if (error === "too_long") return "Tournament name is too long.";
  if (error === "database") return "Tournament could not be renamed.";
  return null;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { activateError, deleteError, renameError, tournamentId: renameTournamentId } = await searchParams;
  const renameMessage = renameErrorMessage(renameError);
  let tournamentRows: Array<{ id: number; name: string; isActive: boolean }> = [];
  let loadError = false;

  try {
    tournamentRows = await getDb()
      .select({ id: tournaments.id, name: tournaments.name, isActive: tournaments.isActive })
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

      {activateError === "database" ? (
        <p className="simple-load-error">Active tournament could not be changed.</p>
      ) : null}

      <nav aria-label="Administration" className="admin-links">
        <Link href="/tournaments/new">Create tournament</Link>
        <Link href="/imports">Import history</Link>
        <Link href="/unresolved-players">Unresolved players</Link>
      </nav>

      <section className="admin-tournaments">
        {tournamentRows.map((tournament) => {
          const showRenameError =
            renameMessage && renameTournamentId === String(tournament.id);

          return (
            <article className="admin-tournament-row" key={tournament.id}>
              <div className="admin-tournament-main">
                <form action={renameTournament} className="admin-rename-form">
                  <input name="tournamentId" type="hidden" value={tournament.id} />
                  <label className="sr-only" htmlFor={`tournament-name-${tournament.id}`}>
                    Tournament name
                  </label>
                  <input
                    defaultValue={tournament.name}
                    id={`tournament-name-${tournament.id}`}
                    maxLength={200}
                    name="name"
                    required
                    type="text"
                  />
                  <button className="button secondary-button admin-save-name" type="submit">
                    Save name
                  </button>
                </form>

                {showRenameError ? (
                  <p className="form-error admin-rename-error">{renameMessage}</p>
                ) : null}

                <div className="admin-row-links">
                  {tournament.isActive ? (
                    <span className="active-tournament-label">Active</span>
                  ) : (
                    <form action={activateTournament}>
                      <input name="tournamentId" type="hidden" value={tournament.id} />
                      <button className="link-button" type="submit">Make active</button>
                    </form>
                  )}
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
          );
        })}
      </section>
    </main>
  );
}
