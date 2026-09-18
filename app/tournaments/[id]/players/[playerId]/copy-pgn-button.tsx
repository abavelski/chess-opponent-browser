"use client";

import { useEffect, useRef, useState } from "react";

type CopyPgnButtonProps = {
  pgn: string;
};

export function CopyPgnButton({ pgn }: CopyPgnButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function copyPgn() {
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);

      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("Failed to copy PGN", error);
    }
  }

  return (
    <button
      aria-label="Copy game PGN to clipboard"
      className="copy-pgn-button"
      onClick={copyPgn}
      title="Copy PGN"
      type="button"
    >
      {copied ? "Copied" : "Copy PGN"}
    </button>
  );
}
