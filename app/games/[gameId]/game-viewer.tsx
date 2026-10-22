"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import LichessPgnViewer from "@lichess-org/pgn-viewer";

type GameViewerProps = {
  pgn: string;
  compact?: boolean;
  initialOrientation?: "white" | "black";
};

type Viewer = ReturnType<typeof LichessPgnViewer>;

export function GameViewer({
  pgn,
  compact = false,
  initialOrientation = "white",
}: GameViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Lichess replaces its mount node. Keep that node inside a React-owned host
    // so changing games and Strict Mode cleanup never remove React's DOM.
    host.replaceChildren();
    let viewer: Viewer | null = null;

    try {
      const mount = document.createElement("div");
      host.appendChild(mount);
      viewer = LichessPgnViewer(mount, {
        pgn,
        orientation: initialOrientation,
        showPlayers: false,
        showMoves: compact ? "bottom" : "auto",
        showControls: true,
        showClocks: true,
        keyboardToMove: true,
        scrollToMove: false,
        lichess: false,
        menu: {
          getPgn: { enabled: true },
          analysisBoard: { enabled: false },
          practiceWithComputer: { enabled: false },
        },
      });
      viewerRef.current = viewer;
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
  }, [pgn, compact, initialOrientation]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']"))
    ) return;

    // Lichess handles Left/Right/F itself. Preserve the old Home/End shortcuts.
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      viewerRef.current?.goTo(event.key === "Home" ? "first" : "last");
    }
  }

  return (
    <section
      aria-label="Chess game replay"
      className={"lichess-game-viewer" + (compact ? " compact-lichess-game-viewer" : "")}
      onKeyDownCapture={handleKeyDown}
    >
      <div className="lichess-viewer-host" ref={hostRef} />
      <p className="lichess-viewer-help">
        Select a move or variation to replay it. Use ← / → to navigate, Home / End for first / last,
        and F or the viewer menu to flip the board.
      </p>
    </section>
  );
}
