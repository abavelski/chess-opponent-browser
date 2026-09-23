import { createHash } from "node:crypto";

import type { PgnPreviewGame } from "./pgn";

/**
 * Task 008 obvious-duplicate identity, version 1.
 *
 * The fingerprint intentionally ignores source labels, PGN header ordering,
 * whitespace, comments, annotations, and variations. It uses normalized raw
 * side names, the played date when known, result, and the exact main-line UCI
 * sequence. A game without a date is fingerprinted only when its main line is
 * at least six full moves (12 plies); shorter undated games are treated as too
 * ambiguous and therefore fail safe by receiving no fingerprint.
 */
export function normalizeFingerprintName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function canonicalGameFingerprintInput(game: PgnPreviewGame) {
  const white = normalizeFingerprintName(game.white);
  const black = normalizeFingerprintName(game.black);
  const moves = game.structuredMoves.mainline.map((move) => move.uci.trim());

  if (!white || !black || moves.length === 0 || moves.some((move) => !move)) return null;
  if (!game.playedOn && moves.length < 12) return null;

  return [
    "v1",
    white,
    black,
    game.playedOn ?? "-",
    game.result,
    moves.join(" "),
  ].join("|");
}

export function createGameFingerprint(game: PgnPreviewGame) {
  const canonical = canonicalGameFingerprintInput(game);
  return canonical ? createHash("md5").update(canonical).digest("hex") : null;
}

/**
 * Date-independent identity for games whose players have both been resolved.
 * Some sources attach an event or publication date instead of the game date.
 */
export function canonicalMoveFingerprintInput(
  game: PgnPreviewGame,
  identities: {
    whitePlayerId: number | null;
    blackPlayerId: number | null;
    whiteFideId?: string | null;
    blackFideId?: string | null;
  },
) {
  const moves = game.structuredMoves.mainline.map((move) => move.uci.trim());
  const whiteFideId = game.whiteFideId?.trim() || identities.whiteFideId?.trim();
  const blackFideId = game.blackFideId?.trim() || identities.blackFideId?.trim();
  const white = whiteFideId
    ? `fide:${whiteFideId}`
    : identities.whitePlayerId === null
      ? null
      : `player:${identities.whitePlayerId}`;
  const black = blackFideId
    ? `fide:${blackFideId}`
    : identities.blackPlayerId === null
      ? null
      : `player:${identities.blackPlayerId}`;

  if (!white || !black || moves.length < 12 || moves.some((move) => !move)) return null;

  return ["v2", white, black, game.result, moves.join(" ")].join("|");
}

export function createMoveFingerprint(
  game: PgnPreviewGame,
  identities: {
    whitePlayerId: number | null;
    blackPlayerId: number | null;
    whiteFideId?: string | null;
    blackFideId?: string | null;
  },
) {
  const canonical = canonicalMoveFingerprintInput(game, identities);
  return canonical ? createHash("md5").update(canonical).digest("hex") : null;
}
