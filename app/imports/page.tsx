import Link from "next/link";

import { getPrunableImportCount } from "@/lib/admin/history";
import { importStatusLabel, listImportHistory } from "@/lib/imports/history";

import { PruneImportHistoryForm } from "./prune-import-history-form";

export const dynamic = "force-dynamic";

type ImportHistoryPageProps = {
  searchParams: Promise<{ pruned?: string; pruneError?: string }>;
};

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

export default async function ImportHistoryPage({ searchParams }: ImportHistoryPageProps) {
  const params = await searchParams;
  let rows: Awaited<ReturnType<typeof listImportHistory>> = [];
  let prunableCount = 0;
  let loadError = false;

  try {
    [rows, prunableCount] = await Promise.all([
      listImportHistory(),
      getPrunableImportCount(),
    ]);
  } catch (error) {
    console.error("Failed to load import history", error);
    loadError = true;
  }

  return (
    <main className="app-shell">
      <Link className="back-link" href="/admin">
        ← Admin
      </Link>

      <header className="page-header">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Import history</h1>
          <p className="muted page-intro">
            Review what each PGN import added, reused as already known, or could not process.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="button" href="/imports/new">
            Import games
          </Link>
        </div>
      </header>

      {params.pruned ? (
        <p className="admin-success-note">Pruned {params.pruned} duplicate-only import records.</p>
      ) : null}
      {params.pruneError ? (
        <p className="form-error">Duplicate-only import history could not be pruned.</p>
      ) : null}

      {prunableCount > 0 ? (
        <section className="panel import-prune-panel">
          <div>
            <strong>{prunableCount} duplicate-only import{prunableCount === 1 ? "" : "s"}</strong>
            <p className="muted">
              These completed imports added no canonical games, contain no errors or unresolved sides, and can be removed from history without deleting games.
            </p>
          </div>
          <PruneImportHistoryForm count={prunableCount} />
        </section>
      ) : null}

      {loadError ? (
        <section className="panel empty-state" role="alert">
          <h2>Import history could not be loaded</h2>
          <p>Try refreshing the page. If the problem continues, check database health.</p>
        </section>
      ) : rows.length === 0 ? (
        <section className="panel empty-state">
          <h2>No imports yet</h2>
          <p>Import a PGN file to create the first durable import record.</p>
          <Link className="text-link" href="/imports/new">
            Import games →
          </Link>
        </section>
      ) : (
        <ol className="import-history-list">
          {rows.map((row) => {
            const errors = row.parseErrorCount + row.persistenceErrorCount;
            return (
              <li key={row.id}>
                <Link className="panel import-history-card" href={`/imports/${row.id}`}>
                  <div className="import-history-card-heading">
                    <div>
                      <p className="eyebrow">Import #{row.id}</p>
                      <h2>{row.filename}</h2>
                    </div>
                    <span className={`import-status import-status-${row.status}`}>
                      {importStatusLabel(row.status)}
                    </span>
                  </div>

                  <p className="muted import-history-meta">
                    {row.sourceLabel} · {formatTimestamp(row.createdAt)} UTC
                  </p>

                  <dl className="import-history-counts">
                    <div>
                      <dt>Parsed</dt>
                      <dd>{row.parsedCount}</dd>
                    </div>
                    <div>
                      <dt>Imported</dt>
                      <dd>{row.importedCount}</dd>
                    </div>
                    <div>
                      <dt>Already known</dt>
                      <dd>{row.duplicateCount}</dd>
                    </div>
                    <div>
                      <dt>Errors</dt>
                      <dd>{errors}</dd>
                    </div>
                    <div>
                      <dt>Unresolved</dt>
                      <dd>{row.unresolvedSideCount}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
