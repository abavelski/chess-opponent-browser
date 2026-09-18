import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";
import {
  analyzeOpponentPack,
  normalizePackPlayerName,
} from "@/lib/imports/opponent-pack";
import { persistParsedImport } from "@/lib/imports/persist";
import {
  MAX_PGN_BYTES,
  parsePgnPreview,
  validatePgnUploadMetadata,
} from "@/lib/imports/pgn";
import { createImportPersistenceRepository } from "@/lib/imports/repository";
import { PLAYER_NAME_MAX_LENGTH } from "@/lib/players/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sourceLabel = "Danbase CLI";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return errorResponse("The request body must be multipart form data.", 400);
  }

  const nameInput = formData.get("name");
  const uploaded = formData.get("pgnFile");
  const canonicalName = typeof nameInput === "string" ? nameInput.trim() : "";

  if (!canonicalName) {
    return errorResponse("Opponent name is required.", 400);
  }
  if (canonicalName.length > PLAYER_NAME_MAX_LENGTH) {
    return errorResponse(
      `Opponent name must be ${PLAYER_NAME_MAX_LENGTH} characters or fewer.`,
      400,
    );
  }
  if (!(uploaded instanceof File)) {
    return errorResponse("Attach the extracted PGN as pgnFile.", 400);
  }

  const validation = validatePgnUploadMetadata({
    filename: uploaded.name,
    size: uploaded.size,
    sourceLabel,
  });
  if (!validation.ok) {
    return errorResponse(validation.message, 400);
  }
  if (uploaded.size > MAX_PGN_BYTES) {
    return errorResponse("The extracted opponent pack is too large to upload.", 413);
  }

  let rawPgn: string;
  try {
    rawPgn = await uploaded.text();
  } catch {
    return errorResponse("The uploaded PGN could not be read.", 400);
  }

  let preview;
  try {
    preview = parsePgnPreview(rawPgn);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "The PGN could not be parsed.",
      422,
    );
  }

  if (preview.games.length === 0) {
    return errorResponse("No successfully parsed games were found in this pack.", 422);
  }

  const pack = analyzeOpponentPack(preview);
  const requestedKey = normalizePackPlayerName(canonicalName);
  const focalCandidate =
    pack.candidates.find((candidate) => candidate.normalizedName === requestedKey) ??
    pack.candidates.find(
      (candidate) => candidate.normalizedName === pack.suggestedNormalizedName,
    );

  if (!focalCandidate) {
    return errorResponse(
      "The requested opponent could not be identified as the focal player in this pack.",
      422,
    );
  }

  try {
    const db = getDb();
    const [activeTournament] = await db
      .select({ id: tournaments.id, name: tournaments.name })
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt), desc(tournaments.id))
      .limit(1);

    if (!activeTournament) {
      return errorResponse("No tournament exists. Create one before importing opponents.", 409);
    }

    const result = await persistParsedImport(
      {
        filename: uploaded.name,
        sourceLabel: validation.sourceLabel,
        preview,
        focalOpponent: {
          sourceName: focalCandidate.name,
          sourceFideId: focalCandidate.fideId,
          canonicalName,
          tournamentId: activeTournament.id,
        },
      },
      createImportPersistenceRepository(),
    );

    const focal = result.focalOpponent;
    const alreadyUpToDate = Boolean(
      focal &&
        !focal.playerCreated &&
        !focal.rosterAdded &&
        result.importedCount === 0 &&
        result.persistenceErrorCount === 0,
    );

    return NextResponse.json({
      ok: true,
      alreadyUpToDate,
      tournament: activeTournament,
      opponent: focal
        ? {
            id: focal.playerId,
            name: focal.playerName,
            created: focal.playerCreated,
            rosterAdded: focal.rosterAdded,
            visibleGameCount: focal.visibleGameCount,
            conflictCount: focal.conflictCount,
          }
        : null,
      import: {
        id: result.importId,
        parsedCount: result.parsedCount,
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount,
        parseErrorCount: result.parseErrorCount,
        persistenceErrorCount: result.persistenceErrorCount,
      },
    });
  } catch (error) {
    console.error("Failed to import opponent through admin API", error);
    return errorResponse("The opponent pack could not be imported.", 500);
  }
}
