import { and, eq, gte, or, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import {
  games,
  gameSources,
  players,
  tournamentParticipants,
  tournaments,
} from "@/lib/db/schema";
import {
  buildGameFilterPlan,
  defaultGameFilters,
  hasActiveGameFilters,
  parseGameFilters,
  type GameFilterQuery,
  type GameFilterState,
} from "@/lib/games/filters";
import {
  mapGameForPlayer,
  openingLabel,
  type PlayerGameListItem,
  type StoredGameListRow,
} from "@/lib/games/presentation";

import { GameFilterControls } from "./filter-controls";

export const dynamic = "force-dynamic";

type PlayerPageProps = {
  params: Promise<{ id: string; playerId: string }>;
  searchParams: Promise<GameFilterQuery>;
};

type SourceOption = {
  key: string;
  label: string;
};

function parsePositiveId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function resultClass(result: PlayerGameListItem["result"]) {
  if (result === "Win") return "result-win";
  if (result === "Loss") return "result-loss";
  if (result === "Draw") return "result-draw";
  return "result-unknown";
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
        fideId: string | null;
        federation: string | null;
        rating: number | null;
      }
    | undefined;
  let gameItems: PlayerGameListItem[] = [];
  let sourceOptions: SourceOption[] = [];
  let activeFilters: GameFilterState = defaultGameFilters;
  let hasAnyKnownGames = false;

  try {
    const db = getDb();

    [detail] = await db
      .select({
        tournamentName: tournaments.name,
        playerName: players.name,
        fideId: players.fideId,
        federation: tournamentParticipants.federation,
        rating: tournamentParticipants.rating,
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

      sourceOptions = await db
        .selectDistinct({ key: gameSources.sourceKey, label: gameSources.label })
        .from(games)
        .innerJoin(gameSources, eq(games.sourceId, gameSources.id))
        .where(playerLinkCondition)
        .orderBy(gameSources.label, gameSources.sourceKey);

      hasAnyKnownGames = sourceOptions.length > 0;
      activeFilters = parseGameFilters(
        query,
        sourceOptions.map((source) => source.key),
      );
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
      const ratingCondition = plan.minOpponentRating
        ? or(
            and(
              eq(games.whitePlayerId, playerId),
              gte(games.blackRating, plan.minOpponentRating),
            ),
            and(
              eq(games.blackPlayerId, playerId),
              gte(games.whiteRating, plan.minOpponentRating),
            ),
          )
        : undefined;
      const resultCondition =
        plan.whiteResult && plan.blackResult
          ? or(
              and(
                eq(games.whitePlayerId, playerId),
                eq(games.result, plan.whiteResult),
              ),
              and(
                eq(games.blackPlayerId, playerId),
                eq(games.result, plan.blackResult),
              ),
            )
          : undefined;
      const sourceCondition = plan.sourceKey
        ? eq(gameSources.sourceKey, plan.sourceKey)
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
          whitePlayerId: games.whitePlayerId,
          blackPlayerId: games.blackPlayerId,
          whiteName: games.whiteName,
          blackName: games.blackName,
          whiteRating: games.whiteRating,
          blackRating: games.blackRating,
          playedOn: games.playedOn,
          result: games.result,
          event: games.event,
          eco: games.eco,
          opening: games.opening,
          sourceLabel: gameSources.label,
        })
        .from(games)
        .innerJoin(gameSources, eq(games.sourceId, gameSources.id))
        .where(
          and(
            playerLinkCondition,
            colorCondition,
            dateCondition,
            ratingCondition,
            resultCondition,
            sourceCondition,
          ),
        )
        .orderBy(...orderExpressions);

      gameItems = gameRows.map((row) =>
        mapGameForPlayer(playerId, {
          ...row,
          result: row.result as StoredGameListRow["result"],
        }),
      );
    }
  } catch (error) {
    console.error("Failed to load tournament player", error);

    return (
      <main className="app-shell narrow-shell">
        <Link className="back-link" href={`/tournaments/${tournamentId}`}>
          ← Tournament
        </Link>
        <section className="panel empty-state" role="alert">
          <h1>Player could not be loaded</h1>
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

  return (
    <main className="app-shell">
      <Link className="back-link" href={`/tournaments/${tournamentId}`}>
        ← {detail.tournamentName}
      </Link>

      <header className="detail-header player-detail-header">
        <p className="eyebrow">Potential opponent</p>
        <h1>{detail.playerName}</h1>
      </header>

      <section aria-labelledby="identity-heading" className="section-stack player-identity-section">
        <h2 id="identity-heading">Player details</h2>
        <dl className="panel identity-grid">
          <div>
            <dt>FIDE ID</dt>
            <dd>{detail.fideId ?? "Not provided"}</dd>
          </div>
          <div>
            <dt>Federation</dt>
            <dd>{detail.federation ?? "Not provided"}</dd>
          </div>
          <div>
            <dt>Tournament rating</dt>
            <dd>{detail.rating ?? "Not provided"}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="games-heading" className="section-stack games-section">
        <div className="section-heading game-section-heading">
          <h2 id="games-heading">Known games</h2>
          <span className="game-count" aria-live="polite">
            {gameItems.length} matching {gameItems.length === 1 ? "game" : "games"}
          </span>
        </div>

        {hasAnyKnownGames ? (
          <GameFilterControls
            action={playerPath}
            showReset={active}
            sources={sourceOptions}
            value={activeFilters}
          />
        ) : null}

        {!hasAnyKnownGames ? (
          <div className="panel empty-state">
            <h3>No known games yet</h3>
            <p>No globally stored games are linked to this player yet.</p>
          </div>
        ) : gameItems.length === 0 ? (
          <div className="panel empty-state">
            <h3>No games match these filters</h3>
            <p>Try broadening the preparation set or reset all filters.</p>
            <Link className="button secondary-button" href={playerPath}>
              Reset filters
            </Link>
          </div>
        ) : (
          <ul className="game-list">
            {gameItems.map((game) => (
              <li className="panel game-card" key={game.id}>
                <div className="game-card-topline">
                  <span className="game-date">{game.date ?? "—"}</span>
                  <span className="color-pill">{game.color}</span>
                  <span className={`result-pill ${resultClass(game.result)}`}>{game.result}</span>
                </div>

                <div className="game-opponent">
                  <strong>{game.opponentName}</strong>
                  <span>{game.opponentRating ? `Rating ${game.opponentRating}` : "Rating —"}</span>
                </div>

                <dl className="game-metadata">
                  <div>
                    <dt>Event</dt>
                    <dd>{game.event ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Opening</dt>
                    <dd>{openingLabel(game.eco, game.opening)}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{game.sourceLabel}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
