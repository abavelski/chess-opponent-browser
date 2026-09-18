import Link from "next/link";

import { createTournament } from "./actions";
import {
  TOURNAMENT_GROUP_MAX_LENGTH,
  TOURNAMENT_NAME_MAX_LENGTH,
  TOURNAMENT_NICKNAME_MAX_LENGTH,
  TOURNAMENT_URL_MAX_LENGTH,
} from "@/lib/tournaments/validation";

const errorMessages: Record<string, string> = {
  required: "Enter a tournament name.",
  too_long: `Tournament name must be ${TOURNAMENT_NAME_MAX_LENGTH} characters or fewer.`,
  nickname_required: "Enter a short nickname for command-line sync.",
  nickname_too_long: `Nickname must be ${TOURNAMENT_NICKNAME_MAX_LENGTH} characters or fewer.`,
  nickname_format: "Use lowercase letters, numbers, and single hyphens only.",
  url_required: "Enter the tournament participant-list URL.",
  url_too_long: "Tournament URL is too long.",
  url_invalid: "Enter a valid HTTP or HTTPS URL.",
  group_too_long: `Group must be ${TOURNAMENT_GROUP_MAX_LENGTH} characters or fewer.`,
  database: "We couldn't create the tournament. Please try again.",
};

type NewTournamentPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    name?: string | string[];
    nickname?: string | string[];
    sourceUrl?: string | string[];
    participantGroup?: string | string[];
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
  const enteredNickname = firstValue(params.nickname) ?? "";
  const enteredSourceUrl = firstValue(params.sourceUrl) ?? "";
  const enteredGroup = firstValue(params.participantGroup) ?? "";
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
          Save the participant-list details used by the local sync command.
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

          <div className="field-group">
            <label htmlFor="nickname">Sync nickname</label>
            <input
              defaultValue={enteredNickname}
              id="nickname"
              maxLength={TOURNAMENT_NICKNAME_MAX_LENGTH}
              name="nickname"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="copenhagen-open-2026"
              required
              type="text"
            />
          </div>

          <div className="field-group">
            <label htmlFor="sourceUrl">Tournament URL</label>
            <input
              defaultValue={enteredSourceUrl}
              id="sourceUrl"
              maxLength={TOURNAMENT_URL_MAX_LENGTH}
              name="sourceUrl"
              placeholder="https://turnering.skak.dk/..."
              required
              type="url"
            />
          </div>

          <div className="field-group">
            <label htmlFor="participantGroup">Group (optional)</label>
            <input
              defaultValue={enteredGroup}
              id="participantGroup"
              maxLength={TOURNAMENT_GROUP_MAX_LENGTH}
              name="participantGroup"
              placeholder="U-14"
              type="text"
            />
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
