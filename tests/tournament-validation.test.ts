import { describe, expect, it } from "vitest";

import {
  TOURNAMENT_NAME_MAX_LENGTH,
  validateTournamentName,
} from "../lib/tournaments/validation";

describe("validateTournamentName", () => {
  it("accepts a normal name and trims surrounding whitespace", () => {
    expect(validateTournamentName("  Copenhagen Open 2026  ")).toEqual({
      success: true,
      name: "Copenhagen Open 2026",
    });
  });

  it("rejects empty and whitespace-only names", () => {
    expect(validateTournamentName("")).toEqual({
      success: false,
      error: "required",
    });
    expect(validateTournamentName("   \n\t  ")).toEqual({
      success: false,
      error: "required",
    });
  });

  it("accepts the maximum length and rejects longer names", () => {
    expect(validateTournamentName("a".repeat(TOURNAMENT_NAME_MAX_LENGTH))).toEqual({
      success: true,
      name: "a".repeat(TOURNAMENT_NAME_MAX_LENGTH),
    });

    expect(
      validateTournamentName("a".repeat(TOURNAMENT_NAME_MAX_LENGTH + 1)),
    ).toEqual({ success: false, error: "too_long" });
  });

  it("rejects non-string values", () => {
    expect(validateTournamentName(null)).toEqual({
      success: false,
      error: "required",
    });
  });
});
