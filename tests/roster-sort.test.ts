import { describe, expect, it } from "vitest";

import { nextRosterSortOrder, parseRosterSort } from "@/lib/tournaments/roster-sort";

describe("tournament roster sorting", () => {
  it("defaults to DSU descending and rejects unknown values", () => {
    expect(parseRosterSort(undefined, undefined)).toEqual({ sort: "dsu", order: "desc" });
    expect(parseRosterSort("unknown", "sideways")).toEqual({ sort: "dsu", order: "desc" });
  });

  it("toggles active columns and chooses useful initial directions", () => {
    expect(nextRosterSortOrder("dsu", "dsu", "desc")).toBe("asc");
    expect(nextRosterSortOrder("name", "dsu", "desc")).toBe("asc");
    expect(nextRosterSortOrder("games", "dsu", "desc")).toBe("desc");
  });
});
