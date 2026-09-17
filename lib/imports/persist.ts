import type { PgnPreview, PgnPreviewGame } from "./pgn";

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

export type SaveImportedGameUnit = {
  importId: number;
  sourceId: number;
  game: PgnPreviewGame;
  whitePlayerId: number | null;
  blackPlayerId: number | null;
};

export type ImportPersistenceRepository = {
  ensureSource(sourceLabel: string): Promise<{ id: number; label: string }>;
  listCanonicalPlayers(): Promise<CanonicalPlayerIdentity[]>;
  createImport(input: {
    sourceId: number;
    filename: string;
    parsedCount: number;
    parseErrorCount: number;
  }): Promise<number>;
  saveGameUnit(input: SaveImportedGameUnit): Promise<void>;
  finalizeImport(input: {
    importId: number;
    importedCount: number;
    persistenceErrorCount: number;
    unresolvedSideCount: number;
  }): Promise<void>;
  listAffectedPlayerLinks(playerIds: number[]): Promise<AffectedPlayerLink[]>;
};

export type PersistImportResult = {
  importId: number;
  parsedCount: number;
  importedCount: number;
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

  let importedCount = 0;
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
      await repository.saveGameUnit({
        importId,
        sourceId: source.id,
        game,
        whitePlayerId: white.playerId,
        blackPlayerId: black.playerId,
      });
      importedCount += 1;
      if (white.playerId === null) unresolvedSideCount += 1;
      else affectedPlayerIds.add(white.playerId);
      if (black.playerId === null) unresolvedSideCount += 1;
      else affectedPlayerIds.add(black.playerId);
    } catch {
      persistenceErrors.push({
        index: game.index,
        message: "This parsed game could not be saved.",
      });
    }
  }

  await repository.finalizeImport({
    importId,
    importedCount,
    persistenceErrorCount: persistenceErrors.length,
    unresolvedSideCount,
  });

  const affectedPlayers = await repository.listAffectedPlayerLinks([...affectedPlayerIds]);

  return {
    importId,
    parsedCount: input.preview.games.length,
    importedCount,
    parseErrorCount: input.preview.errors.length,
    persistenceErrorCount: persistenceErrors.length,
    unresolvedSideCount,
    persistenceErrors,
    affectedPlayers,
  };
}
