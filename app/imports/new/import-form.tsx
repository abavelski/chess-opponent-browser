"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  confirmPgnImport,
  previewPgnImport,
  type ImportConfirmActionState,
  type ImportPreviewActionState,
} from "./actions";

const initialPreviewState: ImportPreviewActionState = {
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

const initialConfirmState: ImportConfirmActionState = {
  status: "idle",
  message: null,
  importId: null,
  parsedCount: 0,
  importedCount: 0,
  parseErrorCount: 0,
  persistenceErrorCount: 0,
  unresolvedSideCount: 0,
  persistenceErrors: [],
  affectedPlayers: [],
};

function ratingLabel(rating: number | null) {
  return rating ? ` (${rating})` : "";
}

function openingLabel(eco: string | null, opening: string | null) {
  if (eco && opening) return `${eco} · ${opening}`;
  return eco ?? opening ?? "—";
}

function ConfirmImportForm({ preview }: { preview: ImportPreviewActionState }) {
  const [result, action, pending] = useActionState(confirmPgnImport, initialConfirmState);
  const completed = result.status === "result";
  const totalErrors = result.parseErrorCount + result.persistenceErrorCount;

  return (
    <div className="import-confirm-stack">
      <section className="panel import-confirm-panel" aria-labelledby="confirm-import-heading">
        <div>
          <p className="eyebrow">Confirmation</p>
          <h3 id="confirm-import-heading">Ready to import</h3>
        </div>

        <dl className="import-confirm-details">
          <div>
            <dt>File</dt>
            <dd>{preview.filename}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{preview.sourceLabel}</dd>
          </div>
          <div>
            <dt>Games to import</dt>
            <dd>{preview.parsedCount}</dd>
          </div>
          <div>
            <dt>Parse errors skipped</dt>
            <dd>{preview.errorCount}</dd>
          </div>
        </dl>

        <p className="helper-text">
          Only successfully parsed games will be saved. Unknown or ambiguous player identities are
          preserved as unresolved sides rather than guessed. Duplicate detection arrives in Task 008,
          so do not intentionally import the same file twice yet.
        </p>

        <form action={action}>
          <input name="filename" type="hidden" value={preview.filename ?? ""} />
          <input name="sourceLabel" type="hidden" value={preview.sourceLabel} />
          <input name="rawPgn" type="hidden" value={preview.rawPgn ?? ""} />

          {result.status === "error" && result.message ? (
            <p className="form-error import-confirm-error" role="alert">
              {result.message}
            </p>
          ) : null}

          <div className="form-actions">
            <button className="button" disabled={pending || completed} type="submit">
              {pending ? "Importing…" : completed ? "Imported" : "Confirm import"}
            </button>
          </div>
        </form>
      </section>

      {completed ? (
        <section className="section-stack import-result-section" aria-labelledby="import-result-heading">
          <div>
            <p className="eyebrow">Import result</p>
            <h2 id="import-result-heading">Import complete</h2>
          </div>

          {result.message ? (
            <p className="panel import-notice" role="status">
              {result.message} Import #{result.importId}.
            </p>
          ) : null}

          <dl className="import-summary import-result-summary">
            <div className="panel">
              <dt>Parsed</dt>
              <dd>{result.parsedCount}</dd>
            </div>
            <div className="panel">
              <dt>Imported</dt>
              <dd>{result.importedCount}</dd>
            </div>
            <div className="panel">
              <dt>Errors</dt>
              <dd>{totalErrors}</dd>
            </div>
            <div className="panel">
              <dt>Unresolved sides</dt>
              <dd>{result.unresolvedSideCount}</dd>
            </div>
          </dl>

          {result.persistenceErrors.length > 0 ? (
            <div className="panel import-errors" role="alert">
              <h3>Games that could not be saved</h3>
              <ul>
                {result.persistenceErrors.map((error) => (
                  <li key={`${error.index}:${error.message}`}>
                    <strong>Game {error.index}:</strong> {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.affectedPlayers.length > 0 ? (
            <div className="panel import-affected-players">
              <h3>Verify imported games</h3>
              <p className="muted">
                These safely matched players are already in tournament rosters. Open one to verify
                the new game in the normal browse/filter/viewer flow.
              </p>
              <ul>
                {result.affectedPlayers.map((player) => (
                  <li key={`${player.tournamentId}:${player.playerId}`}>
                    <Link
                      className="text-link"
                      href={`/tournaments/${player.tournamentId}/players/${player.playerId}`}
                    >
                      {player.playerName} · {player.tournamentName} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function ImportForm() {
  const [state, action, pending] = useActionState(previewPgnImport, initialPreviewState);

  return (
    <div className="import-stack">
      <section className="panel form-panel import-form-panel">
        <p className="eyebrow">Administrator</p>
        <h1>Import games</h1>
        <p className="muted">
          Upload one PGN file, review the parsed games, then explicitly confirm before anything is
          saved.
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
            <p className="helper-text">
              One text .pgn file, maximum 3 MB. Multi-game files are supported.
            </p>
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
              <dt>Parse errors</dt>
              <dd>{state.errorCount}</dd>
            </div>
          </dl>

          {state.errors.length > 0 ? (
            <div className="panel import-errors" role="alert">
              <h3>Games skipped during parsing</h3>
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

          {state.parsedCount > 0 && state.rawPgn ? (
            <ConfirmImportForm
              key={`${state.filename}:${state.sourceLabel}:${state.rawPgn.length}`}
              preview={state}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
