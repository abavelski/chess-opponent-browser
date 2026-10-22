import type { DrawShape } from "@lichess-org/chessground/draw";
import type { EngineLine } from "./browser-stockfish";

export const ENGINE_ARROW_BRUSH = "engineGrey";

// The arrows are Chessground auto-shapes, separate from both user markings and
// Lichess's PGN annotations. Show only the first move of each principal variation.
export function engineArrowShapes(lines: EngineLine[]): DrawShape[] {
  const seen = new Set<string>();
  return [...lines]
    .sort((a, b) => a.multiPv - b.multiPv)
    .flatMap((line) => {
      const move = line.pv[0];
      if (!move || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move) || seen.has(move.slice(0, 4))) {
        return [];
      }
      seen.add(move.slice(0, 4));
      return [{
        orig: move.slice(0, 2) as DrawShape["orig"],
        dest: move.slice(2, 4) as DrawShape["dest"],
        brush: ENGINE_ARROW_BRUSH,
      }];
    });
}
