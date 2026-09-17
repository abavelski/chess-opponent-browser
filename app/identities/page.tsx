import Link from "next/link";

import { listUnresolvedIdentityGroups } from "@/lib/identities/repository";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UnresolvedIdentitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = first(params.q)?.trim() ?? "";
  const resolved = Number(first(params.resolved) ?? 0);
  const created = first(params.created) === "1";
  const topError = first(params.error);

  let groups: Awaited<ReturnType<typeof listUnresolvedIdentityGroups>> = [];
  let loadError = false;
  try {
    groups = await listUnresolvedIdentityGroups(query);
  } catch (error) {
    console.error("Failed to load unresolved identities", error);
    loadError = true;
  }

  return (
    <main className="app-shell">
      <Link className="back-link" href="/">
        ← Tournaments
      </Link>

      <header className="page-header">
        <div>
          <p className="eyebrow">Administrator</p>
          <h1>Unresolved identities</h1>
          <p className="muted page-intro">
            Review imported player names that were intentionally left unlinked rather than guessed.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="button secondary-button" href="/imports">
            Import history
          </Link>
          <Link className="button" href="/imports/new">
            Import games
          </Link>
        </div>
      </header>

      {resolved > 0 ? (
        <div className="inline-alert success-alert" role="status">
          {created ? "Created a canonical player and linked" : "Linked"} {resolved} game side{resolved === 1 ? "" : "s"}. The games are now available wherever that Player is used.
        </div>
      ) : null}
      {topError ? (
        <div className="inline-alert error-alert" role="alert">{topError}</div>
      ) : null}

      <form className="panel identity-search-form" method="get">
        <div className="field-group">
          <label htmlFor="q">Search unresolved name</label>
          <input id="q" name="q" defaultValue={query} placeholder="Kowalski" />
        </div>
        <div className="form-actions">
          <button className="button" type="submit">Search</button>
          {query ? <Link className="text-link" href="/identities">Clear search</Link> : null}
        </div>
      </form>

      {loadError ? (
        <section className="panel empty-state" role="alert">
          <h2>Unresolved identities could not be loaded</h2>
          <p>Try refreshing the page. If the problem continues, check database health.</p>
        </section>
      ) : groups.length === 0 ? (
        <section className="panel empty-state">
          <h2>{query ? "No unresolved matches" : "No unresolved identities"}</h2>
          <p>{query ? "Try a different spelling or clear the search." : "All currently stored game sides are linked to canonical Players."}</p>
        </section>
      ) : (
        <section className="section-stack" aria-labelledby="identity-groups-heading">
          <div className="section-heading">
            <h2 id="identity-groups-heading">Needs review</h2>
            <span className="count-badge">{groups.length}</span>
          </div>
          <ol className="identity-group-list">
            {groups.map((group) => {
              const target = new URLSearchParams({ nameKey: group.normalizedName });
              if (group.sourceFideId) target.set("fideId", group.sourceFideId);
              return (
                <li key={`${group.normalizedName}|${group.sourceFideId ?? "-"}`}>
                  <Link className="panel identity-group-card" href={`/identities/resolve?${target.toString()}`}>
                    <div className="identity-group-heading">
                      <div>
                        <h3>{group.rawName}</h3>
                        <p className="muted identity-key">Key: {group.normalizedName}</p>
                      </div>
                      <span className="count-badge">{group.sideCount} side{group.sideCount === 1 ? "" : "s"}</span>
                    </div>
                    <dl className="identity-hints">
                      <div><dt>FIDE</dt><dd>{group.sourceFideId ?? "—"}</dd></div>
                      <div><dt>Rating</dt><dd>{group.ratingHint ?? "—"}</dd></div>
                      <div><dt>Federation</dt><dd>{group.federationHint ?? "—"}</dd></div>
                      <div><dt>Games</dt><dd>{group.gameCount}</dd></div>
                    </dl>
                    <p className="muted identity-context">
                      Recent context: {group.opponentName ? `vs ${group.opponentName}` : "opponent unknown"}
                      {group.event ? ` · ${group.event}` : ""}
                      {group.recentDate ? ` · ${group.recentDate}` : ""}
                      {group.sourceLabel ? ` · ${group.sourceLabel}` : ""}
                      {group.importId ? ` · Import #${group.importId}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </main>
  );
}
