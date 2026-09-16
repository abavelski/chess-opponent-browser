import { describe, expect, it } from "vitest";

import {
  normalizeRosterSearch,
  validateOpponentInput,
} from "../lib/players/validation";

describe("validateOpponentInput", () => {
  it("normalizes valid optional fields", () => {
    const result = validateOpponentInput({
      name: "  Jan Kowalski  ",
      fideId: " 1234567 ",
      federation: " pol ",
      rating: "2140",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        name: "Jan Kowalski",
        fideId: "1234567",
        federation: "POL",
        rating: 2140,
      },
    });
  });

  it("allows optional fields to be absent", () => {
    expect(
      validateOpponentInput({ name: "Name Only", fideId: "", federation: "", rating: "" }),
    ).toEqual({
      ok: true,
      data: { name: "Name Only", fideId: null, federation: null, rating: null },
    });
  });

  it("rejects missing names", () => {
    const result = validateOpponentInput({
      name: "   ",
      fideId: "",
      federation: "",
      rating: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBe("Player name is required.");
    }
  });

  it("rejects invalid FIDE IDs, federation codes, and ratings", () => {
    const result = validateOpponentInput({
      name: "Jan",
      fideId: "12A34",
      federation: "PL",
      rating: "4001",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.fideId).toBeDefined();
      expect(result.errors.federation).toBeDefined();
      expect(result.errors.rating).toBeDefined();
    }
  });
});

describe("normalizeRosterSearch", () => {
  it("trims search text", () => {
    expect(normalizeRosterSearch("  jan  ")).toBe("jan");
  });

  it("returns an empty string when search is absent", () => {
    expect(normalizeRosterSearch(undefined)).toBe("");
  });
});
