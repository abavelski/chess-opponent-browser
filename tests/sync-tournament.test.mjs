import { describe, expect, it } from "vitest";

import { danbaseNameVariants, identityKeys, mergeParticipants, parseArguments, toRating } from "../scripts/sync-tournament.mjs";

describe("tournament sync CLI", () => {
  it("uses the local Danbase path and local snapshot defaults", () => {
    expect(parseArguments([])).toMatchObject({
      command: "all",
      snapshotPath: "data/participants.json",
      danbasePath: "C:/dev/danbase.pgn",
    });
  });

  it("parses subcommands and overrides", () => {
    expect(parseArguments(["app", "--file", "other.json", "--app-url", "http://localhost:3000"]))
      .toMatchObject({ command: "app", snapshotPath: "other.json", appUrl: "http://localhost:3000" });
  });

  it("preserves refreshed ratings while replacing the roster", () => {
    const existing = [{ name: "Player", dsuId: "1", actualDsuRating: 1900, actualFideRating: 1800 }];
    const fresh = [{ name: "Player Renamed", dsuId: "1", actualDsuRating: null, actualFideRating: null }];
    expect(mergeParticipants(existing, fresh)).toEqual([
      expect.objectContaining({ name: "Player Renamed", actualDsuRating: 1900, actualFideRating: 1800 }),
    ]);
  });

  it("normalizes ratings and identity keys", () => {
    expect(toRating("1.934")).toBe(1934);
    expect(toRating("Not rated")).toBeNull();
    expect(identityKeys({ name: "  A   B ", dsuId: null, fideId: null })).toContain("name:a b");
  });

  it("generates Danbase surname-first variants and removes titles", () => {
    expect(danbaseNameVariants("CM Karl Emil Nielsen-Refs")).toContain("Nielsen-Refs, Karl Emil");
    expect(danbaseNameVariants("Luis Alzaga")).toContain("Alzaga,Luis");
  });
});
