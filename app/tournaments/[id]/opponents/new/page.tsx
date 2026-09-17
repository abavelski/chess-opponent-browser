import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";
import { searchPlayersForTournament } from "@/lib/players/search";
import { normalizeRosterSearch } from "@/lib/players/validation";

import { addExistingOpponentAction } from "./actions";
import { AddOpponentForm } from "./form";

export const dynamic = "force-dynamic";

type AddOpponentPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseTournamentId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AddOpponentPage({
  params,
  searchParams,
}: AddOpponentPageProps) {
  const [{ id: rawId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const tournamentId = parseTournamentId(rawId);

  if (tournamentId === null) {
    notFound();
  }

  const [tournament] = await getDb()
    .select({ id: tournaments.id, name: tournaments.name })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!tournament) {
    notFound();
  }

  const query = normalizeRosterSearch(first(rawSearchParams.q));
  const actionError = first(rawSearchParams.error);
  let searchFailed = false;
  let matches: Awaited<ReturnType<typeof searchPlayersForTournament>> = [];

  if (query) {
    try {
      matches = await searchPlayersForTournament(tournament.id, query);
    } catch (error) {
      console.error("Failed to search existing Players", error);
      searchFailed = true;
    }
  }

  return (
    <main className="app-shell narrow-shell">
      <Link className="back-link" href={`/tournaments/${tournament.id}`}>
        ← {tournament.name}
      </Link>

      <section className="panel form-panel">
        <p className="eyebrow">Tournament roster</p>
        <h1>Add opponent</h1>
        <p className="muted">
          Search the existing Player library first. Matches include canonical names,
          remembered aliases, and FIDE IDs.
        </p>

        {actionError ? (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        ) : null}

        <form className="roster-search" method="get">
          <label htmlFor="existing-player-search">Find existing Player</label>
          <div className="search-row">
            <input
              defaultValue={query}
              id="existing-player-search"
              maxLength={200}
              name="q"
              placeholder="Name, alias, or FIDE ID"
            />
            <button className="button" type="submit">
              Search
            </button>
            {query ? (
              <Link
                className="text-link search-clear"
                href={`/tournaments/${tournament.id}/opponents/new`}
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        {query ? (
          <div className="existing-player-results">
            <div className="section-heading section-heading-with-action">
              <div>
                <h2>Existing players</h2>
                <p className="muted">
                  Select the canonical Player instead of creating a duplicate.
                </p>
              </div>
              {!searchFailed ? (
                <span className="count-badge">{matches.length} found</span>
              ) : null}
            </div>

            {searchFailed ? (
              <div className="empty-state compact-empty-state" role="alert">
                <strong>Search could not be completed.</strong>
                <span>Refresh and try again.</span>
              </div>
            ) : matches.length === 0 ? (
              <div className="empty-state compact-empty-state">
                <strong>No existing Player found.</strong>
                <span>Create a new Player below if this is a new opponent.</span>
              </div>
            ) : (
              <ul className="player-search-results">
                {matches.map((player) => (
                  <li className="player-search-card" key={player.id}>
                    <div className="participant-main">
                      <strong>{player.name}</strong>
                      <div className="participant-meta">
                        <span>Player #{player.id}</span>
                        <span>
                          {player.fideId ? `FIDE ${player.fideId}` : "No FIDE ID"}
                        </span>
                      </div>
                    </div>

                    {player.alreadyInTournament ? (
                      <span className="status-badge">Already in tournament</span>
                    ) : (
                      <form action={addExistingOpponentAction}>
                        <input name="tournamentId" type="hidden" value={tournament.id} />
                        <input name="playerId" type="hidden" value={player.id} />
                        <input name="query" type="hidden" value={query} />
                        <button className="button" type="submit">
                          Add existing Player
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="form-divider" role="presentation" />

        <div className="section-heading">
          <div>
            <h2>Create new Player</h2>
            <p className="muted">
              Use this only when the opponent is not already in the Player library.
            </p>
          </div>
        </div>

        <AddOpponentForm tournamentId={tournament.id} />
      </section>
    </main>
  );
}
