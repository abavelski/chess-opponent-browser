import type { PgnPreview, PgnPreviewGame } from "./pgn";
import { createGameFingerprint, createMoveFingerprint } from "./fingerprint";

export type CanonicalPlayerIdentity = {
  id: number;
  name: string;
  fideId: string | null;
};

export type PlayerAliasIdentity = {
  playerId: number;
  normalizedKey: string;
};

export type ImportedSideResolution = {
  playerId: number | null;
  method: "fide" | "alias" | "name" | null;
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
  moveFingerprint: string | null;
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

export type FocalOpponentInput = {
  sourceName: string;
  sourceFideId: string | null;
  canonicalName: string;
  tournamentId: number;
};

export type FocalOpponentConflict = {
  index: number;
  side: "White" | "Black";
  message: string;
};

export type FocalOpponentResult = {
  playerId: number;
  playerName: string;
  playerCreated: boolean;
  tournamentId: number;
  rosterAdded: boolean;
  visibleGameCount: number;
  conflictCount: number;
  conflicts: FocalOpponentConflict[];
};

export type ImportPersistenceRepository = {
  ensureSource(sourceLabel: string): Promise<{ id: number; label: string }>;
  listCanonicalPlayers(): Promise<CanonicalPlayerIdentity[]>;
  listPlayerAliases?(): Promise<PlayerAliasIdentity[]>;
  createCanonicalPlayer(input: { name: string; fideId: string | null }): Promise<CanonicalPlayerIdentity>;
  rememberPlayerAlias?(input: {
    playerId: number;
    aliasText: string;
    normalizedKey: string;
  }): Promise<void>;
  ensureTournamentParticipant(tournamentId: number, playerId: number): Promise<{ added: boolean }>;
  countGamesForPlayer(playerId: number): Promise<number>;
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
  focalOpponent: FocalOpponentResult | null;
};

type IdentityIndex = {
  byId: Map<number, CanonicalPlayerIdentity>;
  byFideId: Map<string, CanonicalPlayerIdentity[]>;
  byAliasKey: Map<string, CanonicalPlayerIdentity[]>;
  byNormalizedName: Map<string, CanonicalPlayerIdentity[]>;
};

export function normalizeImportedPlayerName(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .toLowerCase();
}

function usableFideId(value: string | null) {
  const fideId = value?.trim() ?? "";
  return fideId && fideId.length <= 32 ? fideId : null;
}

function targetContradictsSourceFide(
  sourceFideId: string | null,
  target: CanonicalPlayerIdentity,
) {
  const source = usableFideId(sourceFideId);
  const targetFide = usableFideId(target.fideId);
  return Boolean(source && targetFide && source !== targetFide);
}

export function buildIdentityIndex(
  players: CanonicalPlayerIdentity[],
  aliases: PlayerAliasIdentity[] = [],
): IdentityIndex {
  const byId = new Map<number, CanonicalPlayerIdentity>();
  const byFideId = new Map<string, CanonicalPlayerIdentity[]>();
  const byAliasKey = new Map<string, CanonicalPlayerIdentity[]>();
  const byNormalizedName = new Map<string, CanonicalPlayerIdentity[]>();

  for (const player of players) {
    byId.set(player.id, player);
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

  for (const alias of aliases) {
    const player = byId.get(alias.playerId);
    if (!player) continue;
    const key = normalizeImportedPlayerName(alias.normalizedKey);
    if (!key) continue;
    const current = byAliasKey.get(key) ?? [];
    if (!current.some((candidate) => candidate.id === player.id)) {
      byAliasKey.set(key, [...current, player]);
    }
  }

  return { byId, byFideId, byAliasKey, byNormalizedName };
}

function uniqueSafeMatch(
  candidates: CanonicalPlayerIdentity[],
  sourceFideId: string | null,
): CanonicalPlayerIdentity | null {
  if (candidates.length !== 1) return null;
  const target = candidates[0];
  return targetContradictsSourceFide(sourceFideId, target) ? null : target;
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
  const aliasMatch = normalizedName
    ? uniqueSafeMatch(index.byAliasKey.get(normalizedName) ?? [], input.fideId)
    : null;
  if (aliasMatch) return { playerId: aliasMatch.id, method: "alias" };

  const nameMatch = normalizedName
    ? uniqueSafeMatch(index.byNormalizedName.get(normalizedName) ?? [], input.fideId)
    : null;
  if (nameMatch) return { playerId: nameMatch.id, method: "name" };

  return { playerId: null, method: null };
}

export async function persistParsedImport(
  input: {
    filename: string;
    sourceLabel: string;
    preview: PgnPreview;
    focalOpponent?: FocalOpponentInput;
  },
  repository: ImportPersistenceRepository,
): Promise<PersistImportResult> {
  const source = await repository.ensureSource(input.sourceLabel);
  const players = await repository.listCanonicalPlayers();
  const aliases = repository.listPlayerAliases ? await repository.listPlayerAliases() : [];
  let identities = buildIdentityIndex(players, aliases);

  let focalPlayer: CanonicalPlayerIdentity | null = null;
  let focalPlayerCreated = false;
  let rosterAdded = false;
  let focalSourceKey = "";

  if (input.focalOpponent) {
    focalSourceKey = normalizeImportedPlayerName(input.focalOpponent.sourceName);
    const existingResolution = resolveImportedSide(
      {
        name: input.focalOpponent.sourceName,
        fideId: input.focalOpponent.sourceFideId,
      },
      identities,
    );

    const canonicalResolution = existingResolution.playerId === null
      ? resolveImportedSide(
          {
            name: input.focalOpponent.canonicalName,
            fideId: input.focalOpponent.sourceFideId,
          },
          identities,
        )
      : existingResolution;

    if (canonicalResolution.playerId !== null) {
      focalPlayer = identities.byId.get(canonicalResolution.playerId) ?? null;
    }

    if (!focalPlayer) {
      focalPlayer = await repository.createCanonicalPlayer({
        name: input.focalOpponent.canonicalName,
        fideId: usableFideId(input.focalOpponent.sourceFideId),
      });
      focalPlayerCreated = true;
      players.push(focalPlayer);
      identities = buildIdentityIndex(players, aliases);

      const canonicalKey = normalizeImportedPlayerName(focalPlayer.name);
      if (
        repository.rememberPlayerAlias &&
        focalSourceKey &&
        focalSourceKey !== canonicalKey &&
        input.focalOpponent.sourceName.length <= 200 &&
        focalSourceKey.length <= 200
      ) {
        await repository.rememberPlayerAlias({
          playerId: focalPlayer.id,
          aliasText: input.focalOpponent.sourceName.trim(),
          normalizedKey: focalSourceKey,
        });
      }
    }

    const participant = await repository.ensureTournamentParticipant(
      input.focalOpponent.tournamentId,
      focalPlayer.id,
    );
    rosterAdded = participant.added;
  }

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
    const focalConflicts: FocalOpponentConflict[] = [];

    for (const game of input.preview.games) {
      const normalWhite = resolveImportedSide(
        { name: game.white, fideId: game.whiteFideId },
        identities,
      );
      const normalBlack = resolveImportedSide(
        { name: game.black, fideId: game.blackFideId },
        identities,
      );

      const whiteMatchesFocal = Boolean(
        focalPlayer && normalizeImportedPlayerName(game.white) === focalSourceKey,
      );
      const blackMatchesFocal = Boolean(
        focalPlayer && normalizeImportedPlayerName(game.black) === focalSourceKey,
      );
      const whiteFideConflict = Boolean(
        focalPlayer && whiteMatchesFocal && targetContradictsSourceFide(game.whiteFideId, focalPlayer),
      );
      const blackFideConflict = Boolean(
        focalPlayer && blackMatchesFocal && targetContradictsSourceFide(game.blackFideId, focalPlayer),
      );

      const requestedWhitePlayerId =
        focalPlayer && whiteMatchesFocal && !whiteFideConflict
          ? focalPlayer.id
          : normalWhite.playerId;
      const requestedBlackPlayerId =
        focalPlayer && blackMatchesFocal && !blackFideConflict
          ? focalPlayer.id
          : normalBlack.playerId;

      try {
        const saved = await repository.saveGameUnit({
          importId,
          sourceId: source.id,
          game,
          fingerprint: createGameFingerprint(game),
          moveFingerprint: createMoveFingerprint(game, {
            whitePlayerId: requestedWhitePlayerId,
            blackPlayerId: requestedBlackPlayerId,
            whiteFideId: requestedWhitePlayerId === null
              ? null
              : identities.byId.get(requestedWhitePlayerId)?.fideId,
            blackFideId: requestedBlackPlayerId === null
              ? null
              : identities.byId.get(requestedBlackPlayerId)?.fideId,
          }),
          whitePlayerId: requestedWhitePlayerId,
          blackPlayerId: requestedBlackPlayerId,
        });

        if (saved.outcome === "duplicate") duplicateCount += 1;
        else importedCount += 1;

        if (saved.whitePlayerId === null) unresolvedSideCount += 1;
        if (saved.blackPlayerId === null) unresolvedSideCount += 1;
        if (saved.whitePlayerId !== null) affectedPlayerIds.add(saved.whitePlayerId);
        if (saved.blackPlayerId !== null) affectedPlayerIds.add(saved.blackPlayerId);

        if (focalPlayer && whiteMatchesFocal) {
          if (whiteFideConflict) {
            focalConflicts.push({
              index: game.index,
              side: "White",
              message: "The imported White FIDE ID conflicts with the focal canonical Player.",
            });
          } else if (saved.whitePlayerId !== focalPlayer.id) {
            focalConflicts.push({
              index: game.index,
              side: "White",
              message: "The existing Game is already linked to a different White Player.",
            });
          }
        }

        if (focalPlayer && blackMatchesFocal) {
          if (blackFideConflict) {
            focalConflicts.push({
              index: game.index,
              side: "Black",
              message: "The imported Black FIDE ID conflicts with the focal canonical Player.",
            });
          } else if (saved.blackPlayerId !== focalPlayer.id) {
            focalConflicts.push({
              index: game.index,
              side: "Black",
              message: "The existing Game is already linked to a different Black Player.",
            });
          }
        }
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
    const focalOpponent = focalPlayer && input.focalOpponent
      ? {
          playerId: focalPlayer.id,
          playerName: focalPlayer.name,
          playerCreated: focalPlayerCreated,
          tournamentId: input.focalOpponent.tournamentId,
          rosterAdded,
          visibleGameCount: await repository.countGamesForPlayer(focalPlayer.id),
          conflictCount: focalConflicts.length,
          conflicts: focalConflicts,
        }
      : null;

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
      focalOpponent,
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
