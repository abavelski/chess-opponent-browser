import { describe, expect, it } from "vitest";

import {
  buildFixtureKey,
  fixtureGames,
  validateFixtureSet,
  validateStructuredMoves,
} from "../scripts/task-003-fixtures.mjs";

describe("task 003 fixture data", () => {
  it("builds deterministic fixture keys", () => {
    const input = {
      playedOn: "2026-08-21",
      whiteFideId: "99000001",
      blackFideId: "99000002",
      result: "1-0",
      round: "4",
    };

    expect(buildFixtureKey(input)).toBe(buildFixtureKey({ ...input }));
    expect(buildFixtureKey({ ...input, round: "5" })).not.toBe(buildFixtureKey(input));
  });

  it("validates the complete fixture set and unique source-scoped keys", () => {
    expect(validateFixtureSet()).toBe(true);
    expect(new Set(fixtureGames.map((game) => `${game.sourceKey}:${game.sourceGameKey}`)).size).toBe(
      fixtureGames.length,
    );
  });

  it("rejects obviously invalid structured move documents", () => {
    expect(() =>
      validateStructuredMoves({
        version: 1,
        mainline: [{ san: "e4", uci: "not-a-move" }],
      }),
    ).toThrow(/valid UCI move/);
  });
});
