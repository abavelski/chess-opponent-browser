import { and, asc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { players, tournamentParticipants, tournaments } from "@/lib/db/schema";
import { normalizeRosterSearch } from "@/lib/players/validation";
import { parseTournamentId } from "@/lib/tournaments/validation";

import { DeleteTournamentForm } from "./delete-tournament-form";

export const dynamic = "force-dynamic";

type TournamentPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; deleteError?: string }>;
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

export default async function TournamentPage({ params, searchParams }: TournamentPageProps) {
  const { id: rawId } = await params;
  const { q: rawQuery, deleteError } = await searchParams;
  const tournamentId = parseTournamentId(rawId);

  if (tournamentId === null) {
    notFound();
  }

  const query = normalizeRosterSearch(rawQuery);
  let tournament: TournamentDetail | undefined;
  let tournamentCount = 0;
  let roster: Array<{
    playerId: number;
    name: string;
    fideId: string | null;
    federation: string | null;
    rating: number | null;
  }> = [];

  try {
    const db = getDb();
    [tournament] = await db
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    const tournamentIds = await db.select({ id: tournaments.id }).from(tournaments);
    tournamentCount = tournamentIds.length;

    if (tournament) {
      const searchCondition = query
        ? or(
            ilike(players.name, `%${query}%`),
            ilike(players.fideId, `%${query}%`),
          )
        : undefined;

      roster = await db
        .select({
          playerId: players.id,
          name: players.name,
          fideId: players.fideId,
          federation: tournamentParticipants.federation,
          rating: tournamentParticipants.rating,
        })
        .from(tournamentParticipants)
        .innerJoin(players, eq(tournamentParticipants.playerId, players.id))
        .where(
          searchCondition
            ? and(
                eq(tournamentParticipants.tournamentId, tournamentId),
                searchCondition,
              )
            : eq(tournamentParticipants.tournamentId, tournamentId),
        )
        .orderBy(asc(players.name), asc(players.id));
    }
  } catch (error) {
    console.error("Failed to load tournament roster", error);

    return (
      <main className="app-shell narrow-shell">
        <section className="panel empty-state" role="alert">
          <h1>Preparation workspace could not be loaded</h1>
          <p>Try refreshing the page. If the problem continues, check the database health.</p>
        </section>
      </main>
    );
  }

  if (!tournament) {
    notFound();
  }

  return (
    <main className="app-shell">
      {tournamentCount > 1 ? (
        <Link className="back-link" href="/">
          ← Preparation workspaces
        </Link>
      ) : null}

      {deleteError === "database" ? (
        <section className="panel empty-state" role="alert">
          <h2>Tournament could not be deleted</h2>
          <p>No changes were made. Try again, or check the database health if the problem continues.</p>
        </section>
      ) : null}

      <header className="page-header">
        <div>
          <p className="eyebrow">Preparation workspace</p>
          <h1>{tournament.name}</h1>
          <p className="muted page-intro">
            Choose an opponent to browse their games, or import another opponent pack for this field.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="button" href={`/imports/new?tournamentId=${tournament.id}`}>
            Import opponent pack
          </Link>
          <Link className="button secondary-button" href={`/tournaments/${tournament.id}/opponents/new`}>
            Add opponent manually
          </Link>
        </div>
      </header>

      <section aria-labelledby="opponents-heading" className="section-stack">
        <div className="section-heading">
          <h2 id="opponents-heading">Opponents</h2>
          <span className="count-badge">{roster.length}</span>
        </div>

        <form action={`/tournaments/${tournament.id}`} className="roster-search" method="get">
          <label htmlFor="roster-search">Search opponents</label>
          <div className="search-row">
            <input
              defaultValue={query}
              id="roster-search"
              name="q"
              placeholder="Name or FIDE ID"
              type="search"
            />
            <button className="button secondary-button" type="submit">
              Search
            </button>
            {query ? (
              <Link className="text-link search-clear" href={`/tournaments/${tournament.id}`}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        {roster.length === 0 ? (
          <div className="panel empty-state">
            <h3>{query ? "No matching opponents" : "No opponents imported yet"}</h3>
            <p>
              {query
                ? `No roster entries match “${query}”.`
                : "Import a pre-filtered PGN pack and the focal opponent will be added here automatically."}
            </p>
            {query ? (
              <Link className="text-link" href={`/tournaments/${tournament.id}`}>
                Show full roster →
              </Link>
            ) : (
              <div className="form-actions">
                <Link className="button" href={`/imports/new?tournamentId=${tournament.id}`}>
                  Import first opponent pack
                </Link>
                <Link className="text-link" href={`/tournaments/${tournament.id}/opponents/new`}>
                  Add an existing Player manually
                </Link>
              </div>
            )}
          </div>
        ) : (
          <ul className="participant-list">
            {roster.map((participant) => (
              <li key={participant.playerId}>
                <Link
                  className="participant-card"
                  href={`/tournaments/${tournament.id}/players/${participant.playerId}`}
                >
                  <span className="participant-main">
                    <strong>{participant.name}</strong>
                    <span className="participant-meta">
                      {participant.federation ? <span>{participant.federation}</span> : null}
                      {participant.rating ? <span>{participant.rating}</span> : null}
                      {participant.fideId ? <span>FIDE {participant.fideId}</span> : null}
                    </span>
                  </span>
                  <span aria-hidden="true" className="card-arrow">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-tools-heading" className="section-stack">
        <div className="section-heading">
          <h2 id="admin-tools-heading">Administration</h2>
        </div>
        <div className="panel empty-state">
          <p className="muted">
            These tools are mainly for setup and troubleshooting; the shared coach workflow starts with the opponent list above.
          </p>
          <div className="form-actions">
            <Link className="text-link" href="/imports">
              Import history
            </Link>
            <Link className="text-link" href="/unresolved-players">
              Unresolved players
            </Link>
            <Link className="text-link" href="/tournaments/new">
              Create another tournament
            </Link>
          </div>
        </div>

        <div className="panel empty-state danger-panel">
          <p className="eyebrow danger-eyebrow">Danger zone</p>
          <h3>Delete this tournament</h3>
          <p className="muted">
            This removes the preparation workspace and its opponent roster. Canonical Players,
            Games, aliases, and import history are kept.
          </p>
          <DeleteTournamentForm
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        </div>
      </section>
    </main>
  );
}
