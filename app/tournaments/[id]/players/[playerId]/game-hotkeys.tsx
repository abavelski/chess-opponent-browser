"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type GameSelectionHotkeysProps = {
  gameIds: number[];
  gameHrefs: string[];
  selectedGameId: number | null;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "SELECT" ||
    target.tagName === "TEXTAREA"
  );
}

export function GameSelectionHotkeys({
  gameIds,
  gameHrefs,
  selectedGameId,
}: GameSelectionHotkeysProps) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }

      const selectedIndex = Math.max(0, gameIds.indexOf(selectedGameId ?? gameIds[0]));
      const previousIndex = Math.max(0, selectedIndex - 1);
      const nextIndex = Math.min(gameIds.length - 1, selectedIndex + 1);
      const key = event.key.toLowerCase();

      if (event.key === "ArrowUp" || key === "k") {
        if (previousIndex !== selectedIndex) {
          event.preventDefault();
          router.push(gameHrefs[previousIndex]);
        }
      } else if (event.key === "ArrowDown" || key === "j") {
        if (nextIndex !== selectedIndex) {
          event.preventDefault();
          router.push(gameHrefs[nextIndex]);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameHrefs, gameIds, router, selectedGameId]);

  return (
    <p className="workspace-hotkey-hint">
      ↑/↓ or J/K games · ←/→ moves · Home/End · F flip
    </p>
  );
}
