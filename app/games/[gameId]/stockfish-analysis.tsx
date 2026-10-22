"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  BrowserStockfish,
  STOCKFISH_VERSION,
  defaultEngineSettings,
  variationSan,
  type EngineLine,
  type EngineSettings,
} from "@/lib/games/browser-stockfish";

type AnalysisResult = { fen: string; lines: EngineLine[] };

export function StockfishAnalysis({
  fen,
  onLinesChange,
}: {
  fen: string;
  onLinesChange?: (fen: string, lines: EngineLine[]) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<EngineSettings>(defaultEngineSettings);
  const [status, setStatus] = useState("Starting");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult>({ fen: "", lines: [] });
  const engineRef = useRef<BrowserStockfish | null>(null);
  const currentFenRef = useRef(fen);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentFenRef.current = fen;
    engineRef.current?.analyze(fen);
  }, [fen]);

  useEffect(() => {
    if (!enabled) return;

    let engine: BrowserStockfish;
    try {
      engine = new BrowserStockfish(settings, {
        onState: (state) => setStatus(state === "loading" ? "Loading" : state === "analyzing" ? "Analyzing" : "Ready"),
        onInfo: (position, info) => {
          if (position !== currentFenRef.current) return;
          setResult((previous) => {
            const lines = previous.fen === position ? [...previous.lines] : [];
            const old = lines.findIndex((candidate) => candidate.multiPv === info.multiPv);
            if (old >= 0) {
              if (lines[old].depth > info.depth) return previous;
              lines[old] = info;
            } else lines.push(info);
            return { fen: position, lines: lines.sort((a, b) => a.multiPv - b.multiPv) };
          });
        },
        onError: (message) => setError(message),
      });
      engineRef.current = engine;
      engine.analyze(currentFenRef.current);
    } catch {
      // A denied Worker or incompatible browser should not affect PGN replay.
      const frame = requestAnimationFrame(() => setError("Stockfish could not start in this browser."));
      return () => cancelAnimationFrame(frame);
    }

    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [enabled, settings]);

  const lines = useMemo(() => (result.fen === fen ? result.lines : []), [result, fen]);

  useEffect(() => {
    onLinesChange?.(fen, enabled ? lines : []);
  }, [fen, enabled, lines, onLinesChange]);

  useEffect(() => {
    if (!showSettings) return;
    function onOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target)) {
        setShowSettings(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowSettings(false);
    }
    document.addEventListener("pointerdown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [showSettings]);
  const primary = lines.find((line) => line.multiPv === 1);
  const mainStatus = enabled
    ? error ?? `Stockfish ${STOCKFISH_VERSION} Lite · ${primary ? `Depth ${primary.depth}` : status}`
    : "Stockfish 19 Lite · Off";

  function toggle() {
    if (!enabled) {
      setError(null);
      setStatus("Starting");
    }
    setEnabled((active) => !active);
  }

  function changeSetting(name: keyof EngineSettings, value: number) {
    setError(null);
    setSettings((previous) => ({ ...previous, [name]: value }));
  }

  return (
    <section
      aria-label="Computer analysis"
      className="replay-engine-pane"
      data-enabled={enabled}
      data-lines={settings.multiPv}
    >
      <div className="replay-engine-toolbar">
        <button
          aria-label={enabled ? "Disable Stockfish evaluation" : "Enable Stockfish evaluation"}
          role="switch"
          aria-checked={enabled}
          className={"replay-engine-toggle" + (enabled ? " is-on" : "")}
          onClick={toggle}
          title={enabled ? "Disable local Stockfish" : "Enable local Stockfish"}
          type="button"
        >
          <span aria-hidden="true" className="replay-engine-toggle-track">
            <span className="replay-engine-toggle-thumb">{enabled ? "✓" : "×"}</span>
          </span>
        </button>
        <strong className="replay-engine-score" aria-label="Evaluation for White">
          {enabled ? primary?.score ?? "—" : "—"}
        </strong>
        <div className="replay-engine-caption">
          <strong>{mainStatus}</strong>
          {enabled && !error ? <small>{settings.multiPv} line{settings.multiPv === 1 ? "" : "s"} · In your browser</small> : null}
        </div>
        <div className="replay-engine-settings-anchor" ref={settingsRef}>
        <button
          aria-expanded={showSettings}
          aria-label="Stockfish settings"
          className="replay-engine-settings-button"
          onClick={() => setShowSettings((open) => !open)}
          title="Engine settings"
          type="button"
        >
          <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
            <path d="M19.4 14.3 21 15.2l-1.8 3.1-1.8-.2a7.8 7.8 0 0 1-1.5.9l-.7 1.7h-3.6l-.7-1.7a7.8 7.8 0 0 1-1.5-.9l-1.8.2L5.8 15.2l1.6-.9a7.2 7.2 0 0 1 0-1.8l-1.6-1 1.8-3.1 1.8.2a7.8 7.8 0 0 1 1.5-.9l.7-1.7h3.6l.7 1.7a7.8 7.8 0 0 1 1.5.9l1.8-.2L21 11.5l-1.6 1a7.2 7.2 0 0 1 0 1.8Z" transform="translate(-1.4 -1.4)" />
          </svg>
        </button>
        {showSettings ? (
          <div className="replay-engine-settings" role="group" aria-label="Stockfish settings">
            <strong>Engine settings</strong>
            <label htmlFor="stockfish-depth">Maximum depth</label>
            <select id="stockfish-depth" value={settings.depth} onChange={(event) => changeSetting("depth", Number(event.target.value))}>
              {[12, 16, 20, 24].map((depth) => <option key={depth} value={depth}>{depth}</option>)}
            </select>
            <label htmlFor="stockfish-lines">Principal variations</label>
            <select id="stockfish-lines" value={settings.multiPv} onChange={(event) => changeSetting("multiPv", Number(event.target.value))}>
              {[1, 2, 3].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
            <label htmlFor="stockfish-hash">Engine hash</label>
            <select id="stockfish-hash" value={settings.hashMb} onChange={(event) => changeSetting("hashMb", Number(event.target.value))}>
              {[16, 32, 64].map((size) => <option key={size} value={size}>{size} MB</option>)}
            </select>
            <p>Runs locally in a Web Worker. Analysis uses your device&apos;s CPU and memory.</p>
          </div>
        ) : null}
        </div>
      </div>

      {enabled ? (
        <div className="replay-engine-lines" aria-label="Best lines">
          {Array.from({ length: settings.multiPv }, (_, i) => {
            const line = lines.find((item) => item.multiPv === i + 1);
            return (
              <div className="replay-engine-line" key={i + 1}>
                <strong>{line?.score ?? "—"}</strong>
                <span title={line ? line.pv.join(" ") : "Analyzing position"}>
                  {line ? variationSan(fen, line.pv) : error ? "Unavailable" : "Analyzing…"}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}


    </section>
  );
}
