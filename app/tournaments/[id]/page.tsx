import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { players, tournamentParticipants, tournaments } from "@/lib/db/schema";
import { parseTournamentId } from "@/lib/tournaments/validation";

export const dynamic = "force-dynamic";

type TournamentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function TournamentPage({ params }: TournamentPageProps) {
  const { id: rawId } = await params;
  const tournamentId = parseTournamentId(rawId);

  if (tournamentId === null) {
    notFound();
  }

  let tournament: { id: number; name: string } | undefined;
  let roster: Array<{ playerId: number; name: string }> = [];

  try {
    const db = getDb();

    [tournament] = await db
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    if (tournament) {
      roster = await db
        .select({
          playerId: players.id,
          name: players.name,
        })
        .from(tournamentParticipants)
        .innerJoin(players, eq(tournamentParticipants.playerId, players.id))
        .where(eq(tournamentParticipants.tournamentId, tournamentId));
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
        <ul className="simple-opponent-list">
          {roster.map((participant) => (
            <li key={participant.playerId}>
              <Link href={`/tournaments/${tournament.id}/players/${participant.playerId}`}>
                {participant.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
