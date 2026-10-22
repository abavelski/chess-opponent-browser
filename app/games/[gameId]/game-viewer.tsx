"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import LichessPgnViewer from "@lichess-org/pgn-viewer";

import { LichessFlipIcon } from "./lichess-flip-icon";

type GameViewerProps = {
  pgn: string;
  compact?: boolean;
  initialOrientation?: "white" | "black";
};

type Viewer = ReturnType<typeof LichessPgnViewer>;
type Shortcut = "first" | "prev" | "next" | "last" | "flip";
type Navigation = { first: boolean; prev: boolean; next: boolean; last: boolean };
type ResizeStart = { pointerId: number; x: number; y: number; size: number };

const minimumBoardSize = 220;
const maximumBoardSize = 640;
const stackedBreakpoint = 672;

export function constrainedBoardSize(requested: number, availableWidth: number) {
  if (availableWidth <= 0) return Math.max(minimumBoardSize, Math.min(maximumBoardSize, requested));
  const stacked = availableWidth <= stackedBreakpoint;
  const max = Math.max(
    Math.min(minimumBoardSize, availableWidth),
    Math.min(
      maximumBoardSize,
      stacked ? availableWidth : Math.min(Math.floor(availableWidth * 0.58), availableWidth - 240),
    ),
  );
  return Math.max(Math.min(minimumBoardSize, max), Math.min(max, requested));
}

export function gameViewerOptions(
  pgn: string,
  orientation: "white" | "black",
): Parameters<typeof LichessPgnViewer>[1] {
  return {
    pgn,
    orientation,
    showPlayers: false,
    showMoves: "right",
    showControls: false, // Five dedicated controls live under the notation panel.
    showClocks: true,
    keyboardToMove: false, // Window shortcuts work without board focus.
    scrollToMove: false,
    drawArrows: true, // Chessground right-drag arrows and right-click circles.
    lichess: false,
    menu: {
      getPgn: { enabled: true },
      analysisBoard: { enabled: false },
      practiceWithComputer: { enabled: false },
    },
  };
}

export function replayShortcut(
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "defaultPrevented">,
): Shortcut | null {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey && key !== "f") return null;
  switch (key) {
    case "arrowleft":
      return "prev";
    case "arrowright":
      return "next";
    case "home":
      return "first";
    case "end":
      return "last";
    case "f":
      return "flip";
    default:
      return null; // ArrowUp/Down and J/K remain opponent-game shortcuts.
  }
}

function isEditingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(
    target.isContentEditable ||
      target.closest("input, textarea, select, [contenteditable='true'], [role='textbox'], [role='menu'], [role='dialog'], [data-board-resize]"),
  );
}

const initialNavigation: Navigation = { first: false, prev: false, next: true, last: true };

function navigationState(viewer: Viewer): Navigation {
  const previous = viewer.canGoTo("prev");
  const next = viewer.canGoTo("next");
  const end = viewer.game.pathAtMainlinePly("last");
  return { first: previous, prev: previous, next, last: !viewer.path.equals(end) };
}

function NavigationIcon({ action }: { action: Exclude<Shortcut, "flip"> }) {
  const direction = action === "first" || action === "prev" ? "left" : "right";
  const edge = action === "first" || action === "last";
  return (
    <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left" ? (
        <>
          <path d={edge ? "m19 5-7 7 7 7" : "m15 5-7 7 7 7"} />
          {edge ? <path d="m11 5-7 7 7 7" /> : null}
        </>
      ) : (
        <>
          <path d={edge ? "m5 5 7 7-7 7" : "m9 5 7 7-7 7"} />
          {edge ? <path d="m13 5 7 7-7 7" /> : null}
        </>
      )}
    </svg>
  );
}

