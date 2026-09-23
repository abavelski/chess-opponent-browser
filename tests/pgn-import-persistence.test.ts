import { describe, expect, it } from "vitest";

import { parsePgnPreview } from "@/lib/imports/pgn";
import {
  buildIdentityIndex,
  normalizeImportedPlayerName,
  persistParsedImport,
  resolveImportedSide,
  type CanonicalPlayerIdentity,
  type ImportPersistenceRepository,
  type PersistedImportError,
  type SaveImportedGameUnit,
} from "@/lib/imports/persist";

const annotatedPgn = `[Event "Persistence Cup"]
[Site "Copenhagen DEN"]
[Date "2026.09.17"]
[Round "1"]
[White "Imported Jan Name"]
[Black "Anna Nowak"]
[WhiteElo "2140"]
[BlackElo "2210"]
[WhiteFideId "99000001"]
[BlackFideId "99000002"]
[Result "1-0"]
[CustomArchiveKey "persist-123"]

1. e4 {Stored comment} e5 2. Nf3 (2. Bc4 {Stored variation} Nc6) Nc6 1-0`;

const unknownPgn = `[Event "Unknown Side"]
[Date "2026.09.16"]
[White "Completely Unknown"]
[Black "Unique Name"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 1/2-1/2`;

function fakeRepository(
  players: CanonicalPlayerIdentity[],
  options: {
    failIndexes?: number[];
    duplicateIndexes?: number[];
    savedPlayerOverrides?: Record<
      number,
      { whitePlayerId?: number | null; blackPlayerId?: number | null }
    >;
  } = {},
) {
  const saved: SaveImportedGameUnit[] = [];
  const recordedErrors: PersistedImportError[] = [];
  const finalized: Array<{
    importId: number;
    importedCount: number;
    duplicateCount: number;
    persistenceErrorCount: number;
    unresolvedSideCount: number;
    status: "completed" | "completed_with_errors";
  }> = [];
  const participants = new Set<string>();
  let failed = false;
  let nextPlayerId = Math.max(0, ...players.map((player) => player.id)) + 1;

  const repository: ImportPersistenceRepository = {
    async ensureSource(sourceLabel) {
      return { id: 7, label: sourceLabel };
    },
    async listCanonicalPlayers() {
      return players;
    },
    async createCanonicalPlayer(input) {
      const player = { id: nextPlayerId++, name: input.name, fideId: input.fideId };
      players.push(player);
      return player;
    },
    async rememberPlayerAlias() {},
    async ensureTournamentParticipant(tournamentId, playerId) {
      const key = `${tournamentId}:${playerId}`;
      const added = !participants.has(key);
      participants.add(key);
      return { added };
    },
    async countGamesForPlayer(playerId) {
      return saved.filter(
        (unit) => unit.whitePlayerId === playerId || unit.blackPlayerId === playerId,
      ).length;
    },
    async createImport() {
      return 42;
    },
    async saveGameUnit(input) {
      if (options.failIndexes?.includes(input.game.index)) throw new Error("simulated save failure");
      saved.push(input);
      const override = options.savedPlayerOverrides?.[input.game.index];
      return {
        gameId: 100 + input.game.index,
        outcome: options.duplicateIndexes?.includes(input.game.index) ? "duplicate" : "imported",
        whitePlayerId: override?.whitePlayerId ?? input.whitePlayerId,
        blackPlayerId: override?.blackPlayerId ?? input.blackPlayerId,
      };
    },
    async recordImportErrors(_importId, errors) {
      recordedErrors.push(...errors);
    },
    async finalizeImport(input) {
      finalized.push(input);
    },
    async markImportFailed() {
      failed = true;
    },
    async listAffectedPlayerLinks(playerIds) {
      return playerIds.map((playerId) => ({
        playerId,
        playerName: players.find((player) => player.id === playerId)?.name ?? "Unknown",
        tournamentId: 3,
        tournamentName: "Fixture Open",
      }));
    },
  };

  return {
    repository,
    saved,
    recordedErrors,
    finalized,
    participants,
    get failed() {
      return failed;
    },
  };
}

