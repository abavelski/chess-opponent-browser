import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { games, players, tournamentParticipants, tournaments } from "@/lib/db/schema";
import { parseTournamentId } from "@/lib/tournaments/validation";
import {
  nextRosterSortOrder,
  parseRosterSort,
  type RosterSortKey,
  type RosterSortOrder,
} from "@/lib/tournaments/roster-sort";

export const dynamic = "force-dynamic";

type TournamentPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; order?: string }>;
};

function SortableHeader({
  label,
  column,
  numeric = false,
  tournamentId,
  currentSort,
  currentOrder,
}: {
  label: string;
  column: RosterSortKey;
  numeric?: boolean;
  tournamentId: number;
  currentSort: RosterSortKey;
  currentOrder: RosterSortOrder;
}) {
  const active = currentSort === column;
  const nextOrder = nextRosterSortOrder(column, currentSort, currentOrder);
  return (
    <th
      aria-sort={active ? (currentOrder === "asc" ? "ascending" : "descending") : "none"}
      className={numeric ? "numeric-cell" : undefined}
    >
      <Link
        className="sortable-header-link"
        href={`/tournaments/${tournamentId}?sort=${column}&order=${nextOrder}`}
      >
        {label}{active ? (currentOrder === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );
}

export default async function TournamentPage({ params, searchParams }: TournamentPageProps) {
  const [{ id: rawId }, rawSort] = await Promise.all([params, searchParams]);
  const tournamentId = parseTournamentId(rawId);
  const { sort, order } = parseRosterSort(rawSort.sort, rawSort.order);

  if (tournamentId === null) {
    notFound();
  }

  let tournament: { id: number; name: string } | undefined;
  let roster: Array<{
    playerId: number;
    name: string;
    club: string | null;
    group: string | null;
    dsuRating: number | null;
    fideRating: number | null;
    gameCount: number;
  }> = [];

  try {
    const db = getDb();

    [tournament] = await db
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    if (tournament) {
      const gameCount = sql<number>`(
        select count(*) from ${games}
        where ${games.whitePlayerId} = ${players.id} or ${games.blackPlayerId} = ${players.id}
      )`;
      const sortExpressions = {
        name: players.name,
        club: tournamentParticipants.club,
        group: tournamentParticipants.groupName,
        dsu: players.currentDsuRating,
        fide: players.currentFideRating,
        games: gameCount,
      };
      const primaryOrder = order === "asc"
        ? sql`${sortExpressions[sort]} asc nulls last`
        : sql`${sortExpressions[sort]} desc nulls last`;

      roster = await db
        .select({
          playerId: players.id,
          name: players.name,
          club: tournamentParticipants.club,
          group: tournamentParticipants.groupName,
          dsuRating: players.currentDsuRating,
          fideRating: players.currentFideRating,
          gameCount,
        })
        .from(tournamentParticipants)
        .innerJoin(players, eq(tournamentParticipants.playerId, players.id))
        .where(eq(tournamentParticipants.tournamentId, tournamentId))
        .orderBy(primaryOrder, players.name);
    }
  } catch (error) {
    console.error("Failed to load tournament roster", error);

    return (
      <main className="app-shell simple-tournament-shell">
        <p className="simple-load-error">Tournament could not be loaded.</p>
      </main>
    );
  }

  if (!tournament) {
    notFound();
  }

  return (
    <main className="app-shell simple-tournament-shell">
      <header className="simple-tournament-header">
        <h1>{tournament.name}</h1>
      </header>

      {roster.length === 0 ? (
        <p className="simple-empty-copy">No opponents yet.</p>
      ) : (
        <div className="opponent-table-wrap">
          <table className="opponent-table">
            <thead>
              <tr>
                <SortableHeader label="Player" column="name" tournamentId={tournament.id} currentSort={sort} currentOrder={order} />
                <SortableHeader label="Club" column="club" tournamentId={tournament.id} currentSort={sort} currentOrder={order} />
                <SortableHeader label="Group" column="group" tournamentId={tournament.id} currentSort={sort} currentOrder={order} />
                <SortableHeader label="DSU" column="dsu" numeric tournamentId={tournament.id} currentSort={sort} currentOrder={order} />
                <SortableHeader label="FIDE" column="fide" numeric tournamentId={tournament.id} currentSort={sort} currentOrder={order} />
                <SortableHeader label="Games" column="games" numeric tournamentId={tournament.id} currentSort={sort} currentOrder={order} />
              </tr>
            </thead>
            <tbody>
              {roster.map((participant) => (
                <tr key={participant.playerId}>
                  <td className="opponent-name-cell">
                    <Link href={`/tournaments/${tournament.id}/players/${participant.playerId}`}>
                      {participant.name}
                    </Link>
                  </td>
                  <td>{participant.club ?? "–"}</td>
                  <td>{participant.group ?? "–"}</td>
                  <td className="numeric-cell">{participant.dsuRating ?? "–"}</td>
                  <td className="numeric-cell">{participant.fideRating ?? "–"}</td>
                  <td className="numeric-cell">{Number(participant.gameCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
