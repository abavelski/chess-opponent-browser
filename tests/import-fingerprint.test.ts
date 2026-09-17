import { describe, expect, it } from "vitest";

import {
  canonicalGameFingerprintInput,
  createGameFingerprint,
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
});
