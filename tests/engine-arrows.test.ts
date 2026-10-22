import { describe, expect, it } from "vitest";
import { ENGINE_ARROW_BRUSH, engineArrowShapes } from "../lib/games/engine-arrows";
import type { EngineLine } from "../lib/games/browser-stockfish";

function line(multiPv: number, move: string): EngineLine {
  return { multiPv, depth: 12, score: "+0.20", cp: 20, mate: null, pv: [move] };
}

describe("Stockfish variation arrows", () => {
  it("uses Chessground automatic shapes with a grey brush for the first PV moves", () => {
    const shapes = engineArrowShapes([line(3, "b1c3"), line(1, "g1f3"), line(2, "e2e4")]);
    expect(shapes).toEqual([
      { orig: "g1", dest: "f3", brush: ENGINE_ARROW_BRUSH },
      { orig: "e2", dest: "e4", brush: ENGINE_ARROW_BRUSH },
      { orig: "b1", dest: "c3", brush: ENGINE_ARROW_BRUSH },
    ]);
  });

  it("deduplicates equivalent moves and rejects bad UCI input", () => {
    expect(engineArrowShapes([
      line(1, "e7e8q"),
      line(2, "e7e8n"),
      line(3, "oops"),
      line(4, "h2h4"),
    ])).toEqual([
      { orig: "e7", dest: "e8", brush: ENGINE_ARROW_BRUSH },
      { orig: "h2", dest: "h4", brush: ENGINE_ARROW_BRUSH },
    ]);
    expect(engineArrowShapes([])).toEqual([]);
  });
});
