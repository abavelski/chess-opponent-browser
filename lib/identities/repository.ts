import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { playerAliases, players } from "@/lib/db/schema";

export type UnresolvedIdentityGroup = {
  normalizedName: string;
  rawName: string;
  sourceFideId: string | null;
  sideCount: number;
  gameCount: number;
  ratingHint: number | null;
  federationHint: string | null;
  sourceLabel: string | null;
  importId: number | null;
  filename: string | null;
  recentDate: string | null;
  opponentName: string | null;
  event: string | null;
};

export type UnresolvedIdentitySide = {
  gameId: number;
  side: "white" | "black";
  rawName: string;
  sourceFideId: string | null;
  rating: number | null;
  federation: string | null;
  opponentName: string;
  event: string | null;
  playedOn: string | null;
  result: string;
  sourceLabel: string;
  importId: number | null;
  filename: string | null;
};

export type CanonicalPlayerOption = {
  id: number;
  name: string;
  fideId: string | null;
};

function stringOrNull(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function numberOrNull(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

const normalizedWhite = sql`lower(regexp_replace(btrim(g."white_name"), '[[:space:]]+', ' ', 'g'))`;
const normalizedBlack = sql`lower(regexp_replace(btrim(g."black_name"), '[[:space:]]+', ' ', 'g'))`;

export async function listUnresolvedIdentityGroups(search: string) {
  const needle = `%${search.trim()}%`;
  const result = await getDb().execute(sql`
    with sides as (
      select
        g."id" as game_id,
        g."white_name" as raw_name,
        ${normalizedWhite} as normalized_name,
        nullif(btrim(g."white_fide_id"), '') as source_fide_id,
        g."white_rating" as rating,
        g."black_name" as opponent_name,
        g."event",
        g."played_on",
        gs."label" as source_label,
        latest."import_id",
        latest."filename",
        latest."federation"
      from "games" g
      inner join "game_sources" gs on gs."id" = g."source_id"
      left join lateral (
        select
          igi."import_id",
          i."filename",
          coalesce(
            nullif(igi."raw_tags"->>'WhiteFederation', ''),
            nullif(igi."raw_tags"->>'WhiteCountry', ''),
            nullif(igi."raw_tags"->>'WhiteFed', '')
          ) as federation
        from "import_game_items" igi
        inner join "imports" i on i."id" = igi."import_id"
        where igi."game_id" = g."id"
        order by igi."created_at" desc, igi."id" desc
        limit 1
      ) latest on true
      where g."white_player_id" is null

      union all

      select
        g."id" as game_id,
        g."black_name" as raw_name,
        ${normalizedBlack} as normalized_name,
        nullif(btrim(g."black_fide_id"), '') as source_fide_id,
        g."black_rating" as rating,
        g."white_name" as opponent_name,
        g."event",
        g."played_on",
        gs."label" as source_label,
        latest."import_id",
        latest."filename",
        latest."federation"
      from "games" g
      inner join "game_sources" gs on gs."id" = g."source_id"
      left join lateral (
        select
          igi."import_id",
          i."filename",
          coalesce(
            nullif(igi."raw_tags"->>'BlackFederation', ''),
            nullif(igi."raw_tags"->>'BlackCountry', ''),
            nullif(igi."raw_tags"->>'BlackFed', '')
          ) as federation
        from "import_game_items" igi
        inner join "imports" i on i."id" = igi."import_id"
        where igi."game_id" = g."id"
        order by igi."created_at" desc, igi."id" desc
        limit 1
      ) latest on true
      where g."black_player_id" is null
    )
    select
      normalized_name,
      source_fide_id,
      (array_agg(raw_name order by played_on desc nulls last, game_id desc))[1] as raw_name,
      count(*)::integer as side_count,
      count(distinct game_id)::integer as game_count,
      max(rating)::integer as rating_hint,
      max(federation) as federation_hint,
      (array_agg(source_label order by played_on desc nulls last, game_id desc))[1] as source_label,
      (array_agg(import_id order by played_on desc nulls last, game_id desc))[1] as import_id,
      (array_agg(filename order by played_on desc nulls last, game_id desc))[1] as filename,
      max(played_on) as recent_date,
      (array_agg(opponent_name order by played_on desc nulls last, game_id desc))[1] as opponent_name,
      (array_agg(event order by played_on desc nulls last, game_id desc))[1] as event
    from sides
    where ${search.trim() === ""} or normalized_name ilike ${needle} or raw_name ilike ${needle}
    group by normalized_name, source_fide_id
    order by max(played_on) desc nulls last, normalized_name asc
    limit 200
  `);

  return result.rows.map((row) => {
    const value = row as Record<string, unknown>;
    return {
      normalizedName: String(value.normalized_name),
      rawName: String(value.raw_name),
      sourceFideId: stringOrNull(value.source_fide_id),
      sideCount: Number(value.side_count),
      gameCount: Number(value.game_count),
      ratingHint: numberOrNull(value.rating_hint),
      federationHint: stringOrNull(value.federation_hint),
      sourceLabel: stringOrNull(value.source_label),
      importId: numberOrNull(value.import_id),
      filename: stringOrNull(value.filename),
      recentDate: stringOrNull(value.recent_date),
      opponentName: stringOrNull(value.opponent_name),
      event: stringOrNull(value.event),
    } satisfies UnresolvedIdentityGroup;
  });
}

export async function getUnresolvedIdentitySides(
  normalizedName: string,
  sourceFideId: string | null,
) {
  const result = await getDb().execute(sql`
    with sides as (
      select
        g."id" as game_id,
        'white'::text as side,
        g."white_name" as raw_name,
        ${normalizedWhite} as normalized_name,
        nullif(btrim(g."white_fide_id"), '') as source_fide_id,
        g."white_rating" as rating,
        g."black_name" as opponent_name,
        g."event", g."played_on", g."result",
        gs."label" as source_label,
        latest."import_id", latest."filename", latest."federation"
      from "games" g
      inner join "game_sources" gs on gs."id" = g."source_id"
      left join lateral (
        select igi."import_id", i."filename",
          coalesce(nullif(igi."raw_tags"->>'WhiteFederation', ''), nullif(igi."raw_tags"->>'WhiteCountry', ''), nullif(igi."raw_tags"->>'WhiteFed', '')) as federation
        from "import_game_items" igi
        inner join "imports" i on i."id" = igi."import_id"
        where igi."game_id" = g."id"
        order by igi."created_at" desc, igi."id" desc
        limit 1
      ) latest on true
      where g."white_player_id" is null

      union all

      select
        g."id" as game_id,
        'black'::text as side,
        g."black_name" as raw_name,
        ${normalizedBlack} as normalized_name,
        nullif(btrim(g."black_fide_id"), '') as source_fide_id,
        g."black_rating" as rating,
        g."white_name" as opponent_name,
        g."event", g."played_on", g."result",
        gs."label" as source_label,
        latest."import_id", latest."filename", latest."federation"
      from "games" g
      inner join "game_sources" gs on gs."id" = g."source_id"
      left join lateral (
        select igi."import_id", i."filename",
          coalesce(nullif(igi."raw_tags"->>'BlackFederation', ''), nullif(igi."raw_tags"->>'BlackCountry', ''), nullif(igi."raw_tags"->>'BlackFed', '')) as federation
        from "import_game_items" igi
        inner join "imports" i on i."id" = igi."import_id"
        where igi."game_id" = g."id"
        order by igi."created_at" desc, igi."id" desc
        limit 1
      ) latest on true
      where g."black_player_id" is null
    )
    select * from sides
    where normalized_name = ${normalizedName}
      and ((${sourceFideId}::text is null and source_fide_id is null) or source_fide_id = ${sourceFideId})
    order by played_on desc nulls last, game_id desc
    limit 100
  `);

  return result.rows.map((row) => {
    const value = row as Record<string, unknown>;
    return {
      gameId: Number(value.game_id),
      side: value.side === "black" ? "black" : "white",
      rawName: String(value.raw_name),
      sourceFideId: stringOrNull(value.source_fide_id),
      rating: numberOrNull(value.rating),
      federation: stringOrNull(value.federation),
      opponentName: String(value.opponent_name),
      event: stringOrNull(value.event),
      playedOn: stringOrNull(value.played_on),
      result: String(value.result),
      sourceLabel: String(value.source_label),
      importId: numberOrNull(value.import_id),
      filename: stringOrNull(value.filename),
    } satisfies UnresolvedIdentitySide;
  });
}

export async function listCanonicalPlayerOptions() {
  return getDb()
    .select({ id: players.id, name: players.name, fideId: players.fideId })
    .from(players)
    .orderBy(asc(players.name), asc(players.id));
}

export async function aliasOwners(normalizedKey: string) {
  return getDb()
    .select({ playerId: playerAliases.playerId })
    .from(playerAliases)
    .where(eq(playerAliases.normalizedKey, normalizedKey));
}

export async function resolveIdentityToExisting(input: {
  normalizedName: string;
  sourceFideId: string | null;
  targetPlayerId: number;
  rememberAlias: boolean;
}) {
  const db = getDb();
  const result = await db.execute(sql`
    with target as (
      select "id", "name", nullif(btrim("fide_id"), '') as fide_id
      from "players" where "id" = ${input.targetPlayerId}
    ),
    eligible as (
      select g."id" as game_id, 'white'::text as side, g."white_name" as raw_name,
        nullif(btrim(g."white_fide_id"), '') as source_fide_id
      from "games" g
      where g."white_player_id" is null
        and lower(regexp_replace(btrim(g."white_name"), '[[:space:]]+', ' ', 'g')) = ${input.normalizedName}
        and ((${input.sourceFideId}::text is null and nullif(btrim(g."white_fide_id"), '') is null) or nullif(btrim(g."white_fide_id"), '') = ${input.sourceFideId})
      union all
      select g."id", 'black'::text, g."black_name", nullif(btrim(g."black_fide_id"), '')
      from "games" g
      where g."black_player_id" is null
        and lower(regexp_replace(btrim(g."black_name"), '[[:space:]]+', ' ', 'g')) = ${input.normalizedName}
        and ((${input.sourceFideId}::text is null and nullif(btrim(g."black_fide_id"), '') is null) or nullif(btrim(g."black_fide_id"), '') = ${input.sourceFideId})
    ),
    guard as (
      select
        count(*)::integer as total,
        count(*) filter (where e.source_fide_id is not null and t.fide_id is not null and e.source_fide_id <> t.fide_id)::integer as fide_conflicts,
        (select count(*)::integer from "player_aliases" a where a."normalized_key" = ${input.normalizedName} and a."player_id" <> t."id") as alias_conflicts
      from eligible e cross join target t
      group by t.id
    ),
    inserted_alias as (
      insert into "player_aliases" ("player_id", "alias_text", "normalized_key")
      select t."id", (select min(raw_name) from eligible), ${input.normalizedName}
      from target t cross join guard gd
      where ${input.rememberAlias} and gd.total > 0 and gd.fide_conflicts = 0 and gd.alias_conflicts = 0
      on conflict ("normalized_key") do nothing
      returning "id"
    ),
    updated_white as (
      update "games" g set "white_player_id" = t."id"
      from target t cross join guard gd
      where g."white_player_id" is null and gd.total > 0 and gd.fide_conflicts = 0
        and (not ${input.rememberAlias} or gd.alias_conflicts = 0)
        and lower(regexp_replace(btrim(g."white_name"), '[[:space:]]+', ' ', 'g')) = ${input.normalizedName}
        and ((${input.sourceFideId}::text is null and nullif(btrim(g."white_fide_id"), '') is null) or nullif(btrim(g."white_fide_id"), '') = ${input.sourceFideId})
      returning g."id"
    ),
    updated_black as (
      update "games" g set "black_player_id" = t."id"
      from target t cross join guard gd
      where g."black_player_id" is null and gd.total > 0 and gd.fide_conflicts = 0
        and (not ${input.rememberAlias} or gd.alias_conflicts = 0)
        and lower(regexp_replace(btrim(g."black_name"), '[[:space:]]+', ' ', 'g')) = ${input.normalizedName}
        and ((${input.sourceFideId}::text is null and nullif(btrim(g."black_fide_id"), '') is null) or nullif(btrim(g."black_fide_id"), '') = ${input.sourceFideId})
      returning g."id"
    )
    select t."id" as player_id, t."name", t."fide_id", gd.total, gd.fide_conflicts, gd.alias_conflicts,
      ((select count(*) from updated_white) + (select count(*) from updated_black))::integer as updated_count
    from target t cross join guard gd
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return { status: "target_missing" as const, updatedCount: 0, playerId: null };
  if (Number(row.total) === 0) return { status: "stale" as const, updatedCount: 0, playerId: Number(row.player_id) };
  if (Number(row.fide_conflicts) > 0) return { status: "fide_conflict" as const, updatedCount: 0, playerId: Number(row.player_id) };
  if (input.rememberAlias && Number(row.alias_conflicts) > 0) return { status: "alias_conflict" as const, updatedCount: 0, playerId: Number(row.player_id) };
  return { status: "resolved" as const, updatedCount: Number(row.updated_count), playerId: Number(row.player_id) };
}

export async function createPlayerAndResolveIdentity(input: {
  normalizedName: string;
  sourceFideId: string | null;
  canonicalName: string;
  canonicalFideId: string | null;
  rememberAlias: boolean;
}) {
  const result = await getDb().execute(sql`
    with eligible as (
      select g."id" as game_id, 'white'::text as side, g."white_name" as raw_name,
        nullif(btrim(g."white_fide_id"), '') as source_fide_id
      from "games" g
      where g."white_player_id" is null
        and lower(regexp_replace(btrim(g."white_name"), '[[:space:]]+', ' ', 'g')) = ${input.normalizedName}
        and ((${input.sourceFideId}::text is null and nullif(btrim(g."white_fide_id"), '') is null) or nullif(btrim(g."white_fide_id"), '') = ${input.sourceFideId})
      union all
      select g."id", 'black'::text, g."black_name", nullif(btrim(g."black_fide_id"), '')
      from "games" g
      where g."black_player_id" is null
        and lower(regexp_replace(btrim(g."black_name"), '[[:space:]]+', ' ', 'g')) = ${input.normalizedName}
        and ((${input.sourceFideId}::text is null and nullif(btrim(g."black_fide_id"), '') is null) or nullif(btrim(g."black_fide_id"), '') = ${input.sourceFideId})
    ),
    guard as (
      select
        count(*)::integer as total,
        count(*) filter (where source_fide_id is not null and ${input.canonicalFideId}::text is not null and source_fide_id <> ${input.canonicalFideId})::integer as fide_conflicts,
        (select count(*)::integer from "player_aliases" a where a."normalized_key" = ${input.normalizedName}) as alias_conflicts,
        (select count(*)::integer from "players" p where ${input.canonicalFideId}::text is not null and p."fide_id" = ${input.canonicalFideId}) as canonical_fide_conflicts
      from eligible
    ),
    created_player as (
      insert into "players" ("name", "fide_id")
      select ${input.canonicalName}, ${input.canonicalFideId}
      from guard gd
      where gd.total > 0 and gd.fide_conflicts = 0 and gd.canonical_fide_conflicts = 0
        and (not ${input.rememberAlias} or gd.alias_conflicts = 0)
      returning "id", "name", "fide_id"
    ),
    inserted_alias as (
      insert into "player_aliases" ("player_id", "alias_text", "normalized_key")
      select cp."id", (select min(raw_name) from eligible), ${input.normalizedName}
      from created_player cp
      where ${input.rememberAlias}
      returning "id"
    ),
    updated_white as (
      update "games" g set "white_player_id" = cp."id"
      from created_player cp
      where g."white_player_id" is null
        and lower(regexp_replace(btrim(g."white_name"), '[[:space:]]+', ' ', 'g')) = ${input.normalizedName}
        and ((${input.sourceFideId}::text is null and nullif(btrim(g."white_fide_id"), '') is null) or nullif(btrim(g."white_fide_id"), '') = ${input.sourceFideId})
      returning g."id"
    ),
    updated_black as (
      update "games" g set "black_player_id" = cp."id"
      from created_player cp
      where g."black_player_id" is null
        and lower(regexp_replace(btrim(g."black_name"), '[[:space:]]+', ' ', 'g')) = ${input.normalizedName}
        and ((${input.sourceFideId}::text is null and nullif(btrim(g."black_fide_id"), '') is null) or nullif(btrim(g."black_fide_id"), '') = ${input.sourceFideId})
      returning g."id"
    )
    select gd.total, gd.fide_conflicts, gd.alias_conflicts, gd.canonical_fide_conflicts,
      cp."id" as player_id,
      ((select count(*) from updated_white) + (select count(*) from updated_black))::integer as updated_count
    from guard gd left join created_player cp on true
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || Number(row.total) === 0) return { status: "stale" as const, updatedCount: 0, playerId: null };
  if (Number(row.fide_conflicts) > 0) return { status: "fide_conflict" as const, updatedCount: 0, playerId: null };
  if (Number(row.canonical_fide_conflicts) > 0) return { status: "canonical_fide_conflict" as const, updatedCount: 0, playerId: null };
  if (input.rememberAlias && Number(row.alias_conflicts) > 0) return { status: "alias_conflict" as const, updatedCount: 0, playerId: null };
  if (row.player_id === null || row.player_id === undefined) return { status: "failed" as const, updatedCount: 0, playerId: null };
  return { status: "resolved" as const, updatedCount: Number(row.updated_count), playerId: Number(row.player_id) };
}
