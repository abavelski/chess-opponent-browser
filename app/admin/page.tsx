import { desc } from "drizzle-orm";
import Link from "next/link";

import { DeleteTournamentForm } from "@/app/tournaments/[id]/delete-tournament-form";
import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";

import { activateTournament, updateTournamentDetails } from "./actions";
import type { TournamentDetailsErrorCode } from "@/lib/tournaments/validation";

export const dynamic = "force-dynamic";

type DetailsError = TournamentDetailsErrorCode | "database";

type AdminPageProps = {
  searchParams: Promise<{
    deleteError?: string;
    activateError?: string;
    detailsError?: DetailsError;
    tournamentId?: string;
  }>;
};

function detailsErrorMessage(error: DetailsError | undefined) {
  if (error === "required") return "Tournament name is required.";
  if (error === "too_long") return "Tournament name is too long.";
  if (error === "nickname_required") return "Sync nickname is required.";
  if (error === "nickname_too_long") return "Sync nickname is too long.";
  if (error === "nickname_format") return "Nickname must use lowercase letters, numbers, and hyphens.";
  if (error === "url_required") return "Tournament URL is required.";
  if (error === "url_too_long") return "Tournament URL is too long.";
  if (error === "url_invalid") return "Tournament URL must be a valid HTTP or HTTPS URL.";
  if (error === "group_too_long") return "Participant group is too long.";
  if (error === "database") return "Tournament details could not be saved. Check that the nickname is unique.";
  return null;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { activateError, deleteError, detailsError, tournamentId: detailsTournamentId } = await searchParams;
  const detailsMessage = detailsErrorMessage(detailsError);
  let tournamentRows: Array<{ id: number; name: string; nickname: string; sourceUrl: string | null; participantGroup: string | null; isActive: boolean }> = [];
  let loadError = false;

  try {
    tournamentRows = await getDb()
      .select({
        id: tournaments.id,
        name: tournaments.name,
        nickname: tournaments.nickname,
        sourceUrl: tournaments.sourceUrl,
        participantGroup: tournaments.participantGroup,
        isActive: tournaments.isActive,
      })
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
          const showDetailsError =
            detailsMessage && detailsTournamentId === String(tournament.id);

          return (
            <article className="admin-tournament-row" key={tournament.id}>
              <div className="admin-tournament-main">
                <form action={updateTournamentDetails} className="admin-rename-form admin-details-form">
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
                  <label className="sr-only" htmlFor={`tournament-nickname-${tournament.id}`}>
                    Sync nickname
                  </label>
                  <input
                    defaultValue={tournament.nickname}
                    id={`tournament-nickname-${tournament.id}`}
                    maxLength={80}
                    name="nickname"
                    placeholder="sync-nickname"
                    required
                    type="text"
                  />
                  <label className="sr-only" htmlFor={`tournament-url-${tournament.id}`}>
                    Tournament URL
                  </label>
                  <input
                    defaultValue={tournament.sourceUrl ?? ""}
                    id={`tournament-url-${tournament.id}`}
                    maxLength={1000}
                    name="sourceUrl"
                    placeholder="Tournament URL"
                    required
                    type="url"
                  />
                  <label className="sr-only" htmlFor={`tournament-group-${tournament.id}`}>
                    Participant group
                  </label>
                  <input
                    defaultValue={tournament.participantGroup ?? ""}
                    id={`tournament-group-${tournament.id}`}
                    maxLength={120}
                    name="participantGroup"
                    placeholder="Group (optional)"
                    type="text"
                  />
                  <button className="button secondary-button admin-save-name" type="submit">
                    Save details
                  </button>
                </form>

                {showDetailsError ? (
                  <p className="form-error admin-rename-error">{detailsMessage}</p>
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
