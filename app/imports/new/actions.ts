"use server";

import {
  MAX_PGN_BYTES,
  parsePgnPreview,
  validatePgnUploadMetadata,
} from "@/lib/imports/pgn";
import {
  analyzeOpponentPack,
  type OpponentPackCandidate,
} from "@/lib/imports/opponent-pack";
import { persistParsedImport, type FocalOpponentResult } from "@/lib/imports/persist";
import { createImportPersistenceRepository } from "@/lib/imports/repository";
import { PLAYER_NAME_MAX_LENGTH } from "@/lib/players/validation";

export type ImportPreviewListItem = {
  index: number;
  white: string;
  black: string;
  whiteRating: number | null;
  blackRating: number | null;
  date: string | null;
  result: string;
  event: string | null;
  eco: string | null;
  opening: string | null;
};

export type ImportPreviewActionState = {
  status: "idle" | "error" | "preview";
  message: string | null;
  sourceLabel: string;
  filename: string | null;
  gamesFound: number;
  parsedCount: number;
  errorCount: number;
  games: ImportPreviewListItem[];
  errors: Array<{ index: number; message: string }>;
  rawPgn: string | null;
  focalCandidates: OpponentPackCandidate[];
  suggestedFocalName: string | null;
};

export type ImportConfirmActionState = {
  status: "idle" | "error" | "result";
  message: string | null;
  importId: number | null;
  parsedCount: number;
  importedCount: number;
  duplicateCount: number;
  parseErrorCount: number;
  persistenceErrorCount: number;
  unresolvedSideCount: number;
  persistenceErrors: Array<{ index: number; message: string }>;
  affectedPlayers: Array<{
    playerId: number;
    playerName: string;
    tournamentId: number;
    tournamentName: string;
  }>;
  focalOpponent: FocalOpponentResult | null;
};

function previewErrorState(message: string, sourceLabel: string): ImportPreviewActionState {
  return {
    status: "error",
    message,
    sourceLabel,
    filename: null,
    gamesFound: 0,
    parsedCount: 0,
    errorCount: 0,
    games: [],
    errors: [],
    rawPgn: null,
    focalCandidates: [],
    suggestedFocalName: null,
  };
}

function confirmErrorState(message: string): ImportConfirmActionState {
  return {
    status: "error",
    message,
    importId: null,
    parsedCount: 0,
    importedCount: 0,
    duplicateCount: 0,
    parseErrorCount: 0,
    persistenceErrorCount: 0,
    unresolvedSideCount: 0,
    persistenceErrors: [],
    affectedPlayers: [],
    focalOpponent: null,
  };
}

