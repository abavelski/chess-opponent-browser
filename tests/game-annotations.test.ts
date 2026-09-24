import { describe, expect, it } from "vitest";

import { gameTimeControl, isUrlPlace, moveAnnotations } from "@/lib/games/annotations";
import { parsePgnPreview } from "@/lib/imports/pgn";

describe("game annotation display data", () => {
  it("reads the time control and move annotations preserved by PGN import", () => {
    const pgn = `[Event "Test"]
[Site "Copenhagen"]
[TimeControl "600+5"]
[White "A"]
[Black "B"]
[Result "*"]

1. e4 {[%clk 0:09:53] [%eval 0.32,18]} e5 {[%clk 0:09:51] [%eval #-3]} *`;
    const game = parsePgnPreview(pgn).games[0];

    expect(gameTimeControl(game.originalPgn)).toBe("600+5");
    expect(moveAnnotations(game.structuredMoves.mainline[0].comment ?? null)).toEqual({
      clock: "0:09:53",
      evaluation: "+0.32",
    });
    expect(moveAnnotations(game.structuredMoves.mainline[1].comment ?? null)).toEqual({
      clock: "0:09:51",
      evaluation: "#-3",
    });
  });

  it("omits missing details and recognizes URL places", () => {
    expect(gameTimeControl('[TimeControl "-"]')).toBeNull();
    expect(moveAnnotations("Ordinary comment")).toEqual({ clock: null, evaluation: null });
    expect(isUrlPlace("Copenhagen DEN")).toBe(false);
    expect(isUrlPlace("https://lichess.org/broadcast/round/1")).toBe(true);
    expect(isUrlPlace("Broadcast at lichess.org")).toBe(true);
  });
});
