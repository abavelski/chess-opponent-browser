"use client";

import { useEffect, useRef } from "react";
import LichessPgnViewer from "@lichess-org/pgn-viewer";

type GameViewerProps = {
  pgn: string;
  compact?: boolean;
  initialOrientation?: "white" | "black";
};

type Viewer = ReturnType<typeof LichessPgnViewer>;
type Shortcut = "first" | "prev" | "next" | "last" | "flip";

export function gameViewerOptions(
  pgn: string,
  orientation: "white" | "black",
): Parameters<typeof LichessPgnViewer>[1] {
  return {
    pgn,
    orientation,
    showPlayers: false, // The page already displays the matchup and ratings.
    showMoves: "right", // Full score beside the board, including variations and comments.
    showControls: true,
    showClocks: true,
    keyboardToMove: false, // Window shortcuts below work even without board focus.
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
      target.closest("input, textarea, select, [contenteditable='true'], [role='textbox'], [role='menu'], [role='dialog']"),
  );
}

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

    // Lichess replaces its mount node. Keep it inside a React-owned host so
    // switching games and Strict Mode cleanup never remove React's DOM.
    host.replaceChildren();
    let viewer: Viewer | null = null;

    try {
      const mount = document.createElement("div");
      host.appendChild(mount);
      viewer = LichessPgnViewer(mount, gameViewerOptions(pgn, initialOrientation));
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
  }, [pgn, initialOrientation]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const viewer = viewerRef.current;
      if (!viewer || isEditingTarget(event.target)) return;
      const shortcut = replayShortcut(event);
      if (!shortcut) return;

      event.preventDefault();
      if (shortcut === "flip") viewer.flip();
      else viewer.goTo(shortcut, false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <section
      aria-label="Chess game replay"
      className={"lichess-game-viewer" + (compact ? " compact-lichess-game-viewer" : "")}
    >
      <div className="lichess-viewer-host" ref={hostRef} />
      <p className="lichess-viewer-help">
        ← / → moves · Home / End first / last · F flips · Right-drag to draw arrows ·
        Right-click a square to mark it
      </p>
    </section>
  );
}
