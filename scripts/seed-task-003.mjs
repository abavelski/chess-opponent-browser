import { neon } from "@neondatabase/serverless";

import {
  fixtureGames,
  fixturePlayers,
  fixtureSources,
  fixtureTournament,
  validateFixtureSet,
} from "./task-003-fixtures.mjs";

if (process.env.FIXTURE_SEED_TARGET !== "preview") {
  throw new Error(
    "Refusing to seed. Set FIXTURE_SEED_TARGET=preview explicitly for the intended Preview database.",
  );
}

if (process.env.VERCEL_ENV === "production") {
  throw new Error("Refusing to seed while VERCEL_ENV=production.");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed Task 003 fixture data.");
}

validateFixtureSet();

const sql = neon(databaseUrl);

const sourceIds = new Map();
for (const source of fixtureSources) {
  const [row] = await sql`
    insert into game_sources (source_key, label, is_fixture)
    values (${source.sourceKey}, ${source.label}, true)
    on conflict (source_key) do update
      set label = excluded.label,
          is_fixture = true
    returning id
  `;
  sourceIds.set(source.sourceKey, row.id);
}

const playerIds = new Map();
for (const player of fixturePlayers) {
  const [row] = await sql`
    insert into players (name, fide_id)
    values (${player.name}, ${player.fideId})
    on conflict (fide_id) do update
      set name = excluded.name
    returning id
  `;
  playerIds.set(player.key, row.id);
}

let tournamentId = null;
const [metadata] = await sql`
  select value
  from app_metadata
  where key = ${fixtureTournament.metadataKey}
  limit 1
`;

if (metadata && /^\d+$/.test(metadata.value)) {
  const [existingTournament] = await sql`
    select id
    from tournaments
    where id = ${Number(metadata.value)}
    limit 1
  `;
  tournamentId = existingTournament?.id ?? null;
}

if (tournamentId === null) {
  const [createdTournament] = await sql`
    insert into tournaments (name)
    values (${fixtureTournament.name})
    returning id
  `;
  tournamentId = createdTournament.id;

  await sql`
    insert into app_metadata (key, value)
    values (${fixtureTournament.metadataKey}, ${String(tournamentId)})
    on conflict (key) do update
      set value = excluded.value
  `;
}

for (const participant of fixtureTournament.participants) {
  const playerId = playerIds.get(participant.playerKey);
  if (!playerId) {
    throw new Error(`Missing seeded player id for ${participant.playerKey}.`);
  }

  await sql`
    insert into tournament_participants (tournament_id, player_id, rating, federation)
    values (${tournamentId}, ${playerId}, ${participant.rating}, ${participant.federation})
    on conflict (tournament_id, player_id) do update
      set rating = excluded.rating,
          federation = excluded.federation
  `;
}

for (const game of fixtureGames) {
  const sourceId = sourceIds.get(game.sourceKey);
  const whitePlayerId = playerIds.get(game.whitePlayerKey);
  const blackPlayerId = playerIds.get(game.blackPlayerKey);

  if (!sourceId || !whitePlayerId || !blackPlayerId) {
    throw new Error(`Fixture references unresolved ids for ${game.sourceGameKey}.`);
  }

  await sql`
    insert into games (
      white_player_id,
      black_player_id,
      white_name,
      black_name,
      white_rating,
      black_rating,
      played_on,
      result,
      event,
      site,
      round,
      eco,
      opening,
      source_id,
      source_game_key,
      original_pgn,
      structured_moves
    ) values (
      ${whitePlayerId},
      ${blackPlayerId},
      ${game.whiteName},
      ${game.blackName},
      ${game.whiteRating},
      ${game.blackRating},
      ${game.playedOn}::date,
      ${game.result},
      ${game.event},
      ${game.site},
      ${game.round},
      ${game.eco},
      ${game.opening},
      ${sourceId},
      ${game.sourceGameKey},
      ${game.originalPgn},
      ${JSON.stringify(game.structuredMoves)}::jsonb
    )
    on conflict (source_id, source_game_key) do update
      set white_player_id = excluded.white_player_id,
          black_player_id = excluded.black_player_id,
          white_name = excluded.white_name,
          black_name = excluded.black_name,
          white_rating = excluded.white_rating,
          black_rating = excluded.black_rating,
          played_on = excluded.played_on,
          result = excluded.result,
          event = excluded.event,
          site = excluded.site,
          round = excluded.round,
          eco = excluded.eco,
          opening = excluded.opening,
          original_pgn = excluded.original_pgn,
          structured_moves = excluded.structured_moves
  `;
}

console.log(
  `Task 003 fixture seed complete: tournament ${tournamentId}, ${fixturePlayers.length} players, ${fixtureGames.length} games.`,
);
console.log("Re-running this command updates the same fixture records instead of duplicating them.");
