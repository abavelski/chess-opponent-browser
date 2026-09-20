import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  playerMergeHistory,
  players,
} from "@/lib/db/schema";

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

export type DataHealthSummary = {
  tournaments: number;
  archivedTournaments: number;
  players: number;
  fullyOrphanedPlayers: number;
  gameOnlyPlayers: number;
  rosterWithoutGames: number;
  noIdPlayers: number;
  duplicateNamePlayers: number;
  unresolvedAliasPlayers: number;
  games: number;
  gamesWithUnresolvedSide: number;
  unresolvedSides: number;
  gameSources: number;
  imports: number;
  prunableImports: number;
  importErrors: number;
  failedSyncRuns: number;
  mergeHistory: number;
};

export async function getDataHealthSummary(): Promise<DataHealthSummary> {
  const result = await getDb().execute(sql`
    with player_health as (
      select
        p.id,
        (p.dsu_id is null and p.fide_id is null) as no_ids,
        exists(select 1 from tournament_participants tp where tp.player_id = p.id) as in_roster,
        exists(
          select 1 from games g
          where g.white_player_id = p.id or g.black_player_id = p.id
        ) as has_games
      from players p
    ),
    duplicate_keys as (
      select lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) as normalized_name
      from players
      group by 1
      having count(*) > 1
    ),
    unresolved_keys as (
      select lower(regexp_replace(btrim(white_name), '[[:space:]]+', ' ', 'g')) as normalized_key
      from games where white_player_id is null
      union
      select lower(regexp_replace(btrim(black_name), '[[:space:]]+', ' ', 'g'))
      from games where black_player_id is null
    ),
    unresolved_alias_players as (
      select distinct a.player_id
      from player_aliases a
      inner join unresolved_keys u on u.normalized_key = a.normalized_key
    )
    select
      (select count(*)::int from tournaments) as tournaments,
      (select count(*)::int from tournaments where archived_at is not null) as archived_tournaments,
      (select count(*)::int from players) as players,
      (select count(*)::int from player_health where not in_roster and not has_games) as fully_orphaned_players,
      (select count(*)::int from player_health where not in_roster and has_games) as game_only_players,
      (select count(*)::int from player_health where in_roster and not has_games) as roster_without_games,
      (select count(*)::int from player_health where no_ids) as no_id_players,
      (
        select count(*)::int
        from players p
        where lower(regexp_replace(btrim(p.name), '[[:space:]]+', ' ', 'g'))
          in (select normalized_name from duplicate_keys)
      ) as duplicate_name_players,
      (select count(*)::int from unresolved_alias_players) as unresolved_alias_players,
      (select count(*)::int from games) as games,
      (
        select count(*)::int from games
        where white_player_id is null or black_player_id is null
      ) as games_with_unresolved_side,
      (
        select
          count(*) filter (where white_player_id is null)
          + count(*) filter (where black_player_id is null)
        from games
      )::int as unresolved_sides,
      (select count(*)::int from game_sources) as game_sources,
      (select count(*)::int from imports) as imports,
      (
        select count(*)::int from imports
        where status = 'completed'
          and imported_count = 0
          and duplicate_count > 0
          and parse_error_count = 0
          and persistence_error_count = 0
          and unresolved_side_count = 0
      ) as prunable_imports,
      (select count(*)::int from import_errors) as import_errors,
      (
        select count(*)::int from sync_runs
        where status in ('failed', 'completed_with_errors')
      ) as failed_sync_runs,
      (select count(*)::int from player_merge_history) as merge_history
  `);

  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    tournaments: numberValue(row.tournaments),
    archivedTournaments: numberValue(row.archived_tournaments),
    players: numberValue(row.players),
    fullyOrphanedPlayers: numberValue(row.fully_orphaned_players),
    gameOnlyPlayers: numberValue(row.game_only_players),
    rosterWithoutGames: numberValue(row.roster_without_games),
    noIdPlayers: numberValue(row.no_id_players),
    duplicateNamePlayers: numberValue(row.duplicate_name_players),
    unresolvedAliasPlayers: numberValue(row.unresolved_alias_players),
    games: numberValue(row.games),
    gamesWithUnresolvedSide: numberValue(row.games_with_unresolved_side),
    unresolvedSides: numberValue(row.unresolved_sides),
    gameSources: numberValue(row.game_sources),
    imports: numberValue(row.imports),
    prunableImports: numberValue(row.prunable_imports),
    importErrors: numberValue(row.import_errors),
    failedSyncRuns: numberValue(row.failed_sync_runs),
    mergeHistory: numberValue(row.merge_history),
  };
}

export async function listRecentPlayerMerges(limit = 20) {
  return getDb()
    .select({
      id: playerMergeHistory.id,
      sourcePlayerId: playerMergeHistory.sourcePlayerId,
      targetPlayerId: playerMergeHistory.targetPlayerId,
      sourceName: playerMergeHistory.sourceName,
      targetName: playerMergeHistory.targetName,
      summaryJson: playerMergeHistory.summaryJson,
      createdAt: playerMergeHistory.createdAt,
      targetCurrentName: players.name,
    })
    .from(playerMergeHistory)
    .leftJoin(players, eq(playerMergeHistory.targetPlayerId, players.id))
    .orderBy(desc(playerMergeHistory.createdAt), desc(playerMergeHistory.id))
    .limit(limit);
}
