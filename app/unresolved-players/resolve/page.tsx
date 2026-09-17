import Link from "next/link";

import { normalizeAliasKey, normalizeSourceFideId } from "@/lib/identities/domain";
import {
  getUnresolvedIdentitySides,
  listCanonicalPlayerOptions,
  listUnresolvedIdentityGroups,
} from "@/lib/identities/repository";

import { createPlayerAndResolve } from "../actions";
import { ExistingPlayerForm } from "./existing-player-form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResolvePlayerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawNameKey = first(params.nameKey) ?? "";
  const normalizedName = normalizeAliasKey(rawNameKey);
  const sourceFideId = normalizeSourceFideId(first(params.fideId));
  const actionError = first(params.error);

  let sides: Awaited<ReturnType<typeof getUnresolvedIdentitySides>> = [];
  let players: Awaited<ReturnType<typeof listCanonicalPlayerOptions>> = [];
  let group: Awaited<ReturnType<typeof listUnresolvedIdentityGroups>>[number] | null = null;
  let loadError = false;

  try {
    const [sideRows, playerRows, matchingGroups] = await Promise.all([
      getUnresolvedIdentitySides(normalizedName, sourceFideId),
      listCanonicalPlayerOptions(),
      listUnresolvedIdentityGroups(normalizedName),
    ]);
    sides = sideRows;
    players = playerRows;
    group =
      matchingGroups.find(
        (candidate) =>
          candidate.normalizedName === normalizedName &&
          candidate.sourceFideId === sourceFideId,
      ) ?? null;
  } catch (error) {
    console.error("Failed to load unresolved player detail", error);
    loadError = true;
  }

  const rawName = group?.rawName ?? sides[0]?.rawName ?? rawNameKey;
  const sideCount = group?.sideCount ?? sides.length;

  return (
    <main className="app-shell">
      <Link className="back-link" href="/unresolved-players">
        ← Unresolved players
      </Link>

      <header className="page-header identity-detail-header">
        <div>
          <p className="eyebrow">Player review</p>
          <h1>{rawName || "Unresolved player"}</h1>
          <p className="muted page-intro">
            Normalized key: <strong>{normalizedName || "—"}</strong>
            {sourceFideId ? ` · Source FIDE ${sourceFideId}` : " · No source FIDE ID"}
          </p>
        </div>
        <span className="count-badge">{sideCount} affected side{sideCount === 1 ? "" : "s"}</span>
      </header>

      {actionError ? <div className="inline-alert error-alert" role="alert">{actionError}</div> : null}

      {loadError ? (
        <section className="panel empty-state" role="alert">
          <h2>Player details could not be loaded</h2>
          <p>Refresh and try again. No player changes were applied.</p>
        </section>
      ) : !group || sideCount === 0 ? (
        <section className="panel empty-state">
          <h2>This player group is no longer unresolved</h2>
          <p>It may already have been resolved in another session.</p>
          <Link className="text-link" href="/unresolved-players">Return to unresolved players →</Link>
        </section>
      ) : (
        <>
          <section className="section-stack" aria-labelledby="context-heading">
            <div className="section-heading">
              <h2 id="context-heading">Source context</h2>
              <span className="muted">Showing up to {sides.length} recent sides</span>
            </div>
            <div className="identity-context-grid">
              {sides.slice(0, 12).map((side) => (
                <article className="panel identity-game-context" key={`${side.gameId}-${side.side}`}>
                  <div className="identity-context-heading">
                    <strong>{side.side === "white" ? "White" : "Black"} vs {side.opponentName}</strong>
                    <Link className="text-link" href={`/games/${side.gameId}`}>Game #{side.gameId}</Link>
                  </div>
                  <p className="muted">
                    {side.playedOn ?? "Date unknown"} · {side.result}
                    {side.event ? ` · ${side.event}` : ""}
                  </p>
                  <p className="muted">
                    Rating {side.rating ?? "—"} · Federation {side.federation ?? "—"} · {side.sourceLabel}
                    {side.importId ? ` · Import #${side.importId}` : ""}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="identity-resolution-grid" aria-label="Resolution options">
            <div className="panel form-panel">
              <p className="eyebrow">Option 1</p>
              <h2>Link to existing Player</h2>
              <p className="muted">
                Choose the canonical person deliberately. A direct non-empty FIDE ID conflict is blocked.
              </p>
              <ExistingPlayerForm
                players={players}
                normalizedName={normalizedName}
                sourceFideId={sourceFideId}
                sideCount={sideCount}
                rawName={rawName}
              />
            </div>

            <div className="panel form-panel">
              <p className="eyebrow">Option 2</p>
              <h2>Create new Player</h2>
              <p className="muted">
                Creates a global canonical Player and links this unresolved group. It does not add the Player to any tournament automatically.
              </p>
              <form action={createPlayerAndResolve} className="stack-form identity-resolution-form">
                <input name="nameKey" type="hidden" value={normalizedName} />
                <input name="sourceFideId" type="hidden" value={sourceFideId ?? ""} />
                <div className="field-group">
                  <label htmlFor="canonicalName">Canonical name</label>
                  <input id="canonicalName" name="canonicalName" defaultValue={rawName} maxLength={200} required />
                </div>
                <div className="field-group">
                  <label htmlFor="canonicalFideId">FIDE ID</label>
                  <input id="canonicalFideId" name="canonicalFideId" defaultValue={sourceFideId ?? ""} inputMode="numeric" maxLength={32} />
                  <p className="helper-text">Optional. Existing Player FIDE-ID uniqueness rules apply.</p>
                </div>
                <label className="identity-checkbox">
                  <input name="rememberAlias" type="checkbox" />
                  <span>Remember “{rawName}” as an exact alias for future imports</span>
                </label>
                <button className="button" type="submit">Create Player and resolve</button>
              </form>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
