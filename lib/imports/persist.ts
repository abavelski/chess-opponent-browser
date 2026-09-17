import type { PgnPreview, PgnPreviewGame } from "./pgn";
import { createGameFingerprint } from "./fingerprint";

export type CanonicalPlayerIdentity = {
  id: number;
  name: string;
  fideId: string | null;
};

export type ImportedSideResolution = {
  playerId: number | null;
  method: "fide" | "name" | null;
};

export type AffectedPlayerLink = {
  playerId: number;
  playerName: string;
  tournamentId: number;
  tournamentName: string;
};

export type ImportItemOutcome = "imported" | "duplicate";

export type SaveImportedGameUnit = {
  importId: number;
  sourceId: number;
  game: PgnPreviewGame;
  fingerprint: string | null;
  whitePlayerId: number | null;
  blackPlayerId: number | null;
};

export type SaveImportedGameResult = {
  gameId: number;
  outcome: ImportItemOutcome;
  whitePlayerId: number | null;
  blackPlayerId: number | null;
};

export type PersistedImportError = {
  sourceIndex: number;
  phase: "parse" | "persistence";
  message: string;
};

export type ImportStatus = "processing" | "completed" | "completed_with_errors" | "failed";

export type ImportPersistenceRepository = {
  ensureSource(sourceLabel: string): Promise<{ id: number; label: string }>;
  listCanonicalPlayers(): Promise<CanonicalPlayerIdentity[]>;
  createImport(input: {
    sourceId: number;
    filename: string;
    parsedCount: number;
    parseErrorCount: number;
  }): Promise<number>;
  saveGameUnit(input: SaveImportedGameUnit): Promise<SaveImportedGameResult>;
  recordImportErrors(importId: number, errors: PersistedImportError[]): Promise<void>;
  finalizeImport(input: {
    importId: number;
    importedCount: number;
    duplicateCount: number;
    persistenceErrorCount: number;
    unresolvedSideCount: number;
    status: Exclude<ImportStatus, "processing" | "failed">;
  }): Promise<void>;
  markImportFailed(importId: number): Promise<void>;
  listAffectedPlayerLinks(playerIds: number[]): Promise<AffectedPlayerLink[]>;
};

export type PersistImportResult = {
  importId: number;
  parsedCount: number;
  importedCount: number;
  duplicateCount: number;
  parseErrorCount: number;
  persistenceErrorCount: number;
  unresolvedSideCount: number;
  persistenceErrors: Array<{ index: number; message: string }>;
  affectedPlayers: AffectedPlayerLink[];
};

type IdentityIndex = {
  byFideId: Map<string, CanonicalPlayerIdentity[]>;
  byNormalizedName: Map<string, CanonicalPlayerIdentity[]>;
};

export function normalizeImportedPlayerName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function usableFideId(value: string | null) {
  const fideId = value?.trim() ?? "";
  return fideId && fideId.length <= 32 ? fideId : null;
}

export function buildIdentityIndex(players: CanonicalPlayerIdentity[]): IdentityIndex {
  const byFideId = new Map<string, CanonicalPlayerIdentity[]>();
  const byNormalizedName = new Map<string, CanonicalPlayerIdentity[]>();

  for (const player of players) {
    const fideId = usableFideId(player.fideId);
    if (fideId) byFideId.set(fideId, [...(byFideId.get(fideId) ?? []), player]);

    const normalizedName = normalizeImportedPlayerName(player.name);
    if (normalizedName) {
      byNormalizedName.set(
        normalizedName,
        [...(byNormalizedName.get(normalizedName) ?? []), player],
      );
    }
  }

  return { byFideId, byNormalizedName };
}

export function resolveImportedSide(
  input: { name: string; fideId: string | null },
  index: IdentityIndex,
): ImportedSideResolution {
  const fideId = usableFideId(input.fideId);
  if (fideId) {
    const fideMatches = index.byFideId.get(fideId) ?? [];
    if (fideMatches.length === 1) return { playerId: fideMatches[0].id, method: "fide" };
  }

  const normalizedName = normalizeImportedPlayerName(input.name);
  const nameMatches = normalizedName ? index.byNormalizedName.get(normalizedName) ?? [] : [];
  if (nameMatches.length === 1) return { playerId: nameMatches[0].id, method: "name" };

  return { playerId: null, method: null };
}

export async function persistParsedImport(
  input: {
    filename: string;
    sourceLabel: string;
    preview: PgnPreview;
  },
  repository: ImportPersistenceRepository,
): Promise<PersistImportResult> {
  const source = await repository.ensureSource(input.sourceLabel);
  const players = await repository.listCanonicalPlayers();
  const identities = buildIdentityIndex(players);
  const importId = await repository.createImport({
    sourceId: source.id,
    filename: input.filename,
    parsedCount: input.preview.games.length,
    parseErrorCount: input.preview.errors.length,
  });

  try {
    if (input.preview.errors.length > 0) {
      await repository.recordImportErrors(
        importId,
        input.preview.errors.map((error) => ({
          sourceIndex: error.index,
          phase: "parse" as const,
          message: error.message,
        })),
      );
    }

    let importedCount = 0;
    let duplicateCount = 0;
    let unresolvedSideCount = 0;
    const persistenceErrors: Array<{ index: number; message: string }> = [];
    const affectedPlayerIds = new Set<number>();

    for (const game of input.preview.games) {
      const white = resolveImportedSide(
        { name: game.white, fideId: game.whiteFideId },
        identities,
      );
      const black = resolveImportedSide(
        { name: game.black, fideId: game.blackFideId },
        identities,
      );

      try {
        const saved = await repository.saveGameUnit({
          importId,
          sourceId: source.id,
          game,
          fingerprint: createGameFingerprint(game),
          whitePlayerId: white.playerId,
          blackPlayerId: black.playerId,
        });

        if (saved.outcome === "duplicate") duplicateCount += 1;
        else importedCount += 1;

        if (white.playerId === null) unresolvedSideCount += 1;
        if (black.playerId === null) unresolvedSideCount += 1;
        if (saved.whitePlayerId !== null) affectedPlayerIds.add(saved.whitePlayerId);
        if (saved.blackPlayerId !== null) affectedPlayerIds.add(saved.blackPlayerId);
      } catch {
        persistenceErrors.push({
          index: game.index,
          message: "This parsed game could not be saved.",
        });
      }
    }

    if (persistenceErrors.length > 0) {
      await repository.recordImportErrors(
        importId,
        persistenceErrors.map((error) => ({
          sourceIndex: error.index,
          phase: "persistence" as const,
          message: error.message,
        })),
      );
    }

    const status =
      input.preview.errors.length + persistenceErrors.length > 0
        ? "completed_with_errors"
        : "completed";

    await repository.finalizeImport({
      importId,
      importedCount,
      duplicateCount,
      persistenceErrorCount: persistenceErrors.length,
      unresolvedSideCount,
      status,
    });

    const affectedPlayers = await repository.listAffectedPlayerLinks([...affectedPlayerIds]);

    return {
      importId,
      parsedCount: input.preview.games.length,
      importedCount,
      duplicateCount,
      parseErrorCount: input.preview.errors.length,
      persistenceErrorCount: persistenceErrors.length,
      unresolvedSideCount,
      persistenceErrors,
      affectedPlayers,
    };
  } catch (error) {
    try {
      await repository.markImportFailed(importId);
    } catch {
      // Preserve the original failure. History may retain a processing row if
      // even the failure marker cannot be written.
    }
    throw error;
  }
}
