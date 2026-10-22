import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ execute }) }));

import { parsePgnPreview } from "@/lib/imports/pgn";
import { createImportPersistenceRepository } from "@/lib/imports/repository";

const game = parsePgnPreview('[White "One"]\n[Black "Two"]\n[Result "1-0"]\n\n1. e4 e5 1-0').games[0];
const input = { game, importId: 1, sourceId: 2, fingerprint: "content", moveFingerprint: "moves", whitePlayerId: 3, blackPlayerId: 4 };

describe("game import persistence", () => {
  beforeEach(() => { execute.mockReset(); });

  it("reuses an existing content fingerprint when player resolution adds a move fingerprint", async () => {
    const cause = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "games_duplicate_fingerprint_unique" });
    execute.mockRejectedValueOnce(new Error("query failed", { cause })).mockResolvedValueOnce({
      rows: [{ game_id: 10, outcome: "duplicate", white_player_id: 3, black_player_id: 4 }],
    });
    expect(await createImportPersistenceRepository().saveGameUnit(input)).toEqual({ gameId: 10, outcome: "duplicate", whitePlayerId: 3, blackPlayerId: 4 });
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(execute.mock.calls[0][0]).sql).toContain('on conflict ("move_fingerprint")');
    expect(dialect.sqlToQuery(execute.mock.calls[1][0]).sql).toContain('on conflict ("duplicate_fingerprint")');
  });

  it("does not retry unrelated constraints", async () => {
    const error = Object.assign(new Error("constraint failed"), { code: "23514", constraint: "games_result_format" });
    execute.mockRejectedValue(error);
    await expect(createImportPersistenceRepository().saveGameUnit(input)).rejects.toThrow("constraint failed");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
