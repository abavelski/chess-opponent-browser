import "server-only";

import { asc, eq, ilike, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  games,
  playerAliases,
  playerMergeHistory,
  players,
  tournamentParticipants,
} from "@/lib/db/schema";
import { normalizeImportedPlayerName } from "@/lib/imports/persist";

export const PLAYER_HEALTH_FILTERS = [
  "all",
  "duplicate",
  "no-ids",
  "orphaned",
  "game-only",
  "roster-no-games",
  "unresolved-alias",
] as const;

export type PlayerHealthFilter = (typeof PLAYER_HEALTH_FILTERS)[number];

export function parsePlayerHealthFilter(value: unknown): PlayerHealthFilter {
  return typeof value === "string" &&
    PLAYER_HEALTH_FILTERS.includes(value as PlayerHealthFilter)
    ? (value as PlayerHealthFilter)
    : "all";
}

export type PlayerHealthRow = {
  id: number;
  name: string;
  dsuId: string | null;
  fideId: string | null;
  currentDsuRating: number | null;
  currentFideRating: number | null;
  tournamentCount: number;
  gameCount: number;
  aliasCount: number;
  unresolvedAliasSideCount: number;
  normalizedNameCount: number;
};

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function mapPlayerHealthRow(row: Record<string, unknown>): PlayerHealthRow {
  return {
    id: Number(row.id),
    name: String(row.name),
    dsuId: nullableString(row.dsu_id),
    fideId: nullableString(row.fide_id),
    currentDsuRating: nullableNumber(row.current_dsu_rating),
    currentFideRating: nullableNumber(row.current_fide_rating),
    tournamentCount: numberValue(row.tournament_count),
    gameCount: numberValue(row.game_count),
    aliasCount: numberValue(row.alias_count),
    unresolvedAliasSideCount: numberValue(row.unresolved_alias_side_count),
    normalizedNameCount: numberValue(row.normalized_name_count),
  };
}

function matchesFilter(row: PlayerHealthRow, filter: PlayerHealthFilter) {
  if (filter === "duplicate") return row.normalizedNameCount > 1;
  if (filter === "no-ids") return !row.dsuId && !row.fideId;
  if (filter === "orphaned") return row.tournamentCount === 0 && row.gameCount === 0;
  if (filter === "game-only") return row.tournamentCount === 0 && row.gameCount > 0;
  if (filter === "roster-no-games") return row.tournamentCount > 0 && row.gameCount === 0;
  if (filter === "unresolved-alias") return row.unresolvedAliasSideCount > 0;
  return true;
}

export async function listPlayerHealth(input: {
  filter: PlayerHealthFilter;
  query?: string;
}) {
  const query = input.query?.trim().slice(0, 200) ?? "";
  const pattern = `%${query}%`;
  const result = await getDb().execute(sql`
    with game_links as (
      select player_id, count(distinct game_id)::integer as game_count
      from (
        select id as game_id, white_player_id as player_id
        from games where white_player_id is not null
        union all
        select id as game_id, black_player_id as player_id
        from games where black_player_id is not null
      ) linked
      group by player_id
    ),
    roster_counts as (
      select player_id, count(*)::integer as tournament_count
      from tournament_participants
      group by player_id
    ),
    alias_counts as (
      select player_id, count(*)::integer as alias_count
      from player_aliases
      group by player_id
    ),
    normalized_counts as (
      select
        lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) as normalized_name,
        count(*)::integer as normalized_name_count
      from players
      group by 1
    ),
    unresolved_keys as (
      select lower(regexp_replace(btrim(white_name), '[[:space:]]+', ' ', 'g')) as normalized_key
      from games where white_player_id is null
      union all
      select lower(regexp_replace(btrim(black_name), '[[:space:]]+', ' ', 'g'))
      from games where black_player_id is null
    ),
    unresolved_alias_counts as (
      select a.player_id, count(*)::integer as unresolved_alias_side_count
      from player_aliases a
      inner join unresolved_keys u on u.normalized_key = a.normalized_key
      group by a.player_id
    )
    select
      p.id,
      p.name,
      p.dsu_id,
      p.fide_id,
      p.current_dsu_rating,
      p.current_fide_rating,
      coalesce(r.tournament_count, 0)::integer as tournament_count,
      coalesce(g.game_count, 0)::integer as game_count,
      coalesce(a.alias_count, 0)::integer as alias_count,
      coalesce(ua.unresolved_alias_side_count, 0)::integer as unresolved_alias_side_count,
      coalesce(n.normalized_name_count, 1)::integer as normalized_name_count
    from players p
    left join game_links g on g.player_id = p.id
    left join roster_counts r on r.player_id = p.id
    left join alias_counts a on a.player_id = p.id
    left join unresolved_alias_counts ua on ua.player_id = p.id
    left join normalized_counts n
      on n.normalized_name = lower(regexp_replace(btrim(p.name), '[[:space:]]+', ' ', 'g'))
    where (
      ${query} = ''
      or p.name ilike ${pattern}
      or coalesce(p.dsu_id, '') ilike ${pattern}
      or coalesce(p.fide_id, '') ilike ${pattern}
      or exists (
        select 1 from player_aliases search_alias
        where search_alias.player_id = p.id and search_alias.alias_text ilike ${pattern}
      )
    )
    order by p.name asc, p.id asc
    limit 1000
  `);

  return result.rows
    .map((row) => mapPlayerHealthRow(row as Record<string, unknown>))
    .filter((row) => matchesFilter(row, input.filter));
}

