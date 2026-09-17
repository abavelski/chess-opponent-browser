"use server";

import {
  MAX_PGN_BYTES,
  parsePgnPreview,
  validatePgnUploadMetadata,
} from "@/lib/imports/pgn";
import { persistParsedImport } from "@/lib/imports/persist";
import { createImportPersistenceRepository } from "@/lib/imports/repository";

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
};

export type ImportConfirmActionState = {
  status: "idle" | "error" | "result";
  message: string | null;
  importId: number | null;
  parsedCount: number;
  importedCount: number;
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
  };
}

function confirmErrorState(message: string): ImportConfirmActionState {
  return {
    status: "error",
    message,
    importId: null,
    parsedCount: 0,
    importedCount: 0,
    parseErrorCount: 0,
    persistenceErrorCount: 0,
    unresolvedSideCount: 0,
    persistenceErrors: [],
    affectedPlayers: [],
  };
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
    return {
      status: "preview",
      message:
        preview.games.length === 0
          ? "No games could be parsed. Nothing has been saved."
          : "Preview complete. Nothing has been saved yet.",
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

  if (
    typeof filename !== "string" ||
    typeof sourceLabel !== "string" ||
    typeof rawPgn !== "string" ||
    !rawPgn
  ) {
    return confirmErrorState("The preview is no longer available. Preview the PGN again.");
  }

  const byteLength = new TextEncoder().encode(rawPgn).byteLength;
  const validation = validatePgnUploadMetadata({
    filename,
    size: byteLength,
    sourceLabel,
  });
  if (!validation.ok) return confirmErrorState(validation.message);

  try {
    // Reparse the raw PGN on the server. No parsed move tree or identity decision
    // submitted by the browser is trusted at the confirmation boundary.
    const preview = parsePgnPreview(rawPgn);
    if (preview.games.length === 0) {
      return confirmErrorState("No successfully parsed games are available to import.");
    }

    const result = await persistParsedImport(
      {
        filename,
        sourceLabel: validation.sourceLabel,
        preview,
      },
      createImportPersistenceRepository(),
    );

    return {
      status: "result",
      message: "Import complete. Safely matched games are now available in the player browser.",
      importId: result.importId,
      parsedCount: result.parsedCount,
      importedCount: result.importedCount,
      parseErrorCount: result.parseErrorCount,
      persistenceErrorCount: result.persistenceErrorCount,
      unresolvedSideCount: result.unresolvedSideCount,
      persistenceErrors: result.persistenceErrors,
      affectedPlayers: result.affectedPlayers,
    };
  } catch (error) {
    console.error("Failed to persist PGN import", error);
    return confirmErrorState(
      "The import could not be completed because the database operation failed. Check the game library before retrying.",
    );
  }
}
