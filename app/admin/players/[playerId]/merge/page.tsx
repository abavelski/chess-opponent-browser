import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPlayerMaintenanceDetail,
  getPlayerMergePreview,
  searchMergeTargets,
} from "@/lib/admin/players";

import { MergePlayerForm } from "./merge-player-form";

export const dynamic = "force-dynamic";

type MergePageProps = {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ q?: string; target?: string; error?: string }>;
};

function positiveId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function errorMessage(code: string | undefined) {
  if (code === "dsu_conflict") return "Both players have different DSU IDs. Resolve the identity conflict before merging.";
  if (code === "fide_conflict") return "Both players have different FIDE IDs. Resolve the identity conflict before merging.";
  if (code === "player_missing") return "One of the players no longer exists.";
  if (code === "same_player") return "A player cannot be merged into itself.";
  if (code === "database") return "The merge could not be completed.";
  return null;
}

export default async function MergePlayerPage({ params, searchParams }: MergePageProps) {
  const [{ playerId: rawPlayerId }, query] = await Promise.all([params, searchParams]);
  const sourcePlayerId = positiveId(rawPlayerId);
  if (!sourcePlayerId) notFound();

  const source = await getPlayerMaintenanceDetail(sourcePlayerId);
  if (!source) notFound();

  const q = query.q?.trim() ?? "";
  const targetPlayerId = positiveId(query.target);
  const [candidates, preview] = await Promise.all([
    q ? searchMergeTargets(sourcePlayerId, q) : Promise.resolve([]),
    targetPlayerId
      ? getPlayerMergePreview(sourcePlayerId, targetPlayerId)
      : Promise.resolve(null),
  ]);
  const message = errorMessage(query.error);
  const conflict = preview?.dsuConflict || preview?.fideConflict;

  return (
    <main className="app-shell narrow-shell admin-maintenance-shell">
      <Link className="back-link" href="/admin/players">← Players</Link>

      <header className="admin-section-header">
        <div>
          <h1>Merge player</h1>
          <p className="muted">
            Source: <strong>{source.name}</strong> · #{source.id}
          </p>
        </div>
      </header>

      <dl className="admin-compact-stats">
        <div><dt>DSU</dt><dd>{source.dsuId ?? "—"}</dd></div>
        <div><dt>FIDE</dt><dd>{source.fideId ?? "—"}</dd></div>
        <div><dt>Tournaments</dt><dd>{source.tournamentCount}</dd></div>
        <div><dt>Games</dt><dd>{source.gameCount}</dd></div>
        <div><dt>Aliases</dt><dd>{source.aliasCount}</dd></div>
      </dl>

      {message ? <p className="form-error admin-maintenance-error">{message}</p> : null}

      <form className="admin-search-form" method="get">
        <input
          aria-label="Search merge target"
          defaultValue={q}
          name="q"
          placeholder="Find target player by name, alias, DSU or FIDE ID"
          type="search"
        />
        <button className="button secondary-button" type="submit">Find target</button>
      </form>

      {candidates.length > 0 ? (
        <div className="admin-merge-candidates">
          {candidates.map((candidate) => (
            <Link
              href={`/admin/players/${source.id}/merge?target=${candidate.id}`}
              key={candidate.id}
            >
              <strong>{candidate.name}</strong>
              <span>
                DSU {candidate.dsuId ?? "—"} · FIDE {candidate.fideId ?? "—"}
              </span>
            </Link>
          ))}
        </div>
      ) : q && !preview ? (
        <p className="simple-empty-copy">No merge targets found.</p>
      ) : null}

      {preview ? (
        <section className="panel admin-merge-preview">
          <h2>Merge into {preview.target.name}</h2>
          <dl className="admin-compact-stats">
            <div><dt>DSU</dt><dd>{preview.target.dsuId ?? "—"}</dd></div>
            <div><dt>FIDE</dt><dd>{preview.target.fideId ?? "—"}</dd></div>
            <div><dt>Tournaments</dt><dd>{preview.target.tournamentCount}</dd></div>
            <div><dt>Games</dt><dd>{preview.target.gameCount}</dd></div>
            <div><dt>Aliases</dt><dd>{preview.target.aliasCount}</dd></div>
          </dl>

          {conflict ? (
            <div className="inline-alert">
              <strong>Merge blocked.</strong>
              <p>
                {preview.dsuConflict ? "Both records have DSU IDs. " : ""}
                {preview.fideConflict ? "Both records have FIDE IDs. " : ""}
                This conservative merge will not guess which external identity is correct.
              </p>
            </div>
          ) : (
            <>
              <p className="muted admin-merge-copy">
                Games, tournament memberships and aliases from <strong>{preview.source.name}</strong> will move to <strong>{preview.target.name}</strong>. Missing DSU/FIDE metadata and newer rating data are preserved on the target. The source player row is then removed and the operation is recorded in merge history.
              </p>
              <MergePlayerForm
                sourceName={preview.source.name}
                sourcePlayerId={preview.source.id}
                targetName={preview.target.name}
                targetPlayerId={preview.target.id}
              />
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
