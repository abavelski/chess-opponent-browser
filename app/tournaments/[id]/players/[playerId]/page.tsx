import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GameViewer } from "@/app/games/[gameId]/game-viewer";
import { getDb } from "@/lib/db";
import { gameSources, games, players, tournamentParticipants, tournaments } from "@/lib/db/schema";
import {
  buildGameFilterPlan,
  defaultGameFilters,
  hasActiveGameFilters,
  parseGameFilters,
  type GameFilterQuery,
  type GameFilterState,
} from "@/lib/games/filters";
import { buildReplayDocument, type ReplayDocument } from "@/lib/games/viewer";

import { GameFilterControls } from "./filter-controls";
import { CopyPgnButton } from "./copy-pgn-button";
import { GameSelectionHotkeys } from "./game-hotkeys";

export const dynamic = "force-dynamic";

type PlayerPageProps = {
  params: Promise<{ id: string; playerId: string }>;
  searchParams: Promise<GameFilterQuery>;
};

type CompactGameItem = {
  id: number;
  whiteName: string;
  blackName: string;
  whiteRating: number | null;
  blackRating: number | null;
  date: string | null;
  result: string;
};

type SelectedGame = CompactGameItem & {
  event: string | null;
  site: string | null;
  round: string | null;
  eco: string | null;
  opening: string | null;
  sourceLabel: string;
  replay: ReplayDocument | null;
  orientation: "white" | "black";
  originalPgn: string;
};

function parsePositiveId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function compactFilters(query: GameFilterQuery): GameFilterState {
  const parsed = parseGameFilters(query, []);

  return {
    ...defaultGameFilters,
    color: parsed.color,
    date: parsed.date,
    minRating: parsed.minRating,
    maxRating: parsed.maxRating,
    sort: parsed.sort,
  };
}

