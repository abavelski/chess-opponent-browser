import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeGame } from "@lichess-org/pgn-viewer/pgn";

import { GameViewer } from "../app/games/[gameId]/game-viewer";

const annotatedPgn = [
  '[Event "Preparation"]',
  '[White "Player A"]',
  '[Black "Player B"]',
  '[Result "*"]',
  "",
  "1. e4 {[%clk 0:05:00] Central control} (1. d4 d5) 1... e5 2. Nf3 *",
].join("\n");

describe("Lichess PGN viewer integration", () => {
  it("parses stored PGN variations and annotations", () => {
    const game = makeGame(annotatedPgn);
    expect(game.mainline.map((move) => move.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(game.moves.children.map((child) => child.data.san)).toContain("d4");
    expect(game.mainline[0].comments).toContain("Central control");
    expect(game.players.white.name).toBe("Player A");
  });

  it("renders a stable React-owned host for compact and full-page games", () => {
    for (const compact of [false, true]) {
      const markup = renderToStaticMarkup(
        <GameViewer pgn={annotatedPgn} compact={compact} initialOrientation="black" />,
      );
      expect(markup).toContain('class="lichess-viewer-host"');
      expect(markup).toContain("Chess game replay");
      if (compact) expect(markup).toContain("compact-lichess-game-viewer");
    }
  });
});
