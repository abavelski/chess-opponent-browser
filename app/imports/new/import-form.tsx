"use client";

import { useActionState } from "react";

import { previewPgnImport, type ImportPreviewActionState } from "./actions";

const initialState: ImportPreviewActionState = {
  status: "idle",
  message: null,
  sourceLabel: "Manual",
  filename: null,
  gamesFound: 0,
  parsedCount: 0,
  errorCount: 0,
  games: [],
  errors: [],
  rawPgn: null,
};

function ratingLabel(rating: number | null) {
  return rating ? ` (${rating})` : "";
}

function openingLabel(eco: string | null, opening: string | null) {
  if (eco && opening) return `${eco} · ${opening}`;
  return eco ?? opening ?? "—";
}

export function ImportForm() {
  const [state, action, pending] = useActionState(previewPgnImport, initialState);

  return (
    <div className="import-stack">
      <section className="panel form-panel import-form-panel">
        <p className="eyebrow">Administrator</p>
        <h1>Import games</h1>
        <p className="muted">
          Upload one PGN file to inspect how its games will be parsed. Previewing does not save
          players, games, sources, or tournament data.
        </p>

        <form action={action} className="stack-form">
          <div className="field-group">
            <label htmlFor="sourceLabel">Source label</label>
            <input
              defaultValue={state.sourceLabel || "Manual"}
              id="sourceLabel"
              maxLength={120}
              name="sourceLabel"
              placeholder="Manual"
            />
            <p className="helper-text">Used to identify where these games came from.</p>
          </div>

          <div className="field-group">
            <label htmlFor="pgnFile">PGN file</label>
            <input
              accept=".pgn,application/x-chess-pgn,text/plain"
              id="pgnFile"
              name="pgnFile"
              required
              type="file"
            />
            <p className="helper-text">One text .pgn file, maximum 3 MB. Multi-game files are supported.</p>
          </div>

          {state.status === "error" && state.message ? (
            <p className="form-error" role="alert">
              {state.message}
            </p>
          ) : null}

          <div className="form-actions">
            <button className="button" disabled={pending} type="submit">
              {pending ? "Parsing…" : "Preview PGN"}
            </button>
          </div>
        </form>
      </section>

      {state.status === "preview" ? (
        <section aria-labelledby="preview-heading" className="section-stack import-preview-section">
          <div className="section-heading import-preview-heading">
            <div>
              <p className="eyebrow">Parse result</p>
              <h2 id="preview-heading">Preview</h2>
            </div>
            <span className="import-preview-filename">{state.filename}</span>
          </div>

          <p className="panel import-notice" role="status">
            {state.message} Source: <strong>{state.sourceLabel}</strong>.
          </p>

          <dl className="import-summary">
            <div className="panel">
              <dt>Games found</dt>
              <dd>{state.gamesFound}</dd>
            </div>
            <div className="panel">
              <dt>Parsed</dt>
              <dd>{state.parsedCount}</dd>
            </div>
            <div className="panel">
              <dt>Errors</dt>
              <dd>{state.errorCount}</dd>
            </div>
          </dl>

          {state.errors.length > 0 ? (
            <div className="panel import-errors" role="alert">
              <h3>Games needing attention</h3>
              <ul>
                {state.errors.map((error) => (
                  <li key={`${error.index}:${error.message}`}>
                    <strong>Game {error.index}:</strong> {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {state.games.length > 0 ? (
            <ol className="import-game-list">
              {state.games.map((game) => (
                <li className="panel import-game-card" key={game.index}>
                  <div className="import-game-title">
                    <span className="count-badge">{game.index}</span>
                    <strong>
                      {game.white}{ratingLabel(game.whiteRating)} — {game.black}
                      {ratingLabel(game.blackRating)}
                    </strong>
                    <span className="result-pill result-unknown">{game.result}</span>
                  </div>
                  <dl className="import-game-metadata">
                    <div>
                      <dt>Date</dt>
                      <dd>{game.date ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Event</dt>
                      <dd>{game.event ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Opening</dt>
                      <dd>{openingLabel(game.eco, game.opening)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
