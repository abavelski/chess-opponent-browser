import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeGame } from "@lichess-org/pgn-viewer/pgn";

import { GameViewer, gameViewerOptions, replayShortcut } from "../app/games/[gameId]/game-viewer";

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

  it("keeps the full notation to the right and enables Chessground drawing", () => {
    const options = gameViewerOptions(annotatedPgn, "black");

    expect(options.showMoves).toBe("right");
    expect(options.orientation).toBe("black");
    expect(options.drawArrows).toBe(true);
    expect(options.showControls).toBe(true);
    expect(options.keyboardToMove).toBe(false);
    expect(options.pgn).toBe(annotatedPgn);
  });

  it("restores navigation and flip keys without consuming game-selection keys", () => {
    function shortcut(key: string, modifiers: Partial<Parameters<typeof replayShortcut>[0]> = {}) {
      return replayShortcut({
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        defaultPrevented: false,
        ...modifiers,
      });
    }

    expect(shortcut("ArrowLeft")).toBe("prev");
    expect(shortcut("ArrowRight")).toBe("next");
    expect(shortcut("Home")).toBe("first");
    expect(shortcut("End")).toBe("last");
    expect(shortcut("f")).toBe("flip");
    expect(shortcut("F", { shiftKey: true })).toBe("flip");

    for (const key of ["ArrowUp", "ArrowDown", "j", "k"]) {
      expect(shortcut(key)).toBeNull();
    }
    expect(shortcut("ArrowRight", { ctrlKey: true })).toBeNull();
    expect(shortcut("ArrowRight", { shiftKey: true })).toBeNull();
    expect(shortcut("f", { defaultPrevented: true })).toBeNull();
    expect(shortcut("Home", { metaKey: true })).toBeNull();
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