describe("PGN import persistence", () => {
  it("normalizes canonical names conservatively", () => {
    expect(normalizeImportedPlayerName("  JAN   Kowalski  ")).toBe("jan kowalski");
  });

  it("prefers an exact FIDE ID match over a different imported name", () => {
    const players = [
      { id: 1, name: "Jan Kowalski", fideId: "99000001" },
      { id: 2, name: "Imported Jan Name", fideId: null },
    ];
    const resolution = resolveImportedSide(
      { name: "Imported Jan Name", fideId: "99000001" },
      buildIdentityIndex(players),
    );
    expect(resolution).toEqual({ playerId: 1, method: "fide" });
  });

  it("links by name only when exactly one normalized canonical name matches", () => {
    const unique = buildIdentityIndex([
      { id: 8, name: "  Unique   Name ", fideId: null },
    ]);
    expect(resolveImportedSide({ name: "unique name", fideId: null }, unique)).toEqual({
      playerId: 8,
      method: "name",
    });

    const ambiguous = buildIdentityIndex([
      { id: 8, name: "Unique Name", fideId: null },
      { id: 9, name: " unique   name ", fideId: null },
    ]);
    expect(resolveImportedSide({ name: "Unique Name", fideId: null }, ambiguous)).toEqual({
      playerId: null,
      method: null,
    });
  });

  it("persists unresolved sides instead of creating or guessing players", async () => {
    const preview = parsePgnPreview(unknownPgn);
    const { repository, saved } = fakeRepository([
      { id: 8, name: "Unique Name", fideId: null },
    ]);

    const result = await persistParsedImport(
      { filename: "unknown.pgn", sourceLabel: "Manual", preview },
      repository,
    );

    expect(result).toMatchObject({ importedCount: 1, duplicateCount: 0, unresolvedSideCount: 1 });
    expect(saved).toHaveLength(1);
    expect(saved[0].whitePlayerId).toBeNull();
    expect(saved[0].blackPlayerId).toBe(8);
    expect(saved[0].game.white).toBe("Completely Unknown");
    expect(saved[0].fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(saved[0].moveFingerprint).toBeNull();
  });

  it("creates a focal Player, adds it to the roster, and links the matching side", async () => {
    const preview = parsePgnPreview(unknownPgn);
    const { repository, saved, participants } = fakeRepository([
      { id: 8, name: "Unique Name", fideId: null },
    ]);

    const result = await persistParsedImport(
      {
        filename: "pack.pgn",
        sourceLabel: "Danbase",
        preview,
        focalOpponent: {
          sourceName: "Completely Unknown",
          sourceFideId: null,
          canonicalName: "Prepared Opponent",
          tournamentId: 12,
        },
      },
      repository,
    );

    expect(saved[0].whitePlayerId).toBe(9);
    expect(participants.has("12:9")).toBe(true);
    expect(result.focalOpponent).toMatchObject({
      playerId: 9,
      playerName: "Prepared Opponent",
      playerCreated: true,
      tournamentId: 12,
      rosterAdded: true,
      conflictCount: 0,
    });
  });

  it("reports a duplicate focal-side conflict without overwriting the existing Player link", async () => {
    const preview = parsePgnPreview(unknownPgn);
    const { repository } = fakeRepository(
      [
        { id: 5, name: "Completely Unknown", fideId: null },
        { id: 8, name: "Unique Name", fideId: null },
      ],
      {
        duplicateIndexes: [1],
        savedPlayerOverrides: { 1: { whitePlayerId: 99 } },
      },
    );

    const result = await persistParsedImport(
      {
        filename: "duplicate-pack.pgn",
        sourceLabel: "Danbase",
        preview,
        focalOpponent: {
          sourceName: "Completely Unknown",
          sourceFideId: null,
          canonicalName: "Completely Unknown",
          tournamentId: 12,
        },
      },
      repository,
    );

    expect(result.duplicateCount).toBe(1);
    expect(result.focalOpponent?.conflictCount).toBe(1);
    expect(result.focalOpponent?.conflicts[0]).toMatchObject({
      index: 1,
      side: "White",
    });
  });

  it("preserves original PGN, extra tags, comments, variations, and raw FIDE IDs", async () => {
    const preview = parsePgnPreview(annotatedPgn);
    const { repository, saved } = fakeRepository([
      { id: 1, name: "Jan Kowalski", fideId: "99000001" },
      { id: 2, name: "Anna Nowak", fideId: "99000002" },
    ]);

    const result = await persistParsedImport(
      { filename: "annotated.pgn", sourceLabel: "Archive", preview },
      repository,
    );

    expect(result).toMatchObject({ importedCount: 1, duplicateCount: 0, unresolvedSideCount: 0 });
    expect(saved[0]).toMatchObject({ whitePlayerId: 1, blackPlayerId: 2 });
    expect(saved[0].game.whiteFideId).toBe("99000001");
    expect(saved[0].game.tags.CustomArchiveKey).toBe("persist-123");
    expect(saved[0].game.originalPgn).toContain('[CustomArchiveKey "persist-123"]');
    expect(saved[0].game.structuredMoves.mainline[0].comment).toBe("Stored comment");
    expect(saved[0].game.structuredMoves.mainline[2].variations?.[0].moves[0]).toMatchObject({
      san: "Bc4",
      comment: "Stored variation",
    });
  });

  it("accounts for already-known games separately from newly imported games", async () => {
    const preview = parsePgnPreview(`${annotatedPgn}\n\n${unknownPgn}`);
    const { repository, finalized } = fakeRepository(
      [
        { id: 1, name: "Jan Kowalski", fideId: "99000001" },
        { id: 2, name: "Anna Nowak", fideId: "99000002" },
        { id: 8, name: "Unique Name", fideId: null },
      ],
      { duplicateIndexes: [1] },
    );

    const result = await persistParsedImport(
      { filename: "mixed.pgn", sourceLabel: "Manual", preview },
      repository,
    );

    expect(result).toMatchObject({
      parsedCount: 2,
      importedCount: 1,
      duplicateCount: 1,
      persistenceErrorCount: 0,
    });
    expect(finalized[0]).toMatchObject({ importedCount: 1, duplicateCount: 1, status: "completed" });
  });

  it("reports one failed save without corrupting successful sibling units", async () => {
    const preview = parsePgnPreview(`${annotatedPgn}\n\n${unknownPgn}`);
    const { repository, saved, finalized, recordedErrors } = fakeRepository(
      [
        { id: 1, name: "Jan Kowalski", fideId: "99000001" },
        { id: 2, name: "Anna Nowak", fideId: "99000002" },
        { id: 8, name: "Unique Name", fideId: null },
      ],
      { failIndexes: [2] },
    );

    const result = await persistParsedImport(
      { filename: "mixed.pgn", sourceLabel: "Manual", preview },
      repository,
    );

    expect(saved.map((unit) => unit.game.index)).toEqual([1]);
    expect(result).toMatchObject({
      parsedCount: 2,
      importedCount: 1,
      duplicateCount: 0,
      persistenceErrorCount: 1,
      unresolvedSideCount: 0,
    });
    expect(result.persistenceErrors).toEqual([
      { index: 2, message: "This parsed game could not be saved." },
    ]);
    expect(recordedErrors).toContainEqual({
      sourceIndex: 2,
      phase: "persistence",
      message: "This parsed game could not be saved.",
    });
    expect(finalized).toEqual([
      {
        importId: 42,
        importedCount: 1,
        duplicateCount: 0,
        persistenceErrorCount: 1,
        unresolvedSideCount: 0,
        status: "completed_with_errors",
      },
    ]);
  });
});
