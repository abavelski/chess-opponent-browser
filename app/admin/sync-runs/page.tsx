import { desc, eq } from "drizzle-orm";
import Link from "next/link";

import { getDb } from "@/lib/db";
import { syncRuns, tournaments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function summaryText(value: Record<string, unknown> | null) {
  if (!value) return "—";
  const stages = value.stages;
  if (!stages || typeof stages !== "object") return "—";
  const stageNames = Object.keys(stages as Record<string, unknown>);
  return stageNames.length ? stageNames.join(", ") : "—";
}

export default async function AdminSyncRunsPage() {
  const rows = await getDb()
    .select({
      id: syncRuns.id,
      tournamentName: tournaments.name,
      tournamentId: tournaments.id,
      kind: syncRuns.kind,
      status: syncRuns.status,
      summaryJson: syncRuns.summaryJson,
      errorText: syncRuns.errorText,
      startedAt: syncRuns.startedAt,
      completedAt: syncRuns.completedAt,
    })
    .from(syncRuns)
    .innerJoin(tournaments, eq(syncRuns.tournamentId, tournaments.id))
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(150);

  return (
    <main className="app-shell admin-wide-shell">
      <div className="admin-subpage-topbar">
        <Link className="back-link compact-back-link" href="/admin">← Admin</Link>
        <Link className="text-link" href="/admin/data-health">Data health</Link>
      </div>

      <header className="admin-section-header">
        <div>
          <h1>Sync status</h1>
          <p className="muted">Recent tournament preparation runs recorded by the local CLI.</p>
        </div>
        <span className="count-badge">{rows.length}</span>
      </header>

      {rows.length === 0 ? (
        <p className="simple-empty-copy">No sync runs recorded yet.</p>
      ) : (
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Stages</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((run) => (
                <tr key={run.id}>
                  <td><Link className="text-link" href={`/tournaments/${run.tournamentId}`}>{run.tournamentName}</Link></td>
                  <td>{run.kind}</td>
                  <td><span className={`sync-status sync-status-${run.status}`}>{run.status.replaceAll("_", " ")}</span></td>
                  <td>{summaryText(run.summaryJson)}</td>
                  <td>{new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(run.startedAt)}</td>
                  <td>{run.completedAt ? new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(run.completedAt) : "—"}</td>
                  <td className="sync-message-cell">{run.errorText ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
