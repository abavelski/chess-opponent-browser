import { and, eq, gte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GameViewer } from "@/app/games/[gameId]/game-viewer";
import { getDb } from "@/lib/db";
import { games, players, tournamentParticipants, tournaments } from "@/lib/db/schema";
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
  date: string | null;
  result: string;
};

type SelectedGame = CompactGameItem & {
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

      const orderExpressions =
        plan.sort === "oldest"
          ? [sql`${games.playedOn} asc nulls last`, sql`${games.id} asc`]
          : plan.sort === "strongest"
            ? [
                sql`case
                  when ${games.whitePlayerId} = ${playerId} then ${games.blackRating}
                  when ${games.blackPlayerId} = ${playerId} then ${games.whiteRating}
                  else null
                end desc nulls last`,
                sql`${games.playedOn} desc nulls last`,
                sql`${games.id} desc`,
              ]
            : [sql`${games.playedOn} desc nulls last`, sql`${games.id} desc`];

      const gameRows = await db
        .select({
          id: games.id,
          whiteName: games.whiteName,
          blackName: games.blackName,
          playedOn: games.playedOn,
          result: games.result,
        })
        .from(games)
        .where(and(playerLinkCondition, colorCondition, dateCondition))
        .orderBy(...orderExpressions);

      gameItems = gameRows.map((game) => ({
        id: game.id,
        whiteName: game.whiteName,
        blackName: game.blackName,
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
            playedOn: games.playedOn,
            result: games.result,
            whitePlayerId: games.whitePlayerId,
            blackPlayerId: games.blackPlayerId,
            originalPgn: games.originalPgn,
            structuredMoves: games.structuredMoves,
          })
          .from(games)
          .where(eq(games.id, selectedGameId))
          .limit(1);

        if (row) {
          selectedGame = {
            id: row.id,
            whiteName: row.whiteName,
            blackName: row.blackName,
            date: row.playedOn,
            result: row.result,
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
                          <strong>{game.whiteName}</strong>
                          <span aria-hidden="true">–</span>
                          <strong>{game.blackName}</strong>
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
