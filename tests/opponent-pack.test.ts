import { describe, expect, it } from "vitest";

import { analyzeOpponentPack, normalizePackPlayerName } from "@/lib/imports/opponent-pack";
import { parsePgnPreview } from "@/lib/imports/pgn";

const pgn = `[Event "Pack"]
[White "Pack Player"]
[Black "Opponent One"]
[WhiteFideId "123456"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0

[Event "Pack"]
[White "Opponent Two"]
[Black " pack   player "]
[BlackFideId "123456"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1`;

describe("opponent pack analysis", () => {
  it("normalizes comma spacing consistently", () => {
    expect(normalizePackPlayerName("Nielsen ,  Jens")).toBe("nielsen,jens");
  });
  it("auto-detects the only normalized player present in every game", () => {
    const analysis = analyzeOpponentPack(parsePgnPreview(pgn));

    expect(analysis.suggestedNormalizedName).toBe("pack player");
    expect(analysis.candidates[0]).toMatchObject({
      normalizedName: "pack player",
      name: "Pack Player",
      fideId: "123456",
      gameCount: 2,
    });
  });

  it("does not guess when more than one player appears in every game", () => {
    const twoPlayerMatch = parsePgnPreview(`[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0`);
    expect(analyzeOpponentPack(twoPlayerMatch).suggestedNormalizedName).toBeNull();
  });
});
