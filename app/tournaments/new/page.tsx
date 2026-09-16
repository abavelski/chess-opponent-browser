import Link from "next/link";

import { createTournament } from "./actions";
import { TOURNAMENT_NAME_MAX_LENGTH } from "@/lib/tournaments/validation";

const errorMessages: Record<string, string> = {
  required: "Enter a tournament name.",
  too_long: `Tournament name must be ${TOURNAMENT_NAME_MAX_LENGTH} characters or fewer.`,
  database: "We couldn't create the tournament. Please try again.",
};

type NewTournamentPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    name?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewTournamentPage({
  searchParams,
}: NewTournamentPageProps) {
  const params = await searchParams;
  const errorCode = firstValue(params.error);
  const enteredName = firstValue(params.name) ?? "";
  const errorMessage = errorCode ? errorMessages[errorCode] : undefined;

  return (
    <main className="app-shell narrow-shell">
      <Link className="back-link" href="/">
        ← Tournaments
      </Link>

      <section className="panel form-panel">
        <p className="eyebrow">Tournament setup</p>
        <h1>Create tournament</h1>
        <p className="muted">
          Start with the tournament name. Opponents will be added in a later
          step.
        </p>

        <form action={createTournament} className="stack-form">
          <div className="field-group">
            <label htmlFor="name">Tournament name</label>
            <input
              autoFocus
              defaultValue={enteredName}
              id="name"
              maxLength={TOURNAMENT_NAME_MAX_LENGTH}
              name="name"
              placeholder="Copenhagen Open 2026"
              required
              type="text"
            />
            {errorMessage ? (
              <p className="form-error" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <div className="form-actions">
            <button className="button" type="submit">
              Create tournament
            </button>
            <Link className="button secondary-button" href="/">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