export async function getPlayerMaintenanceDetail(playerId: number) {
  const rows = await listPlayerHealth({ filter: "all" });
  return rows.find((row) => row.id === playerId) ?? null;
}

export async function searchMergeTargets(sourcePlayerId: number, rawQuery: string) {
  const query = rawQuery.trim().slice(0, 200);
  if (!query) return [];
  const pattern = `%${query}%`;

  return getDb()
    .selectDistinct({
      id: players.id,
      name: players.name,
      dsuId: players.dsuId,
      fideId: players.fideId,
      currentDsuRating: players.currentDsuRating,
      currentFideRating: players.currentFideRating,
    })
    .from(players)
    .leftJoin(playerAliases, eq(playerAliases.playerId, players.id))
    .where(
      sql`${players.id} <> ${sourcePlayerId} and (
        ${ilike(players.name, pattern)}
        or ${ilike(playerAliases.aliasText, pattern)}
        or ${ilike(players.dsuId, pattern)}
        or ${ilike(players.fideId, pattern)}
      )`,
    )
    .orderBy(asc(players.name), asc(players.id))
    .limit(30);
}

function latestDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

function providerRating(
  targetValue: number | null,
  targetUpdatedAt: Date | null,
  sourceValue: number | null,
  sourceUpdatedAt: Date | null,
) {
  if (targetValue === null) return sourceValue;
  if (sourceValue === null) return targetValue;
  if (sourceUpdatedAt && (!targetUpdatedAt || sourceUpdatedAt > targetUpdatedAt)) {
    return sourceValue;
  }
  return targetValue;
}

function mergedParticipantValue<T>(target: T | null, source: T | null) {
  return target ?? source;
}

export type PlayerMergePreview = {
  source: PlayerHealthRow;
  target: PlayerHealthRow;
  dsuConflict: boolean;
  fideConflict: boolean;
};

export async function getPlayerMergePreview(
  sourcePlayerId: number,
  targetPlayerId: number,
): Promise<PlayerMergePreview | null> {
  if (sourcePlayerId === targetPlayerId) return null;
  const [source, target] = await Promise.all([
    getPlayerMaintenanceDetail(sourcePlayerId),
    getPlayerMaintenanceDetail(targetPlayerId),
  ]);
  if (!source || !target) return null;

  return {
    source,
    target,
    dsuConflict: Boolean(source.dsuId && target.dsuId),
    fideConflict: Boolean(source.fideId && target.fideId),
  };
}

export type MergeCanonicalPlayersResult = {
  sourcePlayerId: number;
  targetPlayerId: number;
  sourceName: string;
  targetName: string;
  gamesMoved: number;
  tournamentRowsMoved: number;
  tournamentRowsCollapsed: number;
  aliasesMoved: number;
};

