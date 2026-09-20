import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { DeleteTournamentForm } from "@/app/tournaments/[id]/delete-tournament-form";
import { getDb } from "@/lib/db";
import { syncRuns, tournaments } from "@/lib/db/schema";

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
  let tournamentRows: Array<{
    id: number;
    name: string;
    nickname: string;
    sourceUrl: string | null;
    participantGroup: string | null;
    isActive: boolean;
    participantCount: number;
    staleDsuCount: number;
    staleFideCount: number;
  }> = [];
  let recentSyncRuns: Array<{
    id: number;
    tournamentName: string;
    kind: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    errorText: string | null;
  }> = [];
  let loadError = false;

  try {
    const db = getDb();
    [tournamentRows, recentSyncRuns] = await Promise.all([
      db.select({
          id: tournaments.id,
          name: tournaments.name,
          nickname: tournaments.nickname,
          sourceUrl: tournaments.sourceUrl,
          participantGroup: tournaments.participantGroup,
          isActive: tournaments.isActive,
          participantCount: sql<number>`(
            select count(*)::int from tournament_participants tp where tp.tournament_id = ${tournaments.id}
          )`,
          staleDsuCount: sql<number>`(
            select count(*)::int
            from tournament_participants tp
            inner join players p on p.id = tp.player_id
            where tp.tournament_id = ${tournaments.id}
              and p.dsu_profile_url is not null
              and (p.dsu_rating_updated_at is null or p.dsu_rating_updated_at < now() - interval '30 days')
          )`,
          staleFideCount: sql<number>`(
            select count(*)::int
            from tournament_participants tp
            inner join players p on p.id = tp.player_id
            where tp.tournament_id = ${tournaments.id}
              and (p.fide_id is not null or p.fide_profile_url is not null)
              and (p.fide_rating_updated_at is null or p.fide_rating_updated_at < now() - interval '30 days')
          )`,
        })
        .from(tournaments)
        .orderBy(desc(tournaments.createdAt), desc(tournaments.id)),
      db.select({
          id: syncRuns.id,
          tournamentName: tournaments.name,
          kind: syncRuns.kind,
          status: syncRuns.status,
          startedAt: syncRuns.startedAt,
          completedAt: syncRuns.completedAt,
          errorText: syncRuns.errorText,
        })
        .from(syncRuns)
        .innerJoin(tournaments, eq(syncRuns.tournamentId, tournaments.id))
        .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
        .limit(10),
    ]);
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

      <section className="admin-sync-status" aria-labelledby="sync-status-heading">
        <h2 id="sync-status-heading">Recent syncs</h2>
        {recentSyncRuns.length === 0 ? (
          <p className="simple-empty-copy">No sync runs recorded yet.</p>
        ) : (
          <div className="admin-sync-table-wrap">
            <table className="admin-sync-table">
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {recentSyncRuns.map((run) => (
                  <tr key={run.id} title={run.errorText ?? undefined}>
                    <td>{run.tournamentName}</td>
                    <td>{run.kind}</td>
                    <td><span className={`sync-status sync-status-${run.status}`}>{run.status.replaceAll("_", " ")}</span></td>
                    <td>{new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(run.startedAt)}</td>
                    <td className="sync-message-cell">{run.errorText ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
                <p className="admin-sync-summary">
                  {tournament.participantCount} players · stale ratings: DSU {tournament.staleDsuCount}, FIDE {tournament.staleFideCount}
                </p>
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
