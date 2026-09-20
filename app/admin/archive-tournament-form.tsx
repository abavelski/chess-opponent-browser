"use client";

import { useFormStatus } from "react-dom";

import { archiveTournament } from "./actions";

function ArchiveButton() {
  const { pending } = useFormStatus();
  return (
    <button className="link-button" disabled={pending} type="submit">
      {pending ? "Archiving…" : "Archive"}
    </button>
  );
}

export function ArchiveTournamentForm({
  tournamentId,
  tournamentName,
  active,
}: {
  tournamentId: number;
  tournamentName: string;
  active: boolean;
}) {
  return (
    <form
      action={archiveTournament}
      onSubmit={(event) => {
        const suffix = active
          ? " This tournament is active, so the preparation home page will have no active tournament until another one is activated."
          : "";
        if (!window.confirm(`Archive “${tournamentName}”? It stays available in Admin and can be restored.${suffix}`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="tournamentId" type="hidden" value={tournamentId} />
      <ArchiveButton />
    </form>
  );
}
