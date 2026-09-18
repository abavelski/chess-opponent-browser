"use client";

import { useEffect, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";

import {
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
  compact?: boolean;
  initialOrientation?: "white" | "black";
};

type NotationLineProps = {
  replay: ReplayDocument;
  lineId: string;
  selected: ReplaySelection;
  onSelect: (selection: ReplaySelection) => void;
  depth?: number;
};

function notationPrefix(moveNumber: number, side: "white" | "black") {
  return side === "white" ? `${moveNumber}.` : `${moveNumber}...`;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA"
  );
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

export function GameViewer({
  replay,
  compact = false,
  initialOrientation = "white",
}: GameViewerProps) {
  const [selection, setSelection] = useState<ReplaySelection>(() => startSelection(replay));
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(initialOrientation);

  const currentLine = findReplayLine(replay, selection.lineId);
  const currentMove = selection.index >= 0 ? currentLine?.moves[selection.index] ?? null : null;
  const fen = selectionFen(replay, selection) ?? replay.initialFen;
  const previous = previousSelection(replay, selection);
  const next = nextSelection(replay, selection);
  const end = endSelection(replay);
  const atStart = selection.lineId === replay.mainLineId && selection.index === -1;
  const atEnd = selection.lineId === end.lineId && selection.index === end.index;
  const positionLabel = currentMove
    ? `${notationPrefix(currentMove.moveNumber, currentMove.side)} ${currentMove.san}`
    : "Starting position";
  const boardOptions = useMemo(
    () => ({
      id: compact ? "embedded-game-replay-board" : "game-replay-board",
      position: fen,
      boardOrientation,
      allowDragging: false,
      allowDrawingArrows: false,
      showNotation: true,
      showAnimations: true,
      animationDurationInMs: 140,
      boardStyle: {
        borderRadius: compact ? "0.4rem" : "0.65rem",
      },
    }),
    [boardOrientation, compact, fen],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.key === "ArrowLeft" && previous) {
        event.preventDefault();
        setSelection(previous);
      } else if (event.key === "ArrowRight" && next) {
        event.preventDefault();
        setSelection(next);
      } else if (event.key === "Home" && !atStart) {
        event.preventDefault();
        setSelection(startSelection(replay));
      } else if (event.key === "End" && !atEnd) {
        event.preventDefault();
        setSelection(end);
      } else if (key === "f") {
        event.preventDefault();
        setBoardOrientation((value) => (value === "white" ? "black" : "white"));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [atEnd, atStart, end, next, previous, replay]);

  return (
    <div className={`viewer-layout${compact ? " compact-viewer-layout" : ""}`}>
      <section aria-label="Chessboard and replay controls" className="board-column">
        <div
          aria-label={`Chess position: ${positionLabel}`}
          className="chessboard-library"
          role="img"
        >
          <Chessboard options={boardOptions} />
        </div>

        <div
          aria-label="Game navigation"
          className={`viewer-controls${compact ? " compact-viewer-controls" : ""}`}
        >
          <button
            aria-label="Go to beginning of game"
            className="viewer-control-button"
            disabled={atStart}
            onClick={() => setSelection(startSelection(replay))}
            title="Start (Home)"
            type="button"
          >
            {compact ? "⏮" : "⏮ Start"}
          </button>
          <button
            aria-label="Previous move"
            className="viewer-control-button"
            disabled={!previous}
            onClick={() => previous && setSelection(previous)}
            title="Previous move (Left arrow)"
            type="button"
          >
            {compact ? "←" : "← Previous"}
          </button>
          <button
            aria-label="Next move"
            className="viewer-control-button"
            disabled={!next}
            onClick={() => next && setSelection(next)}
            title="Next move (Right arrow)"
            type="button"
          >
            {compact ? "→" : "Next →"}
          </button>
          <button
            aria-label="Go to end of main line"
            className="viewer-control-button"
            disabled={atEnd}
            onClick={() => setSelection(end)}
            title="End (End)"
            type="button"
          >
            {compact ? "⏭" : "End ⏭"}
          </button>
          {compact ? (
            <button
              aria-label="Flip board orientation"
              className="viewer-control-button"
              onClick={() => setBoardOrientation((value) => (value === "white" ? "black" : "white"))}
              title="Flip board (F)"
              type="button"
            >
              Flip
            </button>
          ) : null}
        </div>

        {compact ? (
          <span aria-live="polite" className="compact-position-label">
            {positionLabel}
          </span>
        ) : (
          <div className="viewer-position-row">
            <span aria-live="polite" className="current-position-label">
              {positionLabel}
            </span>
            <button
              aria-label="Flip board orientation"
              className="text-button"
              onClick={() => setBoardOrientation((value) => (value === "white" ? "black" : "white"))}
              type="button"
            >
              Flip board
            </button>
          </div>
        )}
      </section>

      <section
        aria-label={compact ? "Game notation" : undefined}
        aria-labelledby={compact ? undefined : "notation-heading"}
        className="panel notation-panel"
      >
        {!compact ? (
          <div className="notation-heading-row">
            <div>
              <p className="eyebrow">Stored notation</p>
              <h2 id="notation-heading">Moves</h2>
            </div>
            <span className="muted">Click any move to jump</span>
          </div>
        ) : null}
        <div className={`notation-scroll${compact ? " compact-notation-scroll" : ""}`}>
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
