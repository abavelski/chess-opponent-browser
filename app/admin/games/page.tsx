import Link from "next/link";

import {
  listAdminGames,
  listGameSources,
  parseAdminGameFilter,
} from "@/lib/admin/games";

export const dynamic = "force-dynamic";

type GamesPageProps = {
  searchParams: Promise<{
    q?: string;
    filter?: string;
    source?: string;
    deleted?: string;
    deleteError?: string;
  }>;
};

function positiveId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export default async function AdminGamesPage({ searchParams }: GamesPageProps) {
  const params = await searchParams;
  const filter = parseAdminGameFilter(params.filter);
  const query = params.q?.trim() ?? "";
  const sourceId = positiveId(params.source);
  const [sources, rows] = await Promise.all([
    listGameSources(),
    listAdminGames({ query, filter, sourceId }),
  ]);

  return (
    <main className="app-shell admin-wide-shell">
      <div className="admin-subpage-topbar">
        <Link className="back-link compact-back-link" href="/admin">← Admin</Link>
        <Link className="text-link" href="/admin/data-health">Data health</Link>
      </div>

      <header className="admin-section-header">
        <div>
          <h1>Games &amp; sources</h1>
          <p className="muted">Inspect canonical games, current provenance and unresolved player links.</p>
        </div>
        <span className="count-badge">{rows.length}</span>
      </header>

      {params.deleted ? <p className="admin-success-note">Canonical game deleted.</p> : null}
      {params.deleteError ? <p className="form-error">The game could not be deleted.</p> : null}

      <section className="admin-source-summary">
        {sources.map((source) => (
          <Link
            href={`/admin/games?source=${source.id}`}
            key={source.id}
          >
            <strong>{source.label}</strong>
            <span>{Number(source.gameCount)} games</span>
          </Link>
        ))}
      </section>

      <form className="admin-search-form admin-game-search" method="get">
        <input
          aria-label="Search games"
          defaultValue={query}
          name="q"
          placeholder="Search player, event or site"
          type="search"
        />
        <select defaultValue={filter} name="filter">
          <option value="all">All games</option>
          <option value="unresolved">Unresolved sides</option>
        </select>
        <select defaultValue={sourceId ? String(sourceId) : ""} name="source">
          <option value="">All sources</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>{source.label}</option>
          ))}
        </select>
        <button className="button secondary-button" type="submit">Apply</button>
      </form>

      {rows.length === 0 ? (
        <p className="simple-empty-copy">No games match this view.</p>
      ) : (
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Date</th>
                <th>Result</th>
                <th>Event</th>
                <th>Source</th>
                <th className="numeric-cell">Imports</th>
                <th>Health</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((game) => {
                const unresolved = game.whitePlayerId === null || game.blackPlayerId === null;
                return (
                  <tr key={game.id}>
                    <td>
                      <strong>{game.whiteName} – {game.blackName}</strong>
                      <small>#{game.id}</small>
                    </td>
                    <td>{game.playedOn ?? "—"}</td>
                    <td>{game.result}</td>
                    <td>{game.event ?? "—"}</td>
                    <td>{game.sourceLabel}</td>
                    <td className="numeric-cell">{Number(game.occurrenceCount)}</td>
                    <td>{unresolved ? <span className="admin-warning-text">unresolved</span> : "ok"}</td>
                    <td className="admin-table-actions">
                      <Link href={`/admin/games/${game.id}`}>Inspect</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
