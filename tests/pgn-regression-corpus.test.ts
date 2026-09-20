import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parsePgnPreview } from "@/lib/imports/pgn";

const fixture = (name: string) => readFile(new URL(`./fixtures/pgn-regressions/${name}`, import.meta.url), "utf8");

describe("PGN parser regression corpus", () => {
  it("keeps games with no movetext as an explicit parse error", async () => {
    const preview = parsePgnPreview(await fixture("no-moves.pgn"));
    expect(preview.games).toEqual([]);
    expect(preview.errors).toEqual([{ index: 1, message: "No moves were found in this game." }]);
  });

  it("reports the exact illegal move instead of accepting it", async () => {
    const preview = parsePgnPreview(await fixture("illegal-move.pgn"));
    expect(preview.games).toEqual([]);
    expect(preview.errors[0]).toMatchObject({ index: 1 });
    expect(preview.errors[0].message).toContain("Qh9");
  });

  it("recovers adjacent game boundaries without requiring a blank separator", async () => {
    const preview = parsePgnPreview(await fixture("merged-boundary.pgn"));
    expect(preview.gamesFound).toBe(2);
    expect(preview.games.map((game) => game.event)).toEqual(["First", "Second"]);
    expect(preview.errors).toEqual([]);
  });
});
