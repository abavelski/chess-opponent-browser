"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

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
  focalCandidates: [],
  suggestedFocalName: null,
};

const initialConfirmState: ImportConfirmActionState = {
  status: "idle",
  message: null,
  importId: null,
  parsedCount: 0,
  importedCount: 0,
  duplicateCount: 0,
  parseErrorCount: 0,
  persistenceErrorCount: 0,
  unresolvedSideCount: 0,
  persistenceErrors: [],
  affectedPlayers: [],
  focalOpponent: null,
};

export type ImportTournamentOption = {
  id: number;
  name: string;
};

function ratingLabel(rating: number | null) {
  return rating ? ` (${rating})` : "";
}

function openingLabel(eco: string | null, opening: string | null) {
  if (eco && opening) return `${eco} · ${opening}`;
  return eco ?? opening ?? "—";
}

function ConfirmImportForm({
  preview,
  tournaments,
}: {
  preview: ImportPreviewActionState;
  tournaments: ImportTournamentOption[];
}) {
  const [result, action, pending] = useActionState(confirmPgnImport, initialConfirmState);
  const [focalName, setFocalName] = useState(preview.suggestedFocalName ?? "");
  const suggestedCandidate = preview.focalCandidates.find(
    (candidate) => candidate.normalizedName === preview.suggestedFocalName,
  );
  const [canonicalName, setCanonicalName] = useState(suggestedCandidate?.name ?? "");
  const completed = result.status === "result";
  const totalErrors = result.parseErrorCount + result.persistenceErrorCount;
  const selectedCandidate = preview.focalCandidates.find(
    (candidate) => candidate.normalizedName === focalName,
  );

  function chooseFocalPlayer(value: string) {
    setFocalName(value);
    const candidate = preview.focalCandidates.find(
      (entry) => entry.normalizedName === value,
    );
    setCanonicalName(candidate?.name ?? "");
  }

  return (
    <div className="import-confirm-stack">
      <section className="panel import-confirm-panel" aria-labelledby="confirm-import-heading">
        <div>
          <p className="eyebrow">Opponent pack</p>
          <h3 id="confirm-import-heading">Choose the focal opponent</h3>
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
            <dt>Games parsed</dt>
            <dd>{preview.parsedCount}</dd>
          </div>
          <div>
            <dt>Parse errors skipped</dt>
            <dd>{preview.errorCount}</dd>
          </div>
        </dl>

        <form action={action} className="stack-form">
          <input name="filename" type="hidden" value={preview.filename ?? ""} />
          <input name="sourceLabel" type="hidden" value={preview.sourceLabel} />
          <input name="rawPgn" type="hidden" value={preview.rawPgn ?? ""} />

          <div className="field-group">
            <label htmlFor="focalName">Focal opponent</label>
            <select
              id="focalName"
              name="focalName"
              onChange={(event) => chooseFocalPlayer(event.target.value)}
              required
              value={focalName}
            >
              <option value="">Choose the player this pack is about</option>
              {preview.focalCandidates.map((candidate) => (
                <option key={candidate.normalizedName} value={candidate.normalizedName}>
                  {candidate.name} · {candidate.gameCount}/{preview.parsedCount} games
                  {candidate.fideId ? ` · FIDE ${candidate.fideId}` : ""}
                </option>
              ))}
            </select>
            <p className="helper-text">
              {preview.suggestedFocalName
                ? "Auto-detected because this is the only player present in every parsed game."
                : "No unique focal player was detected. Choose the opponent deliberately."}
            </p>
          </div>

          <div className="field-group">
            <label htmlFor="canonicalName">Canonical display name</label>
            <input
              disabled={!selectedCandidate}
              id="canonicalName"
              maxLength={200}
              name="canonicalName"
              onChange={(event) => setCanonicalName(event.target.value)}
              required
              value={canonicalName}
            />
            <p className="helper-text">
              Used only when a canonical Player cannot be safely reused. You may clean up the display spelling here.
            </p>
          </div>

          <div className="field-group">
            <label htmlFor="tournamentId">Preparation tournament</label>
            <select
              defaultValue={tournaments.length === 1 ? String(tournaments[0].id) : ""}
              id="tournamentId"
              name="tournamentId"
              required
            >
              <option value="">Choose tournament</option>
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
            <p className="helper-text">
              The focal Player will be added to this roster automatically if needed.
            </p>
          </div>

          {tournaments.length === 0 ? (
            <p className="form-error" role="alert">
              Create a tournament before importing an opponent pack. <Link href="/tournaments/new">Create tournament →</Link>
            </p>
          ) : null}

          <p className="helper-text">
            New games link matching focal sides to this Player. Already-known games may fill a matching unresolved side, but an existing different Player link is never overwritten.
          </p>

          {result.status === "error" && result.message ? (
            <p className="form-error import-confirm-error" role="alert">
              {result.message}
            </p>
          ) : null}

          <div className="form-actions">
            <button
              className="button"
              disabled={pending || completed || tournaments.length === 0 || !selectedCandidate}
              type="submit"
            >
              {pending ? "Importing…" : completed ? "Imported" : "Import opponent pack"}
            </button>
          </div>
        </form>
      </section>

      {completed ? (
        <section className="section-stack import-result-section" aria-labelledby="import-result-heading">
          <div>
            <p className="eyebrow">Import result</p>
            <h2 id="import-result-heading">Opponent pack ready</h2>
          </div>

          {result.message ? (
            <p className="panel import-notice" role="status">
              {result.message} Import #{result.importId}.
            </p>
          ) : null}

          {result.focalOpponent ? (
            <div className="panel import-affected-players">
              <h3>{result.focalOpponent.playerName}</h3>
              <p className="muted">
                {result.focalOpponent.playerCreated ? "Canonical Player created." : "Existing canonical Player reused."}{" "}
                {result.focalOpponent.rosterAdded ? "Added to the preparation roster." : "Already in the preparation roster."}
              </p>
              <p><strong>{result.focalOpponent.visibleGameCount}</strong> games are now visible for this opponent.</p>
              <Link
                className="button secondary-button"
                href={`/tournaments/${result.focalOpponent.tournamentId}/players/${result.focalOpponent.playerId}`}
              >
                Open opponent games
              </Link>
            </div>
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
              <dt>Already known</dt>
              <dd>{result.duplicateCount}</dd>
            </div>
            <div className="panel">
              <dt>Conflicts</dt>
              <dd>{result.focalOpponent?.conflictCount ?? 0}</dd>
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

          {result.focalOpponent && result.focalOpponent.conflicts.length > 0 ? (
            <div className="panel import-errors" role="alert">
              <h3>Focal-player conflicts</h3>
              <p>These existing links were preserved rather than overwritten.</p>
              <ul>
                {result.focalOpponent.conflicts.map((conflict) => (
                  <li key={`${conflict.index}:${conflict.side}`}>
                    <strong>Game {conflict.index} · {conflict.side}:</strong> {conflict.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="import-result-links">
            {result.importId ? (
              <Link className="button secondary-button" href={`/imports/${result.importId}`}>
                View import details
              </Link>
            ) : null}
            <Link className="text-link" href="/imports">
              Import history →
            </Link>
          </div>

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
        </section>
      ) : null}
    </div>
  );
}

export function ImportForm({ tournaments }: { tournaments: ImportTournamentOption[] }) {
  const [state, action, pending] = useActionState(previewPgnImport, initialPreviewState);

  return (
    <div className="import-stack">
      <section className="panel form-panel import-form-panel">
        <p className="eyebrow">Administrator</p>
        <h1>Import opponent pack</h1>
        <p className="muted">
          Upload one pre-filtered PGN for an opponent, review the games, choose the focal player, then import them directly into the preparation roster.
        </p>

        <form action={action} className="stack-form">
          <div className="field-group">
            <label htmlFor="sourceLabel">Source label</label>
            <input
              defaultValue={state.sourceLabel || "Manual"}
              id="sourceLabel"
              maxLength={120}
              name="sourceLabel"
              placeholder="Danbase"
            />
            <p className="helper-text">Used to identify where these games came from.</p>
          </div>

          <div className="field-group">
            <label htmlFor="pgnFile">Opponent PGN pack</label>
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
              {pending ? "Parsing…" : "Preview opponent pack"}
            </button>
            <Link className="text-link" href="/imports">
              View import history →
            </Link>
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
              tournaments={tournaments}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
