import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Chessboard } from "react-chessboard";

const startingFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("react-chessboard integration", () => {
  it("renders the library board and pieces from a FEN position", () => {
    const html = renderToStaticMarkup(
      <Chessboard
        options={{
          id: "smoke",
          position: startingFen,
          allowDragging: false,
          allowDrawingArrows: false,
          showAnimations: false,
        }}
      />,
    );

    expect(html).toContain('id="smoke-board"');
    expect(html).toContain('id="smoke-piece-wK-e1"');
    expect(html).toContain('id="smoke-piece-bK-e8"');
    expect(html).toContain('data-piece="wP"');
    expect(html).toContain('data-piece="bP"');
    expect(html).not.toContain("♔");
    expect(html).not.toContain("♚");
  });
});
