import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { players, tournamentParticipants, tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type PlayerPageProps = {
  params: Promise<{ id: string; playerId: string }>;
};

function parsePositiveId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { id: rawTournamentId, playerId: rawPlayerId } = await params;
  const tournamentId = parsePositiveId(rawTournamentId);
  const playerId = parsePositiveId(rawPlayerId);

  if (tournamentId === null || playerId === null) {
    notFound();
  }

  let detail:
    | {
        tournamentName: string;
        playerName: string;
        fideId: string | null;
        federation: string | null;
        rating: number | null;
      }
    | undefined;

  try {
    [detail] = await getDb()
      .select({
        tournamentName: tournaments.name,
        playerName: players.name,
        fideId: players.fideId,
        federation: tournamentParticipants.federation,
        rating: tournamentParticipants.rating,
      })
      .from(tournamentParticipants)
      .innerJoin(tournaments, eq(tournamentParticipants.tournamentId, tournaments.id))
      .innerJoin(players, eq(tournamentParticipants.playerId, players.id))
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.playerId, playerId),
        ),
      )
      .limit(1);
  } catch (error) {
    console.error("Failed to load tournament player", error);

    return (
      <main className="app-shell narrow-shell">
        <Link className="back-link" href={`/tournaments/${tournamentId}`}>
          ← Tournament
        </Link>
        <section className="panel empty-state" role="alert">
          <h1>Player could not be loaded</h1>
          <p>Try refreshing the page. If the problem continues, check the database health.</p>
        </section>
      </main>
    );
  }

  if (!detail) {
    notFound();
  }

  return (
    <main className="app-shell narrow-shell">
      <Link className="back-link" href={`/tournaments/${tournamentId}`}>
        ← {detail.tournamentName}
      </Link>

      <header className="detail-header">
        <p className="eyebrow">Potential opponent</p>
        <h1>{detail.playerName}</h1>
      </header>

      <section aria-labelledby="identity-heading" className="section-stack">
        <h2 id="identity-heading">Player details</h2>
        <dl className="panel identity-grid">
          <div>
            <dt>FIDE ID</dt>
            <dd>{detail.fideId ?? "Not provided"}</dd>
          </div>
          <div>
            <dt>Federation</dt>
            <dd>{detail.federation ?? "Not provided"}</dd>
          </div>
          <div>
            <dt>Tournament rating</dt>
            <dd>{detail.rating ?? "Not provided"}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="games-heading" className="section-stack games-empty-section">
        <h2 id="games-heading">Known games</h2>
        <div className="panel empty-state">
          <h3>No known games yet</h3>
          <p>Game library browsing will be added in the next implementation task.</p>
        </div>
      </section>
    </main>
  );
}
