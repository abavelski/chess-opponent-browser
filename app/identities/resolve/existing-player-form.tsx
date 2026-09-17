"use client";

import { useMemo, useState } from "react";

import { resolveToExistingPlayer } from "../actions";

type Player = {
  id: number;
  name: string;
  fideId: string | null;
};

export function ExistingPlayerForm({
  players,
  normalizedName,
  sourceFideId,
  sideCount,
  rawName,
}: {
  players: Player[];
  normalizedName: string;
  sourceFideId: string | null;
  sideCount: number;
  rawName: string;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = useMemo(
    () => players.find((player) => String(player.id) === selectedId) ?? null,
    [players, selectedId],
  );
  const fideConflict = Boolean(
    sourceFideId && selected?.fideId && sourceFideId !== selected.fideId,
  );

  return (
    <form action={resolveToExistingPlayer} className="stack-form identity-resolution-form">
      <input name="nameKey" type="hidden" value={normalizedName} />
      <input name="sourceFideId" type="hidden" value={sourceFideId ?? ""} />

      <div className="field-group">
        <label htmlFor="targetPlayerId">Canonical player</label>
        <select
          id="targetPlayerId"
          name="targetPlayerId"
          required
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Choose a player…</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.name}{player.fideId ? ` · FIDE ${player.fideId}` : ""}
            </option>
          ))}
        </select>
      </div>

      {selected ? (
        <div className="identity-target-summary panel">
          <strong>{selected.name}</strong>
          <span className="muted">{selected.fideId ? `FIDE ${selected.fideId}` : "No FIDE ID"}</span>
          <span className="muted">Will link {sideCount} still-unresolved game side{sideCount === 1 ? "" : "s"}.</span>
        </div>
      ) : null}

      {fideConflict ? (
        <div className="inline-alert error-alert" role="alert">
          Source FIDE ID {sourceFideId} conflicts with {selected?.name}&apos;s FIDE ID {selected?.fideId}. Bulk resolution is blocked.
        </div>
      ) : null}

      <label className="identity-checkbox">
        <input name="rememberAlias" type="checkbox" />
        <span>Remember “{rawName}” as an exact alias for future imports</span>
      </label>

      <button className="button" disabled={!selected || fideConflict} type="submit">
        Resolve to existing player
      </button>
    </form>
  );
}
