"use server";

import {
  MAX_PGN_BYTES,
  parsePgnPreview,
  validatePgnUploadMetadata,
} from "@/lib/imports/pgn";

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

function errorState(message: string, sourceLabel: string): ImportPreviewActionState {
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

export async function previewPgnImport(
  _previousState: ImportPreviewActionState,
  formData: FormData,
): Promise<ImportPreviewActionState> {
  const sourceInput = formData.get("sourceLabel");
  const sourceLabel = typeof sourceInput === "string" ? sourceInput : "Manual";
  const uploaded = formData.get("pgnFile");

  if (!(uploaded instanceof File)) {
    return errorState("Choose one PGN file to preview.", sourceLabel);
  }

  const validation = validatePgnUploadMetadata({
    filename: uploaded.name,
    size: uploaded.size,
    sourceLabel,
  });
  if (!validation.ok) return errorState(validation.message, sourceLabel);

  // The configured Server Action body limit is slightly larger than this product limit.
  if (uploaded.size > MAX_PGN_BYTES) {
    return errorState("The PGN file is too large. Maximum size is 3 MB.", validation.sourceLabel);
  }

  let rawPgn: string;
  try {
    rawPgn = await uploaded.text();
  } catch {
    return errorState("The selected file could not be read as text.", validation.sourceLabel);
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
    return errorState(message, validation.sourceLabel);
  }
}
