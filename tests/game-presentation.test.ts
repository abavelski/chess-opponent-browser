import { describe, expect, it } from "vitest";

import {
  mapGameForPlayer,
  openingLabel,
  perspectiveResult,
  type StoredGameListRow,
} from "../lib/games/presentation";

const baseRow: StoredGameListRow = {
  id: 1,
  whitePlayerId: 10,
  blackPlayerId: 20,
  whiteName: "Jan Kowalski",
  blackName: "Anna Nowak",
  whiteRating: 2140,
  blackRating: 2210,
  playedOn: "2026-08-21",
  result: "1-0",
  event: "Fixture Open",
  eco: "B12",
  opening: "Caro-Kann Defence",
  sourceLabel: "Fixture Manual",
};

describe("mapGameForPlayer", () => {
  it("maps the selected player as White with a win", () => {
    expect(mapGameForPlayer(10, baseRow)).toMatchObject({
      color: "White",
      opponentName: "Anna Nowak",
      opponentRating: 2210,
      result: "Win",
    });
  });

  it("maps the selected player as Black with the inverse perspective", () => {
    expect(mapGameForPlayer(20, baseRow)).toMatchObject({
      color: "Black",
      opponentName: "Jan Kowalski",
      opponentRating: 2140,
      result: "Loss",
    });
  });

  it("handles draws from either color", () => {
    expect(perspectiveResult("1/2-1/2", "White")).toBe("Draw");
    expect(perspectiveResult("1/2-1/2", "Black")).toBe("Draw");
  });

  it("keeps unknown optional metadata safe for rendering", () => {
    const item = mapGameForPlayer(10, {
      ...baseRow,
      playedOn: null,
      event: null,
      eco: null,
      opening: null,
      blackRating: null,
      result: "*",
    });

    expect(item).toMatchObject({
      date: null,
      event: null,
      eco: null,
      opening: null,
      opponentRating: null,
      result: "—",
    });
    expect(openingLabel(item.eco, item.opening)).toBe("—");
  });

  it("rejects a row that does not link exactly one side to the selected player", () => {
    expect(() => mapGameForPlayer(99, baseRow)).toThrow(/exactly one side/);
  });
});
