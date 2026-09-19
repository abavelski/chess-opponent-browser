import { describe, expect, it } from "vitest";

import {
  buildGameFilterPlan,
  dateCutoffForFilter,
  defaultGameFilters,
  hasActiveGameFilters,
  parseGameFilters,
  resultCodesForFilter,
} from "../lib/games/filters";

describe("game filter URL parsing", () => {
  it("falls back safely for invalid enum and source values", () => {
    expect(
      parseGameFilters(
        {
          color: "purple",
          date: "forever",
          minRating: "9999",
          maxRating: "nope",
          result: "unknown",
          source: "missing-source",
          sort: "random",
        },
        ["fixture-manual"],
      ),
    ).toEqual(defaultGameFilters);
  });

  it("keeps valid combined filters and validates source identity", () => {
    expect(
      parseGameFilters(
        {
          color: "black",
          date: "2y",
          minRating: "1800",
          maxRating: "2200",
          result: "win",
          source: "fixture-archive",
          sort: "strongest",
        },
        ["fixture-manual", "fixture-archive"],
      ),
    ).toEqual({
      color: "black",
      date: "2y",
      minRating: 1800,
      maxRating: 2200,
      result: "win",
      source: "fixture-archive",
      sort: "strongest",
    });
  });
});

describe("game filter query plan", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");

  it("calculates bounded date thresholds as UTC chess dates", () => {
    expect(dateCutoffForFilter("6m", now)).toBe("2026-03-16");
    expect(dateCutoffForFilter("1y", now)).toBe("2025-09-16");
    expect(dateCutoffForFilter("2y", now)).toBe("2024-09-16");
    expect(dateCutoffForFilter("5y", now)).toBe("2021-09-16");
    expect(dateCutoffForFilter("all", now)).toBeNull();
  });

  it("clamps month subtraction at the end of shorter months", () => {
    expect(dateCutoffForFilter("6m", new Date("2026-08-31T23:59:59.000Z"))).toBe(
      "2026-02-28",
    );
  });

  it.each([
    ["win", "1-0", "0-1"],
    ["draw", "1/2-1/2", "1/2-1/2"],
    ["loss", "0-1", "1-0"],
  ] as const)(
    "maps %s to correct White and Black perspective result codes",
    (filter, white, black) => {
      expect(resultCodesForFilter(filter)).toEqual({ white, black });
    },
  );

  it("maps opponent rating threshold, source identity, color, and sort into the plan", () => {
    expect(
      buildGameFilterPlan(
        {
          color: "white",
          date: "2y",
          minRating: 1800,
          maxRating: 2200,
          result: "loss",
          source: "fixture-manual",
          sort: "strongest",
        },
        now,
      ),
    ).toEqual({
      color: "white",
      minPlayedOn: "2024-09-16",
      minOpponentRating: 1800,
      maxOpponentRating: 2200,
      whiteResult: "0-1",
      blackResult: "1-0",
      sourceKey: "fixture-manual",
      sort: "strongest",
    });
  });

  it("keeps unknown dates and ratings eligible only when bounded filters are inactive", () => {
    const plan = buildGameFilterPlan(defaultGameFilters, now);
    expect(plan.minPlayedOn).toBeNull();
    expect(plan.minOpponentRating).toBeNull();
    expect(plan.maxOpponentRating).toBeNull();

    const boundedPlan = buildGameFilterPlan(
      { ...defaultGameFilters, date: "1y", minRating: 1800, maxRating: 2400 },
      now,
    );
    expect(boundedPlan.minPlayedOn).toBe("2025-09-16");
    expect(boundedPlan.minOpponentRating).toBe(1800);
    expect(boundedPlan.maxOpponentRating).toBe(2400);
  });

  it("detects whether reset should be available", () => {
    expect(hasActiveGameFilters(defaultGameFilters)).toBe(false);
    expect(hasActiveGameFilters({ ...defaultGameFilters, sort: "oldest" })).toBe(true);
  });
});
