"use client";

import { useFormStatus } from "react-dom";

import { deleteTournament } from "./actions";

type DeleteTournamentFormProps = {
  tournamentId: number;
  tournamentName: string;
};

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button danger-button" disabled={pending} type="submit">
      {pending ? "Deleting…" : "Delete tournament"}
    </button>
  );
}

export function DeleteTournamentForm({
  tournamentId,
  tournamentName,
}: DeleteTournamentFormProps) {
  return (
    <form
      action={deleteTournament}
      className="admin-delete-form"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Delete “${tournamentName}”?\n\nThis removes the tournament workspace and its opponent roster. Players, games, and import history are kept.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input name="tournamentId" type="hidden" value={tournamentId} />
      <DeleteButton />
    </form>
  );
}
