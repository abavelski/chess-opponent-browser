import Link from "next/link";

import { getDataHealthSummary, listRecentPlayerMerges } from "@/lib/admin/health";

export const dynamic = "force-dynamic";

function summaryNumber(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const number = record[key];
  return typeof number === "number" ? number : null;
}

export default async function AdminDataHealthPage() {
  const [health, merges] = await Promise.all([
    getDataHealthSummary(),
    listRecentPlayerMerges(),
  ]);

  return (
    <main className="app-shell admin-wide-shell">
      <div className="admin-subpage-topbar">
        <Link className="back-link compact-back-link" href="/admin">← Admin</Link>
      </div>

      <header className="admin-section-header">
        <div>
          <h1>Data health</h1>
          <p className="muted">
            Compact maintenance view for identities, games, imports and sync quality.
          </p>
        </div>
      </header>

      <section className="admin-health-grid">
        <Link href="/admin/players?filter=orphaned">
          <strong>{health.fullyOrphanedPlayers}</strong>
          <span>orphaned players</span>
        </Link>
        <Link href="/admin/players?filter=game-only">
          <strong>{health.gameOnlyPlayers}</strong>
          <span>game-only players</span>
        </Link>
        <Link href="/admin/players?filter=roster-no-games">
          <strong>{health.rosterWithoutGames}</strong>
          <span>roster players without games</span>
        </Link>
        <Link href="/admin/players?filter=no-ids">
          <strong>{health.noIdPlayers}</strong>
          <span>players without DSU/FIDE ID</span>
        </Link>
        <Link href="/admin/players?filter=duplicate">
          <strong>{health.duplicateNamePlayers}</strong>
          <span>duplicate-name candidates</span>
        </Link>
        <Link href="/admin/players?filter=unresolved-alias">
          <strong>{health.unresolvedAliasPlayers}</strong>
          <span>players with unresolved alias sides</span>
        </Link>
        <Link href="/admin/games?filter=unresolved">
          <strong>{health.gamesWithUnresolvedSide}</strong>
          <span>games with unresolved side</span>
        </Link>
        <Link href="/unresolved-players">
          <strong>{health.unresolvedSides}</strong>
          <span>unresolved game sides</span>
        </Link>
        <Link href="/imports">
          <strong>{health.prunableImports}</strong>
          <span>duplicate-only imports safe to prune</span>
        </Link>
        <Link href="/admin/sync-runs">
          <strong>{health.failedSyncRuns}</strong>
          <span>sync runs with issues</span>
        </Link>
      </section>

      <section className="admin-maintenance-section">
        <h2>Inventory</h2>
        <dl className="admin-compact-stats admin-inventory-stats">
          <div><dt>Tournaments</dt><dd>{health.tournaments}</dd></div>
          <div><dt>Archived</dt><dd>{health.archivedTournaments}</dd></div>
          <div><dt>Players</dt><dd>{health.players}</dd></div>
          <div><dt>Games</dt><dd>{health.games}</dd></div>
          <div><dt>Sources</dt><dd>{health.gameSources}</dd></div>
          <div><dt>Imports</dt><dd>{health.imports}</dd></div>
          <div><dt>Import errors</dt><dd>{health.importErrors}</dd></div>
          <div><dt>Player merges</dt><dd>{health.mergeHistory}</dd></div>
        </dl>
      </section>

      <section className="admin-maintenance-section">
        <div className="section-heading">
          <h2>Recent player merges</h2>
          <span className="count-badge">{merges.length}</span>
        </div>
        {merges.length === 0 ? (
          <p className="simple-empty-copy">No player merges recorded yet.</p>
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Target</th>
                  <th>Games</th>
                  <th>Tournaments moved</th>
                  <th>Collapsed</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {merges.map((merge) => (
                  <tr key={merge.id}>
                    <td>{merge.sourceName} <small>#{merge.sourcePlayerId}</small></td>
                    <td>{merge.targetCurrentName ?? merge.targetName} <small>{merge.targetPlayerId ? `#${merge.targetPlayerId}` : "deleted"}</small></td>
                    <td>{summaryNumber(merge.summaryJson, "gamesMoved") ?? "—"}</td>
                    <td>{summaryNumber(merge.summaryJson, "tournamentRowsMoved") ?? "—"}</td>
                    <td>{summaryNumber(merge.summaryJson, "tournamentRowsCollapsed") ?? "—"}</td>
                    <td>{new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(merge.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