function parsePositiveId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export async function previewPgnImport(
  _previousState: ImportPreviewActionState,
  formData: FormData,
): Promise<ImportPreviewActionState> {
  const sourceInput = formData.get("sourceLabel");
  const sourceLabel = typeof sourceInput === "string" ? sourceInput : "Manual";
  const uploaded = formData.get("pgnFile");

  if (!(uploaded instanceof File)) {
    return previewErrorState("Choose one PGN file to preview.", sourceLabel);
  }

  const validation = validatePgnUploadMetadata({
    filename: uploaded.name,
    size: uploaded.size,
    sourceLabel,
  });
  if (!validation.ok) return previewErrorState(validation.message, sourceLabel);

  if (uploaded.size > MAX_PGN_BYTES) {
    return previewErrorState(
      "The PGN file is too large. Maximum size is 3 MB.",
      validation.sourceLabel,
    );
  }

  let rawPgn: string;
  try {
    rawPgn = await uploaded.text();
  } catch {
    return previewErrorState(
      "The selected file could not be read as text.",
      validation.sourceLabel,
    );
  }

  try {
    const preview = parsePgnPreview(rawPgn);
    const pack = analyzeOpponentPack(preview);
    return {
      status: "preview",
      message:
        preview.games.length === 0
          ? "No games could be parsed. Nothing has been saved."
          : "Preview complete. Choose the focal opponent for this pack, then confirm the import.",
      sourceLabel: validation.sourceLabel,
      filename: uploaded.name,
      gamesFound: preview.gamesFound,
      parsedCount: preview.games.length,
      errorCount: preview.errors.length,
      games: preview.games.map((game) => ({
        index: game.index,
        white: game.white,
        black: game.black,
        whiteRating: game.whiteRating,
        blackRating: game.blackRating,
        date: game.dateLabel,
        result: game.result,
        event: game.event,
        eco: game.eco,
        opening: game.opening,
      })),
      errors: preview.errors,
      rawPgn,
      focalCandidates: pack.candidates,
      suggestedFocalName: pack.suggestedNormalizedName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The PGN could not be parsed.";
    return previewErrorState(message, validation.sourceLabel);
  }
}

export async function confirmPgnImport(
  _previousState: ImportConfirmActionState,
  formData: FormData,
): Promise<ImportConfirmActionState> {
  const filename = formData.get("filename");
  const sourceLabel = formData.get("sourceLabel");
  const rawPgn = formData.get("rawPgn");
  const focalNameKey = formData.get("focalName");
  const canonicalNameInput = formData.get("canonicalName");
  const tournamentId = parsePositiveId(formData.get("tournamentId"));

  if (
    typeof filename !== "string" ||
    typeof sourceLabel !== "string" ||
    typeof rawPgn !== "string" ||
    !rawPgn
  ) {
    return confirmErrorState("The preview is no longer available. Preview the PGN again.");
  }

  if (typeof focalNameKey !== "string" || !focalNameKey) {
    return confirmErrorState("Choose the focal opponent for this PGN pack.");
  }

  const canonicalName =
    typeof canonicalNameInput === "string" ? canonicalNameInput.trim() : "";
  if (!canonicalName) {
    return confirmErrorState("Enter a canonical display name for the focal opponent.");
  }
  if (canonicalName.length > PLAYER_NAME_MAX_LENGTH) {
    return confirmErrorState(
      `Canonical player name must be ${PLAYER_NAME_MAX_LENGTH} characters or fewer.`,
    );
  }
  if (tournamentId === null) {
    return confirmErrorState("Choose the preparation tournament for this opponent pack.");
  }

  const byteLength = new TextEncoder().encode(rawPgn).byteLength;
  const validation = validatePgnUploadMetadata({
    filename,
    size: byteLength,
    sourceLabel,
  });
  if (!validation.ok) return confirmErrorState(validation.message);

  try {
    const preview = parsePgnPreview(rawPgn);
    if (preview.games.length === 0) {
      return confirmErrorState("No successfully parsed games are available to import.");
    }

    const pack = analyzeOpponentPack(preview);
    const focalCandidate = pack.candidates.find(
      (candidate) => candidate.normalizedName === focalNameKey,
    );
    if (!focalCandidate) {
      return confirmErrorState(
        "The selected focal opponent is no longer present in the parsed PGN. Preview it again.",
      );
    }

    const result = await persistParsedImport(
      {
        filename,
        sourceLabel: validation.sourceLabel,
        preview,
        focalOpponent: {
          sourceName: focalCandidate.name,
          sourceFideId: focalCandidate.fideId,
          canonicalName,
          tournamentId,
        },
      },
      createImportPersistenceRepository(),
    );

    const focal = result.focalOpponent;
    return {
      status: "result",
      message: focal
        ? `${focal.playerName} is ${focal.playerCreated ? "created" : "reused"} and ${
            focal.rosterAdded ? "added to" : "already in"
          } the preparation roster. ${focal.visibleGameCount} games are now visible for this opponent.`
        : "Import complete.",
      importId: result.importId,
      parsedCount: result.parsedCount,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
      parseErrorCount: result.parseErrorCount,
      persistenceErrorCount: result.persistenceErrorCount,
      unresolvedSideCount: result.unresolvedSideCount,
      persistenceErrors: result.persistenceErrors,
      affectedPlayers: result.affectedPlayers,
      focalOpponent: focal,
    };
  } catch (error) {
    console.error("Failed to persist opponent PGN pack", error);
    return confirmErrorState(
      "The opponent pack could not be completed because the database operation failed. Check Import history before retrying.",
    );
  }
}
