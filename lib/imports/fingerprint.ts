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
