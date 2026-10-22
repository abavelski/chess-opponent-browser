import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { isDsuPlaceholderParticipant, parseDsuProfileHtml } from "../lib/local/sources/dsu.mjs";
import { fetchFideProfile, parseFideProfileHtml } from "../lib/local/sources/fide.mjs";

const fixture = (name) => readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("rating source adapters", () => {
  it("excludes a newly registered bye placeholder without player identities or ratings", () => {
    expect(isDsuPlaceholderParticipant({ name: "Bye", dsuId: "-", fideId: null, tournamentDsuRating: null, tournamentFideRating: null })).toBe(true);
    expect(isDsuPlaceholderParticipant({ name: "97. BYE", dsuId: "-" })).toBe(true);
  });

  it("preserves real participants even when their surname or missing IDs resemble a placeholder", () => {
    expect(isDsuPlaceholderParticipant({ name: "Hans Bye", dsuId: null })).toBe(false);
    expect(isDsuPlaceholderParticipant({ name: "Bye", fideId: "1482475" })).toBe(false);
  });

  it("retries an empty cached FIDE profile without changing its canonical URL", async () => {
    const page = {
      goto: vi.fn(),
      content: vi.fn().mockResolvedValueOnce("<html><head></head><body></body></html>")
        .mockResolvedValueOnce(await fixture("fide-profile.html")),
    };
    const result = await fetchFideProfile(page, { fideId: "1500123" });
    expect(page.goto).toHaveBeenCalledTimes(2);
    expect(page.goto.mock.calls[1][0]).toMatch(/^https:\/\/ratings\.fide\.com\/profile\/1500123\?sync-refresh=\d+$/);
    expect(result).toEqual({ status: "updated", profileUrl: "https://ratings.fide.com/profile/1500123", fideRating: 2017 });
  });

  it("parses the saved DSU profile fixture", async () => {
    expect(parseDsuProfileHtml(await fixture("dsu-profile.html"))).toEqual({
      dsuRating: 1934,
      fideRating: 1876,
      fideId: "1500123",
    });
  });

  it("parses the saved FIDE profile fixture", async () => {
    expect(parseFideProfileHtml(await fixture("fide-profile.html"))).toEqual({ fideRating: 2017 });
  });

  it("fails clearly when provider layouts no longer contain required rating fields", () => {
    expect(() => parseDsuProfileHtml("<html><body>changed</body></html>"))
      .toThrow("DSU profile layout changed");
    expect(() => parseFideProfileHtml("<html><body>changed</body></html>"))
      .toThrow("FIDE profile layout changed");
  });
});
