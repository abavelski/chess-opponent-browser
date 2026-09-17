import Link from "next/link";
import { notFound } from "next/navigation";

import { getImportHistoryDetail, importStatusLabel } from "@/lib/imports/history";

export const dynamic = "force-dynamic";

type ImportDetailPageProps = {
  params: Promise<{ id: string }>;
};

function parsePositiveId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function formatTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

function formatDate(value: string | null) {
  return value ?? "—";
}

export default async function ImportDetailPage({ params }: ImportDetailPageProps) {
  const { id: rawId } = await params;
  const importId = parsePositiveId(rawId);
  if (!importId) notFound();

  let detail: Awaited<ReturnType<typeof getImportHistoryDetail>>;
  try {
    detail = await getImportHistoryDetail(importId);
  } catch (error) {
    console.error("Failed to load import detail", error);
    throw error;
  }

  if (!detail) notFound();

  const { summary, items, errors } = detail;
  const totalErrors = summary.parseErrorCount + summary.persistenceErrorCount;

  return (
    <main className="app-shell">
      <Link className="back-link" href="/imports">
        ← Import history
      </Link>

      <header className="page-header import-detail-header">
        <div>
          <p className="eyebrow">Import #{summary.id}</p>
          <h1>{summary.filename}</h1>
          <p className="muted page-intro">
            {summary.sourceLabel} · {formatTimestamp(summary.createdAt)} UTC
          </p>
        </div>
        <span className={`import-status import-status-${summary.status}`}>
          {importStatusLabel(summary.status)}
        </span>
      </header>

      <dl className="import-summary import-result-summary">
        <div className="panel">
          <dt>Parsed</dt>
          <dd>{summary.parsedCount}</dd>
        </div>
        <div className="panel">
          <dt>Imported</dt>
          <dd>{summary.importedCount}</dd>
        </div>
        <div className="panel">
          <dt>Already known</dt>
          <dd>{summary.duplicateCount}</dd>
        </div>
        <div className="panel">
          <dt>Errors</dt>
          <dd>{totalErrors}</dd>
        </div>
        <div className="panel">
          <dt>Unresolved sides</dt>
          <dd>{summary.unresolvedSideCount}</dd>
        </div>
      </dl>

      <section className="section-stack" aria-labelledby="items-heading">
        <div className="section-heading">
          <h2 id="items-heading">Game outcomes</h2>
          <span className="count-badge">{items.length}</span>
        </div>

        {items.length === 0 ? (
          <div className="panel empty-state">
            <p>No successfully persisted game items were recorded for this import.</p>
          </div>
        ) : (
          <ol className="import-item-list">
            {items.map((item) => (
              <li className="panel import-item-card" key={item.id}>
                <div className="import-item-heading">
                  <div>
                    <span className="count-badge">{item.sourceIndex}</span>
                    <strong>
                      {item.whiteName} — {item.blackName}
                    </strong>
                  </div>
                  <span className={`import-outcome import-outcome-${item.outcome}`}>
                    {item.outcome === "duplicate" ? "Already known" : "Imported"}
                  </span>
                </div>
                <div className="import-item-meta muted">
                  <span>{formatDate(item.playedOn)}</span>
                  <span>{item.result}</span>
                  <span>{item.event ?? "Event unknown"}</span>
                </div>
                <Link className="text-link" href={`/games/${item.gameId}`}>
                  Open game #{item.gameId} →
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {errors.length > 0 ? (
        <section className="section-stack" aria-labelledby="errors-heading">
          <div className="section-heading">
            <h2 id="errors-heading">Errors</h2>
            <span className="count-badge">{errors.length}</span>
          </div>
          <ul className="panel import-errors import-history-errors">
            {errors.map((error) => (
              <li key={error.id}>
                <strong>
                  Game {error.sourceIndex} · {error.phase === "parse" ? "Parse" : "Save"}:
                </strong>{" "}
                {error.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