export async function mergeCanonicalPlayers(
  sourcePlayerId: number,
  targetPlayerId: number,
): Promise<MergeCanonicalPlayersResult> {
  if (sourcePlayerId === targetPlayerId) {
    throw new Error("same_player");
  }

  const db = getDb();
  const playerRows = await db
    .select()
    .from(players)
    .where(inArray(players.id, [sourcePlayerId, targetPlayerId]));
  const source = playerRows.find((row) => row.id === sourcePlayerId);
  const target = playerRows.find((row) => row.id === targetPlayerId);

  if (!source || !target) throw new Error("player_missing");
  if (source.dsuId && target.dsuId) throw new Error("dsu_conflict");
  if (source.fideId && target.fideId) throw new Error("fide_conflict");

  const [sourceParticipants, targetParticipants, sourceAliasRows, sourceGameCountRows] =
    await Promise.all([
      db.select().from(tournamentParticipants).where(eq(tournamentParticipants.playerId, source.id)),
      db.select().from(tournamentParticipants).where(eq(tournamentParticipants.playerId, target.id)),
      db.select().from(playerAliases).where(eq(playerAliases.playerId, source.id)),
      db.execute(sql`
        select count(distinct id)::integer as game_count
        from games
        where white_player_id = ${source.id} or black_player_id = ${source.id}
      `),
    ]);

  const targetParticipantsByTournament = new Map(
    targetParticipants.map((row) => [row.tournamentId, row]),
  );
  const operations = [];
  let tournamentRowsMoved = 0;
  let tournamentRowsCollapsed = 0;

  const clearSourceIdentifiers: { dsuId?: null; fideId?: null } = {};
  if (source.dsuId && !target.dsuId) clearSourceIdentifiers.dsuId = null;
  if (source.fideId && !target.fideId) clearSourceIdentifiers.fideId = null;
  if (Object.keys(clearSourceIdentifiers).length > 0) {
    operations.push(
      db.update(players).set(clearSourceIdentifiers).where(eq(players.id, source.id)),
    );
  }

  for (const sourceParticipant of sourceParticipants) {
    const targetParticipant = targetParticipantsByTournament.get(
      sourceParticipant.tournamentId,
    );

    if (targetParticipant) {
      operations.push(
        db.update(tournamentParticipants)
          .set({
            rating: mergedParticipantValue(targetParticipant.rating, sourceParticipant.rating),
            federation: mergedParticipantValue(
              targetParticipant.federation,
              sourceParticipant.federation,
            ),
            groupName: mergedParticipantValue(
              targetParticipant.groupName,
              sourceParticipant.groupName,
            ),
            club: mergedParticipantValue(targetParticipant.club, sourceParticipant.club),
            tournamentDsuRating: mergedParticipantValue(
              targetParticipant.tournamentDsuRating,
              sourceParticipant.tournamentDsuRating,
            ),
            tournamentFideRating: mergedParticipantValue(
              targetParticipant.tournamentFideRating,
              sourceParticipant.tournamentFideRating,
            ),
            registeredAtText: mergedParticipantValue(
              targetParticipant.registeredAtText,
              sourceParticipant.registeredAtText,
            ),
            syncedAt: latestDate(targetParticipant.syncedAt, sourceParticipant.syncedAt),
          })
          .where(eq(tournamentParticipants.id, targetParticipant.id)),
      );
      operations.push(
        db.delete(tournamentParticipants)
          .where(eq(tournamentParticipants.id, sourceParticipant.id)),
      );
      tournamentRowsCollapsed += 1;
    } else {
      operations.push(
        db.update(tournamentParticipants)
          .set({ playerId: target.id })
          .where(eq(tournamentParticipants.id, sourceParticipant.id)),
      );
      tournamentRowsMoved += 1;
    }
  }

  if (sourceAliasRows.length > 0) {
    operations.push(
      db.update(playerAliases)
        .set({ playerId: target.id })
        .where(eq(playerAliases.playerId, source.id)),
    );
  }

  operations.push(
    db.update(games)
      .set({ whitePlayerId: target.id })
      .where(eq(games.whitePlayerId, source.id)),
  );
  operations.push(
    db.update(games)
      .set({ blackPlayerId: target.id })
      .where(eq(games.blackPlayerId, source.id)),
  );

  operations.push(
    db.update(players)
      .set({
        dsuId: target.dsuId ?? source.dsuId,
        fideId: target.fideId ?? source.fideId,
        currentDsuRating: providerRating(
          target.currentDsuRating,
          target.dsuRatingUpdatedAt,
          source.currentDsuRating,
          source.dsuRatingUpdatedAt,
        ),
        currentFideRating: providerRating(
          target.currentFideRating,
          target.fideRatingUpdatedAt,
          source.currentFideRating,
          source.fideRatingUpdatedAt,
        ),
        dsuProfileUrl: target.dsuProfileUrl ?? source.dsuProfileUrl,
        fideProfileUrl: target.fideProfileUrl ?? source.fideProfileUrl,
        dsuRatingUpdatedAt: latestDate(
          target.dsuRatingUpdatedAt,
          source.dsuRatingUpdatedAt,
        ),
        fideRatingUpdatedAt: latestDate(
          target.fideRatingUpdatedAt,
          source.fideRatingUpdatedAt,
        ),
        ratingsUpdatedAt: latestDate(target.ratingsUpdatedAt, source.ratingsUpdatedAt),
      })
      .where(eq(players.id, target.id)),
  );

  const sourceNameKey = normalizeImportedPlayerName(source.name);
  const targetNameKey = normalizeImportedPlayerName(target.name);
  if (sourceNameKey && sourceNameKey !== targetNameKey) {
    operations.push(
      db.insert(playerAliases)
        .values({
          playerId: target.id,
          aliasText: source.name,
          normalizedKey: sourceNameKey,
        })
        .onConflictDoNothing({ target: playerAliases.normalizedKey }),
    );
  }

  const gamesMoved = numberValue(
    (sourceGameCountRows.rows[0] as Record<string, unknown> | undefined)?.game_count,
  );
  const summary = {
    gamesMoved,
    tournamentRowsMoved,
    tournamentRowsCollapsed,
    aliasesMoved: sourceAliasRows.length,
    sourceDsuId: source.dsuId,
    sourceFideId: source.fideId,
    targetDsuIdBefore: target.dsuId,
    targetFideIdBefore: target.fideId,
  };

  operations.push(
    db.insert(playerMergeHistory).values({
      sourcePlayerId: source.id,
      targetPlayerId: target.id,
      sourceName: source.name,
      targetName: target.name,
      summaryJson: summary,
    }),
  );
  operations.push(db.delete(players).where(eq(players.id, source.id)));

  await db.batch([operations[0]!, ...operations.slice(1)]);

  return {
    sourcePlayerId: source.id,
    targetPlayerId: target.id,
    sourceName: source.name,
    targetName: target.name,
    gamesMoved,
    tournamentRowsMoved,
    tournamentRowsCollapsed,
    aliasesMoved: sourceAliasRows.length,
  };
}
