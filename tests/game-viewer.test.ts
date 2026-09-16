import { describe, expect, it } from "vitest";

import {
  boardSquaresFromFen,
  buildReplayDocument,
  endSelection,
  findReplayLine,
  initialFen,
  nextSelection,
  previousSelection,
  selectionFen,
  startSelection,
} from "../lib/games/viewer";

const structuredGame = {
  version: 1,
  mainline: [
    { san: "e4", uci: "e2e4" },
    { san: "c6", uci: "c7c6" },
    {
      san: "d4",
      uci: "d2d4",
      comment: "Stored preparation comment.",
      variations: [
        {
          moves: [
            { san: "Nc3", uci: "b1c3" },
            { san: "d5", uci: "d7d5" },
          ],
        },
      ],
    },
    { san: "d5", uci: "d7d5" },
    { san: "Nc3", uci: "b1c3" },
  ],
};

function replay() {
  const value = buildReplayDocument(structuredGame);
  if (!value) throw new Error("Expected fixture replay document.");
  return value;
}

describe("game viewer replay adapter", () => {
  it("starts at the standard initial position and advances within bounds", () => {
    const document = replay();
    const start = startSelection(document);

    expect(selectionFen(document, start)).toBe(initialFen);
    expect(previousSelection(document, start)).toBeNull();

    const first = nextSelection(document, start);
    expect(first).toEqual({ lineId: "main", index: 0 });
    expect(selectionFen(document, first!)).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    );

    expect(previousSelection(document, first!)).toEqual(start);
  });

  it("jumps to known main-line positions and stops at the end", () => {
    const document = replay();
    const end = endSelection(document);

    expect(end).toEqual({ lineId: "main", index: 4 });
    expect(nextSelection(document, end)).toBeNull();
    expect(selectionFen(document, { lineId: "main", index: 1 })).toBe(
      "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    );
  });

  it("builds an independent variation from the position before its parent move", () => {
    const document = replay();
    const variation = findReplayLine(document, "main.2.v0");

    expect(variation?.anchorFen).toBe(
      "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
    );
    expect(variation?.moves[0].fen).toBe(
      "rnbqkbnr/pp1ppppp/2p5/8/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2",
    );
    expect(previousSelection(document, { lineId: "main.2.v0", index: 0 })).toEqual({
      lineId: "main",
      index: 1,
    });
  });

  it("preserves comments on the move that owns them", () => {
    const document = replay();
    const main = findReplayLine(document, "main");

    expect(main?.moves[2]).toMatchObject({
      san: "d4",
      comment: "Stored preparation comment.",
      variationLineIds: ["main.2.v0"],
    });
  });

  it("rejects corrupt structured move data into the unavailable path", () => {
    expect(buildReplayDocument({ version: 1, mainline: [{ san: "e4", uci: "bad" }] })).toBeNull();
    expect(
      buildReplayDocument({ version: 1, mainline: [{ san: "e4", uci: "e3e4" }] }),
    ).toBeNull();
    expect(buildReplayDocument({ version: 2, mainline: [] })).toBeNull();
  });

  it("maps FEN board squares for rendering", () => {
    const squares = boardSquaresFromFen(initialFen);

    expect(squares).toHaveLength(64);
    expect(squares[0]).toEqual({ square: "a8", piece: "r" });
    expect(squares[63]).toEqual({ square: "h1", piece: "R" });
  });
});
