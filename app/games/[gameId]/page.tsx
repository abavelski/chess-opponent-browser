import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { games, gameSources } from "@/lib/db/schema";
import { openingLabel } from "@/lib/games/presentation";
import { buildReplayDocument } from "@/lib/games/viewer";

import { GameViewer } from "./game-viewer";

export const dynamic = "force-dynamic";

type GamePageProps = {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parsePositiveId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeReturnPath(value: string | string[] | undefined) {
  const candidate = firstValue(value);
  if (!candidate) return "/";
  if (!candidate.startsWith("/tournaments/") || candidate.startsWith("//")) return "/";
  if (candidate.includes("\n") || candidate.includes("\r")) return "/";
  return candidate;
}

function ratingLabel(rating: number | null) {
  return rating ? String(rating) : "—";
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  const [{ gameId: rawGameId }, query] = await Promise.all([params, searchParams]);
  const gameId = parsePositiveId(rawGameId);
  const returnTo = safeReturnPath(query.returnTo);

  if (gameId === null) notFound();

  let game:
    | {
        id: number;
        whiteName: string;
        blackName: string;
        whiteRating: number | null;
        blackRating: number | null;
        playedOn: string | null;
        result: string;
        event: string | null;
        eco: string | null;
        opening: string | null;
        sourceLabel: string;
        structuredMoves: unknown;
      }
    | undefined;

  try {
    const db = getDb();
    [game] = await db
      .select({
        id: games.id,
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
        structuredMoves: games.structuredMoves,
      })
      .from(games)
      .innerJoin(gameSources, eq(games.sourceId, gameSources.id))
      .where(eq(games.id, gameId))
      .limit(1);
  } catch (error) {
    console.error("Failed to load game viewer", { gameId, error });
    return (
      <main className="app-shell narrow-shell">
        <Link className="back-link" href={returnTo}>
          ← Back
        </Link>
        <section className="panel empty-state" role="alert">
          <h1>Game could not be loaded</h1>
          <p>Try refreshing the page. If the problem continues, check the database health.</p>
        </section>
      </main>
    );
  }

  if (!game) notFound();

  const replay = buildReplayDocument(game.structuredMoves);
  if (!replay) {
    console.error("Stored game moves are unavailable", { gameId: game.id });
  }

  return (
    <main className="app-shell viewer-shell">
      <Link className="back-link" href={returnTo}>
        ← Back to preparation
      </Link>

      <header className="game-viewer-header">
        <p className="eyebrow">Game review</p>
        <h1>
          {game.whiteName} <span className="game-result-heading">{game.result}</span> {game.blackName}
        </h1>
      </header>

      <section aria-label="Game metadata" className="panel viewer-metadata">
        <div>
          <span>White</span>
          <strong>{game.whiteName}</strong>
          <small>Rating {ratingLabel(game.whiteRating)}</small>
        </div>
        <div>
          <span>Black</span>
          <strong>{game.blackName}</strong>
          <small>Rating {ratingLabel(game.blackRating)}</small>
        </div>
        <div>
          <span>Event / date</span>
          <strong>{game.event ?? "—"}</strong>
          <small>{game.playedOn ?? "Date —"}</small>
        </div>
        <div>
          <span>Opening</span>
          <strong>{openingLabel(game.eco, game.opening)}</strong>
          <small>Source: {game.sourceLabel}</small>
        </div>
      </section>

      {replay ? (
        <GameViewer replay={replay} />
      ) : (
        <section className="panel empty-state viewer-unavailable" role="status">
          <h2>Game moves unavailable</h2>
          <p>The game metadata is available, but its stored move representation could not be replayed.</p>
        </section>
      )}
    </main>
  );
}
