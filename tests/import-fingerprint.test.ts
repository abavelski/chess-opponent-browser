import { describe, expect, it } from "vitest";

import {
  canonicalGameFingerprintInput,
  canonicalMoveFingerprintInput,
  createGameFingerprint,
  createMoveFingerprint,
  normalizeFingerprintName,
} from "@/lib/imports/fingerprint";
import { parsePgnPreview } from "@/lib/imports/pgn";

const basePgn = `[Event "Fingerprint Cup"]
[Date "2026.09.17"]
[White "Alice Smith"]
[Black "Bob Jones"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0`;

const formattingVariant = `[Black "Bob Jones"]
[Result "1-0"]
[White "  Alice   Smith "]
[Date "2026.09.17"]
[Event "Different header ordering is irrelevant"]

1. e4 {comment ignored} e5 2. Nf3 (2. Bc4 Nc6) Nc6 3. Bc4 Nf6 1-0`;

function firstGame(pgn: string) {
  const preview = parsePgnPreview(pgn);
  expect(preview.errors).toEqual([]);
  expect(preview.games).toHaveLength(1);
  return preview.games[0];
}

describe("Task 008 game fingerprint", () => {
  it("normalizes only irrelevant name whitespace/case", () => {
    expect(normalizeFingerprintName("  ALICE   Smith ")).toBe("alice smith");
  });

  it("ignores header ordering, comments, annotations, variations, and whitespace", () => {
    expect(createGameFingerprint(firstGame(formattingVariant))).toBe(
      createGameFingerprint(firstGame(basePgn)),
    );
  });

  it("does not collapse games with different main-line moves", () => {
    const different = `[Event "Fingerprint Cup"]
[Date "2026.09.17"]
[White "Alice Smith"]
[Black "Bob Jones"]
[Result "1-0"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 1-0`;

    expect(createGameFingerprint(firstGame(different))).not.toBe(
      createGameFingerprint(firstGame(basePgn)),
    );
  });

  it("fails safe for short undated games", () => {
    const undatedShort = `[White "Alice Smith"]
[Black "Bob Jones"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 1/2-1/2`;

    const game = firstGame(undatedShort);
    expect(canonicalGameFingerprintInput(game)).toBeNull();
    expect(createGameFingerprint(game)).toBeNull();
  });

  it("fingerprints sufficiently long undated games deterministically", () => {
    const undatedLong = `[White "Alice Smith"]
[Black "Bob Jones"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 1/2-1/2`;

    expect(createGameFingerprint(firstGame(undatedLong))).toMatch(/^[0-9a-f]{32}$/);
  });

  it("recognizes the same resolved game despite a different source date", () => {
    const longGame = firstGame(`[White "Alice Smith"]
[Black "Bob Jones"]
[Date "2026.09.17"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 1/2-1/2`);
    const differentDate = firstGame(longGame.originalPgn.replace("2026.09.17", "2026.09.22"));
    const identities = { whitePlayerId: 10, blackPlayerId: 20 };

    expect(createMoveFingerprint(longGame, identities)).toBe(
      createMoveFingerprint(differentDate, identities),
    );
    expect(createGameFingerprint(longGame)).not.toBe(createGameFingerprint(differentDate));
  });

  it("uses FIDE identities and fails safe for short or unresolved games", () => {
    const shortGame = firstGame(basePgn);
    shortGame.whiteFideId = "123";
    shortGame.blackFideId = "456";
    expect(canonicalMoveFingerprintInput(shortGame, {
      whitePlayerId: null,
      blackPlayerId: null,
    })).toBeNull();

    const longGame = firstGame(`[White "Alice Smith"]
[Black "Bob Jones"]
[WhiteFideId "123"]
[BlackFideId "456"]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 1/2-1/2`);
    expect(createMoveFingerprint(longGame, {
      whitePlayerId: null,
      blackPlayerId: null,
    })).toMatch(/^[0-9a-f]{32}$/);
  });
});
