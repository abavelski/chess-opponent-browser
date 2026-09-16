import { describe, expect, it } from "vitest";

import { buildReplayDocument } from "@/lib/games/viewer";
import {
  MAX_PGN_BYTES,
  parsePgnPreview,
  validatePgnUploadMetadata,
} from "@/lib/imports/pgn";

const annotatedPgn = `[Event "Preview Cup"]
[Site "Copenhagen DEN"]
[Date "2026.09.16"]
[Round "1"]
[White "Jan Kowalski"]
[Black "Anna Nowak"]
[WhiteElo "2140"]
[BlackElo "2210"]
[WhiteFideId "99000001"]
[BlackFideId "99000002"]
[Result "1-0"]
[ECO "C50"]
[Opening "Italian Game"]
[CustomArchiveKey "abc-123"]

1. e4 {King pawn opening} e5 2. Nf3 (2. Bc4 {Italian idea} Nc6 (2... Nf6)) Nc6 3. Bc4 1-0`;

const secondPgn = `[Event "Second Game"]
[White "Marta Lewandowska"]
[Black "Tomas Eriksen"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 1/2-1/2`;

describe("PGN import preview parser", () => {
  it("parses multiple games and keeps optional metadata", () => {
    const preview = parsePgnPreview(`${annotatedPgn}\n\n${secondPgn}`);

    expect(preview.gamesFound).toBe(2);
    expect(preview.errors).toEqual([]);
    expect(preview.games).toHaveLength(2);
    expect(preview.games[0]).toMatchObject({
      white: "Jan Kowalski",
      black: "Anna Nowak",
      whiteRating: 2140,
      blackRating: 2210,
      whiteFideId: "99000001",
      blackFideId: "99000002",
      playedOn: "2026-09-16",
      result: "1-0",
      eco: "C50",
      opening: "Italian Game",
    });
    expect(preview.games[0].tags.CustomArchiveKey).toBe("abc-123");
    expect(preview.games[1].playedOn).toBeNull();
    expect(preview.games[1].whiteRating).toBeNull();
  });

  it("preserves comments, recursive variations, original PGN, and viewer-compatible moves", () => {
    const preview = parsePgnPreview(annotatedPgn);
    const game = preview.games[0];

    expect(game.originalPgn).toContain('[CustomArchiveKey "abc-123"]');
    expect(game.structuredMoves.mainline[0]).toMatchObject({
      san: "e4",
      uci: "e2e4",
      comment: "King pawn opening",
    });

    const knight = game.structuredMoves.mainline[2];
    expect(knight.uci).toBe("g1f3");
    expect(knight.variations?.[0].moves[0]).toMatchObject({
      san: "Bc4",
      uci: "f1c4",
      comment: "Italian idea",
    });
    expect(knight.variations?.[0].moves[1].variations?.[0].moves[0]).toMatchObject({
      san: "Nf6",
      uci: "g8f6",
    });

    const replay = buildReplayDocument(game.structuredMoves);
    expect(replay).not.toBeNull();
    expect(replay?.lines.length).toBe(3);
  });

  it("recovers valid sibling games when one segmented game is malformed", () => {
    const malformed = `[Event "Broken"]
[White "Broken White"]
[Black "Broken Black"]
[Result "*"]

1. e4 e5 2. Qh9 *`;
    const preview = parsePgnPreview(`${secondPgn}\n\n${malformed}\n\n${annotatedPgn}`);

    expect(preview.gamesFound).toBe(3);
    expect(preview.games).toHaveLength(2);
    expect(preview.errors).toHaveLength(1);
    expect(preview.errors[0].index).toBe(2);
    expect(preview.errors[0].message).toContain("Qh9");
  });

  it("rejects empty and clearly binary input", () => {
    expect(() => parsePgnPreview("  \n\t")).toThrow("empty");
    expect(() => parsePgnPreview("[White \"A\"]\u0000[Black \"B\"]")).toThrow("text PGN");
  });

  it("validates upload metadata and the bounded serverless-safe limit", () => {
    expect(
      validatePgnUploadMetadata({ filename: "games.pgn", size: 1024, sourceLabel: "" }),
    ).toEqual({ ok: true, sourceLabel: "Manual" });
    expect(
      validatePgnUploadMetadata({ filename: "games.txt", size: 1024, sourceLabel: "Manual" }),
    ).toMatchObject({ ok: false });
    expect(
      validatePgnUploadMetadata({
        filename: "games.pgn",
        size: MAX_PGN_BYTES + 1,
        sourceLabel: "Manual",
      }),
    ).toEqual({ ok: false, message: "The PGN file is too large. Maximum size is 3 MB." });
  });

  it("reports unsupported custom starting positions per game", () => {
    const custom = `[Event "Custom"]
[White "A"]
[Black "B"]
[SetUp "1"]
[FEN "8/8/8/8/8/8/4K3/4k3 w - - 0 1"]
[Result "*"]

1. Kf3 *`;
    const preview = parsePgnPreview(`${secondPgn}\n\n${custom}`);
    expect(preview.games).toHaveLength(1);
    expect(preview.errors).toHaveLength(1);
    expect(preview.errors[0].message).toContain("Custom starting positions");
  });
});
