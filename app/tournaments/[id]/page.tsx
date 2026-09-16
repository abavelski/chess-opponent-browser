import { and, asc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { players, tournamentParticipants, tournaments } from "@/lib/db/schema";
import { normalizeRosterSearch } from "@/lib/players/validation";

export const dynamic = "force-dynamic";

type TournamentPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
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
  const { q: rawQuery } = await searchParams;
  const tournamentId = parseTournamentId(rawId);

  if (tournamentId === null) {
    notFound();
  }

  const query = normalizeRosterSearch(rawQuery);
  let tournament: TournamentDetail | undefined;
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
        <Link className="back-link" href="/">
          ← Tournaments
        </Link>
        <section className="panel empty-state" role="alert">
          <h1>Tournament could not be loaded</h1>
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
      <Link className="back-link" href="/">
        ← Tournaments
      </Link>

      <header className="detail-header">
        <p className="eyebrow">Tournament</p>
        <h1>{tournament.name}</h1>
      </header>

      <section aria-labelledby="opponents-heading" className="section-stack">
        <div className="section-heading section-heading-with-action">
          <div className="section-heading">
            <h2 id="opponents-heading">Potential opponents</h2>
            <span className="count-badge">{roster.length}</span>
          </div>
          <Link className="button" href={`/tournaments/${tournament.id}/opponents/new`}>
            Add opponent
          </Link>
        </div>

        <form action={`/tournaments/${tournament.id}`} className="roster-search" method="get">
          <label htmlFor="roster-search">Search roster</label>
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
            <h3>{query ? "No matching opponents" : "No opponents added yet"}</h3>
            <p>
              {query
                ? `No roster entries match “${query}”.`
                : "Add potential opponents so the coach can find them quickly before a round."}
            </p>
            {query ? (
              <Link className="text-link" href={`/tournaments/${tournament.id}`}>
                Show full roster →
              </Link>
            ) : (
              <Link className="text-link" href={`/tournaments/${tournament.id}/opponents/new`}>
                Add first opponent →
              </Link>
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
    </main>
  );
}
