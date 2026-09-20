import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminGameDetail } from "@/lib/admin/games";

import { DeleteGameForm } from "../delete-game-form";

export const dynamic = "force-dynamic";

type GameDetailPageProps = {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ deleteError?: string }>;
};

function positiveId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export default async function AdminGameDetailPage({
  params,
  searchParams,
}: GameDetailPageProps) {
  const [{ gameId: rawGameId }, query] = await Promise.all([params, searchParams]);
  const gameId = positiveId(rawGameId);
  if (!gameId) notFound();

  const detail = await getAdminGameDetail(gameId);
  if (!detail) notFound();

  const { game, occurrences, errors } = detail;
  const unresolved = game.whitePlayerId === null || game.blackPlayerId === null;

  return (
    <main className="app-shell narrow-shell admin-maintenance-shell">
      <Link className="back-link" href="/admin/games">← Games &amp; sources</Link>

      <header className="admin-section-header">
        <div>
          <h1>{game.whiteName} – {game.blackName}</h1>
          <p className="muted">Game #{game.id} · {game.playedOn ?? "date unknown"} · {game.result}</p>
        </div>
        <Link className="text-link" href={`/games/${game.id}`}>Open viewer</Link>
      </header>

      {query.deleteError ? (
        <p className="form-error">The canonical game could not be deleted.</p>
      ) : null}

      <dl className="admin-detail-grid">
        <div><dt>Source</dt><dd>{game.sourceLabel}</dd></div>
        <div><dt>Source key</dt><dd>{game.sourceKey}</dd></div>
        <div><dt>Source game key</dt><dd>{game.sourceGameKey ?? "—"}</dd></div>
        <div><dt>Fingerprint</dt><dd>{game.duplicateFingerprint ?? "—"}</dd></div>
        <div><dt>Event</dt><dd>{game.event ?? "—"}</dd></div>
        <div><dt>Site</dt><dd>{game.site ?? "—"}</dd></div>
        <div><dt>Round</dt><dd>{game.round ?? "—"}</dd></div>
        <div><dt>ECO / opening</dt><dd>{[game.eco, game.opening].filter(Boolean).join(" · ") || "—"}</dd></div>
        <div><dt>White link</dt><dd>{game.whitePlayerId ? `player #${game.whitePlayerId}` : "unresolved"}</dd></div>
        <div><dt>Black link</dt><dd>{game.blackPlayerId ? `player #${game.blackPlayerId}` : "unresolved"}</dd></div>
      </dl>

      {unresolved ? (
        <p className="inline-alert">
          At least one player side is unresolved. Use <Link className="text-link" href="/unresolved-players">Unresolved players</Link> to repair identity links.
        </p>
      ) : null}

      <section className="admin-maintenance-section">
        <div className="section-heading">
          <h2>Import provenance</h2>
          <span className="count-badge">{occurrences.length}</span>
        </div>
        {occurrences.length === 0 ? (
          <p className="simple-empty-copy">No import-item history is linked to this game.</p>
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Import</th>
                  <th>File</th>
                  <th>Outcome</th>
                  <th>Source index</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.map((item) => (
                  <tr key={item.id}>
                    <td><Link className="text-link" href={`/imports/${item.importId}`}>#{item.importId}</Link></td>
                    <td>{item.filename}</td>
                    <td>{item.outcome === "duplicate" ? "already known" : "imported"}</td>
                    <td>{item.sourceIndex}</td>
                    <td>{Number(item.errorCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {errors.length > 0 ? (
        <section className="admin-maintenance-section">
          <div className="section-heading">
            <h2>Associated import errors</h2>
            <span className="count-badge">{errors.length}</span>
          </div>
          <ul className="panel admin-error-list">
            {errors.map((error) => (
              <li key={error.id}>
                <strong>Import #{error.importId} · game {error.sourceIndex} · {error.phase}</strong>
                <span>{error.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel admin-danger-zone">
        <div>
          <h2>Delete canonical game</h2>
          <p className="muted">
            Use this only for a bad game record. The canonical game and linked import-item rows are removed. Import summary counters remain historical.
          </p>
        </div>
        <DeleteGameForm
          gameId={game.id}
          label={`game #${game.id} (${game.whiteName} – ${game.blackName})`}
          occurrenceCount={occurrences.length}
        />
      </section>
    </main>
  );
}
