import { describe, expect, it } from "vitest";

import {
  expandHome,
  packFilename,
  parseArguments,
  parseNameList,
} from "../scripts/add-opponents.mjs";

describe("add opponent CLI", () => {
  it("uses the expected defaults and accepts a positional opponent name", () => {
    expect(parseArguments(["Nielsen,", "Jens", "Ove", "Fries"])).toMatchObject({
      inputPath: "C:/dev/danbase.pgn",
      namesFile: "",
      packsDir: "packs",
      positional: ["Nielsen,", "Jens", "Ove", "Fries"],
    });
  });

  it("accepts input, names file, target URL, and packs directory overrides", () => {
    expect(
      parseArguments([
        "--input",
        "/data/danbase.pgn",
        "--file",
        "./names.txt",
        "--url",
        "http://localhost:3000",
        "--packs-dir",
        "./tmp/packs",
        "--tournament",
        "dm2026u14",
      ]),
    ).toMatchObject({
      inputPath: "/data/danbase.pgn",
      namesFile: "./names.txt",
      baseUrl: "http://localhost:3000",
      packsDir: "./tmp/packs",
      tournamentNickname: "dm2026u14",
    });
  });

  it("parses unique non-comment names from a text file", () => {
    expect(
      parseNameList(`
# Furesoe opponents
Nielsen, Jens Ove Fries

Bavelski, Nikolaj
  nielsen,   jens ove fries
`),
    ).toEqual(["Nielsen, Jens Ove Fries", "Bavelski, Nikolaj"]);
  });

  it("creates stable filesystem-safe pack names", () => {
    expect(packFilename("Nielsen, Jens Ove Fries")).toMatch(
      /^nielsen-jens-ove-fries-[a-f0-9]{8}\.pgn$/,
    );
    expect(packFilename("Nielsen, Jens Ove Fries")).toBe(
      packFilename("Nielsen, Jens Ove Fries"),
    );
  });

  it("expands a home-relative path", () => {
    expect(expandHome("~/Downloads/danbase.pgn")).not.toContain("~");
  });
});
