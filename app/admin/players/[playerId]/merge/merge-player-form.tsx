"use client";

import { useFormStatus } from "react-dom";

import { mergePlayers } from "../../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button danger-button" disabled={pending} type="submit">
      {pending ? "Merging…" : "Merge players"}
    </button>
  );
}

export function MergePlayerForm({
  sourcePlayerId,
  sourceName,
  targetPlayerId,
  targetName,
}: {
  sourcePlayerId: number;
  sourceName: string;
  targetPlayerId: number;
  targetName: string;
}) {
  return (
    <form
      action={mergePlayers}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Merge “${sourceName}” into “${targetName}”?\n\nThe source player will be removed. Tournament memberships, linked games and aliases will move to the target player.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input name="sourcePlayerId" type="hidden" value={sourcePlayerId} />
      <input name="targetPlayerId" type="hidden" value={targetPlayerId} />
      <SubmitButton />
    </form>
  );
}
