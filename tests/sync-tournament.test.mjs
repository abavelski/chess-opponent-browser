import { describe, expect, it } from "vitest";

import { assertSnapshotTarget, danbaseNameVariants, filterParticipantsByGroup, identityKeys, mergeParticipants, normalizeParticipantName, parseArguments, toRating, workspacePaths } from "../scripts/sync-tournament.mjs";

describe("tournament sync CLI", () => {
  it("defers local paths until the tournament workspace is known", () => {
    expect(parseArguments([])).toMatchObject({
      command: "all",
      includeRatings: false,
      snapshotPath: "",
      packsDir: "",
      danbasePath: "C:/dev/danbase.pgn",
    });
  });

  it("isolates default snapshots and packs by tournament nickname", () => {
    expect(workspacePaths("furesoe-open-2026")).toEqual({
      snapshotPath: expect.stringMatching(/data[\\/]tournaments[\\/]furesoe-open-2026[\\/]participants\.json$/),
      syncStatePath: expect.stringMatching(/data[\\/]tournaments[\\/]furesoe-open-2026[\\/]sync-state\.json$/),
      packsDir: expect.stringMatching(/packs[\\/]furesoe-open-2026$/),
    });
    expect(workspacePaths("dm2026u14").snapshotPath).not.toBe(workspacePaths("furesoe-open-2026").snapshotPath);
  });

  it("rejects a snapshot for a different tournament", () => {
    expect(() => assertSnapshotTarget({ tournamentNickname: "dm2026u14" }, "furesoe-open-2026"))
      .toThrow("Snapshot belongs to 'dm2026u14'");
    expect(() => assertSnapshotTarget({}, "furesoe-open-2026"))
      .toThrow("Snapshot has no tournament nickname");
  });

  it("parses subcommands and overrides", () => {
    expect(parseArguments(["app", "furesoe-open", "--file", "other.json", "--app-url", "http://localhost:3000"]))
      .toMatchObject({ command: "app", nickname: "furesoe-open", snapshotPath: "other.json", appUrl: "http://localhost:3000" });
  });

  it("only includes rating refreshes in full sync when explicitly requested", () => {
    expect(parseArguments(["all", "furesoe-open"])).toMatchObject({ includeRatings: false });
    expect(parseArguments(["all", "furesoe-open", "--ratings"]))
      .toMatchObject({ includeRatings: true });
  });

  it("parses dry-run and force safety controls", () => {
    expect(parseArguments(["all", "furesoe-open", "--dry-run", "--force"]))
      .toMatchObject({ dryRun: true, force: true });
  });

  it("filters participant groups case-insensitively", () => {
    const players = [{ name: "One", group: " U-14 " }, { name: "Two", group: "Open" }];
    expect(filterParticipantsByGroup(players, "u-14")).toEqual([players[0]]);
    expect(filterParticipantsByGroup(players, null)).toEqual(players);
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

  it("removes tournament seed numbers from participant names and Danbase variants", () => {
    expect(normalizeParticipantName("  19.   Nikolaj Bavelski ")).toBe("Nikolaj Bavelski");
    expect(danbaseNameVariants("19. Nikolaj Bavelski")).toContain("Bavelski, Nikolaj");
  });
});
