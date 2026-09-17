import "server-only";

import { createHash } from "node:crypto";

import { asc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  gameSources,
  importErrors,
  imports as importRecords,
  playerAliases,
  players,
  tournamentParticipants,
  tournaments,
} from "@/lib/db/schema";

import type {
  ImportPersistenceRepository,
  PersistedImportError,
  SaveImportedGameResult,
  SaveImportedGameUnit,
} from "./persist";

function sourceKeyForLabel(label: string) {
  const normalized = label.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `import-${digest}`;
}

function storableFideId(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed && trimmed.length <= 32 ? trimmed : null;
}

async function saveGameUnit(input: SaveImportedGameUnit): Promise<SaveImportedGameResult> {
  const db = getDb();
  const movesJson = JSON.stringify(input.game.structuredMoves);
  const tagsJson = JSON.stringify(input.game.tags);

  const result = await db.execute(sql`
    with upserted_game as (
      insert into "games" (
        "white_player_id", "black_player_id", "white_name", "black_name",
        "white_rating", "black_rating", "white_fide_id", "black_fide_id",
        "played_on", "result", "event", "site", "round", "eco", "opening",
        "source_id", "source_game_key", "duplicate_fingerprint", "original_pgn", "structured_moves"
      ) values (
        ${input.whitePlayerId}, ${input.blackPlayerId}, ${input.game.white}, ${input.game.black},
        ${input.game.whiteRating}, ${input.game.blackRating},
        ${storableFideId(input.game.whiteFideId)}, ${storableFideId(input.game.blackFideId)},
        ${input.game.playedOn}, ${input.game.result}, ${input.game.event}, ${input.game.site},
        ${input.game.round}, ${input.game.eco}, ${input.game.opening}, ${input.sourceId}, null,
        ${input.fingerprint}, ${input.game.originalPgn}, ${movesJson}::jsonb
      )
      on conflict ("duplicate_fingerprint") do update set
        "white_player_id" = coalesce("games"."white_player_id", excluded."white_player_id"),
        "black_player_id" = coalesce("games"."black_player_id", excluded."black_player_id"),
        "white_fide_id" = coalesce("games"."white_fide_id", excluded."white_fide_id"),
        "black_fide_id" = coalesce("games"."black_fide_id", excluded."black_fide_id")
      returning "id", "white_player_id", "black_player_id", (xmax = 0) as "inserted"
    ),
    inserted_item as (
      insert into "import_game_items" (
        "import_id", "game_id", "source_index", "original_pgn", "raw_tags", "outcome"
      )
      select ${input.importId}, "id", ${input.game.index}, ${input.game.originalPgn},
        ${tagsJson}::jsonb, case when "inserted" then 'imported' else 'duplicate' end
      from upserted_game
      returning "game_id", "outcome"
    )
    select u."id" as "game_id", i."outcome", u."white_player_id", u."black_player_id"
    from upserted_game u
    inner join inserted_item i on i."game_id" = u."id"
  `);

  const row = result.rows[0] as
    | {
        game_id: number | string;
        outcome: "imported" | "duplicate";
        white_player_id: number | string | null;
        black_player_id: number | string | null;
      }
    | undefined;
  if (!row) throw new Error("Imported game could not be persisted.");

  return {
    gameId: Number(row.game_id),
    outcome: row.outcome,
    whitePlayerId: row.white_player_id === null ? null : Number(row.white_player_id),
    blackPlayerId: row.black_player_id === null ? null : Number(row.black_player_id),
  };
}

async function recordImportErrors(importId: number, errors: PersistedImportError[]) {
  if (errors.length === 0) return;

  await getDb().insert(importErrors).values(
    errors.map((error) => ({
      importId,
      sourceIndex: error.sourceIndex,
      phase: error.phase,
      message: error.message,
    })),
  );
}

export function createImportPersistenceRepository(): ImportPersistenceRepository {
  return {
    async ensureSource(sourceLabel) {
      const db = getDb();
      const [source] = await db
        .insert(gameSources)
        .values({
          sourceKey: sourceKeyForLabel(sourceLabel),
          label: sourceLabel,
          isFixture: false,
        })
        .onConflictDoUpdate({
          target: gameSources.sourceKey,
          set: { label: sourceLabel, isFixture: false },
        })
        .returning({ id: gameSources.id, label: gameSources.label });

      if (!source) throw new Error("Import source could not be created.");
      return source;
    },

    async listCanonicalPlayers() {
      return getDb()
        .select({ id: players.id, name: players.name, fideId: players.fideId })
        .from(players);
    },

    async listPlayerAliases() {
      return getDb()
        .select({ playerId: playerAliases.playerId, normalizedKey: playerAliases.normalizedKey })
        .from(playerAliases);
    },

    async createImport(input) {
      const [created] = await getDb()
        .insert(importRecords)
        .values({
          sourceId: input.sourceId,
          filename: input.filename,
          parsedCount: input.parsedCount,
          parseErrorCount: input.parseErrorCount,
          status: "processing",
        })
        .returning({ id: importRecords.id });

      if (!created) throw new Error("Import could not be created.");
      return created.id;
    },

    saveGameUnit,
    recordImportErrors,

    async finalizeImport(input) {
      await getDb()
        .update(importRecords)
        .set({
          importedCount: input.importedCount,
          duplicateCount: input.duplicateCount,
          persistenceErrorCount: input.persistenceErrorCount,
          unresolvedSideCount: input.unresolvedSideCount,
          status: input.status,
        })
        .where(eq(importRecords.id, input.importId));
    },

    async markImportFailed(importId) {
      await getDb()
        .update(importRecords)
        .set({ status: "failed" })
        .where(eq(importRecords.id, importId));
    },

    async listAffectedPlayerLinks(playerIds) {
      if (playerIds.length === 0) return [];

      return getDb()
        .select({
          playerId: players.id,
          playerName: players.name,
          tournamentId: tournaments.id,
          tournamentName: tournaments.name,
        })
        .from(tournamentParticipants)
        .innerJoin(players, eq(tournamentParticipants.playerId, players.id))
        .innerJoin(tournaments, eq(tournamentParticipants.tournamentId, tournaments.id))
        .where(inArray(players.id, playerIds))
        .orderBy(asc(players.name), asc(tournaments.name));
    },
  };
}
