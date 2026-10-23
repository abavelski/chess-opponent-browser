import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const remote = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => ({
  query: (sql: string, params: unknown[]) => ({ sql, params }),
  transaction: async (requests: Array<{ sql: string; params: unknown[] }>, options: { readOnly: boolean }) => {
    expect(options.readOnly).toBe(true);
    return requests.map(request => remote.read(request.sql, request.params));
  },
}) }));

import { createDesktopDatabase } from "../desktop/db";
import { games, gameSources, players } from "@/lib/db/schema";
import { parsePgnPreview } from "@/lib/imports/pgn";
import { localPgnSegments, syncDesktop } from "../scripts/desktop-sync.mjs";

describe("web-to-desktop tournament synchronization", () => {
  it("preserves local data, downloads only missing games, remaps IDs and repeats without duplication", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "chess-desktop-sync-"));
    const filename = path.join(directory, "chess.sqlite");
    const pgnFile = path.join(directory, "saved.pgn");
    const pgn = (event: string) => `[Event "${event}"]\r\n[White "Remote White"]\r\n[Black "Remote Black"]\r\n[Result "1-0"]\r\n\r\n1. e4 e5 1-0\r\n`;
    const hash = (text: string) => createHash("md5").update(text.replace(/\r\n?/g, "\n").trim()).digest("hex");
    const texts = [pgn("Existing"), pgn("Saved locally"), pgn("Saved locally"), pgn("Missing")];
    const canonicalDate = new Date("2026-01-01T00:00:00Z");
    const manifest = texts.map((text, index) => ({
      id: 101 + index, white_player_id: 501, black_player_id: 502,
      white_name: "Remote White", black_name: "Remote Black", result: "1-0",
      source_id: 601, original_pgn: undefined, structured_moves: undefined,
      duplicate_fingerprint: index === 0 ? "content-a" : null, move_fingerprint: null,
      pgn_hash: hash(text), created_at: canonicalDate,
    }));
    remote.read.mockImplementation((query: string, params: number[][]) => {
      expect(query.trim().toLowerCase().startsWith("select")).toBe(true);
      if (query.includes("from tournaments")) return [{ id: 700, name: "Remote tournament", nickname: "desktop-sync-fixture", source_url: null, participant_group: null, archived_at: null, created_at: canonicalDate }];
      if (query.includes("from tournament_participants") && !query.includes("from games g")) return query.startsWith("select player_id") ? [{ player_id: 501 }] : [{ id: 800, tournament_id: 700, player_id: 501, rating: 1800, created_at: canonicalDate }];
      if (query.includes("from games g")) return manifest;
      if (query.includes("from players")) return [{ id: 501, name: "Remote White", fide_id: "1234567", current_fide_rating: 1800, created_at: canonicalDate }, { id: 502, name: "Remote Black", fide_id: "2345678", created_at: canonicalDate }];
      if (query.includes("from player_aliases")) return [{ id: 901, player_id: 501, alias_text: "Remote White", normalized_key: "remote white", created_at: canonicalDate }];
      if (query.includes("from game_sources")) return [{ id: 601, source_key: "remote", label: "Remote source", is_fixture: false, created_at: canonicalDate }];
      if (query.includes("original_pgn, structured_moves from games")) return params[0].map(id => ({ id, original_pgn: texts[id - 101], structured_moves: parsePgnPreview(texts[id - 101]).games[0].structuredMoves }));
      throw new Error(`Unexpected source query: ${query}`);
    });
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.invalid/test");
    let local = createDesktopDatabase(filename);
    const close = () => (local.$client as unknown as { close(): void }).close();
    try {
      const [white] = await local.insert(players).values({ name: "My local name", fideId: "1234567", currentFideRating: 1999 }).returning();
      const [source] = await local.insert(gameSources).values({ sourceKey: "remote", label: "My local source" }).returning();
      const originalPgn = texts[0].replace("1. e4", "1. e4 {my local annotation}");
      await local.insert(games).values({ whitePlayerId: white.id, whiteName: "Remote White", blackName: "Remote Black", sourceId: source.id, duplicateFingerprint: "content-a", originalPgn, structuredMoves: parsePgnPreview(originalPgn).games[0].structuredMoves });
      close();
      writeFileSync(pgnFile, texts[1]);
      const options = { database: filename, "local-pgn": pgnFile, "cache-dir": path.join(directory, "cache") };
      const first = await syncDesktop(options);
      expect(first).toMatchObject({ sqliteGamesReused: 1, localPgnGames: 2, downloadedGames: 1, gamesAdded: 3, localTournamentGames: 4 });
      const second = await syncDesktop(options);
      expect(second).toMatchObject({ sqliteGamesReused: 4, downloadedGames: 0, gamesAdded: 0, playersAdded: 0, localTournamentGames: 4 });
      local = createDesktopDatabase(filename);
      expect((await local.select().from(players)).find(player => player.fideId === "1234567")).toMatchObject({ name: "My local name", currentFideRating: 1999 });
      expect((await local.select().from(games)).find(game => game.duplicateFingerprint === "content-a")?.originalPgn).toBe(originalPgn);
      expect((await local.select().from(gameSources))[0].label).toBe("My local source");
      expect(remote.read.mock.calls.filter(([query]) => query.includes("original_pgn, structured_moves from games"))).toHaveLength(1);
      expect(JSON.parse(readFileSync(path.join(directory, "cache/last-sync.json"), "utf8")).gamesAdded).toBe(0);
    } finally {
      close();
      vi.unstubAllEnvs();
      const relative = path.relative(tmpdir(), directory);
      if (!relative.startsWith("chess-desktop-sync-") || relative.includes(path.sep)) throw new Error("Unexpected test cleanup path");
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("segments CRLF PGNs without treating comments as extra games", () => {
    const text = '[White "A"]\r\n[Black "B"]\r\n\r\n1. e4 {a comment} e5 *\r\n\r\n[White "C"]\r\n[Black "D"]\r\n\r\n1. d4 d5 *\r\n';
    const segments = [...localPgnSegments(text)];
    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain("{a comment}");
    expect(segments[1]).not.toContain("\r");
  });
});
