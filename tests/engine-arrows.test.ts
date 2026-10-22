import { describe, expect, it } from "vitest";
import { ENGINE_ARROW_BRUSH, ENGINE_ARROW_WIDTHS, engineArrowShapes, engineArrowWidth } from "../lib/games/engine-arrows";
import type { EngineLine } from "../lib/games/browser-stockfish";

function line(multiPv: number, move: string): EngineLine {
  return { multiPv, depth: 12, score: "+0.20", cp: 20, mate: null, pv: [move] };
}

describe("Stockfish variation arrows", () => {
  it("uses Chessground automatic shapes with a grey brush for the first PV moves", () => {
    const shapes = engineArrowShapes([line(3, "b1c3"), line(1, "g1f3"), line(2, "e2e4")]);
    expect(shapes).toEqual([
      { orig: "g1", dest: "f3", brush: ENGINE_ARROW_BRUSH, modifiers: { lineWidth: 12 } },
      { orig: "e2", dest: "e4", brush: ENGINE_ARROW_BRUSH, modifiers: { lineWidth: 8 } },
      { orig: "b1", dest: "c3", brush: ENGINE_ARROW_BRUSH, modifiers: { lineWidth: 4 } },
    ]);
  });

  it("makes the first arrow thicker than the second, and the third thinnest", () => {
    expect(ENGINE_ARROW_WIDTHS).toEqual([12, 8, 4]);
    expect(engineArrowWidth(1)).toBeGreaterThan(engineArrowWidth(2));
    expect(engineArrowWidth(2)).toBeGreaterThan(engineArrowWidth(3));
    // Invalid and future multipv indices fall back to an existing stroke.
    expect(engineArrowWidth(0)).toBe(12);
    expect(engineArrowWidth(4)).toBe(4);
  });

  it("keeps the top-ranked line width when two variations share the same move", () => {
    const shapes = engineArrowShapes([
      line(3, "g1f3"),
      line(2, "e2e4"),
      line(1, "g1f3"),
    ]);
    expect(shapes).toEqual([
      { orig: "g1", dest: "f3", brush: ENGINE_ARROW_BRUSH, modifiers: { lineWidth: 12 } },
      { orig: "e2", dest: "e4", brush: ENGINE_ARROW_BRUSH, modifiers: { lineWidth: 8 } },
    ]);
  });

  it("deduplicates equivalent moves and rejects bad UCI input", () => {
    expect(engineArrowShapes([
      line(1, "e7e8q"),
      line(2, "e7e8n"),
      line(3, "oops"),
      line(4, "h2h4"),
    ])).toEqual([
      { orig: "e7", dest: "e8", brush: ENGINE_ARROW_BRUSH, modifiers: { lineWidth: 12 } },
      { orig: "h2", dest: "h4", brush: ENGINE_ARROW_BRUSH, modifiers: { lineWidth: 4 } },
    ]);
    expect(engineArrowShapes([])).toEqual([]);
  });
});
