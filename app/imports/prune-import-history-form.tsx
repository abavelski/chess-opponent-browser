"use client";

import { useFormStatus } from "react-dom";

import { pruneImportHistory } from "./actions";

function PruneButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="button secondary-button" disabled={pending} type="submit">
      {pending ? "Pruning…" : `Prune ${count} duplicate-only import${count === 1 ? "" : "s"}`}
    </button>
  );
}

export function PruneImportHistoryForm({ count }: { count: number }) {
  return (
    <form
      action={pruneImportHistory}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Remove ${count} duplicate-only import-history record${count === 1 ? "" : "s"}?\n\nCanonical games are kept. Only low-value import history and its item rows are removed.`,
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <PruneButton count={count} />
    </form>
  );
}
