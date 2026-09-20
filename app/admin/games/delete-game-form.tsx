"use client";

import { useFormStatus } from "react-dom";

import { deleteGame } from "./actions";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button danger-button" disabled={pending} type="submit">
      {pending ? "Deleting…" : "Delete canonical game"}
    </button>
  );
}

export function DeleteGameForm({
  gameId,
  label,
  occurrenceCount,
}: {
  gameId: number;
  label: string;
  occurrenceCount: number;
}) {
  return (
    <form
      action={deleteGame}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Delete ${label}?\n\nThis permanently removes the canonical game and its ${occurrenceCount} import-history item${occurrenceCount === 1 ? "" : "s"}. Import summary counters remain historical.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input name="gameId" type="hidden" value={gameId} />
      <DeleteButton />
    </form>
  );
}
