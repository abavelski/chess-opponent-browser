import "server-only";

import { and, eq, ilike, or } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  playerAliases,
  players,
  tournamentParticipants,
} from "@/lib/db/schema";
import { normalizeRosterSearch } from "./validation";

export type TournamentPlayerSearchResult = {
  id: number;
  name: string;
  fideId: string | null;
  alreadyInTournament: boolean;
};

export async function searchPlayersForTournament(
  tournamentId: number,
  rawQuery: string | undefined,
): Promise<TournamentPlayerSearchResult[]> {
  const query = normalizeRosterSearch(rawQuery).slice(0, 200);
  if (!query) return [];

  const pattern = `%${query}%`;
  const rows = await getDb()
    .selectDistinct({
      id: players.id,
      name: players.name,
      fideId: players.fideId,
      participationId: tournamentParticipants.id,
    })
    .from(players)
    .leftJoin(playerAliases, eq(playerAliases.playerId, players.id))
    .leftJoin(
      tournamentParticipants,
      and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        eq(tournamentParticipants.playerId, players.id),
      ),
    )
    .where(
      or(
        ilike(players.name, pattern),
        ilike(playerAliases.aliasText, pattern),
        ilike(players.fideId, pattern),
      ),
    )
    .orderBy(players.name, players.id)
    .limit(25);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    fideId: row.fideId,
    alreadyInTournament: row.participationId !== null,
  }));
}
