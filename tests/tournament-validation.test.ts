import { describe, expect, it } from "vitest";

import {
  TOURNAMENT_NAME_MAX_LENGTH,
  parseTournamentId,
  validateTournamentName,
  validateTournamentDetails,
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

describe("validateTournamentDetails", () => {
  it("normalizes complete tournament sync details", () => {
    expect(validateTournamentDetails({
      name: " Furesoe Open ",
      nickname: "Furesoe-Open",
      sourceUrl: " https://turnering.skak.dk/tournament ",
      participantGroup: " U-14 ",
    })).toEqual({
      success: true,
      details: {
        name: "Furesoe Open",
        nickname: "furesoe-open",
        sourceUrl: "https://turnering.skak.dk/tournament",
        participantGroup: "U-14",
      },
    });
  });

  it("rejects invalid nicknames and URLs", () => {
    expect(validateTournamentDetails({
      name: "Tournament",
      nickname: "not valid",
      sourceUrl: "https://example.com",
      participantGroup: "",
    })).toMatchObject({ success: false, error: "nickname_format" });
    expect(validateTournamentDetails({
      name: "Tournament",
      nickname: "valid",
      sourceUrl: "file:///tournament",
      participantGroup: "",
    })).toMatchObject({ success: false, error: "url_invalid" });
  });
});

describe("parseTournamentId", () => {
  it("accepts positive safe integer ids", () => {
    expect(parseTournamentId("1")).toBe(1);
    expect(parseTournamentId("42")).toBe(42);
  });

  it("rejects malformed, zero, negative, and unsafe ids", () => {
    expect(parseTournamentId(null)).toBeNull();
    expect(parseTournamentId("")).toBeNull();
    expect(parseTournamentId("0")).toBeNull();
    expect(parseTournamentId("-1")).toBeNull();
    expect(parseTournamentId("1.5")).toBeNull();
    expect(parseTournamentId(" 1 ")).toBeNull();
    expect(parseTournamentId(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });
});
