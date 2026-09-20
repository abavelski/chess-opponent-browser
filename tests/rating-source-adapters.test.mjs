import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseDsuProfileHtml } from "../lib/local/sources/dsu.mjs";
import { parseFideProfileHtml } from "../lib/local/sources/fide.mjs";

const fixture = (name) => readFile(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("rating source adapters", () => {
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
