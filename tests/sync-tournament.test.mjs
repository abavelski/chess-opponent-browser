import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { assertSnapshotTarget, danbaseNameVariants, filterParticipantsByGroup, identityKeys, isProviderRatingStale, main, mergeParticipants, normalizeParticipantName, parseArguments, snapshotHash, toRating, workspacePaths } from "../scripts/sync-tournament.mjs";

describe("tournament sync CLI", () => {
  it.each([false, true])("reconciles the authoritative snapshot after game imports (upload failure: %s)", async (failUpload) => {
    const directory = await mkdtemp(join(tmpdir(), "sync-roster-"));
    const nickname = `sync-test-${randomUUID()}`;
    const snapshotPath = join(directory, "participants.json");
    const inputPath = join(directory, "games.pgn");
    const calls = [];
    const counts = { total: 1, matched: 1, created: 0, added: 0, removed: 1, ratingChanges: 0 };
    await writeFile(snapshotPath, JSON.stringify({ tournamentNickname: nickname, players: [{ name: "Peter Sørensen", fideId: "1447467" }] }));
    await writeFile(inputPath, '[White "Different Archive Spelling"]\n[WhiteFideId "1447467"]\n[Black "Other Player"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n');
    vi.stubGlobal("fetch", vi.fn(async (url, request = {}) => {
      const path = new URL(url).pathname;
      calls.push(`${request.method ?? "GET"} ${path}`);
      let payload;
      if (path.endsWith("/config")) payload = { ok: true, tournament: { nickname, name: "Test tournament" } };
      else if (path.endsWith("/sync-runs")) payload = { ok: true, run: { id: 1 } };
      else if (path.endsWith("/import")) payload = {
        ok: true, opponent: { rosterAdded: true, conflictCount: 0 },
        import: { importedCount: 0, duplicateCount: 1, parseErrorCount: 0, persistenceErrorCount: 0 },
      };
      else if (path.endsWith("/sync")) {
        expect(JSON.parse(request.body).players).toEqual([{ name: "Peter Sørensen", fideId: "1447467", dsuRatingUpdatedAt: null, fideRatingUpdatedAt: null }]);
        payload = { ok: true, tournament: { name: "Test tournament" }, participants: counts };
      } else throw new Error(`Unexpected request: ${path}`);
      if (failUpload && path.endsWith("/import")) {
        return new Response(JSON.stringify({ ok: false, message: "simulated upload failure" }), { status: 500 });
      }
      return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
    }));
    try {
      const run = main(["games", nickname, "--file", snapshotPath, "--danbase", inputPath, "--packs-dir", join(directory, "packs")]);
      if (failUpload) await expect(run).rejects.toThrow("1 opponent game sync(s) failed.");
      else expect((await run).stages.participantsFinal).toEqual(counts);
      expect(calls).toEqual([
        "GET /api/admin/tournaments/config",
        "POST /api/admin/tournaments/sync-runs",
        "POST /api/admin/opponents/import",
        "POST /api/admin/tournaments/sync",
        "PATCH /api/admin/tournaments/sync-runs",
      ]);
      const state = JSON.parse(await readFile(workspacePaths(nickname).syncStatePath, "utf8"));
      expect(state.app.participants.total).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      await rm(directory, { recursive: true, force: true });
      await rm(resolve("data", "tournaments", nickname), { recursive: true, force: true });
    }
  });

  it("defers local paths until the tournament workspace is known", () => {
    expect(parseArguments([])).toMatchObject({
      command: "all",
      includeRatings: false,
      snapshotPath: "",
      packsDir: "",
      danbasePath: "data/danbase.pgn",
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
      .toMatchObject({ includeRatings: true, ratingMode: "all" });
    expect(parseArguments(["all", "furesoe-open", "--ratings=stale", "--rating-ttl-days", "14"]))
      .toMatchObject({ includeRatings: true, ratingMode: "stale", ratingTtlDays: 14 });
  });

  it("keeps Lichess discovery opt-in and validates its request limits", () => {
    expect(parseArguments(["all", "furesoe-open"])).toMatchObject({
      includeLichess: false,
      lichessMaxTournaments: 3,
      lichessThrottleMs: 2500,
    });
    expect(parseArguments([
      "all",
      "furesoe-open",
      "--lichess",
      "--lichess-max-tournaments",
      "5",
      "--lichess-throttle",
      "1000",
    ])).toMatchObject({
      includeLichess: true,
      lichessMaxTournaments: 5,
      lichessThrottleMs: 1000,
    });
    expect(() => parseArguments(["lichess", "furesoe-open", "--lichess-max-tournaments", "0"]))
      .toThrow("whole number from 1 to 10");
  });

  it("selects stale provider ratings independently", () => {
    const now = new Date("2026-09-20T00:00:00Z");
    expect(isProviderRatingStale(null, 30, now)).toBe(true);
    expect(isProviderRatingStale("2026-09-01T00:00:00Z", 30, now)).toBe(false);
    expect(isProviderRatingStale("2026-08-01T00:00:00Z", 30, now)).toBe(true);
  });

  it("creates stable SHA-256 snapshot hashes", () => {
    expect(snapshotHash({ players: [{ name: "A" }] })).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshotHash({ players: [{ name: "A" }] })).toBe(snapshotHash({ players: [{ name: "A" }] }));
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
    expect(identityKeys({ name: "Player", dsuId: "-", fideId: "0" })).toEqual(["name:player"]);
  });

  it("generates Danbase surname-first variants and removes titles", () => {
    expect(danbaseNameVariants("CM Karl Emil Nielsen-Refs")).toContain("Nielsen-Refs, Karl Emil");
    expect(danbaseNameVariants("Luis Alzaga")).toContain("Alzaga,Luis");
    expect(danbaseNameVariants("Mathilde Rath Vesterbæk")).toContain("Vesterbaek, Mathilde Rath");
    expect(danbaseNameVariants("Jonas Bøgh Larsen")).toContain("Larsen, Jonas Bogh");
  });

  it("removes tournament seed numbers from participant names and Danbase variants", () => {
    expect(normalizeParticipantName("  19.   Nikolaj Bavelski ")).toBe("Nikolaj Bavelski");
    expect(danbaseNameVariants("19. Nikolaj Bavelski")).toContain("Bavelski, Nikolaj");
  });
});