export function GameViewer({
  pgn,
  compact = false,
  initialOrientation = "white",
}: GameViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dragRef = useRef<ResizeStart | null>(null);
  const [boardSize, setBoardSize] = useState(compact ? 384 : 448);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [navigation, setNavigation] = useState<Navigation>(initialNavigation);
  const actualBoardSize = constrainedBoardSize(boardSize, availableWidth);
  const isStacked = availableWidth > 0 && availableWidth <= stackedBreakpoint;

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver((entries) => {
      setAvailableWidth(entries[0].contentRect.width);
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Lichess replaces its mount node. Keep it inside a React-owned host
    // so switching games and Strict Mode cleanup never remove React's DOM.
    host.replaceChildren();
    let viewer: Viewer | null = null;

    try {
      const mount = document.createElement("div");
      host.appendChild(mount);
      viewer = LichessPgnViewer(mount, gameViewerOptions(pgn, initialOrientation));
      viewerRef.current = viewer;
      const mountedViewer = viewer;
      const originalToPath = viewer.toPath;
      viewer.toPath = (path, focus) => {
        originalToPath(path, focus);
        setNavigation(navigationState(mountedViewer));
      };
    } catch (cause) {
      host.replaceChildren();
      const message = document.createElement("p");
      message.className = "lichess-viewer-error";
      message.setAttribute("role", "alert");
      message.textContent =
        "Unable to display this PGN: " + (cause instanceof Error ? cause.message : String(cause));
      host.appendChild(message);
    }

    return () => {
      viewerRef.current = null;
      viewer?.ground?.destroy();
      host.replaceChildren();
    };
  }, [pgn, initialOrientation]);

  function navigate(action: Shortcut) {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (action === "flip") viewer.flip();
    else viewer.goTo(action, false);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!viewerRef.current || isEditingTarget(event.target)) return;
      const action = replayShortcut(event);
      if (!action) return;
      event.preventDefault();
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (action === "flip") viewer.flip();
      else viewer.goTo(action, false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, size: actualBoardSize };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = Math.max(event.clientX - drag.x, event.clientY - drag.y);
    setBoardSize(constrainedBoardSize(drag.size + delta, availableWidth));
  }

  function stopResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const change = event.key === "ArrowRight" || event.key === "ArrowDown" ? 24
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -24 : 0;
    if (!change && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    event.stopPropagation();
    setBoardSize(constrainedBoardSize(
      event.key === "Home" ? minimumBoardSize : event.key === "End" ? maximumBoardSize : actualBoardSize + change,
      availableWidth,
    ));
  }

  const style = { "--replay-board-size": actualBoardSize + "px" } as CSSProperties;

  return (
    <section
      aria-label="Chess game replay"
      className={"lichess-game-viewer" + (compact ? " compact-lichess-game-viewer" : "")}
      style={style}
    >
      <div className="replay-workspace" ref={workspaceRef}>
        <div className="lichess-viewer-host" ref={hostRef} />
        <div className="replay-board-resize-region">
          <button
            aria-label="Resize chessboard"
            className="replay-board-resize-handle"
            data-board-resize
            onKeyDown={resizeWithKeyboard}
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            onLostPointerCapture={() => { dragRef.current = null; }}
            title="Drag to resize the chessboard"
            type="button"
          >
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 15 15 8M12 15l3-3M4 15 15 4" />
            </svg>
          </button>
        </div>
        <div aria-label="Game navigation" className="replay-notation-controls" role="group">
          {(["first", "prev", "next", "last"] as const).map((action) => (
            <button
              aria-label={{
                first: "Go to beginning of game",
                prev: "Previous move",
                next: "Next move",
                last: "Go to end of game",
              }[action]}
              className="replay-navigation-button"
              disabled={!navigation[action]}
              key={action}
              onClick={() => navigate(action)}
              title={{
                first: "Start (Home)",
                prev: "Previous (←)",
                next: "Next (→)",
                last: "End (End)",
              }[action]}
              type="button"
            >
              <NavigationIcon action={action} />
            </button>
          ))}
          <button
            aria-label="Flip board orientation"
            className="replay-navigation-button"
            onClick={() => navigate("flip")}
            title="Flip board (F)"
            type="button"
          >
            <LichessFlipIcon />
          </button>
        </div>
      </div>
      <p className="lichess-viewer-help">
        {isStacked ? "Drag the board corner to resize. " : ""}
        ← / → moves · Home / End first / last · F flips · Right-drag for arrows · Right-click to highlight
      </p>
    </section>
  );
}
