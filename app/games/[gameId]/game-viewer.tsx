"use client";

import { useMemo, useState } from "react";

import {
  boardSquaresFromFen,
  endSelection,
  findReplayLine,
  nextSelection,
  previousSelection,
  selectionFen,
  startSelection,
  type ReplayDocument,
  type ReplaySelection,
} from "@/lib/games/viewer";

type GameViewerProps = {
  replay: ReplayDocument;
};

type NotationLineProps = {
  replay: ReplayDocument;
  lineId: string;
  selected: ReplaySelection;
  onSelect: (selection: ReplaySelection) => void;
  depth?: number;
};

const pieceGlyphs: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const pieceNames: Record<string, string> = {
  K: "White king",
  Q: "White queen",
  R: "White rook",
  B: "White bishop",
  N: "White knight",
  P: "White pawn",
  k: "Black king",
  q: "Black queen",
  r: "Black rook",
  b: "Black bishop",
  n: "Black knight",
  p: "Black pawn",
};

function notationPrefix(moveNumber: number, side: "white" | "black") {
  return side === "white" ? `${moveNumber}.` : `${moveNumber}...`;
}

function NotationLine({ replay, lineId, selected, onSelect, depth = 0 }: NotationLineProps) {
  const line = findReplayLine(replay, lineId);
  if (!line) return null;

  return (
    <div className={depth === 0 ? "notation-line" : "notation-line variation-line"}>
      {line.moves.map((move, index) => {
        const isSelected = selected.lineId === line.id && selected.index === index;
        return (
          <div className="notation-node" key={move.id}>
            <button
              aria-current={isSelected ? "step" : undefined}
              className={`notation-move${isSelected ? " is-current" : ""}`}
              onClick={() => onSelect({ lineId: line.id, index })}
              type="button"
            >
              <span className="notation-number">{notationPrefix(move.moveNumber, move.side)}</span>
              <span>{move.san}</span>
            </button>

            {move.comment ? <p className="move-comment">{move.comment}</p> : null}

            {move.variationLineIds.map((variationLineId) => (
              <div className="variation-block" key={variationLineId}>
                <span className="variation-label">Variation</span>
                <NotationLine
                  depth={depth + 1}
                  lineId={variationLineId}
                  onSelect={onSelect}
                  replay={replay}
                  selected={selected}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function GameViewer({ replay }: GameViewerProps) {
  const [selection, setSelection] = useState<ReplaySelection>(() => startSelection(replay));
  const [flipped, setFlipped] = useState(false);

  const currentLine = findReplayLine(replay, selection.lineId);
  const currentMove = selection.index >= 0 ? currentLine?.moves[selection.index] ?? null : null;
  const fen = selectionFen(replay, selection) ?? replay.initialFen;
  const squares = useMemo(() => boardSquaresFromFen(fen), [fen]);
  const displaySquares = flipped ? [...squares].reverse() : squares;
  const previous = previousSelection(replay, selection);
  const next = nextSelection(replay, selection);
  const end = endSelection(replay);
  const atStart = selection.lineId === replay.mainLineId && selection.index === -1;
  const atEnd = selection.lineId === end.lineId && selection.index === end.index;
  const positionLabel = currentMove
    ? `${notationPrefix(currentMove.moveNumber, currentMove.side)} ${currentMove.san}`
    : "Starting position";

  return (
    <div className="viewer-layout">
      <section aria-label="Chessboard and replay controls" className="board-column">
        <div aria-label={`Chess position: ${positionLabel}`} className="chessboard" role="img">
          {displaySquares.map(({ square, piece }) => {
            const fileIndex = square.charCodeAt(0) - 97;
            const rank = Number(square[1]);
            const isDark = (fileIndex + rank) % 2 === 1;
            return (
              <div
                aria-label={piece ? `${square}: ${pieceNames[piece]}` : `${square}: empty`}
                className={`board-square ${isDark ? "dark-square" : "light-square"}`}
                key={square}
              >
                <span aria-hidden="true" className="board-piece">
                  {piece ? pieceGlyphs[piece] : ""}
                </span>
                <span aria-hidden="true" className="square-coordinate">
                  {square}
                </span>
              </div>
            );
          })}
        </div>

        <div aria-label="Game navigation" className="viewer-controls">
          <button
            aria-label="Go to beginning of game"
            className="viewer-control-button"
            disabled={atStart}
            onClick={() => setSelection(startSelection(replay))}
            type="button"
          >
            ⏮ Start
          </button>
          <button
            aria-label="Previous move"
            className="viewer-control-button"
            disabled={!previous}
            onClick={() => previous && setSelection(previous)}
            type="button"
          >
            ← Previous
          </button>
          <button
            aria-label="Next move"
            className="viewer-control-button"
            disabled={!next}
            onClick={() => next && setSelection(next)}
            type="button"
          >
            Next →
          </button>
          <button
            aria-label="Go to end of main line"
            className="viewer-control-button"
            disabled={atEnd}
            onClick={() => setSelection(end)}
            type="button"
          >
            End ⏭
          </button>
        </div>

        <div className="viewer-position-row">
          <span aria-live="polite" className="current-position-label">
            {positionLabel}
          </span>
          <button
            aria-label="Flip board orientation"
            className="text-button"
            onClick={() => setFlipped((value) => !value)}
            type="button"
          >
            Flip board
          </button>
        </div>
      </section>

      <section aria-labelledby="notation-heading" className="panel notation-panel">
        <div className="notation-heading-row">
          <div>
            <p className="eyebrow">Stored notation</p>
            <h2 id="notation-heading">Moves</h2>
          </div>
          <span className="muted">Click any move to jump</span>
        </div>
        <div className="notation-scroll">
          <NotationLine
            lineId={replay.mainLineId}
            onSelect={setSelection}
            replay={replay}
            selected={selection}
          />
        </div>
      </section>
    </div>
  );
}
