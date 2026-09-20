import Link from "next/link";

import {
  listPlayerHealth,
  parsePlayerHealthFilter,
  type PlayerHealthRow,
} from "@/lib/admin/players";

export const dynamic = "force-dynamic";

type PlayersPageProps = {
  searchParams: Promise<{ filter?: string; q?: string; merged?: string }>;
};

const filters = [
  ["all", "All"],
  ["duplicate", "Duplicate names"],
  ["no-ids", "No IDs"],
  ["orphaned", "Orphaned"],
  ["game-only", "Game only"],
  ["roster-no-games", "Roster / no games"],
  ["unresolved-alias", "Unresolved aliases"],
] as const;

function issueLabel(row: PlayerHealthRow) {
  const issues = [];
  if (row.normalizedNameCount > 1) issues.push("duplicate name");
  if (!row.dsuId && !row.fideId) issues.push("no IDs");
  if (row.tournamentCount === 0 && row.gameCount === 0) issues.push("orphaned");
  else if (row.tournamentCount === 0 && row.gameCount > 0) issues.push("game only");
  else if (row.tournamentCount > 0 && row.gameCount === 0) issues.push("no games");
  if (row.unresolvedAliasSideCount > 0) {
    issues.push(`${row.unresolvedAliasSideCount} unresolved alias side${row.unresolvedAliasSideCount === 1 ? "" : "s"}`);
  }
  return issues;
}

export default async function AdminPlayersPage({ searchParams }: PlayersPageProps) {
  const params = await searchParams;
  const filter = parsePlayerHealthFilter(params.filter);
  const query = params.q?.trim() ?? "";
  const rows = await listPlayerHealth({ filter, query });

  return (
    <main className="app-shell admin-wide-shell">
      <div className="admin-subpage-topbar">
        <Link className="back-link compact-back-link" href="/admin">← Admin</Link>
        <Link className="text-link" href="/admin/data-health">Data health</Link>
      </div>

      <header className="admin-section-header">
        <div>
          <h1>Players</h1>
          <p className="muted">Review identity quality and merge duplicate canonical players.</p>
        </div>
        <span className="count-badge">{rows.length}</span>
      </header>

      {params.merged ? (
        <p className="admin-success-note">Player merge completed.</p>
      ) : null}

      <form className="admin-search-form" method="get">
        <input name="filter" type="hidden" value={filter} />
        <input
          aria-label="Search players"
          defaultValue={query}
          name="q"
          placeholder="Search name, alias, DSU or FIDE ID"
          type="search"
        />
        <button className="button secondary-button" type="submit">Search</button>
      </form>

      <nav aria-label="Player health filters" className="admin-filter-links">
        {filters.map(([value, label]) => {
          const search = new URLSearchParams();
          if (value !== "all") search.set("filter", value);
          if (query) search.set("q", query);
          const href = search.size ? `/admin/players?${search.toString()}` : "/admin/players";
          return (
            <Link
              aria-current={filter === value ? "page" : undefined}
              className={filter === value ? "is-active" : undefined}
              href={href}
              key={value}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="simple-empty-copy">No players match this view.</p>
      ) : (
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>DSU</th>
                <th>FIDE</th>
                <th className="numeric-cell">Tournaments</th>
                <th className="numeric-cell">Games</th>
                <th className="numeric-cell">Aliases</th>
                <th>Health</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const issues = issueLabel(row);
                return (
                  <tr key={row.id}>
                    <td><strong>{row.name}</strong><small>#{row.id}</small></td>
                    <td>{row.dsuId ?? "—"}</td>
                    <td>{row.fideId ?? "—"}</td>
                    <td className="numeric-cell">{row.tournamentCount}</td>
                    <td className="numeric-cell">{row.gameCount}</td>
                    <td className="numeric-cell">{row.aliasCount}</td>
                    <td className="admin-health-cell">
                      {issues.length ? issues.join(" · ") : <span className="muted">ok</span>}
                    </td>
                    <td className="admin-table-actions">
                      <Link href={`/admin/players/${row.id}/merge`}>Merge</Link>
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