export default async function PlayerPage({ params, searchParams }: PlayerPageProps) {
  const [{ id: rawTournamentId, playerId: rawPlayerId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const tournamentId = parsePositiveId(rawTournamentId);
  const playerId = parsePositiveId(rawPlayerId);

  if (tournamentId === null || playerId === null) {
    notFound();
  }

  let detail:
    | {
        tournamentName: string;
        playerName: string;
      }
    | undefined;
  let gameItems: CompactGameItem[] = [];
  let selectedGame: SelectedGame | null = null;
  let activeFilters: GameFilterState = defaultGameFilters;
  let hasAnyKnownGames = false;

  try {
    const db = getDb();

    [detail] = await db
      .select({
        tournamentName: tournaments.name,
        playerName: players.name,
      })
      .from(tournamentParticipants)
      .innerJoin(tournaments, eq(tournamentParticipants.tournamentId, tournaments.id))
      .innerJoin(players, eq(tournamentParticipants.playerId, players.id))
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.playerId, playerId),
        ),
      )
      .limit(1);

    if (detail) {
      const playerLinkCondition = or(
        eq(games.whitePlayerId, playerId),
        eq(games.blackPlayerId, playerId),
      );

      const [knownGame] = await db
        .select({ id: games.id })
        .from(games)
        .where(playerLinkCondition)
        .limit(1);
      hasAnyKnownGames = Boolean(knownGame);

      activeFilters = compactFilters(query);
      const plan = buildGameFilterPlan(activeFilters, new Date());

      const colorCondition =
        plan.color === "white"
          ? eq(games.whitePlayerId, playerId)
          : plan.color === "black"
            ? eq(games.blackPlayerId, playerId)
            : undefined;
      const dateCondition = plan.minPlayedOn
        ? gte(games.playedOn, plan.minPlayedOn)
        : undefined;
      const opponentRating = sql<number>`case
        when ${games.whitePlayerId} = ${playerId} then ${games.blackRating}
        when ${games.blackPlayerId} = ${playerId} then ${games.whiteRating}
        else null
      end`;
      const minRatingCondition = plan.minOpponentRating
        ? gte(opponentRating, plan.minOpponentRating)
        : undefined;
      const maxRatingCondition = plan.maxOpponentRating
        ? lte(opponentRating, plan.maxOpponentRating)
        : undefined;

      const orderExpressions =
        plan.sort === "oldest"
          ? [sql`${games.playedOn} asc nulls last`, sql`${games.id} asc`]
          : plan.sort === "strongest"
            ? [
                sql`${opponentRating} desc nulls last`,
                sql`${games.playedOn} desc nulls last`,
                sql`${games.id} desc`,
              ]
            : [sql`${games.playedOn} desc nulls last`, sql`${games.id} desc`];

      const gameRows = await db
        .select({
          id: games.id,
          whiteName: games.whiteName,
          blackName: games.blackName,
          whiteRating: games.whiteRating,
          blackRating: games.blackRating,
          playedOn: games.playedOn,
          result: games.result,
        })
        .from(games)
        .where(and(
          playerLinkCondition,
          colorCondition,
          dateCondition,
          minRatingCondition,
          maxRatingCondition,
        ))
        .orderBy(...orderExpressions);

      gameItems = gameRows.map((game) => ({
        id: game.id,
        whiteName: game.whiteName,
        blackName: game.blackName,
        whiteRating: game.whiteRating,
        blackRating: game.blackRating,
        date: game.playedOn,
        result: game.result,
      }));

      const requestedGameId = parsePositiveId(firstValue(query.game) ?? "");
      const selectedGameId =
        requestedGameId && gameItems.some((game) => game.id === requestedGameId)
          ? requestedGameId
          : gameItems[0]?.id ?? null;

      if (selectedGameId !== null) {
        const [row] = await db
          .select({
            id: games.id,
            whiteName: games.whiteName,
            blackName: games.blackName,
            whiteRating: games.whiteRating,
            blackRating: games.blackRating,
            playedOn: games.playedOn,
            result: games.result,
            whitePlayerId: games.whitePlayerId,
            blackPlayerId: games.blackPlayerId,
            event: games.event,
            site: games.site,
            round: games.round,
            eco: games.eco,
            opening: games.opening,
            sourceLabel: gameSources.label,
            originalPgn: games.originalPgn,
            structuredMoves: games.structuredMoves,
          })
          .from(games)
          .innerJoin(gameSources, eq(games.sourceId, gameSources.id))
          .where(eq(games.id, selectedGameId))
          .limit(1);

        if (row) {
          selectedGame = {
            id: row.id,
            whiteName: row.whiteName,
            blackName: row.blackName,
            whiteRating: row.whiteRating,
            blackRating: row.blackRating,
            date: row.playedOn,
            result: row.result,
            event: row.event,
            site: row.site,
            round: row.round,
            eco: row.eco,
            opening: row.opening,
            sourceLabel: row.sourceLabel,
            replay: buildReplayDocument(row.structuredMoves),
            orientation: row.blackPlayerId === playerId ? "black" : "white",
            originalPgn: row.originalPgn,
          };
        }
      }
    }
  } catch (error) {
    console.error("Failed to load opponent workspace", error);

    return (
      <main className="app-shell narrow-shell">
        <Link className="back-link" href={`/tournaments/${tournamentId}`}>
          ← Tournament
        </Link>
        <section className="panel empty-state" role="alert">
          <h1>Opponent could not be loaded</h1>
          <p>Try refreshing the page. If the problem continues, check the database health.</p>
        </section>
      </main>
    );
  }

  if (!detail) {
    notFound();
  }

  const playerPath = `/tournaments/${tournamentId}/players/${playerId}`;
  const active = hasActiveGameFilters(activeFilters);

  function gameHref(gameId: number) {
    const params = new URLSearchParams();

    if (activeFilters.color !== "all") params.set("color", activeFilters.color);
    if (activeFilters.date !== "all") params.set("date", activeFilters.date);
    if (activeFilters.minRating !== null) params.set("minRating", String(activeFilters.minRating));
    if (activeFilters.maxRating !== null) params.set("maxRating", String(activeFilters.maxRating));
    if (activeFilters.sort !== "newest") params.set("sort", activeFilters.sort);
    params.set("game", String(gameId));

    return `${playerPath}?${params.toString()}`;
  }

  const gameHrefs = gameItems.map((game) => gameHref(game.id));

  return (
    <main className="app-shell opponent-workspace-shell">
      <div className="compact-opponent-topbar">
        <Link className="back-link compact-back-link" href={`/tournaments/${tournamentId}`}>
          ← {detail.tournamentName}
        </Link>
        <span className="muted">{gameItems.length} games</span>
      </div>

      <header className="compact-opponent-header">
        <h1>{detail.playerName}</h1>
      </header>

      {hasAnyKnownGames ? (
        <GameFilterControls
          action={playerPath}
          showReset={active}
          value={activeFilters}
        />
      ) : null}

      {!hasAnyKnownGames ? (
        <section className="panel empty-state compact-workspace-empty">
          <h2>No known games yet</h2>
          <p>No globally stored games are linked to this player yet.</p>
        </section>
      ) : gameItems.length === 0 ? (
        <section className="panel empty-state compact-workspace-empty">
          <h2>No games match these filters</h2>
          <p>Try a broader color or date range.</p>
          <Link className="text-link" href={playerPath}>
            Reset filters
          </Link>
        </section>
      ) : (
        <>
          <GameSelectionHotkeys
            gameHrefs={gameHrefs}
            selectedGameId={selectedGame?.id ?? null}
            gameIds={gameItems.map((game) => game.id)}
          />

          <div className="opponent-workspace">
            <aside aria-label="Games" className="opponent-game-list-pane">
              <ul className="compact-game-list">
                {gameItems.map((game) => {
                  const selected = game.id === selectedGame?.id;

                  return (
                    <li key={game.id}>
                      <Link
                        aria-current={selected ? "page" : undefined}
                        className={`compact-game-row${selected ? " is-selected" : ""}`}
                        href={gameHref(game.id)}
                      >
                        <span className="compact-game-names">
                          <span className="compact-game-player">
                            <strong>{game.whiteName}</strong>
                            {game.whiteRating ? <small>{game.whiteRating}</small> : null}
                          </span>
                          <span aria-hidden="true" className="compact-game-separator">–</span>
                          <span className="compact-game-player">
                            <strong>{game.blackName}</strong>
                            {game.blackRating ? <small>{game.blackRating}</small> : null}
                          </span>
                        </span>
                        <span className="compact-game-meta">
                          <span>{game.date ?? "—"}</span>
                          <strong>{game.result}</strong>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section aria-label="Game review" className="opponent-review-pane">
              {selectedGame ? (
                <>
                  <div className="compact-review-heading">
                    <div className="compact-review-matchup">
                      <strong>{selectedGame.whiteName}</strong>
                      <span>{selectedGame.result}</span>
                      <strong>{selectedGame.blackName}</strong>
                    </div>
                    <div className="compact-review-actions">
                      <span className="muted">{selectedGame.date ?? "—"}</span>
                      <CopyPgnButton pgn={selectedGame.originalPgn} />
                    </div>
                  </div>

                  <section aria-label="Selected game details" className="panel compact-game-details">
                    <dl>
                      <div>
                        <dt>Tournament</dt>
                        <dd>{detail.tournamentName}</dd>
                      </div>
                      {selectedGame.event ? (
                        <div>
                          <dt>Event</dt>
                          <dd>{selectedGame.event}</dd>
                        </div>
                      ) : null}
                      {selectedGame.site ? (
                        <div>
                          <dt>Place</dt>
                          <dd>{selectedGame.site}</dd>
                        </div>
                      ) : null}
                      {selectedGame.date ? (
                        <div>
                          <dt>Date</dt>
                          <dd>{selectedGame.date}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Ratings</dt>
                        <dd>
                          {selectedGame.whiteRating ?? "—"} / {selectedGame.blackRating ?? "—"}
                        </dd>
                      </div>
                      {selectedGame.round ? (
                        <div>
                          <dt>Round</dt>
                          <dd>{selectedGame.round}</dd>
                        </div>
                      ) : null}
                      {selectedGame.eco || selectedGame.opening ? (
                        <div>
                          <dt>Opening</dt>
                          <dd>
                            {[selectedGame.eco, selectedGame.opening].filter(Boolean).join(" · ")}
                          </dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Source</dt>
                        <dd>{selectedGame.sourceLabel}</dd>
                      </div>
                    </dl>
                  </section>

                  {selectedGame.replay ? (
                    <GameViewer
                      compact
                      initialOrientation={selectedGame.orientation}
                      key={selectedGame.id}
                      replay={selectedGame.replay}
                    />
                  ) : (
                    <div className="panel empty-state compact-viewer-empty">
                      <p>Moves are unavailable for this game.</p>
                    </div>
                  )}
                </>
              ) : null}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
