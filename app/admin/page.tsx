import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { DeleteTournamentForm } from "@/app/tournaments/[id]/delete-tournament-form";
import { getDataHealthSummary } from "@/lib/admin/health";
import { getDb } from "@/lib/db";
import { syncRuns, tournaments } from "@/lib/db/schema";
import type { TournamentDetailsErrorCode } from "@/lib/tournaments/validation";

import {
  activateTournament,
  unarchiveTournament,
  updateTournamentDetails,
} from "./actions";
import { ArchiveTournamentForm } from "./archive-tournament-form";

export const dynamic = "force-dynamic";

type DetailsError = TournamentDetailsErrorCode | "database";

type AdminPageProps = {
  searchParams: Promise<{
    deleteError?: string;
    activateError?: string;
    archiveError?: string;
    detailsError?: DetailsError;
    tournamentId?: string;
    showArchived?: string;
  }>;
};

type TournamentAdminRow = {
  id: number;
  name: string;
  nickname: string;
  sourceUrl: string | null;
  participantGroup: string | null;
  isActive: boolean;
  archivedAt: Date | null;
  participantCount: number;
  staleDsuCount: number;
  staleFideCount: number;
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

function TournamentRow({
  tournament,
  detailsMessage,
  detailsTournamentId,
}: {
  tournament: TournamentAdminRow;
  detailsMessage: string | null;
  detailsTournamentId: string | undefined;
}) {
  const archived = tournament.archivedAt !== null;
  const showDetailsError =
    detailsMessage && detailsTournamentId === String(tournament.id);

  return (
    <article className={`admin-tournament-row${archived ? " is-archived" : ""}`}>
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
          {archived ? (
            <>
              <span className="archived-tournament-label">Archived</span>
              <form action={unarchiveTournament}>
                <input name="tournamentId" type="hidden" value={tournament.id} />
                <button className="link-button" type="submit">Restore</button>
              </form>
              <Link href={`/tournaments/${tournament.id}`}>Open</Link>
            </>
          ) : (
            <>
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
              <ArchiveTournamentForm
                active={tournament.isActive}
                tournamentId={tournament.id}
                tournamentName={tournament.name}
              />
            </>
          )}
        </div>
        <p className="admin-sync-summary">
          {tournament.participantCount} players · stale ratings: DSU {tournament.staleDsuCount}, FIDE {tournament.staleFideCount}
        </p>
      </div>

      {archived ? (
        <DeleteTournamentForm
          tournamentId={tournament.id}
          tournamentName={tournament.name}
        />
      ) : null}
    </article>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const {
    activateError,
    archiveError,
    deleteError,
    detailsError,
    tournamentId: detailsTournamentId,
  } = params;
  const showArchived = params.showArchived === "1";
  const detailsMessage = detailsErrorMessage(detailsError);
  let tournamentRows: TournamentAdminRow[] = [];
  let recentSyncRuns: Array<{
    id: number;
    tournamentName: string;
    kind: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    errorText: string | null;
  }> = [];
  let health: Awaited<ReturnType<typeof getDataHealthSummary>> | null = null;
  let loadError = false;

  try {
    const db = getDb();
    [tournamentRows, recentSyncRuns, health] = await Promise.all([
      db.select({
          id: tournaments.id,
          name: tournaments.name,
          nickname: tournaments.nickname,
          sourceUrl: tournaments.sourceUrl,
          participantGroup: tournaments.participantGroup,
          isActive: tournaments.isActive,
          archivedAt: tournaments.archivedAt,
          participantCount: sql<number>`(
            select count(*)::int from tournament_participants tp where tp.tournament_id = "tournaments"."id"
          )`,
          staleDsuCount: sql<number>`(
            select count(*)::int
            from tournament_participants tp
            inner join players p on p.id = tp.player_id
            where tp.tournament_id = "tournaments"."id"
              and p.dsu_profile_url is not null
              and (p.dsu_rating_updated_at is null or p.dsu_rating_updated_at < now() - interval '30 days')
          )`,
          staleFideCount: sql<number>`(
            select count(*)::int
            from tournament_participants tp
            inner join players p on p.id = tp.player_id
            where tp.tournament_id = "tournaments"."id"
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
        .limit(8),
      getDataHealthSummary(),
    ]);
  } catch (error) {
    console.error("Failed to load admin data", error);
    loadError = true;
  }

  const currentTournaments = tournamentRows.filter((tournament) => !tournament.archivedAt);
  const archivedTournaments = tournamentRows.filter((tournament) => tournament.archivedAt);

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
      {archiveError === "database" ? (
        <p className="simple-load-error">Tournament archive state could not be changed.</p>
      ) : null}

      <nav aria-label="Administration" className="admin-links">
        <Link href="/tournaments/new">Create tournament</Link>
        <Link href="/admin/players">Players</Link>
        <Link href="/admin/games">Games &amp; sources</Link>
        <Link href="/admin/sync-runs">Sync status</Link>
        <Link href="/imports">Import history</Link>
        <Link href="/unresolved-players">Unresolved players</Link>
        <Link href="/admin/data-health">Data health</Link>
      </nav>

      {health ? (
        <section className="admin-overview-grid">
          <Link href="/admin/players?filter=orphaned">
            <strong>{health.fullyOrphanedPlayers}</strong><span>orphaned players</span>
          </Link>
          <Link href="/admin/games?filter=unresolved">
            <strong>{health.gamesWithUnresolvedSide}</strong><span>games unresolved</span>
          </Link>
          <Link href="/imports">
            <strong>{health.prunableImports}</strong><span>imports pruneable</span>
          </Link>
          <Link href="/admin/data-health">
            <strong>{health.importErrors}</strong><span>import errors</span>
          </Link>
        </section>
      ) : null}

      <section className="admin-sync-status" aria-labelledby="sync-status-heading">
        <div className="admin-section-title">
          <h2 id="sync-status-heading">Recent syncs</h2>
          <Link className="text-link" href="/admin/sync-runs">All syncs</Link>
        </div>
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

      <section className="admin-tournaments" aria-labelledby="tournaments-heading">
        <div className="admin-section-title">
          <h2 id="tournaments-heading">Tournaments</h2>
          {archivedTournaments.length > 0 ? (
            <Link className="text-link" href={showArchived ? "/admin" : "/admin?showArchived=1"}>
              {showArchived ? "Hide archived" : `Show archived (${archivedTournaments.length})`}
            </Link>
          ) : null}
        </div>

        {currentTournaments.map((tournament) => (
          <TournamentRow
            detailsMessage={detailsMessage}
            detailsTournamentId={detailsTournamentId}
            key={tournament.id}
            tournament={tournament}
          />
        ))}

        {showArchived && archivedTournaments.length > 0 ? (
          <>
            <h3 className="admin-archived-heading">Archived</h3>
            {archivedTournaments.map((tournament) => (
              <TournamentRow
                detailsMessage={detailsMessage}
                detailsTournamentId={detailsTournamentId}
                key={tournament.id}
                tournament={tournament}
              />
            ))}
          </>
        ) : null}
      </section>
    </main>
  );
}
