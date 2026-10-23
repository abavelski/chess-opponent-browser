import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ database: undefined as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => state.database }));

import { createDesktopDatabase } from "../desktop/db";
import { createSqliteClient } from "../desktop/sqlite.cjs";
import { games, gameSources, imports, players, tournaments } from "@/lib/db/schema";
import { createImportPersistenceRepository } from "@/lib/imports/repository";
import { parsePgnPreview } from "@/lib/imports/pgn";
import { getDataHealthSummary } from "@/lib/admin/health";
import { listPlayerHealth } from "@/lib/admin/players";
import { createPlayerAndResolveIdentity, getUnresolvedIdentitySides, listUnresolvedIdentityGroups, resolveIdentityToExisting } from "@/lib/identities/repository";
import { POST as syncParticipants } from "@/app/api/admin/tournaments/sync/route";

let db: ReturnType<typeof createDesktopDatabase>;
beforeEach(() => { db = createDesktopDatabase(":memory:"); state.database = db; });
afterEach(() => { (db.$client as unknown as { close(): void }).close(); });

describe("desktop SQLite with the application's actual PostgreSQL queries", () => {
  it("maps defaults, booleans, JSON and dates and rolls back a failed batch", async () => {
    const [tournament] = await db.insert(tournaments).values({ name: "Offline", nickname: "offline" }).returning();
    expect(tournament.isActive).toBe(false);
    expect(tournament.createdAt).toBeInstanceOf(Date);
    await expect(db.batch([
      db.insert(players).values({ name: "Rolled back" }),
      db.insert(tournaments).values({ name: "Duplicate", nickname: "offline" }),
    ])).rejects.toThrow();
    expect(await db.select().from(players)).toEqual([]);
    await expect(db.insert(tournaments).values({ name: "Invalid", nickname: "BAD NICK" })).rejects.toThrow();
    await db.update(tournaments).set({ isActive: true }).where(eq(tournaments.id, tournament.id));
    expect((await db.select().from(tournaments))[0].isActive).toBe(true);
  });

  async function importGame() {
    const [source] = await db.insert(gameSources).values({ sourceKey: "local", label: "Local" }).returning();
    const [record] = await db.insert(imports).values({ sourceId: source.id, filename: "local.pgn", parsedCount: 1, parseErrorCount: 0 }).returning();
    const game = parsePgnPreview('[White "  Unknown   Player "]\n[Black "Opponent"]\n[WhiteFederation "DEN"]\n[Result "1-0"]\n\n1. e4 e5 1-0').games[0];
    const input = { game, importId: record.id, sourceId: source.id, fingerprint: "content", moveFingerprint: null, whitePlayerId: null, blackPlayerId: null };
    const repository = createImportPersistenceRepository();
    const first = await repository.saveGameUnit(input);
    expect(first.outcome).toBe("imported");
    const second = await repository.saveGameUnit(input);
    expect(second).toEqual({ ...first, outcome: "duplicate" });
    const resolvedFingerprint = await repository.saveGameUnit({ ...input, moveFingerprint: "moves" });
    expect(resolvedFingerprint).toEqual({ ...first, outcome: "duplicate" });
    expect((await db.select().from(games))[0].structuredMoves).toEqual(game.structuredMoves);
    return first;
  }

  it("imports and deduplicates PGN, lists unresolved identities and computes admin health", async () => {
    await importGame();
    const groups = await listUnresolvedIdentityGroups("");
    expect(groups).toHaveLength(2);
    const unknown = groups.find(group => group.normalizedName === "unknown player");
    expect(unknown?.federationHint).toBe("DEN");
    expect(await getUnresolvedIdentitySides("unknown player", null)).toHaveLength(1);
    expect(await listUnresolvedIdentityGroups("unknown")).toHaveLength(1);
    expect(await getDataHealthSummary()).toMatchObject({ games: 1, unresolvedSides: 2, imports: 1 });
    expect(await listPlayerHealth({ query: "", filter: "all" })).toEqual([]);
  });

  it("resolves identities through guarded writable CTEs", async () => {
    await importGame();
    const created = await createPlayerAndResolveIdentity({ normalizedName: "unknown player", sourceFideId: null, canonicalName: "Known Player", canonicalFideId: null, rememberAlias: true });
    expect(created).toMatchObject({ status: "resolved", updatedCount: 1 });
    const resolved = await resolveIdentityToExisting({ normalizedName: "opponent", sourceFideId: null, targetPlayerId: created.playerId!, rememberAlias: false });
    expect(resolved).toMatchObject({ status: "resolved", updatedCount: 1 });
    expect(await listUnresolvedIdentityGroups("")).toEqual([]);
    expect(await listPlayerHealth({ query: "Known", filter: "all" })).toHaveLength(1);
  });

  it("activates tournaments with the same atomic CTE used by the web action", async () => {
    await db.insert(tournaments).values({ name: "First", nickname: "first", isActive: true });
    const [next] = await db.insert(tournaments).values({ name: "Second", nickname: "second" }).returning();
    await db.execute(sql`with target as (
      select "id" from "tournaments" where "id" = ${next.id} and "archived_at" is null
    ), deactivated as (
      update "tournaments" set "is_active" = false where "is_active" = true
      and "id" <> ${next.id} and exists (select 1 from target) returning "id"
    ) update "tournaments" set "is_active" = true where "id" = ${next.id}
      and (select count(*) from deactivated) >= 0 returning "id"`);
    expect((await db.select().from(tournaments).where(eq(tournaments.isActive, true))).map(row => row.id)).toEqual([next.id]);
  });

  it("searches Danish names without losing Unicode case folding", async () => {
    await db.insert(players).values({ name: "Østergaard" });
    expect(await listPlayerHealth({ query: "øster", filter: "all" })).toHaveLength(1);
  });

  it("reconciles local participant snapshots through the existing API and atomic batch", async () => {
    await db.insert(tournaments).values({ name: "Local", nickname: "local" });
    const snapshot = { tournamentNickname: "local", players: [{ name: "Offline Player", fideId: "1234567", actualFideRating: 1800 }] };
    const request = () => new Request("http://localhost/api/admin/tournaments/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot),
    });
    const first = await syncParticipants(request());
    expect(await first.json()).toMatchObject({ ok: true, participants: { created: 1 } });
    const second = await syncParticipants(request());
    expect(await second.json()).toMatchObject({ ok: true, participants: { created: 0, matched: 1 } });
    expect(await db.select().from(players)).toHaveLength(1);
  });

  it("reopens saved data and refuses schema changes without deleting it", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "chess-sqlite-test-"));
    const filename = path.join(directory, "chess.sqlite");
    let disk = createDesktopDatabase(filename);
    const close = () => (disk.$client as unknown as { close(): void }).close();
    try {
      await disk.insert(players).values({ name: "Persisted" });
      close();
      expect(() => createSqliteClient(filename, [])).toThrow("migration is required");
      disk = createDesktopDatabase(filename);
      expect((await disk.select().from(players))[0].name).toBe("Persisted");
    } finally {
      close();
      for (const suffix of ["", "-wal", "-shm"]) rmSync(`${filename}${suffix}`, { force: true });
      rmdirSync(directory);
    }
  });
});
